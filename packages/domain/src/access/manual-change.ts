// Manual access change workflow status (ENT-004).
//
// dok 05 §10 E8 "Perubahan manual memerlukan alasan": "Grant, extension,
// suspension, dan revocation manual merekam actor, reason, timestamp,
// target, dan before/after policy." dok 24 §7 marks "manual grant/revoke/
// extension mass action" as a high-risk workflow requiring "reason +
// preview + audit; peer approval when marked" - matching
// @superlatif/domain/authorization's HIGH_RISK_ACTION_TYPES
// "manual_grant_revoke_extension" exactly (IDN-004 already anticipated
// this task).
//
// Same "compute, don't store" discipline as ENT-001's deriveGrantStatus and
// IDN-004's isRoleAssignmentActive: a change REQUEST row is immutable once
// created (packages/db/src/schema/access-change.ts), and every decision
// (approve/reject, plus the execution outcome) is a separate append-only
// row - status is derived from the request plus its decision log, never
// stored as a mutable column.

export type ManualChangeType = "manual_grant" | "manual_extension" | "manual_revocation";

export type ManualChangeStatus = "pending_approval" | "rejected" | "executed" | "execution_failed";

export type ManualChangeDecisionOutcome = "approved" | "rejected";

export interface ManualChangeDecisionFacts {
  readonly outcome: ManualChangeDecisionOutcome;
  readonly executionStatus: "executed" | "execution_failed" | null;
  readonly occurredAt: Date;
}

/**
 * Only the LATEST decision matters (mirrors ENT-001's suspend/reinstate
 * ordering) - a request can in principle be re-decided if a first attempt
 * failed to execute, though this task's own service does not expose a
 * retry path yet (see ADR-051).
 */
export function deriveManualChangeStatus(
  decisions: readonly ManualChangeDecisionFacts[],
): ManualChangeStatus {
  const latest = [...decisions].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime()).at(-1);
  if (!latest) return "pending_approval";
  if (latest.outcome === "rejected") return "rejected";
  // outcome === "approved"
  if (latest.executionStatus === "execution_failed") return "execution_failed";
  return "executed";
}
