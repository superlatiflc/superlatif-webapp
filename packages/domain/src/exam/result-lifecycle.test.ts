import { describe, expect, it } from "vitest";
import { resolveResultVisibility } from "./result-lifecycle.ts";
import type { BatchState } from "./batch-state.ts";

const PRE_RELEASE_STATES: readonly BatchState[] = [
  "draft",
  "scheduled",
  "registration_open",
  "exam_open",
  "exam_closed",
  "scoring",
];

describe("resolveResultVisibility", () => {
  it("is never visible before a result exists", () => {
    for (const batchState of [
      ...PRE_RELEASE_STATES,
      "provisional_released",
      "final_released",
      "review_open",
    ]) {
      expect(resolveResultVisibility(null, batchState as BatchState)).toBe(false);
    }
  });

  it("is not visible for any pre-release batch state, even with a computed result", () => {
    for (const batchState of PRE_RELEASE_STATES) {
      expect(resolveResultVisibility("provisional", batchState)).toBe(false);
    }
  });

  it("is visible once the batch reaches provisional_released", () => {
    expect(resolveResultVisibility("provisional", "provisional_released")).toBe(true);
  });

  it("is visible at final_released and review_open too", () => {
    expect(resolveResultVisibility("final", "final_released")).toBe(true);
    expect(resolveResultVisibility("final", "review_open")).toBe(true);
  });

  it("a corrected result is visible exactly like a provisional/final one", () => {
    expect(resolveResultVisibility("corrected", "provisional_released")).toBe(true);
  });

  it("withheld is NEVER visible, regardless of how far past release the batch is", () => {
    expect(resolveResultVisibility("withheld", "provisional_released")).toBe(false);
    expect(resolveResultVisibility("withheld", "final_released")).toBe(false);
    expect(resolveResultVisibility("withheld", "review_open")).toBe(false);
  });

  it("voided is NEVER visible, regardless of how far past release the batch is", () => {
    expect(resolveResultVisibility("voided", "provisional_released")).toBe(false);
    expect(resolveResultVisibility("voided", "final_released")).toBe(false);
  });

  it("archived/voided batch state is never treated as released", () => {
    expect(resolveResultVisibility("provisional", "archived")).toBe(false);
    expect(resolveResultVisibility("provisional", "voided")).toBe(false);
  });
});
