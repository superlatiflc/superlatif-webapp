// Raw/normalized/quarantine commerce-event persistence (COM-002).
//
// Deliberately thin CRUD - the ingest/normalize/quarantine DECISION lives
// in commerce-event-service.ts, mirroring curriculum-repository.ts vs
// curriculum-service.ts's split elsewhere in this package. No function
// here ever updates `rawPayloadRedacted`/`payloadChecksum` on an existing
// row - the only mutation this file exposes on raw_commerce_events is a
// STATUS transition (markRawEventNormalized/markRawEventQuarantined).

import { and, eq } from "drizzle-orm";
import type { Queryable, Schema } from "../db-types.ts";
import { commerceEventQuarantine, normalizedCommerceEvents, rawCommerceEvents } from "../schema/index.ts";
import type { PurchaseState, SignatureOutcome } from "@superlatif/domain/commerce";

export interface RawCommerceEventRow {
  readonly id: string;
  readonly provider: string;
  readonly site: string;
  readonly eventKey: string;
  readonly signatureOutcome: string;
  readonly payloadChecksum: string;
  readonly rawPayloadRedacted: Record<string, unknown>;
  readonly receivedAt: Date;
  readonly correlationId: string;
  readonly status: string;
}

const RAW_EVENT_COLUMNS = {
  id: rawCommerceEvents.id,
  provider: rawCommerceEvents.provider,
  site: rawCommerceEvents.site,
  eventKey: rawCommerceEvents.eventKey,
  signatureOutcome: rawCommerceEvents.signatureOutcome,
  payloadChecksum: rawCommerceEvents.payloadChecksum,
  rawPayloadRedacted: rawCommerceEvents.rawPayloadRedacted,
  receivedAt: rawCommerceEvents.receivedAt,
  correlationId: rawCommerceEvents.correlationId,
  status: rawCommerceEvents.status,
};

export interface CreateRawCommerceEventInput {
  readonly provider: string;
  readonly site: string;
  readonly eventKey: string;
  readonly signatureOutcome: SignatureOutcome;
  readonly payloadChecksum: string;
  readonly rawPayloadRedacted: Record<string, unknown>;
  readonly receivedAt: Date;
  readonly correlationId: string;
}

export async function createRawCommerceEvent(
  db: Queryable<Schema>,
  input: CreateRawCommerceEventInput,
): Promise<RawCommerceEventRow> {
  const [row] = await db.insert(rawCommerceEvents).values(input).returning(RAW_EVENT_COLUMNS);
  if (!row) throw new Error("createRawCommerceEvent: insert returned no row");
  return row;
}

export async function findRawCommerceEventByKey(
  db: Queryable<Schema>,
  provider: string,
  eventKey: string,
): Promise<RawCommerceEventRow | null> {
  const [row] = await db
    .select(RAW_EVENT_COLUMNS)
    .from(rawCommerceEvents)
    .where(and(eq(rawCommerceEvents.provider, provider), eq(rawCommerceEvents.eventKey, eventKey)))
    .limit(1);
  return row ?? null;
}

export async function findRawCommerceEventById(
  db: Queryable<Schema>,
  id: string,
): Promise<RawCommerceEventRow | null> {
  const [row] = await db
    .select(RAW_EVENT_COLUMNS)
    .from(rawCommerceEvents)
    .where(eq(rawCommerceEvents.id, id))
    .limit(1);
  return row ?? null;
}

/** The only mutation this module ever performs on an existing raw_commerce_events row - a STATUS transition, never the payload/checksum columns. */
export async function markRawCommerceEventStatus(
  db: Queryable<Schema>,
  id: string,
  status: "normalized" | "quarantined",
): Promise<void> {
  await db.update(rawCommerceEvents).set({ status }).where(eq(rawCommerceEvents.id, id));
}

export interface CreateQuarantineRecordInput {
  readonly rawEventId: string;
  readonly reasonCode: string;
  readonly detail: string;
  readonly quarantinedAt: Date;
}

export interface QuarantineRecordRow {
  readonly id: string;
  readonly rawEventId: string;
  readonly reasonCode: string;
  readonly detail: string;
  readonly quarantinedAt: Date;
}

export async function createQuarantineRecord(
  db: Queryable<Schema>,
  input: CreateQuarantineRecordInput,
): Promise<QuarantineRecordRow> {
  const [row] = await db.insert(commerceEventQuarantine).values(input).returning({
    id: commerceEventQuarantine.id,
    rawEventId: commerceEventQuarantine.rawEventId,
    reasonCode: commerceEventQuarantine.reasonCode,
    detail: commerceEventQuarantine.detail,
    quarantinedAt: commerceEventQuarantine.quarantinedAt,
  });
  if (!row) throw new Error("createQuarantineRecord: insert returned no row");
  return row;
}

export async function findQuarantineRecordByRawEventId(
  db: Queryable<Schema>,
  rawEventId: string,
): Promise<QuarantineRecordRow | null> {
  const [row] = await db
    .select({
      id: commerceEventQuarantine.id,
      rawEventId: commerceEventQuarantine.rawEventId,
      reasonCode: commerceEventQuarantine.reasonCode,
      detail: commerceEventQuarantine.detail,
      quarantinedAt: commerceEventQuarantine.quarantinedAt,
    })
    .from(commerceEventQuarantine)
    .where(eq(commerceEventQuarantine.rawEventId, rawEventId))
    .limit(1);
  return row ?? null;
}

export interface CreateNormalizedCommerceEventInput {
  readonly rawEventId: string;
  readonly provider: string;
  readonly site: string;
  readonly eventKey: string;
  readonly type: string;
  readonly occurredAt: Date;
  readonly externalOrderId: string;
  readonly orderStatus: PurchaseState;
  readonly currency: string;
  readonly amountMinor: number;
  readonly externalUserId: string;
  readonly externalSkuId: string;
  readonly schemaVersion: number;
}

export interface NormalizedCommerceEventRow {
  readonly id: string;
  readonly rawEventId: string;
  readonly provider: string;
  readonly site: string;
  readonly eventKey: string;
  readonly type: string;
  readonly occurredAt: Date;
  readonly externalOrderId: string;
  readonly orderStatus: string;
  readonly currency: string;
  readonly amountMinor: number;
  readonly externalUserId: string;
  readonly externalSkuId: string;
  readonly schemaVersion: number;
}

const NORMALIZED_EVENT_COLUMNS = {
  id: normalizedCommerceEvents.id,
  rawEventId: normalizedCommerceEvents.rawEventId,
  provider: normalizedCommerceEvents.provider,
  site: normalizedCommerceEvents.site,
  eventKey: normalizedCommerceEvents.eventKey,
  type: normalizedCommerceEvents.type,
  occurredAt: normalizedCommerceEvents.occurredAt,
  externalOrderId: normalizedCommerceEvents.externalOrderId,
  orderStatus: normalizedCommerceEvents.orderStatus,
  currency: normalizedCommerceEvents.currency,
  amountMinor: normalizedCommerceEvents.amountMinor,
  externalUserId: normalizedCommerceEvents.externalUserId,
  externalSkuId: normalizedCommerceEvents.externalSkuId,
  schemaVersion: normalizedCommerceEvents.schemaVersion,
};

export async function createNormalizedCommerceEvent(
  db: Queryable<Schema>,
  input: CreateNormalizedCommerceEventInput,
): Promise<NormalizedCommerceEventRow> {
  const [row] = await db.insert(normalizedCommerceEvents).values(input).returning(NORMALIZED_EVENT_COLUMNS);
  if (!row) throw new Error("createNormalizedCommerceEvent: insert returned no row");
  return row;
}

export async function findNormalizedCommerceEventByRawEventId(
  db: Queryable<Schema>,
  rawEventId: string,
): Promise<NormalizedCommerceEventRow | null> {
  const [row] = await db
    .select(NORMALIZED_EVENT_COLUMNS)
    .from(normalizedCommerceEvents)
    .where(eq(normalizedCommerceEvents.rawEventId, rawEventId))
    .limit(1);
  return row ?? null;
}

/** Looked up by primary key (COM-003) - purchase-lifecycle-service.ts processes one normalized event at a time by its own id. */
export async function findNormalizedCommerceEventById(
  db: Queryable<Schema>,
  id: string,
): Promise<NormalizedCommerceEventRow | null> {
  const [row] = await db
    .select(NORMALIZED_EVENT_COLUMNS)
    .from(normalizedCommerceEvents)
    .where(eq(normalizedCommerceEvents.id, id))
    .limit(1);
  return row ?? null;
}
