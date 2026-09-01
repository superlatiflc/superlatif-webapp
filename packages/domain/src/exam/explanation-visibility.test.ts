import { describe, expect, it } from "vitest";
import { BATCH_STATES, type BatchState } from "./batch-state.ts";
import { RESULT_STATES, type ResultState } from "./result-lifecycle.ts";
import { resolveExplanationVisibility } from "./explanation-visibility.ts";
import { resolveResultVisibility } from "./result-lifecycle.ts";

describe("resolveExplanationVisibility", () => {
  it("reveals explanation only at review_open", () => {
    for (const state of BATCH_STATES) {
      expect(resolveExplanationVisibility("provisional", state)).toBe(state === "review_open");
    }
  });

  it("never reveals explanation when nothing is scored yet", () => {
    for (const state of BATCH_STATES) {
      expect(resolveExplanationVisibility(null, state)).toBe(false);
    }
  });

  it("refuses withheld and voided results even at review_open", () => {
    expect(resolveExplanationVisibility("withheld", "review_open")).toBe(false);
    expect(resolveExplanationVisibility("voided", "review_open")).toBe(false);
  });

  it("allows every non-hidden result state at review_open", () => {
    const visibleStates: ResultState[] = ["processing", "provisional", "final", "corrected"];
    for (const state of visibleStates) {
      expect(resolveExplanationVisibility(state, "review_open")).toBe(true);
    }
  });

  /**
   * The security-relevant ordering property: a learner can never reach the
   * answer key before their own score. Explanation visibility must be a
   * strict SUBSET of result visibility, for every combination.
   */
  it("is never more permissive than result visibility", () => {
    for (const resultState of [...RESULT_STATES, null] as (ResultState | null)[]) {
      for (const batchState of BATCH_STATES as readonly BatchState[]) {
        if (resolveExplanationVisibility(resultState, batchState)) {
          expect(resolveResultVisibility(resultState, batchState)).toBe(true);
        }
      }
    }
  });
});
