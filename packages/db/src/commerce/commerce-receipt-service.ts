// One webhook delivery, from durable receipt to access (M2, ADR-074).
//
// The HTTP ingress (apps/web .../integrations/commerce/[provider]/events)
// verifies the signature over the exact raw bytes, then hands the parsed
// event here. This module chains the two existing, unchanged pipelines:
//
//   ingestCommerceEvent            raw row -> quarantine | normalized  (COM-002)
//   processPurchaseLifecycleEvent  normalized -> purchase -> grants    (COM-003)
//
// dok 22 §16 wants normalization to run asynchronously in a worker. No worker
// exists yet (apps/worker starts no jobs), so processing runs right after the
// receipt commits, in its own transaction. The receipt is durable first; if
// processing then fails, the caller answers 5xx and the bridge retries with
// the SAME event ID - that retry lands on the `duplicate` branch below, which
// re-drives processing. processPurchaseLifecycleEvent is itself idempotent per
// normalized event, so a re-drive can never apply an event twice.
//
// Unverified deliveries are still recorded (fixture COM-SYN-005: raw event
// stored, never normalized), but NEVER under the event ID they claim. They are
// keyed by payload checksum instead, so an attacker who guesses a genuine
// upcoming event ID cannot plant a quarantined row under it and make the real
// delivery look like a duplicate.

import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { EffectiveAccessCache } from "@superlatif/domain/access";
import {
  deriveEventKey,
  type CommerceEventEnvelope,
  type ProviderStatusMap,
  type SignatureOutcome,
} from "@superlatif/domain/commerce";
import type { JsonValue } from "@superlatif/domain/shared";
import type { Schema } from "../db-types.ts";
import {
  findNormalizedCommerceEventByRawEventId,
  findRawCommerceEventByKey,
} from "./commerce-event-repository.ts";
import { ingestCommerceEvent, type IngestCommerceEventOutcome } from "./commerce-event-service.ts";
import {
  processPurchaseLifecycleEvent,
  type PurchaseLifecycleOutcome,
} from "./purchase-lifecycle-service.ts";

export interface ReceiveCommerceEventInput {
  readonly envelope: CommerceEventEnvelope;
  /** The parsed request body - checksum, redacted copy, and fallback key are derived from it. */
  readonly rawPayload: Record<string, unknown>;
  readonly signatureOutcome: SignatureOutcome;
  readonly correlationId: string;
  readonly statusMap: ProviderStatusMap;
}

export interface CommerceReceipt {
  readonly rawEventId: string;
  readonly duplicate: boolean;
  /** "quarantined" covers bad signatures, unknown event types, and unknown statuses alike. */
  readonly ingest: "normalized" | "quarantined" | "duplicate";
  /** Null when nothing was (re)processed: quarantined, or a duplicate of a quarantined delivery. */
  readonly lifecycle: PurchaseLifecycleOutcome | null;
}

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current !== null && typeof current === "object"; depth += 1) {
    if ((current as { code?: unknown }).code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

async function ingestOnce(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  input: ReceiveCommerceEventInput,
  envelope: CommerceEventEnvelope,
  now: Date,
): Promise<IngestCommerceEventOutcome> {
  const ingestInput = {
    envelope,
    rawPayload: input.rawPayload,
    providedSignature: null,
    secret: null,
    precomputedSignatureOutcome: input.signatureOutcome,
    correlationId: input.correlationId,
    statusMap: input.statusMap,
  };
  try {
    return await ingestCommerceEvent(db, ingestInput, now);
  } catch (error) {
    // Two concurrent deliveries of one event: both passed the pre-check, the
    // unique index let exactly one insert through. The loser is a duplicate.
    if (!isUniqueViolation(error)) throw error;
    const key = deriveEventKey(envelope.eventId, input.rawPayload as JsonValue);
    const existing = await findRawCommerceEventByKey(db, envelope.provider, key);
    if (!existing) throw error;
    return { kind: "duplicate", rawEventId: existing.id, existingStatus: existing.status };
  }
}

export async function receiveCommerceEvent(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  cache: EffectiveAccessCache,
  input: ReceiveCommerceEventInput,
  now: Date,
): Promise<CommerceReceipt> {
  const envelope: CommerceEventEnvelope =
    input.signatureOutcome === "verified" ? input.envelope : { ...input.envelope, eventId: null };

  const ingested = await ingestOnce(db, input, envelope, now);

  if (ingested.kind === "quarantined") {
    return { rawEventId: ingested.rawEventId, duplicate: false, ingest: "quarantined", lifecycle: null };
  }
  if (ingested.kind === "normalized") {
    const lifecycle = await processPurchaseLifecycleEvent(db, cache, ingested.normalizedEventId, now);
    return { rawEventId: ingested.rawEventId, duplicate: false, ingest: "normalized", lifecycle };
  }

  // Duplicate delivery. If the first one was normalized but never finished
  // processing (the earlier request failed after its receipt committed), this
  // retry is what completes it.
  const normalized = await findNormalizedCommerceEventByRawEventId(db, ingested.rawEventId);
  const lifecycle = normalized ? await processPurchaseLifecycleEvent(db, cache, normalized.id, now) : null;
  return { rawEventId: ingested.rawEventId, duplicate: true, ingest: "duplicate", lifecycle };
}
