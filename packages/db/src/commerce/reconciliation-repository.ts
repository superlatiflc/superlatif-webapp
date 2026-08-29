// Reconciliation case persistence (COM-003; owner/resolution-state columns
// and mutators added by COM-006).
//
// dok 21 §4's `reconciliation_cases` - one row per normalized commerce
// event this task could not cleanly process into a grant decision (unknown
// SKU, unresolved identity, ambiguous/out-of-order transition, an
// unverifiable partial refund, an unresolvable policy validity config, or a
// chargeback flagged for human review). Deliberately separate from COM-002's
// `commerce_event_quarantine` - see schema/purchases.ts's module doc.
//
// COM-003 only ever INSERTED a row (open, unassigned, unresolved). COM-006
// adds the only two mutators this table has: `assignReconciliationCase`
// (status -> "assigned"/"investigating", sets the owner) and
// `resolveReconciliationCase` (status -> "resolved"/"ignored_with_reason",
// stamps who/when/why). Both refuse to touch an already-terminal case -
// idempotency lives here, not just in the caller.

import { eq } from "drizzle-orm";
import type { Queryable, Schema } from "../db-types.ts";
import { reconciliationCases } from "../schema/index.ts";

export type ReconciliationCaseType =
  | "unknown_sku"
  | "unresolved_identity"
  | "ambiguous_transition"
  | "unverifiable_partial_refund"
  | "policy_validity_unresolvable"
  | "chargeback_review";

/** dok 25 §13's own queue-state vocabulary, transcribed verbatim. */
export type ReconciliationCaseStatus =
  "open" | "assigned" | "investigating" | "resolved" | "ignored_with_reason";

export const TERMINAL_RECONCILIATION_STATUSES: readonly ReconciliationCaseStatus[] = [
  "resolved",
  "ignored_with_reason",
];

export function isTerminalReconciliationStatus(status: string): boolean {
  return (TERMINAL_RECONCILIATION_STATUSES as readonly string[]).includes(status);
}

export interface CreateReconciliationCaseInput {
  readonly caseType: ReconciliationCaseType;
  readonly severity?: string;
  readonly relatedUserId?: string | null;
  readonly relatedPurchaseId?: string | null;
  readonly relatedNormalizedEventId?: string | null;
  readonly evidence: Record<string, unknown>;
}

export interface ReconciliationCaseRow {
  readonly id: string;
  readonly caseType: string;
  readonly severity: string;
  readonly relatedUserId: string | null;
  readonly relatedPurchaseId: string | null;
  readonly relatedNormalizedEventId: string | null;
  readonly evidence: Record<string, unknown>;
  readonly status: string;
  readonly assignedToUserId: string | null;
  readonly resolvedByUserId: string | null;
  readonly resolvedAt: Date | null;
  readonly resolutionReason: string | null;
}

const RECONCILIATION_CASE_COLUMNS = {
  id: reconciliationCases.id,
  caseType: reconciliationCases.caseType,
  severity: reconciliationCases.severity,
  relatedUserId: reconciliationCases.relatedUserId,
  relatedPurchaseId: reconciliationCases.relatedPurchaseId,
  relatedNormalizedEventId: reconciliationCases.relatedNormalizedEventId,
  evidence: reconciliationCases.evidence,
  status: reconciliationCases.status,
  assignedToUserId: reconciliationCases.assignedToUserId,
  resolvedByUserId: reconciliationCases.resolvedByUserId,
  resolvedAt: reconciliationCases.resolvedAt,
  resolutionReason: reconciliationCases.resolutionReason,
};

export async function createReconciliationCase(
  db: Queryable<Schema>,
  input: CreateReconciliationCaseInput,
): Promise<ReconciliationCaseRow> {
  const [row] = await db
    .insert(reconciliationCases)
    .values({
      caseType: input.caseType,
      severity: input.severity ?? "review_required",
      relatedUserId: input.relatedUserId ?? null,
      relatedPurchaseId: input.relatedPurchaseId ?? null,
      relatedNormalizedEventId: input.relatedNormalizedEventId ?? null,
      evidence: input.evidence,
    })
    .returning(RECONCILIATION_CASE_COLUMNS);
  if (!row) throw new Error("createReconciliationCase: insert returned no row");
  return row;
}

export async function findReconciliationCaseById(
  db: Queryable<Schema>,
  id: string,
): Promise<ReconciliationCaseRow | null> {
  const [row] = await db
    .select(RECONCILIATION_CASE_COLUMNS)
    .from(reconciliationCases)
    .where(eq(reconciliationCases.id, id))
    .limit(1);
  return row ?? null;
}

export async function listReconciliationCasesForPurchase(
  db: Queryable<Schema>,
  purchaseId: string,
): Promise<ReconciliationCaseRow[]> {
  return db
    .select(RECONCILIATION_CASE_COLUMNS)
    .from(reconciliationCases)
    .where(eq(reconciliationCases.relatedPurchaseId, purchaseId));
}

/**
 * Sets the case's owner and moves it to "assigned" - a no-op (returns the
 * row unchanged) if the case is already terminal (resolved/ignored). Never
 * touches `resolvedAt`/`resolvedByUserId`/`resolutionReason`.
 */
export async function assignReconciliationCase(
  db: Queryable<Schema>,
  caseId: string,
  assignedToUserId: string,
): Promise<ReconciliationCaseRow> {
  const existing = await findReconciliationCaseById(db, caseId);
  if (!existing) throw new Error(`assignReconciliationCase: case ${caseId} not found`);
  if (isTerminalReconciliationStatus(existing.status)) return existing;

  const [row] = await db
    .update(reconciliationCases)
    .set({ status: "assigned", assignedToUserId })
    .where(eq(reconciliationCases.id, caseId))
    .returning(RECONCILIATION_CASE_COLUMNS);
  if (!row) throw new Error("assignReconciliationCase: update returned no row");
  return row;
}

/**
 * The ONE function that stamps a case as terminal - `status` must be
 * "resolved" or "ignored_with_reason". A no-op on an already-terminal case
 * (idempotency lives here, not only in the repair service that calls this).
 */
export async function resolveReconciliationCase(
  db: Queryable<Schema>,
  caseId: string,
  status: "resolved" | "ignored_with_reason",
  resolvedByUserId: string,
  resolutionReason: string,
  resolvedAt: Date,
): Promise<ReconciliationCaseRow> {
  const existing = await findReconciliationCaseById(db, caseId);
  if (!existing) throw new Error(`resolveReconciliationCase: case ${caseId} not found`);
  if (isTerminalReconciliationStatus(existing.status)) return existing;

  const [row] = await db
    .update(reconciliationCases)
    .set({ status, resolvedByUserId, resolutionReason, resolvedAt })
    .where(eq(reconciliationCases.id, caseId))
    .returning(RECONCILIATION_CASE_COLUMNS);
  if (!row) throw new Error("resolveReconciliationCase: update returned no row");
  return row;
}
