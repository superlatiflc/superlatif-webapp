// Attempt start preconditions (ATM-001).
//
// dok 16 §5 "Preconditions": authenticated user; effective access
// `start_attempt` allowed; batch attempt window open; allowance remaining;
// form/blueprint published and compatible; no blocking incident/policy.
// This module is the pure decision layer for the first four - the caller
// (packages/db/src/exam/attempt/attempt-service.ts) resolves each input
// from real data (ENT-002's effective-access/attempt-allowance resolvers,
// EXM-002's deriveBatchState) and this function only ever compares already-
// resolved values, exactly like assertBatchWindowsCoherent/deriveBatchState
// (EXM-002) stay pure over caller-supplied Dates. "No blocking incident/
// policy" is EXM-incident/ATM-010 (accommodation) territory - not built by
// this task, so it is not checked here; a future task extends this
// function's input rather than adding a parallel check.
//
// Error codes are dok 16 §19's own STABLE vocabulary, transcribed verbatim
// - `ATTEMPT_WINDOW_CLOSED` and `ATTEMPT_LIMIT_REACHED` are named exactly
// there. Effective-access denial reuses ENT-002's own
// `EffectiveAccessReasonCode` (e.g. `NOT_CLAIMED`/`NO_ACTIVE_GRANT`) rather
// than inventing a new attempt-specific denial code - the SAME reason a
// student cannot see a batch is the reason they cannot start an attempt on
// it, so the codes stay unified.

import type { BatchState } from "./batch-state.ts";

/**
 * A minimal, structurally-compatible subset of ENT-002's own
 * `EffectiveAccessDecision` (@superlatif/domain/access) - deliberately NOT
 * imported directly. Every pure module under packages/domain/src/exam has
 * stayed self-contained, with cross-subdomain composition happening only
 * at the packages/db service layer (e.g. program-repository.ts already
 * imports both @superlatif/domain/access and @superlatif/domain/program) -
 * this keeps that same modularity rather than adding the first subdomain-
 * to-subdomain import inside packages/domain itself. The real
 * `EffectiveAccessDecision` object satisfies this shape structurally, so
 * the db-layer caller (attempt-service.ts) passes it straight through with
 * no mapping step.
 */
export interface AttemptStartAccessDecision {
  readonly allowed: boolean;
  readonly reasonCode: string;
  readonly studentReason: string;
}

export class AttemptAccessDeniedError extends Error {
  constructor(readonly decision: AttemptStartAccessDecision) {
    super(`Attempt start denied: ${decision.reasonCode} - ${decision.studentReason}`);
    this.name = "AttemptAccessDeniedError";
  }
}

export class AttemptWindowClosedError extends Error {
  constructor(readonly batchState: BatchState) {
    super(`ATTEMPT_WINDOW_CLOSED: batch is "${batchState}", not "exam_open"`);
    this.name = "AttemptWindowClosedError";
  }
}

export class AttemptLimitReachedError extends Error {
  constructor(
    readonly existingAttemptCount: number,
    readonly allowanceLimit: number,
  ) {
    super(
      `ATTEMPT_LIMIT_REACHED: ${existingAttemptCount} non-voided attempt(s) already exist (limit ${allowanceLimit})`,
    );
    this.name = "AttemptLimitReachedError";
  }
}

/** Defensive/structural guard only - EXM-002's own `approveExamBatch` already refuses to lock a batch whose pinned form is not published, so this should be unreachable in practice; it exists so a data-integrity regression fails loudly here rather than silently starting an attempt against an incompatible snapshot. */
export class AttemptFormNotCompatibleError extends Error {
  constructor(readonly formVersionStatus: string) {
    super(`Attempt start refused: pinned exam_form_version is "${formVersionStatus}", not "published"`);
    this.name = "AttemptFormNotCompatibleError";
  }
}

export interface AttemptStartEligibilityInput {
  readonly effectiveAccess: AttemptStartAccessDecision;
  readonly batchState: BatchState;
  readonly formVersionStatus: string;
  readonly existingActiveAttemptCount: number;
  readonly allowanceLimit: number;
}

export function assertAttemptStartEligible(input: AttemptStartEligibilityInput): void {
  if (!input.effectiveAccess.allowed) throw new AttemptAccessDeniedError(input.effectiveAccess);
  if (input.formVersionStatus !== "published") {
    throw new AttemptFormNotCompatibleError(input.formVersionStatus);
  }
  if (input.batchState !== "exam_open") throw new AttemptWindowClosedError(input.batchState);
  if (input.existingActiveAttemptCount >= input.allowanceLimit) {
    throw new AttemptLimitReachedError(input.existingActiveAttemptCount, input.allowanceLimit);
  }
}
