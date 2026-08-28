import { describe, expect, it } from "vitest";
import { dedupeClaims, distinctTargets } from "./dedupe.ts";

describe("dedupeClaims", () => {
  it("removes an exact repeat of the same (source, target, action, policyVersion)", () => {
    const claims = [
      { source: "purchase:order-1", target: "track:skd", action: "view", policyVersion: 3 },
      { source: "purchase:order-1", target: "track:skd", action: "view", policyVersion: 3 },
    ];
    expect(dedupeClaims(claims)).toHaveLength(1);
  });

  it("keeps two DIFFERENT sources granting the same target - not this function's job to collapse them", () => {
    const claims = [
      { source: "purchase:order-1", target: "track:skd", action: "view", policyVersion: 3 },
      { source: "scholarship:sch-1", target: "track:skd", action: "view", policyVersion: 3 },
    ];
    expect(dedupeClaims(claims)).toHaveLength(2);
  });

  it("keeps claims that differ only by policyVersion - a version bump is not a duplicate", () => {
    const claims = [
      { source: "purchase:order-1", target: "track:skd", action: "view", policyVersion: 1 },
      { source: "purchase:order-1", target: "track:skd", action: "view", policyVersion: 2 },
    ];
    expect(dedupeClaims(claims)).toHaveLength(2);
  });

  it("preserves first-seen order", () => {
    const claims = [
      { source: "a", target: "t1", action: "view", policyVersion: 1 },
      { source: "b", target: "t2", action: "view", policyVersion: 1 },
      { source: "a", target: "t1", action: "view", policyVersion: 1 },
    ];
    expect(dedupeClaims(claims).map((c) => c.source)).toEqual(["a", "b"]);
  });
});

describe("distinctTargets - duplicate content must not appear twice (dok 05 §10 E2)", () => {
  it("collapses two grants covering the same (target, action) into one entry", () => {
    const claims = [
      { source: "purchase:order-1", target: "track:skd", action: "view", policyVersion: 1 },
      { source: "promo:bonus-5", target: "track:skd", action: "view", policyVersion: 1 },
    ];
    const result = distinctTargets(claims);
    expect(result).toHaveLength(1);
    expect(result[0]?.target).toBe("track:skd");
  });

  it("still exposes every supporting source, even though the resource shows once", () => {
    const claims = [
      { source: "purchase:order-1", target: "track:skd", action: "view", policyVersion: 1 },
      { source: "promo:bonus-5", target: "track:skd", action: "view", policyVersion: 1 },
    ];
    const [result] = distinctTargets(claims);
    expect(result?.sources).toEqual(["purchase:order-1", "promo:bonus-5"]);
  });

  it("does not merge the same target under two DIFFERENT actions - view and download stay separate", () => {
    const claims = [
      { source: "purchase:order-1", target: "resource:pdf-1", action: "view", policyVersion: 1 },
      { source: "purchase:order-1", target: "resource:pdf-1", action: "download", policyVersion: 1 },
    ];
    expect(distinctTargets(claims)).toHaveLength(2);
  });

  it("keeps genuinely different targets separate", () => {
    const claims = [
      { source: "purchase:order-1", target: "track:skd", action: "view", policyVersion: 1 },
      { source: "purchase:order-1", target: "track:tka", action: "view", policyVersion: 1 },
    ];
    expect(distinctTargets(claims)).toHaveLength(2);
  });

  it("does not list the same source twice under one target even if it appears in multiple claim rows", () => {
    const claims = [
      { source: "purchase:order-1", target: "track:skd", action: "view", policyVersion: 1 },
      { source: "purchase:order-1", target: "track:skd", action: "view", policyVersion: 2 },
    ];
    const [result] = distinctTargets(claims);
    expect(result?.sources).toEqual(["purchase:order-1"]);
  });

  it("returns an empty list for an empty input", () => {
    expect(distinctTargets([])).toEqual([]);
  });
});
