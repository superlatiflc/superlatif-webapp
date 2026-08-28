import { describe, expect, it } from "vitest";
import { resolveAttemptAllowance, type AttemptAllowanceClaim } from "./attempt-allowance.ts";

function claim(overrides: Partial<AttemptAllowanceClaim> = {}): AttemptAllowanceClaim {
  return {
    source: "purchase:order-1",
    mode: "per_batch",
    maxRankedAttempts: 1,
    maxPracticeAttempts: 0,
    attemptResolution: "sum_distinct_sources",
    ...overrides,
  };
}

describe("resolveAttemptAllowance - separate from content visibility (ENT-005)", () => {
  it("returns ownedByBatch:true with no claims - the batch is the sole authority by default (dok 05 §8.4 MVP default)", () => {
    expect(resolveAttemptAllowance([])).toEqual({
      ownedByBatch: true,
      maxRankedAttempts: null,
      maxPracticeAttempts: 0,
      contributingSources: [],
    });
  });

  it("returns ownedByBatch:true whenever any claim declares attemptResolution=batch_policy_only, even alongside other claims", () => {
    const result = resolveAttemptAllowance([
      claim({ source: "a", attemptResolution: "batch_policy_only" }),
      claim({ source: "b", maxRankedAttempts: 5, attemptResolution: "sum_distinct_sources" }),
    ]);
    expect(result.ownedByBatch).toBe(true);
    expect(result.maxRankedAttempts).toBeNull();
  });

  it("returns ownedByBatch:true when every claim is mode=inherit_batch, regardless of attemptResolution", () => {
    const result = resolveAttemptAllowance([
      claim({ mode: "inherit_batch", attemptResolution: "sum_distinct_sources" }),
    ]);
    expect(result.ownedByBatch).toBe(true);
  });

  it("sum_distinct_sources adds allowance across distinct decisive sources", () => {
    const result = resolveAttemptAllowance([
      claim({ source: "purchase:order-1", maxRankedAttempts: 1 }),
      claim({ source: "scholarship:sch-1", maxRankedAttempts: 1 }),
    ]);
    expect(result.ownedByBatch).toBe(false);
    expect(result.maxRankedAttempts).toBe(2);
    expect([...result.contributingSources].sort()).toEqual(["purchase:order-1", "scholarship:sch-1"]);
  });

  it("maximum_allowance takes the highest single source's allowance, not the sum", () => {
    const result = resolveAttemptAllowance([
      claim({ source: "purchase:order-1", maxRankedAttempts: 1, attemptResolution: "maximum_allowance" }),
      claim({ source: "scholarship:sch-1", maxRankedAttempts: 3, attemptResolution: "maximum_allowance" }),
    ]);
    expect(result.maxRankedAttempts).toBe(3);
  });

  it("deduplicates by source per the E3A dedupeKey discipline - replaying the same source twice does not double-count", () => {
    const result = resolveAttemptAllowance([
      claim({ source: "purchase:order-1", maxRankedAttempts: 1 }),
      claim({ source: "purchase:order-1", maxRankedAttempts: 1 }),
    ]);
    expect(result.maxRankedAttempts).toBe(1);
    expect(result.contributingSources).toEqual(["purchase:order-1"]);
  });

  it("maxPracticeAttempts is 0 at MVP by construction of every ENT-001 policy fixture, but computed generically here", () => {
    const result = resolveAttemptAllowance([claim({ maxPracticeAttempts: 0 })]);
    expect(result.maxPracticeAttempts).toBe(0);
  });

  it("is a genuinely separate function from content-visibility resolution - callable with only allowance data, no target/action/grant-status input at all", () => {
    // This test's very shape is the proof: resolveAttemptAllowance never
    // takes a target, an action, or a grant's derived status - it cannot
    // structurally decide "can this student see the content."
    const result = resolveAttemptAllowance([claim()]);
    expect(result).not.toHaveProperty("allowed");
    expect(result).not.toHaveProperty("targetType");
  });
});
