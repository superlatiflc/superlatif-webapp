// Canonical ResultState vocabulary and student-visibility gate (SCR-002).
//
// `ResultState` (CLAUDE.md canonical, identical to contracts/openapi.yaml's
// `ResultState` enum) has existed only as scattered raw string literals
// until now - ATM-003's `SubmissionEnvelope.data.resultState` and SCR-001's
// `result_versions.state` both wrote the literal `"processing"`/
// `"provisional"` without a shared type. This file is the first to give it
// one, and the first to make more than one state value actually MEAN
// something at read time: `resolveResultVisibility` is what makes
// "Student visibility harus aman: hasil belum release tidak boleh
// terlihat" (founder instruction) a STRUCTURAL guarantee rather than a
// convention several call sites have to remember - a `withheld`/`voided`
// result is refused regardless of how far past the batch's release
// window `now` already is.
//
// Deliberately NOT a stored "is this released" flag: this function is
// called FRESH on every read (packages/db/src/exam/scoring/
// result-release-service.ts#getStudentResultView), taking the batch's own
// server-derived state (EXM-002's `deriveBatchState` - "Batch state harus
// server-derived, jangan simpan status mutable") as its ONLY authority for
// "has the release window opened yet." A `result_versions.releasedAt`
// timestamp is written once release is first observed (see that same
// service file), but it is informational/audit only - it is never itself
// the access-control gate, so a bug in the write path can never
// accidentally reveal an unreleased result.

import type { BatchState } from "./batch-state.ts";

/** CLAUDE.md canonical, transcribed verbatim (identical to contracts/openapi.yaml's `ResultState`). */
export const RESULT_STATES = [
  "processing",
  "provisional",
  "final",
  "corrected",
  "withheld",
  "voided",
] as const;

export type ResultState = (typeof RESULT_STATES)[number];

/** dok 16 §16: `withheld` ("review terkontrol") and `voided` ("dibatalkan secara terkontrol") are BOTH explicit "never show this" states, independent of how far past the release window `now` is. */
const HIDDEN_RESULT_STATES: ReadonlySet<ResultState> = new Set(["withheld", "voided"]);

/** Batch states at/after which the release window itself has genuinely opened (dok 16 §16 "Release nilai... dapat berbeda waktunya" - `review_open` implies the release windows before it were already crossed, per `deriveBatchState`'s own monotonic ordering). */
const RELEASED_BATCH_STATES: ReadonlySet<BatchState> = new Set([
  "provisional_released",
  "final_released",
  "review_open",
]);

/**
 * True only when a student may see the ACTUAL score for this result right
 * now. `resultState === null` means no result exists yet (still
 * `"processing"` in the outbox-drain sense) - never visible, regardless of
 * batch state.
 */
export function resolveResultVisibility(resultState: ResultState | null, batchState: BatchState): boolean {
  if (resultState === null) return false;
  if (HIDDEN_RESULT_STATES.has(resultState)) return false;
  return RELEASED_BATCH_STATES.has(batchState);
}
