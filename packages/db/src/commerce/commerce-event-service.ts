// Commerce event ingestion pipeline (COM-002).
//
// dok 22 §16 describes an async split - ingress persists durably and
// acknowledges fast, a WORKER normalizes afterward (dok 23 §9's sequence
// diagram: "W->>DB: Normalize purchase"). No queue/worker-dispatch
// infrastructure exists yet in this repository (GOV bootstrap never built
// one), so this task's ingestCommerceEvent runs the whole
// persist -> verify -> normalize/quarantine pipeline SYNCHRONOUSLY, inside
// one transaction. This is a documented scope simplification, not a claim
// that production ingestion is this synchronous - a future task that adds
// real queue/worker dispatch can call this same function from a job handler
// without changing its contract.
//
// Idempotency (dok 22 §16 step 5, dok 23 §8 "event ID dedupe"): the
// (provider, eventKey) uniqueness check happens BEFORE the transaction
// opens - re-ingesting an already-seen delivery returns its EXISTING
// outcome untouched, never a second raw row, never re-normalization.

import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  deriveEventKey,
  normalizeCommerceEvent,
  redactRawPayload,
  verifyWebhookSignature,
  type CommerceEventEnvelope,
  type ProviderStatusMap,
} from "@superlatif/domain/commerce";
import { computeChecksum, type JsonValue } from "@superlatif/domain/shared";
import type { Schema } from "../db-types.ts";
import {
  createNormalizedCommerceEvent,
  createQuarantineRecord,
  createRawCommerceEvent,
  findRawCommerceEventByKey,
  markRawCommerceEventStatus,
  type RawCommerceEventRow,
} from "./commerce-event-repository.ts";

export interface IngestCommerceEventInput {
  /** Structured envelope this task's normalizer understands (dok 22 §17 shape, provider-supplied fields). */
  readonly envelope: CommerceEventEnvelope;
  /**
   * The wire payload as received, BEFORE redaction - used for the HMAC
   * body, the checksum, and the fallback event key. A real HTTP ingress
   * would use the exact raw bytes; this task's synthetic tests supply an
   * object and this function serializes it deterministically (canonical
   * JSON), documented as a stand-in for real raw bytes - see this module's
   * own doc.
   */
  readonly rawPayload: Record<string, unknown>;
  readonly providedSignature: string | null;
  /** Never a real production secret in this task - synthetic/test value only, injected by the caller. */
  readonly secret: string | null;
  readonly correlationId: string;
  readonly statusMap: ProviderStatusMap;
}

export type IngestCommerceEventOutcome =
  | { readonly kind: "normalized"; readonly rawEventId: string; readonly normalizedEventId: string }
  | { readonly kind: "quarantined"; readonly rawEventId: string; readonly reasonCode: string }
  /** Idempotent replay - an event with this (provider, eventKey) was already ingested; nothing new was written. */
  | { readonly kind: "duplicate"; readonly rawEventId: string; readonly existingStatus: string };

function quarantineReason(
  outcome:
    | { readonly kind: "unsupported_type"; readonly type: string }
    | { readonly kind: "unknown_status"; readonly rawStatus: string; readonly provider: string },
): { readonly reasonCode: string; readonly detail: string } {
  if (outcome.kind === "unsupported_type") {
    return { reasonCode: "unsupported_event_type", detail: `Unsupported event type: ${outcome.type}` };
  }
  return {
    reasonCode: "unknown_status",
    detail: `${outcome.provider} sent an unrecognized order status: ${outcome.rawStatus}`,
  };
}

/**
 * Ingests one commerce webhook delivery. ALWAYS persists a raw event row
 * for a genuinely new (provider, eventKey) - even a signature-verification
 * failure is stored, never silently rejected (founder instruction). Returns
 * `duplicate` without writing anything new when this (provider, eventKey)
 * has already been seen.
 */
export async function ingestCommerceEvent(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  input: IngestCommerceEventInput,
  now: Date,
): Promise<IngestCommerceEventOutcome> {
  const canonicalPayload = input.rawPayload as JsonValue;
  const eventKey = deriveEventKey(input.envelope.eventId, canonicalPayload);

  const existing = await findRawCommerceEventByKey(db, input.envelope.provider, eventKey);
  if (existing) {
    return { kind: "duplicate", rawEventId: existing.id, existingStatus: existing.status };
  }

  // Stand-in for real raw HTTP bytes - see this module's doc.
  const rawBody = JSON.stringify(canonicalPayload);
  const signatureOutcome = verifyWebhookSignature(rawBody, input.providedSignature, input.secret);
  const payloadChecksum = computeChecksum(canonicalPayload);
  const rawPayloadRedacted = redactRawPayload(canonicalPayload) as Record<string, unknown>;

  return db.transaction(async (tx) => {
    const rawEvent: RawCommerceEventRow = await createRawCommerceEvent(tx, {
      provider: input.envelope.provider,
      site: input.envelope.site,
      eventKey,
      signatureOutcome,
      payloadChecksum,
      rawPayloadRedacted,
      receivedAt: now,
      correlationId: input.correlationId,
    });

    if (signatureOutcome !== "verified") {
      await createQuarantineRecord(tx, {
        rawEventId: rawEvent.id,
        reasonCode: "signature_verification_failed",
        detail: `Signature outcome: ${signatureOutcome}`,
        quarantinedAt: now,
      });
      await markRawCommerceEventStatus(tx, rawEvent.id, "quarantined");
      return { kind: "quarantined", rawEventId: rawEvent.id, reasonCode: "signature_verification_failed" };
    }

    const normalization = normalizeCommerceEvent(input.envelope, eventKey, input.statusMap);
    if (normalization.kind !== "ok") {
      const { reasonCode, detail } = quarantineReason(normalization);
      await createQuarantineRecord(tx, { rawEventId: rawEvent.id, reasonCode, detail, quarantinedAt: now });
      await markRawCommerceEventStatus(tx, rawEvent.id, "quarantined");
      return { kind: "quarantined", rawEventId: rawEvent.id, reasonCode };
    }

    const normalizedRow = await createNormalizedCommerceEvent(tx, {
      rawEventId: rawEvent.id,
      provider: normalization.event.provider,
      site: normalization.event.site,
      eventKey: normalization.event.eventKey,
      type: normalization.event.type,
      occurredAt: new Date(normalization.event.occurredAt),
      externalOrderId: normalization.event.order.externalId,
      orderStatus: normalization.event.order.status,
      currency: normalization.event.order.currency,
      amountMinor: normalization.event.order.amountMinor,
      externalUserId: normalization.event.order.externalUserId,
      externalSkuId: normalization.event.order.externalSkuId,
      schemaVersion: normalization.event.schemaVersion,
    });
    await markRawCommerceEventStatus(tx, rawEvent.id, "normalized");
    return { kind: "normalized", rawEventId: rawEvent.id, normalizedEventId: normalizedRow.id };
  });
}
