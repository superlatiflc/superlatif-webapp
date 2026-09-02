// Classifies a `startOrResumeAttempt` failure into a friendly, safe outcome
// - or leaves it unclassified so the caller rethrows it.
//
// SCOPE, DELIBERATELY NARROW: only the three EXPECTED domain outcomes
// `assertAttemptStartEligible` (@superlatif/domain/exam) can throw when a
// student is simply not eligible right now - `AttemptAccessDeniedError`
// (no supporting grant/entitlement), `AttemptWindowClosedError` (batch not
// currently open), `AttemptLimitReachedError` (attempt allowance already
// used). Everything else - including `AttemptFormNotCompatibleError`,
// which that module's own doc calls a data-integrity regression that
// should "fail loudly" - returns `undefined` here, so the caller's
// `throw error` still fires and a genuine bug still surfaces as a real
// error, never silently repainted as "you don't have access."
//
// `denied.reason` is `AttemptAccessDeniedError.decision.studentReason` -
// @superlatif/domain/access's own field, already documented "Safe to show
// a student directly - never leaks grant IDs, source types, or other
// students' data" (effective-access.ts). Reusing it means this module
// never has to guess at safe wording itself for that case; it only writes
// copy for the two cases that have no such pre-vetted string.

import {
  AttemptAccessDeniedError,
  AttemptLimitReachedError,
  AttemptWindowClosedError,
} from "@superlatif/domain/exam";

export type AttemptStartDenialCode = "denied" | "window_closed" | "limit_reached";

export interface AttemptStartDenial {
  readonly code: AttemptStartDenialCode;
  /** Present only for `denied` - the domain's own pre-vetted safe string. */
  readonly reason?: string;
}

export function classifyStartAttemptError(error: unknown): AttemptStartDenial | undefined {
  if (error instanceof AttemptAccessDeniedError) {
    return { code: "denied", reason: error.decision.studentReason };
  }
  if (error instanceof AttemptWindowClosedError) return { code: "window_closed" };
  if (error instanceof AttemptLimitReachedError) return { code: "limit_reached" };
  return undefined;
}
