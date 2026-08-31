// Result correction case status derivation (SCR-002).
//
// Mirrors @superlatif/domain/access's `deriveManualChangeStatus` (ENT-004)
// almost exactly - the SAME "immutable ask, append-only decision log,
// status derived from the log, never stored as a mutable column"
// discipline, applied to a new domain. `result.correction.request`/
// `result.correction.publish` (IDN-004's own permission matrix,
// packages/domain/src/authorization/permissions.ts) and the
// `"result_correction"` high-risk action type (IDN-004's own
// HIGH_RISK_ACTION_TYPES) already existed before this task started -
// IDN-004 anticipated this exact workflow, so no new permission
// vocabulary is introduced here, only its consumer.

export type CorrectionDecisionOutcome = "approved" | "rejected";

export type CorrectionCaseStatus = "pending_approval" | "rejected" | "executed" | "execution_failed";

export interface CorrectionDecisionFacts {
  readonly outcome: CorrectionDecisionOutcome;
  readonly executionStatus: "executed" | "execution_failed" | null;
  readonly occurredAt: Date;
}

/** Only the LATEST decision matters, same ordering rule as `deriveManualChangeStatus`. */
export function deriveCorrectionCaseStatus(
  decisions: readonly CorrectionDecisionFacts[],
): CorrectionCaseStatus {
  const latest = [...decisions].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime()).at(-1);
  if (!latest) return "pending_approval";
  if (latest.outcome === "rejected") return "rejected";
  // outcome === "approved"
  if (latest.executionStatus === "execution_failed") return "execution_failed";
  return "executed";
}

/**
 * dok 16 §17 "Correction case memuat... proposed scoring change" - a
 * correction that proposes the SAME scoring policy version the current
 * result already used would recompute byte-identical output (`computeScore`
 * is deterministic - SCR-001) and accomplish nothing. Refused up front so
 * "Correction appends a new result version" (acceptance) always means a
 * result version that is ACTUALLY different, not a no-op audit entry
 * masquerading as one.
 */
export class CorrectionNoOpError extends Error {
  constructor(readonly scoringPolicyVersionId: string) {
    super(
      `Correction proposes the same scoring policy version (${scoringPolicyVersionId}) the current result already used - refusing a no-op correction`,
    );
    this.name = "CorrectionNoOpError";
  }
}

export function assertCorrectionChangesPolicy(
  currentScoringPolicyVersionId: string,
  correctedScoringPolicyVersionId: string,
): void {
  if (currentScoringPolicyVersionId === correctedScoringPolicyVersionId) {
    throw new CorrectionNoOpError(correctedScoringPolicyVersionId);
  }
}
