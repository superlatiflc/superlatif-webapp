// Student explanation/review visibility gate (production tryout core slice).
//
// The exact sibling of result-lifecycle.ts's own `resolveResultVisibility`,
// one release milestone later: dok 16 §16 "Release nilai, leaderboard, dan
// explanation dapat berbeda waktunya" + "sebelum review release: tanpa
// correct answers/weights/explanation; setelah review: answer comparison
// dan explanation sesuai policy."
//
// Deliberately NOT a new window mechanism: `explanation_release` already
// exists as a `BatchWindowType` (batch-windows.ts, EXM-002) and
// `deriveBatchState` already folds it into the canonical `review_open`
// state - so the ONLY authority this function consults is that same
// server-derived batch state, exactly like `resolveResultVisibility`
// consults it for `provisional_released`/`final_released`. No stored
// "explanation released" flag exists, and none is introduced here.
//
// `review_open` is the single batch state at which explanation content may
// be served: `deriveBatchState` returns it only once `explanationRelease`
// has actually been reached, and its own ordering (validated by
// `assertBatchWindowsCoherent`) guarantees that instant is at/after final
// (and therefore provisional) result release. A learner can therefore never
// see the answer key before they can see their own score.

import type { BatchState } from "./batch-state.ts";
import type { ResultState } from "./result-lifecycle.ts";

/** Same two "never show this, regardless of window" states result-lifecycle.ts already refuses - a withheld/voided result must not expose its answer key either. */
const HIDDEN_RESULT_STATES: ReadonlySet<ResultState> = new Set(["withheld", "voided"]);

/**
 * True only when a learner may see correct answers / option weights /
 * explanation for their own attempt right now. `resultState === null`
 * (nothing scored yet) is never visible, matching
 * `resolveResultVisibility`'s own null handling.
 *
 * Stricter than `resolveResultVisibility` by construction: that function
 * accepts three batch states, this one accepts only `review_open`.
 */
export function resolveExplanationVisibility(
  resultState: ResultState | null,
  batchState: BatchState,
): boolean {
  if (resultState === null) return false;
  if (HIDDEN_RESULT_STATES.has(resultState)) return false;
  return batchState === "review_open";
}
