// Reconciliation case persistence (COM-003).
//
// dok 21 §4's `reconciliation_cases` - append-only, one row per normalized
// commerce event this task could not cleanly process into a grant decision
// (unknown SKU, unresolved identity, ambiguous/out-of-order transition, an
// unverifiable partial refund, an unresolvable policy validity config, or a
// chargeback flagged for human review). Deliberately separate from COM-002's
// `commerce_event_quarantine` - see schema/purchases.ts's module doc.

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

export async function listReconciliationCasesForPurchase(
  db: Queryable<Schema>,
  purchaseId: string,
): Promise<ReconciliationCaseRow[]> {
  return db
    .select(RECONCILIATION_CASE_COLUMNS)
    .from(reconciliationCases)
    .where(eq(reconciliationCases.relatedPurchaseId, purchaseId));
}
