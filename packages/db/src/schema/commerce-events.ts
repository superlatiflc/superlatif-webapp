// Raw commerce event ingestion and normalization schema (COM-002).
//
// Three tables, one append-only pipeline:
//
//   raw_commerce_events        - the immutable envelope, ALWAYS persisted,
//                                 regardless of signature/shape outcome
//                                 (dok 22 §16 step 5 "Persist envelope
//                                 idempotently" - persistence happens before
//                                 any normalization decision, not after a
//                                 successful one).
//   commerce_event_quarantine  - one row per raw event this task could NOT
//                                 turn into a normalized event (bad
//                                 signature, unsupported type, unrecognized
//                                 status) - "jangan silent drop" (founder
//                                 instruction) made structural: a quarantine
//                                 row is the audit trail, not a log line.
//   normalized_commerce_events - the dok 22 §17 canonical shape, at most one
//                                 per raw event, provider-agnostic, ready
//                                 for COM-003 to consume. Never embeds the
//                                 raw payload - only a link (rawEventId).
//
// No live Sejoli/WordPress connection, no production webhook secret - see
// @superlatif/domain/commerce/webhook-verification.ts's module doc. Status
// columns (`status` on raw_commerce_events, `signatureOutcome`) stay free
// text, matching commerce.ts's own established local convention
// (products.status, offers.visibility, externalSkuMappings.status are all
// free text, not enums) rather than importing ENT-001/PRG-002's
// enum-preference from a different domain area.

import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { purchaseState } from "./enums.ts";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/**
 * The immutable envelope. `rawPayloadRedacted`/`payloadChecksum` are never
 * updated after insert by any function in this task - only `status`
 * transitions (received -> normalized | quarantined), proven directly by
 * the "no raw payload mutation" required test. `eventKey` is either a
 * provider-supplied stable ID or a deterministic checksum fallback
 * (@superlatif/domain/commerce#deriveEventKey) - the (provider, eventKey)
 * unique index is what makes re-ingesting the same delivery idempotent
 * (dok 22 §16 step 5) instead of creating a duplicate row.
 */
export const rawCommerceEvents = pgTable(
  "raw_commerce_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    provider: text("provider").notNull(),
    site: text("site").notNull(),
    eventKey: text("event_key").notNull(),
    /** "verified" | "failed" | "unverified" - @superlatif/domain/commerce#SignatureOutcome. */
    signatureOutcome: text("signature_outcome").notNull(),
    payloadChecksum: text("payload_checksum").notNull(),
    rawPayloadRedacted: jsonb("raw_payload_redacted").$type<Record<string, unknown>>().notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    correlationId: text("correlation_id").notNull(),
    /** "received" | "normalized" | "quarantined" - the only column this task ever updates on an existing row. */
    status: text("status").notNull().default("received"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("raw_commerce_event_provider_key_uq").on(table.provider, table.eventKey),
    index("raw_commerce_event_status_idx").on(table.status),
  ],
);

/**
 * dok 23 §11 "Unknown/ambiguous event creates reconciliation case" - this
 * task's own quarantine record is the COM-002-scoped predecessor to that
 * full reconciliation-case table (a later commerce task's scope, dok 21
 * §4's `reconciliation_cases`). At most one quarantine row per raw event
 * (unique index) - a raw event is quarantined for exactly one reason at a
 * time in this task's scope; re-processing/appeal workflows are not built
 * here.
 */
export const commerceEventQuarantine = pgTable(
  "commerce_event_quarantine",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    rawEventId: uuid("raw_event_id")
      .notNull()
      .references(() => rawCommerceEvents.id),
    /** "signature_verification_failed" | "unsupported_event_type" | "unknown_status". */
    reasonCode: text("reason_code").notNull(),
    /** Safe, non-secret explanation - never the raw payload itself (that lives on raw_commerce_events, redacted). */
    detail: text("detail").notNull(),
    quarantinedAt: timestamp("quarantined_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("commerce_event_quarantine_raw_event_uq").on(table.rawEventId)],
);

/**
 * dok 22 §17's canonical commerce event, at most one per raw event. Never
 * resolves `externalSkuId` to an internal offer, and never creates an
 * access grant - both are COM-003's explicit scope (dok 23 §11 "Paid":
 * "resolve identity and mapping; ... create source grant tree"), which
 * this table's rows are meant to feed, not preempt.
 */
export const normalizedCommerceEvents = pgTable(
  "normalized_commerce_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    rawEventId: uuid("raw_event_id")
      .notNull()
      .references(() => rawCommerceEvents.id),
    provider: text("provider").notNull(),
    site: text("site").notNull(),
    eventKey: text("event_key").notNull(),
    type: text("type").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    externalOrderId: text("external_order_id").notNull(),
    orderStatus: purchaseState("order_status").notNull(),
    currency: text("currency").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    externalUserId: text("external_user_id").notNull(),
    externalSkuId: text("external_sku_id").notNull(),
    schemaVersion: integer("schema_version").notNull().default(1),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("normalized_commerce_event_raw_event_uq").on(table.rawEventId),
    index("normalized_commerce_event_order_idx").on(table.provider, table.externalOrderId),
  ],
);
