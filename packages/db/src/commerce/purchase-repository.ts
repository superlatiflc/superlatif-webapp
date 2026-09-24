// Purchase snapshot and purchase-event persistence (COM-003).
//
// Two different disciplines in one file, matching schema/purchases.ts's
// module doc: `purchases` rows are a mutable projection (updatePurchaseStatus
// is the one function that mutates an existing row); `purchase_events` rows
// are append-only, never updated.

import { and, asc, desc, eq, isNull } from "drizzle-orm";
import type { PurchaseState } from "@superlatif/domain/commerce";
import type { Queryable, Schema } from "../db-types.ts";
import { normalizedCommerceEvents, purchaseEvents, purchases } from "../schema/index.ts";

export interface PurchaseRow {
  readonly id: string;
  readonly provider: string;
  readonly site: string;
  readonly externalOrderId: string;
  readonly userId: string | null;
  readonly offerId: string | null;
  readonly externalSkuId: string;
  readonly status: string;
  readonly currency: string;
  readonly amountMinor: number;
  readonly orderedAt: Date;
  readonly lastEventOccurredAt: Date;
  readonly paidAt: Date | null;
  readonly refundedAt: Date | null;
}

const PURCHASE_COLUMNS = {
  id: purchases.id,
  provider: purchases.provider,
  site: purchases.site,
  externalOrderId: purchases.externalOrderId,
  userId: purchases.userId,
  offerId: purchases.offerId,
  externalSkuId: purchases.externalSkuId,
  status: purchases.status,
  currency: purchases.currency,
  amountMinor: purchases.amountMinor,
  orderedAt: purchases.orderedAt,
  lastEventOccurredAt: purchases.lastEventOccurredAt,
  paidAt: purchases.paidAt,
  refundedAt: purchases.refundedAt,
};

export interface CreatePurchaseInput {
  readonly provider: string;
  readonly site: string;
  readonly externalOrderId: string;
  readonly userId: string | null;
  readonly offerId: string | null;
  readonly externalSkuId: string;
  readonly status: PurchaseState;
  readonly currency: string;
  readonly amountMinor: number;
  readonly orderedAt: Date;
  readonly lastEventOccurredAt: Date;
  readonly paidAt?: Date | null;
  readonly refundedAt?: Date | null;
}

export async function createPurchase(
  db: Queryable<Schema>,
  input: CreatePurchaseInput,
): Promise<PurchaseRow> {
  const [row] = await db
    .insert(purchases)
    .values({
      provider: input.provider,
      site: input.site,
      externalOrderId: input.externalOrderId,
      userId: input.userId,
      offerId: input.offerId,
      externalSkuId: input.externalSkuId,
      status: input.status,
      currency: input.currency,
      amountMinor: input.amountMinor,
      orderedAt: input.orderedAt,
      lastEventOccurredAt: input.lastEventOccurredAt,
      paidAt: input.paidAt ?? null,
      refundedAt: input.refundedAt ?? null,
    })
    .returning(PURCHASE_COLUMNS);
  if (!row) throw new Error("createPurchase: insert returned no row");
  return row;
}

export async function findPurchaseByExternalOrder(
  db: Queryable<Schema>,
  provider: string,
  site: string,
  externalOrderId: string,
): Promise<PurchaseRow | null> {
  const [row] = await db
    .select(PURCHASE_COLUMNS)
    .from(purchases)
    .where(
      and(
        eq(purchases.provider, provider),
        eq(purchases.site, site),
        eq(purchases.externalOrderId, externalOrderId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function findPurchaseById(db: Queryable<Schema>, id: string): Promise<PurchaseRow | null> {
  const [row] = await db.select(PURCHASE_COLUMNS).from(purchases).where(eq(purchases.id, id)).limit(1);
  return row ?? null;
}

/** Ordered by (orderedAt, id) for the same determinism reason as access/grant-repository.ts#listGrantsForUser - ENT-003's rebuild/drift functions need a stable order to compare across repeated calls. */
export async function listPurchasesForUser(db: Queryable<Schema>, userId: string): Promise<PurchaseRow[]> {
  return db
    .select(PURCHASE_COLUMNS)
    .from(purchases)
    .where(eq(purchases.userId, userId))
    .orderBy(asc(purchases.orderedAt), asc(purchases.id));
}

export interface UpdatePurchaseStatusInput {
  readonly status: PurchaseState;
  readonly lastEventOccurredAt: Date;
  readonly offerId?: string | null;
  readonly userId?: string | null;
  readonly paidAt?: Date | null;
  readonly refundedAt?: Date | null;
}

/**
 * The only function that mutates an existing `purchases` row - a status
 * transition plus its timeline anchor, and optionally a late identity/SKU
 * resolution (`userId`/`offerId`, left undefined to leave unchanged).
 * Never touches `externalOrderId`/`provider`/`site` (the row's identity)
 * or `orderedAt` (when the order was first seen).
 */
export async function updatePurchaseStatus(
  db: Queryable<Schema>,
  purchaseId: string,
  input: UpdatePurchaseStatusInput,
): Promise<void> {
  const patch: Record<string, unknown> = {
    status: input.status,
    lastEventOccurredAt: input.lastEventOccurredAt,
  };
  if (input.offerId !== undefined) patch["offerId"] = input.offerId;
  if (input.userId !== undefined) patch["userId"] = input.userId;
  if (input.paidAt !== undefined) patch["paidAt"] = input.paidAt;
  if (input.refundedAt !== undefined) patch["refundedAt"] = input.refundedAt;
  await db.update(purchases).set(patch).where(eq(purchases.id, purchaseId));
}

export type PurchaseTransitionOutcomeLabel =
  | "applied"
  | "ignored_duplicate"
  | "ignored_out_of_order"
  /** M2 (ADR-074): the event names a different buyer than the purchase is bound to - recorded, never applied. */
  | "ignored_identity_mismatch";

export interface CreatePurchaseEventInput {
  readonly purchaseId: string;
  readonly normalizedEventId: string;
  readonly status: PurchaseState;
  readonly occurredAt: Date;
  readonly transitionOutcome: PurchaseTransitionOutcomeLabel;
}

export interface PurchaseEventRow {
  readonly id: string;
  readonly purchaseId: string;
  readonly normalizedEventId: string;
  readonly status: string;
  readonly occurredAt: Date;
  readonly transitionOutcome: string;
}

const PURCHASE_EVENT_COLUMNS = {
  id: purchaseEvents.id,
  purchaseId: purchaseEvents.purchaseId,
  normalizedEventId: purchaseEvents.normalizedEventId,
  status: purchaseEvents.status,
  occurredAt: purchaseEvents.occurredAt,
  transitionOutcome: purchaseEvents.transitionOutcome,
};

export async function createPurchaseEvent(
  db: Queryable<Schema>,
  input: CreatePurchaseEventInput,
): Promise<PurchaseEventRow> {
  const [row] = await db.insert(purchaseEvents).values(input).returning(PURCHASE_EVENT_COLUMNS);
  if (!row) throw new Error("createPurchaseEvent: insert returned no row");
  return row;
}

/** The idempotency check: has this exact normalized event already been processed into a purchase_events row? */
export async function findPurchaseEventByNormalizedEventId(
  db: Queryable<Schema>,
  normalizedEventId: string,
): Promise<PurchaseEventRow | null> {
  const [row] = await db
    .select(PURCHASE_EVENT_COLUMNS)
    .from(purchaseEvents)
    .where(eq(purchaseEvents.normalizedEventId, normalizedEventId))
    .limit(1);
  return row ?? null;
}

export async function listPurchaseEvents(
  db: Queryable<Schema>,
  purchaseId: string,
): Promise<PurchaseEventRow[]> {
  return db
    .select(PURCHASE_EVENT_COLUMNS)
    .from(purchaseEvents)
    .where(eq(purchaseEvents.purchaseId, purchaseId));
}

// --- Buyer binding (M2, ADR-074) --------------------------------------------

/** Row-locks one purchase for the rest of the transaction, so two concurrent claims cannot both bind it. */
export async function lockPurchaseById(db: Queryable<Schema>, id: string): Promise<PurchaseRow | null> {
  const [row] = await db
    .select(PURCHASE_COLUMNS)
    .from(purchases)
    .where(eq(purchases.id, id))
    .limit(1)
    .for("update");
  return row ?? null;
}

/**
 * The distinct buyer subjects (`externalUserId`) across EVERY event recorded
 * for a purchase. A purchase is bindable to a buyer only when this is exactly
 * that one subject - two different subjects on one order is a conflict for a
 * human, never a guess.
 */
export async function listBuyerSubjectsForPurchase(
  db: Queryable<Schema>,
  purchaseId: string,
): Promise<string[]> {
  const rows = await db
    .selectDistinct({ subject: normalizedCommerceEvents.externalUserId })
    .from(purchaseEvents)
    .innerJoin(normalizedCommerceEvents, eq(normalizedCommerceEvents.id, purchaseEvents.normalizedEventId))
    .where(eq(purchaseEvents.purchaseId, purchaseId));
  return rows.map((row) => row.subject);
}

/** The newest normalized event behind a purchase - the reference a late grant decision is attributed to. */
export async function findLatestNormalizedEventIdForPurchase(
  db: Queryable<Schema>,
  purchaseId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ id: purchaseEvents.normalizedEventId })
    .from(purchaseEvents)
    .where(eq(purchaseEvents.purchaseId, purchaseId))
    .orderBy(desc(purchaseEvents.occurredAt), desc(purchaseEvents.createdAt))
    .limit(1);
  return row?.id ?? null;
}

/** Purchases of one commerce provider still waiting for a buyer, that name `subject` as their buyer. */
export async function listUnboundPurchaseIdsForBuyer(
  db: Queryable<Schema>,
  provider: string,
  subject: string,
): Promise<string[]> {
  const rows = await db
    .selectDistinct({ id: purchases.id })
    .from(purchases)
    .innerJoin(purchaseEvents, eq(purchaseEvents.purchaseId, purchases.id))
    .innerJoin(normalizedCommerceEvents, eq(normalizedCommerceEvents.id, purchaseEvents.normalizedEventId))
    .where(
      and(
        eq(purchases.provider, provider),
        isNull(purchases.userId),
        eq(normalizedCommerceEvents.externalUserId, subject),
      ),
    );
  return rows.map((row) => row.id);
}
