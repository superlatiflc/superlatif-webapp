// Final submit decision primitives (ATM-003).
//
// dok 16 §13 "Submit contract" / §24 RC2: "Satu final submit per attempt" -
// only ONE `attempt_submissions` row may ever exist per attempt (enforced
// by a real unique constraint at the database, schema/submissions.ts, the
// same "DB constraint, not application discipline alone" pattern every
// prior no-duplicate invariant in this codebase already used). This
// module is the pure decision layer the db-service caller consults BEFORE
// attempting that insert - it never queries anything itself.
//
// "Manual dan automatic submit are idempotent" (founder instruction) holds
// two different ways depending on WHICH race is being resolved:
//   - a genuinely NEW submit request only reaches `assertAttemptSubmittable`
//     (must be `in_progress`) and, for a user-triggered request,
//     `assertSubmitRevisionCurrent` (the client's view must match the
//     server's current attempt-wide revision - the same optimistic-
//     concurrency shape answer-save's CAS already uses, one grain
//     coarser).
//   - a RESUBMIT of an attempt that already has a submission (user retry,
//     timeout re-fire, worker retry after a transient failure - "Worker
//     retry tidak boleh membuat submit ganda") never reaches this module
//     at all: the db-service caller finds the EXISTING row first and
//     returns it as-is, the same "check-existing-first" shape
//     `startOrResumeAttempt` (ATM-001) already established for its own
//     attempt-level singleton.

import type { AttemptStatus } from "./attempt-lifecycle.ts";

export class AttemptNotSubmittableError extends Error {
  constructor(readonly status: AttemptStatus) {
    super(`SUBMISSION_ALREADY_FINALIZED: attempt status "${status}" cannot start a new submission`);
    this.name = "AttemptNotSubmittableError";
  }
}

/** Only `in_progress` may START a new submission. This is deliberately narrower than `assertAttemptWritable` (ATM-002, which also implicitly allows `created` to be treated as an error the same way) - kept as its own function/error rather than reused, because the caller (submit) and answer-save mean genuinely different things by "not writable" even though today the two checks happen to agree on every status. */
export function assertAttemptSubmittable(status: AttemptStatus): void {
  if (status !== "in_progress") throw new AttemptNotSubmittableError(status);
}

/**
 * dok 16 §13: "Client mengirim final submit dengan idempotency key dan
 * expected attempt revision." No stable error code in dok 16 §19 names
 * this specific mismatch - the closest existing canonical code
 * (`ANSWER_REVISION_CONFLICT`) is reused rather than inventing a new one
 * CLAUDE.md's own vocabulary discipline would otherwise require updating
 * the domain document for; this IS the same class of optimistic-
 * concurrency conflict, one grain coarser (attempt-wide instead of
 * per-instance).
 */
export class SubmitRevisionConflictError extends Error {
  constructor(
    readonly expectedAttemptRevision: number,
    readonly currentAttemptRevision: number,
  ) {
    super(
      `ANSWER_REVISION_CONFLICT: expected attempt revision ${expectedAttemptRevision}, current is ${currentAttemptRevision} - resync before resubmitting`,
    );
    this.name = "SubmitRevisionConflictError";
  }
}

/** Only checked for a user-triggered submit - a timeout/system trigger has no client-side "expected" view to compare against; it finalizes whatever is CURRENTLY there. */
export function assertSubmitRevisionCurrent(
  expectedAttemptRevision: number,
  currentAttemptRevision: number,
): void {
  if (expectedAttemptRevision !== currentAttemptRevision) {
    throw new SubmitRevisionConflictError(expectedAttemptRevision, currentAttemptRevision);
  }
}
