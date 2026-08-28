import { describe, expect, it } from "vitest";
import { DEFAULT_TEST_SEED, seededRandom, seedFromEnvironment } from "./random.ts";

const take = (next: () => number, count: number): number[] => Array.from({ length: count }, () => next());

describe("seededRandom", () => {
  it("produces an identical sequence for the same seed", () => {
    expect(take(seededRandom("batch-a"), 12)).toEqual(take(seededRandom("batch-a"), 12));
  });

  it("produces a different sequence for a different seed", () => {
    expect(take(seededRandom("batch-a"), 12)).not.toEqual(take(seededRandom("batch-b"), 12));
  });

  it("stays inside [0, 1)", () => {
    for (const value of take(seededRandom(DEFAULT_TEST_SEED), 500)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("rejects an empty seed rather than silently becoming unseeded", () => {
    expect(() => seededRandom("")).toThrow(TypeError);
  });
});

describe("seedFromEnvironment", () => {
  it("uses TEST_FIXTURE_SEED when present", () => {
    expect(seedFromEnvironment({ TEST_FIXTURE_SEED: "custom" })).toBe("custom");
  });

  it("falls back to the shared default", () => {
    expect(seedFromEnvironment({})).toBe(DEFAULT_TEST_SEED);
    expect(seedFromEnvironment({ TEST_FIXTURE_SEED: "" })).toBe(DEFAULT_TEST_SEED);
  });
});
