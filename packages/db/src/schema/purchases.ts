// Purchase lifecycle, reconciliation, and outbox schema (COM-003).
//
// 21_ERD_AND_DATA_DICTIONARY.md §4 "Product and commerce" describes
// `purchases`, `purchase_events`, and `reconciliation_cases` - this task
// implements exactly those three, plus one addition of its own,
// `commerce_outbox`, which is NOT in dok 21 (a minimal, this-task-scoped
// mechanism, not a full message-queue schema - see purchase-lifecycle-
// service.ts's module doc).
//
// Four tables, two different mutability disciplines:
//
//   purchases           - a MUTABLE snapshot/projection ("upsert purchase
//                          snapshot", dok 23 §11), not an immutable fact log
//                          itself. The fact log is purchase_events below
//                          (append-only) plus access_grants/grant_events
//                          (ENT-001, unchanged) - the purchase row is
//                          rebuildable from those at any time (CLAUDE.md
//                          "Rebuild projection from source records and
//                          compare results in tests"), the same class of
//                          deliberate exception PRG-002's
//                          `program_enrollments.isPrimary` already used.
//   purchase_events      - append-only. One row per normalized commerce
//                          event this task ever processed for a purchase,
//                          UNIQUE on normalizedEventId - this is the
//                          idempotency backbone for "replay/retry
//                          idempotent" at the purchase-processing layer
//                          (COM-002 already dedupes at the raw-ingestion
//                          layer; this is the second, independent layer).
//   reconciliation_cases - append-only audit trail for a normalized event
//                          this task could NOT cleanly process into a
//                          grant decision - unknown SKU, unresolved
//                          identity, an ambiguous/out-of-order transition,
//                          an unverifiable partial refund, or an
//                          unresolvable policy validity config. Deliberately
//                          separate from COM-002's commerce_event_quarantine:
//                          quarantine is about an event that could not be
//                          NORMALIZED (bad signature/shape); a
//                          reconciliation case is about a normalized event
//                          that could not be PROCESSED (dok 21 §4's own
//                          separation of these two tables).
//   commerce_outbox      - append-only. One row per purchase-lifecycle side
//                          effect (grant issued/revoked, reconciliation
//                          required) written in the SAME transaction as
//                          that effect - see purchase-lifecycle-service.ts.

import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { purchaseState } from "./enums.ts";
import { normalizedCommerceEvents } from "./commerce-events.ts";
import { offers } from "./commerce.ts";
import { users } from "./identity.ts";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/**
 * `userId`/`offerId` are nullable until resolved (dok 21 §4 "user nullable
 * until resolved") - an unresolved identity or unknown SKU still gets a
 * purchase row (never silently dropped), with the gap recorded as a
 * `reconciliation_cases` row instead. `externalSkuId` stays on this table
 * even after `offerId` resolves, so a later reprocessing pass always has
 * the original raw SKU to work from. `lastEventOccurredAt` is the anchor
 * @superlatif/domain/commerce#resolvePurchaseTransition compares every
 * incoming event's `occurredAt` against - distinct from `orderedAt`/
 * `paidAt`/`refundedAt`, which are semantic milestones, not a generic
 * ordering cursor.
 */
export const purchases = pgTable(
  "purchases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    provider: text("provider").notNull(),
    site: text("site").notNull(),
    externalOrderId: text("external_order_id").notNull(),
    userId: uuid("user_id").references(() => users.id),
    offerId: uuid("offer_id").references(() => offers.id),
    externalSkuId: text("external_sku_id").notNull(),
    status: purchaseState("status").notNull(),
    currency: text("currency").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    orderedAt: timestamp("ordered_at", { withTimezone: true }).notNull(),
    lastEventOccurredAt: timestamp("last_event_occurred_at", { withTimezone: true }).notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("purchase_provider_site_order_uq").on(table.provider, table.site, table.externalOrderId),
    index("purchase_user_idx").on(table.userId),
    index("purchase_offer_idx").on(table.offerId),
  ],
);

/**
 * `transitionOutcome`: "applied" | "ignored_duplicate" | "ignored_out_of_order"
 * - @superlatif/domain/commerce#resolvePurchaseTransition's decision,
 * persisted. The unique index on `normalizedEventId` is what makes
 * `processPurchaseLifecycleEvent` idempotent: attempting to process the
 * same normalized event twice finds this row and returns its already-
 * recorded outcome instead of re-deriving (and possibly re-applying) a
 * decision.
 */
export const purchaseEvents = pgTable(
  "purchase_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    purchaseId: uuid("purchase_id")
      .notNull()
      .references(() => purchases.id),
    normalizedEventId: uuid("normalized_event_id")
      .notNull()
      .references(() => normalizedCommerceEvents.id),
    status: purchaseState("status").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    transitionOutcome: text("transition_outcome").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("purchase_event_normalized_event_uq").on(table.normalizedEventId),
    index("purchase_event_purchase_idx").on(table.purchaseId),
  ],
);

/**
 * `caseType`: "unknown_sku" | "unresolved_identity" | "ambiguous_transition"
 * | "unverifiable_partial_refund" | "policy_validity_unresolvable" |
 * "chargeback_review". `evidence` holds safe, non-secret context only
 * (status values, component codes, reason strings) - never a raw provider
 * payload (that already lives, redacted, on COM-002's
 * commerce_event_quarantine/raw_commerce_events).
 *
 * `status`: "open" | "assigned" | "investigating" | "resolved" |
 * "ignored_with_reason" (dok 25 §13's own queue-state vocabulary,
 * transcribed verbatim) - still free text, matching this table's own
 * existing convention, not a new enum. `assignedToUserId`/
 * `resolvedByUserId`/`resolvedAt`/`resolutionReason` (COM-006) are the
 * "owner and resolution state" acceptance criterion - four nullable
 * columns added to this EXISTING table rather than a new one, since
 * nothing about them needs a separate audit-trail table: a case has at
 * most one live resolution, and the columns going from null to set IS
 * the audit fact (who, when, why) - packages/db/src/commerce/
 * reconciliation-repair-service.ts is the only code that ever sets them.
 */
export const reconciliationCases = pgTable(
  "reconciliation_cases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    caseType: text("case_type").notNull(),
    severity: text("severity").notNull().default("review_required"),
    relatedUserId: uuid("related_user_id").references(() => users.id),
    relatedPurchaseId: uuid("related_purchase_id").references(() => purchases.id),
    relatedNormalizedEventId: uuid("related_normalized_event_id").references(
      () => normalizedCommerceEvents.id,
    ),
    evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status").notNull().default("open"),
    assignedToUserId: uuid("assigned_to_user_id").references(() => users.id),
    resolvedByUserId: uuid("resolved_by_user_id").references(() => users.id),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolutionReason: text("resolution_reason"),
    createdAt: createdAt(),
  },
  (table) => [
    index("reconciliation_case_purchase_idx").on(table.relatedPurchaseId),
    index("reconciliation_case_status_idx").on(table.status),
  ],
);

/**
 * Minimal outbox, NOT a full queue schema (founder instruction). One row
 * per purchase-lifecycle side effect, written in the SAME transaction as
 * the grant/reconciliation-case write it accompanies - "outbox prevents
 * partial commerce/access commits" (acceptance) means a transaction that
 * fails after issuing a grant but before writing this row rolls back the
 * grant too, never leaving one without the other. `drainCommerceOutbox`
 * (purchase-lifecycle-service.ts) is the ONLY reader - a synchronous,
 * injectable-consumer function, not a queue worker.
 */
export const commerceOutbox = pgTable(
  "commerce_outbox",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    purchaseId: uuid("purchase_id")
      .notNull()
      .references(() => purchases.id),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: createdAt(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  },
  (table) => [index("commerce_outbox_status_idx").on(table.status)],
);
