// Result correction workflow (SCR-002): request -> peer decision ->
// execution, composing IDN-004's authorize() for role/maker-checker
// enforcement and SCR-001's computeScorePayload for the actual re-score.
//
// Two-step workflow, structurally identical to ENT-004's own
// requestManualChange/decideManualChange (packages/db/src/access/
// manual-change-service.ts) - that file's own module doc explains the
// shape this mirrors:
//   1. requestResultCorrection - authorize() gates it FIRST (nothing is
//      written if denied), refuses a no-op correction (same policy
//      version as the current result already used), then inserts the
//      immutable case row. Never touches result_versions.
//   2. decideResultCorrection - authorize() gates the DECIDER too (with
//      object.creatorUserId set to the requester, so IDN-004's universal
//      maker-checker rule refuses self-approval structurally - "Correction
//      approval separation", required test); on rejection nothing
//      executes; on approval, the re-score runs through
//      scoring-service.ts's own computeScorePayload against the
//      CORRECTED policy version (never the attempt's original pin), the
//      old result_versions row is superseded and a new one inserted
//      atomically, and the decision row records the outcome either way -
//      a failed execution is captured as `executionStatus:
//      "execution_failed"` rather than thrown, because the human decision
//      itself still happened and is still auditable.

import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { authorize, type AuthorizationDecision } from "@superlatif/domain/authorization";
import {
  assertCorrectionChangesPolicy,
  deriveCorrectionCaseStatus,
  type CorrectionCaseStatus,
  type CorrectionDecisionFacts,
} from "@superlatif/domain/exam";
import type { Queryable, Schema } from "../../db-types.ts";
import { listActiveRoleHoldings } from "../../authorization/index.ts";
import { findSubmissionByAttemptId } from "../attempt/attempt-submission-repository.ts";
import { computeScorePayload, ScoringSubmissionNotFoundError } from "./scoring-service.ts";
import {
  findCurrentResultByAttemptId,
  insertResultVersion,
  markResultVersionSuperseded,
  type ResultVersionRow,
} from "./result-repository.ts";
import {
  findCorrectionCaseById,
  insertCorrectionCase,
  insertCorrectionDecision,
  listCorrectionDecisions,
  type CorrectionCaseRow,
  type CorrectionDecisionRow,
} from "./correction-repository.ts";

export class CorrectionNotAuthorizedError extends Error {
  readonly decision: AuthorizationDecision;
  constructor(decision: AuthorizationDecision) {
    super(`Result correction refused: ${decision.reasonCode}`);
    this.name = "CorrectionNotAuthorizedError";
    this.decision = decision;
  }
}

export class CorrectionResultNotFoundError extends Error {
  constructor(readonly attemptId: string) {
    super(`Attempt ${attemptId} has no current result to correct`);
    this.name = "CorrectionResultNotFoundError";
  }
}

export class CorrectionCaseNotFoundError extends Error {
  constructor(readonly correctionCaseId: string) {
    super(`Correction case ${correctionCaseId} not found`);
    this.name = "CorrectionCaseNotFoundError";
  }
}

export class CorrectionCaseAlreadyDecidedError extends Error {
  constructor(
    readonly correctionCaseId: string,
    readonly status: CorrectionCaseStatus,
  ) {
    super(`Correction case ${correctionCaseId} already has a decision (status: ${status})`);
    this.name = "CorrectionCaseAlreadyDecidedError";
  }
}

/** The current result moved on (a different correction was already approved) between request and decide - refuses rather than silently re-deriving "current" and acting on a result the requester never actually saw. */
export class CorrectionCaseStaleError extends Error {
  constructor(readonly correctionCaseId: string) {
    super(
      `Correction case ${correctionCaseId} is stale - the attempt's current result has changed since it was requested`,
    );
    this.name = "CorrectionCaseStaleError";
  }
}

function toFacts(row: CorrectionDecisionRow): CorrectionDecisionFacts {
  return { outcome: row.outcome, executionStatus: row.executionStatus, occurredAt: row.occurredAt };
}

export interface RequestResultCorrectionInput {
  readonly attemptId: string;
  readonly requestedByUserId: string;
  readonly cause: string;
  readonly evidenceRef?: string;
  readonly correctedScoringPolicyVersionId: string;
  readonly correlationId: string;
}

/**
 * `authorize()` runs FIRST - a denied request (missing permission,
 * missing reason/correlationId per the `result_correction` high-risk
 * gate) writes nothing at all.
 */
export async function requestResultCorrection(
  db: Queryable<Schema>,
  input: RequestResultCorrectionInput,
): Promise<CorrectionCaseRow> {
  const roles = await listActiveRoleHoldings(db, input.requestedByUserId);
  const decision = authorize({
    actor: { userId: input.requestedByUserId, roles },
    action: {
      type: "result_correction_request",
      permission: "result.correction.request",
      highRiskType: "result_correction",
    },
    audit: { reason: input.cause, correlationId: input.correlationId },
  });
  if (!decision.allowed) throw new CorrectionNotAuthorizedError(decision);

  const currentResult = await findCurrentResultByAttemptId(db, input.attemptId);
  if (!currentResult) throw new CorrectionResultNotFoundError(input.attemptId);

  assertCorrectionChangesPolicy(currentResult.scoringPolicyVersionId, input.correctedScoringPolicyVersionId);

  return insertCorrectionCase(db, {
    attemptId: input.attemptId,
    currentResultVersionId: currentResult.id,
    correctedScoringPolicyVersionId: input.correctedScoringPolicyVersionId,
    cause: input.cause,
    evidenceRef: input.evidenceRef ?? null,
    requestedByUserId: input.requestedByUserId,
    correlationId: input.correlationId,
  });
}

export interface DecideResultCorrectionInput {
  readonly correctionCaseId: string;
  readonly decidedByUserId: string;
  readonly outcome: "approved" | "rejected";
  readonly reason: string;
  readonly correlationId: string;
}

export async function decideResultCorrection(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  input: DecideResultCorrectionInput,
  now: Date,
): Promise<CorrectionDecisionRow> {
  const correctionCase = await findCorrectionCaseById(db, input.correctionCaseId);
  if (!correctionCase) throw new CorrectionCaseNotFoundError(input.correctionCaseId);

  const existingDecisions = await listCorrectionDecisions(db, input.correctionCaseId);
  const currentStatus = deriveCorrectionCaseStatus(existingDecisions.map(toFacts));
  if (currentStatus !== "pending_approval") {
    throw new CorrectionCaseAlreadyDecidedError(input.correctionCaseId, currentStatus);
  }

  const roles = await listActiveRoleHoldings(db, input.decidedByUserId);
  const decision = authorize({
    actor: { userId: input.decidedByUserId, roles },
    action: {
      type: "result_correction_decision",
      permission: "result.correction.publish",
      highRiskType: "result_correction",
    },
    // Maker-checker: the requester is the "creator" of this decision's
    // object - a decider who IS the requester is refused here,
    // structurally, by IDN-004's universal rule, before anything below
    // runs. This IS "Correction approval separation" (required test).
    object: { creatorUserId: correctionCase.requestedByUserId },
    audit: { reason: input.reason, correlationId: input.correlationId },
  });
  if (!decision.allowed) throw new CorrectionNotAuthorizedError(decision);

  if (input.outcome === "rejected") {
    return insertCorrectionDecision(db, {
      correctionCaseId: input.correctionCaseId,
      decidedByUserId: input.decidedByUserId,
      outcome: "rejected",
      reason: input.reason,
      correlationId: input.correlationId,
      occurredAt: now,
    });
  }

  let executionStatus: "executed" | "execution_failed";
  let executionResult: Record<string, unknown>;
  let newResultVersionId: string | undefined;

  try {
    const currentResult = await findCurrentResultByAttemptId(db, correctionCase.attemptId);
    if (!currentResult || currentResult.id !== correctionCase.currentResultVersionId) {
      throw new CorrectionCaseStaleError(input.correctionCaseId);
    }
    const submission = await findSubmissionByAttemptId(db, correctionCase.attemptId);
    if (!submission) throw new ScoringSubmissionNotFoundError(correctionCase.attemptId);

    const payload = await computeScorePayload(
      db,
      correctionCase.attemptId,
      submission,
      correctionCase.correctedScoringPolicyVersionId,
    );

    const newResult: ResultVersionRow = await db.transaction(async (tx) => {
      // MUST supersede the old row before inserting the new current one -
      // the partial unique index result_version_attempt_current_uq
      // refuses two is_current rows for the same attempt at once.
      await markResultVersionSuperseded(tx, currentResult.id);
      return insertResultVersion(tx, {
        attemptId: correctionCase.attemptId,
        submissionId: submission.id,
        scoringPolicyVersionId: correctionCase.correctedScoringPolicyVersionId,
        version: currentResult.version + 1,
        isCurrent: true,
        state: "corrected",
        ...payload,
        computedAt: now,
      });
    });

    newResultVersionId = newResult.id;
    executionStatus = "executed";
    executionResult = { newResultVersionId: newResult.id, totalScore: newResult.totalScore };
  } catch (error) {
    executionStatus = "execution_failed";
    executionResult = {
      errorType: error instanceof Error ? error.constructor.name : "UnknownError",
      message: error instanceof Error ? error.message : String(error),
    };
  }

  return insertCorrectionDecision(db, {
    correctionCaseId: input.correctionCaseId,
    decidedByUserId: input.decidedByUserId,
    outcome: "approved",
    reason: input.reason,
    correlationId: input.correlationId,
    executionStatus,
    executionResult,
    ...(newResultVersionId ? { newResultVersionId } : {}),
    occurredAt: now,
  });
}

export interface CorrectionCaseWithStatus {
  readonly correctionCase: CorrectionCaseRow;
  readonly decisions: readonly CorrectionDecisionRow[];
  readonly status: CorrectionCaseStatus;
}

export async function getCorrectionCase(
  db: Queryable<Schema>,
  correctionCaseId: string,
): Promise<CorrectionCaseWithStatus | null> {
  const correctionCase = await findCorrectionCaseById(db, correctionCaseId);
  if (!correctionCase) return null;
  const decisions = await listCorrectionDecisions(db, correctionCaseId);
  const status = deriveCorrectionCaseStatus(decisions.map(toFacts));
  return { correctionCase, decisions, status };
}
