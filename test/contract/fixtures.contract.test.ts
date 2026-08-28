import path from "node:path";
import { describe, expect, it } from "vitest";
import { fixtureCorpusDigest, loadAllFixtureSets } from "../../packages/testing/src/index.ts";

const FIXTURE_DIRECTORY = path.join(import.meta.dirname, "..", "fixtures", "contracts");

describe("synthetic fixture corpus", () => {
  const sets = loadAllFixtureSets(FIXTURE_DIRECTORY);

  it("loads every declared fixture set", () => {
    // test/fixtures/contracts/README.md documents nine sets.
    expect(sets.size).toBe(9);
  });

  it("keeps every set synthetic and production-ineligible", () => {
    for (const [name, set] of sets) {
      expect(set.evidenceClass, name).toBe("synthetic");
      expect(set.productionEligible, name).toBe(false);
      expect(set.cases.length, name).toBeGreaterThan(0);
    }
  });

  it("exposes the case count the starter bundle claims", () => {
    const total = [...sets.values()].reduce((sum, set) => sum + set.cases.length, 0);
    expect(total).toBe(53);
  });
});

describe("fixture runner determinism", () => {
  it("produces an identical digest across repeated loads", () => {
    const first = fixtureCorpusDigest(FIXTURE_DIRECTORY);
    const second = fixtureCorpusDigest(FIXTURE_DIRECTORY);
    expect(second.digest).toBe(first.digest);
    expect(second.sets).toEqual(first.sets);
  });

  it("reports a digest that depends on content, not on iteration order", () => {
    const corpus = fixtureCorpusDigest(FIXTURE_DIRECTORY);
    expect(corpus.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(corpus.setCount).toBe(9);
    expect(corpus.caseCount).toBe(53);
  });
});
