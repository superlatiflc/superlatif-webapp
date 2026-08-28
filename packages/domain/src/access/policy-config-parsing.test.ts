import { describe, expect, it } from "vitest";
import { parseAttemptAllowanceTemplate, parsePolicyClaims, parseStacking } from "./policy-config-parsing.ts";

describe("parsePolicyClaims", () => {
  it("parses a well-formed claims array from a real ENT-001-shaped config", () => {
    const config = {
      claims: [
        {
          targetType: "program_track",
          targetRef: { code: "track:skd", version: 1 },
          actions: ["view", "consume"],
          includeDescendants: true,
        },
      ],
    };
    expect(parsePolicyClaims(config)).toEqual([
      {
        targetType: "program_track",
        targetRef: { code: "track:skd", version: 1 },
        actions: ["view", "consume"],
        includeDescendants: true,
        availabilityOverride: null,
      },
    ]);
  });

  it("parses availabilityOverride when present", () => {
    const config = {
      claims: [
        {
          targetType: "resource",
          targetRef: { code: "resource:r1" },
          actions: ["view"],
          includeDescendants: false,
          availabilityOverride: { startsAt: "2026-08-01T00:00:00.000Z", endsAt: "2026-09-01T00:00:00.000Z" },
        },
      ],
    };
    const [parsed] = parsePolicyClaims(config);
    expect(parsed?.availabilityOverride).toEqual({
      startsAt: new Date("2026-08-01T00:00:00.000Z"),
      endsAt: new Date("2026-09-01T00:00:00.000Z"),
    });
  });

  it("returns an empty array when claims is missing or not an array", () => {
    expect(parsePolicyClaims({})).toEqual([]);
    expect(parsePolicyClaims({ claims: "not-an-array" })).toEqual([]);
  });
});

describe("parseAttemptAllowanceTemplate", () => {
  it("parses mode/maxRankedAttempts/maxPracticeAttempts", () => {
    const config = { attemptAllowance: { mode: "per_batch", maxRankedAttempts: 2, maxPracticeAttempts: 0 } };
    expect(parseAttemptAllowanceTemplate(config)).toEqual({
      mode: "per_batch",
      maxRankedAttempts: 2,
      maxPracticeAttempts: 0,
    });
  });

  it("defaults to inherit_batch/null/0 when attemptAllowance is missing", () => {
    expect(parseAttemptAllowanceTemplate({})).toEqual({
      mode: "inherit_batch",
      maxRankedAttempts: null,
      maxPracticeAttempts: 0,
    });
  });
});

describe("parseStacking", () => {
  it("parses attemptResolution", () => {
    expect(parseStacking({ stacking: { attemptResolution: "sum_distinct_sources" } })).toEqual({
      attemptResolution: "sum_distinct_sources",
    });
  });

  it("defaults to batch_policy_only (dok 05 §10 E3A MVP default) when unrecognized or missing", () => {
    expect(parseStacking({})).toEqual({ attemptResolution: "batch_policy_only" });
    expect(parseStacking({ stacking: { attemptResolution: "not-a-real-value" } })).toEqual({
      attemptResolution: "batch_policy_only",
    });
  });
});
