// Covers the SCR-001 addition to EXM-001's own validator: `sectionScorers`
// consistency with blueprint structure. The pre-existing sectionMaxScores/
// thresholds checks are already covered by blueprint-publication-
// validator.test.ts; this file is scoped to the new field only.

import { describe, expect, it } from "vitest";
import {
  assertScoringPolicyConsistentWithStructure,
  ScoringPolicyInconsistentError,
  type ScoringPolicyConfig,
} from "./scoring-policy.ts";
import type { BlueprintStructure } from "./blueprint-structure.ts";

const STRUCTURE: BlueprintStructure = {
  sections: [
    {
      code: "COGNITIVE",
      title: "Cognitive",
      order: 1,
      questionCount: 2,
      durationSeconds: 300,
      allowedQuestionTypes: ["single_choice"],
    },
    {
      code: "SITUATIONAL",
      title: "Situational",
      order: 2,
      questionCount: 2,
      durationSeconds: 300,
      allowedQuestionTypes: ["weighted_choice"],
    },
  ],
  timing: { mode: "per_section", totalDurationSeconds: 600 },
};

function basePolicy(): ScoringPolicyConfig {
  return {
    sectionMaxScores: { COGNITIVE: 10, SITUATIONAL: 10 },
    thresholds: [{ kind: "no_threshold" }],
  };
}

describe("assertScoringPolicyConsistentWithStructure - sectionScorers (SCR-001)", () => {
  it("allows a config with no sectionScorers at all (backward compatible with pre-SCR-001 policies)", () => {
    expect(() => assertScoringPolicyConsistentWithStructure(basePolicy(), STRUCTURE)).not.toThrow();
  });

  it("allows a correctly-paired binary_choice/weighted_option scorer set", () => {
    const policy: ScoringPolicyConfig = {
      ...basePolicy(),
      sectionScorers: {
        COGNITIVE: { kind: "binary_choice", correctScore: 5, incorrectScore: 0, blankScore: 0 },
        SITUATIONAL: { kind: "weighted_option", blankScore: 0 },
      },
    };
    expect(() => assertScoringPolicyConsistentWithStructure(policy, STRUCTURE)).not.toThrow();
  });

  it("allows a section to have no scorer wired yet (draft policy)", () => {
    const policy: ScoringPolicyConfig = {
      ...basePolicy(),
      sectionScorers: {
        COGNITIVE: { kind: "binary_choice", correctScore: 5, incorrectScore: 0, blankScore: 0 },
      },
    };
    expect(() => assertScoringPolicyConsistentWithStructure(policy, STRUCTURE)).not.toThrow();
  });

  it("refuses a scorer declared for an unknown section", () => {
    const policy: ScoringPolicyConfig = {
      ...basePolicy(),
      sectionScorers: { GHOST: { kind: "binary_choice", correctScore: 5, incorrectScore: 0, blankScore: 0 } },
    };
    expect(() => assertScoringPolicyConsistentWithStructure(policy, STRUCTURE)).toThrow(
      ScoringPolicyInconsistentError,
    );
  });

  it("refuses a binary_choice scorer on a section that only allows weighted_choice", () => {
    const policy: ScoringPolicyConfig = {
      ...basePolicy(),
      sectionScorers: {
        SITUATIONAL: { kind: "binary_choice", correctScore: 5, incorrectScore: 0, blankScore: 0 },
      },
    };
    expect(() => assertScoringPolicyConsistentWithStructure(policy, STRUCTURE)).toThrow(
      ScoringPolicyInconsistentError,
    );
  });

  it("refuses a weighted_option scorer on a section that only allows single_choice", () => {
    const policy: ScoringPolicyConfig = {
      ...basePolicy(),
      sectionScorers: { COGNITIVE: { kind: "weighted_option", blankScore: 0 } },
    };
    expect(() => assertScoringPolicyConsistentWithStructure(policy, STRUCTURE)).toThrow(
      ScoringPolicyInconsistentError,
    );
  });
});
