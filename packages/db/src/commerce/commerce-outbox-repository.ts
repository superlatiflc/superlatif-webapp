// Commerce outbox persistence and synchronous drain (COM-003).
//
// See schema/purchases.ts's module doc: `commerce_outbox` is a minimal,
// this-task-scoped mechanism, deliberately not a full queue schema. Every
// row is written inside the SAME db.transaction as the grant/reconciliation
// write it accompanies (purchase-lifecycle-service.ts) - that is what makes
// "outbox prevents partial commerce/access commits" true: a failure later
// in that transaction rolls back the outbox row and the grant together.
//
// `drainCommerceOutbox` is NOT a queue worker - there is no
// queue/worker-dispatch infrastructure anywhere in this repository yet
// (same documented gap commerce-event-service.ts's module doc already
// records for COM-002). It is a synchronous, injectable-consumer function:
// a future task with real dispatch infrastructure can call it from a job
// handler without changing its contract. A `publish` failure leaves a row
// `pending` for a later drain call to retry - it never marks a row
// delivered speculatively.

import { eq } from "drizzle-orm";
import type { Queryable, Schema } from "../db-types.ts";
import { commerceOutbox } from "../schema/index.ts";

export type CommerceOutboxEventType =
  "grant_issued" | "grant_revoked" | "grant_suspended" | "reconciliation_required";

export interface CreateOutboxEntryInput {
  readonly purchaseId: string;
  readonly eventType: CommerceOutboxEventType;
  readonly payload: Record<string, unknown>;
}

export interface CommerceOutboxRow {
  readonly id: string;
  readonly purchaseId: string;
  readonly eventType: string;
  readonly payload: Record<string, unknown>;
  readonly status: string;
  readonly deliveredAt: Date | null;
}

const OUTBOX_COLUMNS = {
  id: commerceOutbox.id,
  purchaseId: commerceOutbox.purchaseId,
  eventType: commerceOutbox.eventType,
  payload: commerceOutbox.payload,
  status: commerceOutbox.status,
  deliveredAt: commerceOutbox.deliveredAt,
};

export async function createOutboxEntry(
  db: Queryable<Schema>,
  input: CreateOutboxEntryInput,
): Promise<CommerceOutboxRow> {
  const [row] = await db
    .insert(commerceOutbox)
    .values({ purchaseId: input.purchaseId, eventType: input.eventType, payload: input.payload })
    .returning(OUTBOX_COLUMNS);
  if (!row) throw new Error("createOutboxEntry: insert returned no row");
  return row;
}

export async function listPendingOutboxEntries(db: Queryable<Schema>): Promise<CommerceOutboxRow[]> {
  return db.select(OUTBOX_COLUMNS).from(commerceOutbox).where(eq(commerceOutbox.status, "pending"));
}

async function markOutboxEntryDelivered(db: Queryable<Schema>, id: string, deliveredAt: Date): Promise<void> {
  await db.update(commerceOutbox).set({ status: "delivered", deliveredAt }).where(eq(commerceOutbox.id, id));
}

export interface DrainOutboxResult {
  readonly delivered: readonly string[];
  readonly failed: readonly string[];
}

/**
 * Delivers every pending entry to the injected `publish` function, one at a
 * time. A row is marked `delivered` only after `publish` resolves
 * successfully for it; a rejected `publish` leaves that row `pending` and
 * moves on to the next - one failing entry never blocks the rest of the
 * drain.
 */
export async function drainCommerceOutbox(
  db: Queryable<Schema>,
  publish: (entry: CommerceOutboxRow) => Promise<void>,
  now: Date,
): Promise<DrainOutboxResult> {
  const pending = await listPendingOutboxEntries(db);
  const delivered: string[] = [];
  const failed: string[] = [];
  for (const entry of pending) {
    try {
      await publish(entry);
      await markOutboxEntryDelivered(db, entry.id, now);
      delivered.push(entry.id);
    } catch {
      failed.push(entry.id);
    }
  }
  return { delivered, failed };
}
