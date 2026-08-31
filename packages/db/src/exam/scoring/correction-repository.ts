// correction_cases/correction_decisions persistence (SCR-002).
//
// Mirrors packages/db/src/access's request/decision repository shape for
// access_change_requests/access_change_decisions (ENT-004) - a plain
// insert for the immutable ask, a plain insert for each append-only
// decision, and a by-case listing for status derivation.

import { asc, eq } from "drizzle-orm";
import type { Queryable, Schema } from "../../db-types.ts";
import { correctionCases, correctionDecisions } from "../../schema/index.ts";

export interface CorrectionCaseRow {
  readonly id: string;
  readonly attemptId: string;
  readonly currentResultVersionId: string;
  readonly correctedScoringPolicyVersionId: string;
  readonly cause: string;
  readonly evidenceRef: string | null;
  readonly requestedByUserId: string;
  readonly correlationId: string;
  readonly createdAt: Date;
}

export interface InsertCorrectionCaseInput {
  readonly attemptId: string;
  readonly currentResultVersionId: string;
  readonly correctedScoringPolicyVersionId: string;
  readonly cause: string;
  readonly evidenceRef: string | null;
  readonly requestedByUserId: string;
  readonly correlationId: string;
}

export async function insertCorrectionCase(
  db: Queryable<Schema>,
  input: InsertCorrectionCaseInput,
): Promise<CorrectionCaseRow> {
  const [row] = await db.insert(correctionCases).values(input).returning();
  if (!row) throw new Error("insertCorrectionCase: insert returned no row");
  return row as CorrectionCaseRow;
}

export async function findCorrectionCaseById(
  db: Queryable<Schema>,
  caseId: string,
): Promise<CorrectionCaseRow | null> {
  const [row] = await db.select().from(correctionCases).where(eq(correctionCases.id, caseId)).limit(1);
  return (row as CorrectionCaseRow | undefined) ?? null;
}

export interface CorrectionDecisionRow {
  readonly id: string;
  readonly correctionCaseId: string;
  readonly decidedByUserId: string;
  readonly outcome: "approved" | "rejected";
  readonly reason: string;
  readonly correlationId: string;
  readonly executionStatus: "executed" | "execution_failed" | null;
  readonly executionResult: Record<string, unknown> | null;
  readonly newResultVersionId: string | null;
  readonly occurredAt: Date;
}

export interface InsertCorrectionDecisionInput {
  readonly correctionCaseId: string;
  readonly decidedByUserId: string;
  readonly outcome: "approved" | "rejected";
  readonly reason: string;
  readonly correlationId: string;
  readonly executionStatus?: "executed" | "execution_failed";
  readonly executionResult?: Record<string, unknown>;
  readonly newResultVersionId?: string;
  readonly occurredAt: Date;
}

export async function insertCorrectionDecision(
  db: Queryable<Schema>,
  input: InsertCorrectionDecisionInput,
): Promise<CorrectionDecisionRow> {
  const [row] = await db.insert(correctionDecisions).values(input).returning();
  if (!row) throw new Error("insertCorrectionDecision: insert returned no row");
  return row as CorrectionDecisionRow;
}

export async function listCorrectionDecisions(
  db: Queryable<Schema>,
  correctionCaseId: string,
): Promise<readonly CorrectionDecisionRow[]> {
  const rows = await db
    .select()
    .from(correctionDecisions)
    .where(eq(correctionDecisions.correctionCaseId, correctionCaseId))
    .orderBy(asc(correctionDecisions.occurredAt));
  return rows as CorrectionDecisionRow[];
}
