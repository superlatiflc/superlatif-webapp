import { describe, expect, it } from "vitest";
import {
  assertBlueprintVersionPublishable,
  type AssertBlueprintPublishableInput,
} from "./blueprint-publication-validator.ts";
import { DuplicateSectionCodeError } from "./blueprint-structure.ts";
import { BlueprintTimingInconsistentError } from "./blueprint-timing-validator.ts";
import { ScoringPolicyInconsistentError } from "./scoring-policy.ts";
import { ProductionActivationNotPermittedError } from "./activation-scope.ts";

function validInput(): AssertBlueprintPublishableInput {
  return {
    structure: {
      sections: [
        {
          code: "TWK",
          title: "TWK",
          order: 1,
          allowedQuestionTypes: ["single_choice"],
          questionCount: 2,
          durationSeconds: 300,
        },
        {
          code: "TKP",
          title: "TKP",
          order: 2,
          allowedQuestionTypes: ["weighted_choice"],
          questionCount: 2,
          durationSeconds: 300,
        },
      ],
      timing: { mode: "per_section", totalDurationSeconds: 600 },
    },
    scoringPolicy: {
      sectionMaxScores: { TWK: 10, TKP: 10 },
      thresholds: [{ kind: "no_threshold" }],
    },
    activationScope: "draft_only",
  };
}

describe("assertBlueprintVersionPublishable - fail-closed on any single inconsistency", () => {
  it("passes for a fully consistent, synthetic draft_only blueprint", () => {
    expect(() => assertBlueprintVersionPublishable(validInput())).not.toThrow();
  });

  it("fails closed on duplicate section codes", () => {
    const input = validInput();
    const broken = {
      ...input,
      structure: {
        ...input.structure,
        sections: [input.structure.sections[0]!, input.structure.sections[0]!],
      },
    };
    expect(() => assertBlueprintVersionPublishable(broken)).toThrow(DuplicateSectionCodeError);
  });

  it("fails closed on an inconsistent per-section timing sum", () => {
    const input = validInput();
    const broken = {
      ...input,
      structure: { ...input.structure, timing: { mode: "per_section" as const, totalDurationSeconds: 999 } },
    };
    expect(() => assertBlueprintVersionPublishable(broken)).toThrow(BlueprintTimingInconsistentError);
  });

  it("fails closed when scoring policy references an unknown section", () => {
    const input = validInput();
    const broken = {
      ...input,
      scoringPolicy: { sectionMaxScores: { TWK: 10, TKP: 10, UNKNOWN: 5 }, thresholds: [] },
    };
    expect(() => assertBlueprintVersionPublishable(broken)).toThrow(ScoringPolicyInconsistentError);
  });

  it("REFUSES production activation scope unconditionally - the hard OD-04 gate", () => {
    const input = validInput();
    const broken = { ...input, activationScope: "production" as const };
    expect(() => assertBlueprintVersionPublishable(broken)).toThrow(ProductionActivationNotPermittedError);
  });

  it("checks activation scope FIRST - a production request is refused even alongside other invalid fields", () => {
    const input = validInput();
    const broken = {
      ...input,
      activationScope: "production" as const,
      structure: { ...input.structure, sections: [] },
    };
    expect(() => assertBlueprintVersionPublishable(broken)).toThrow(ProductionActivationNotPermittedError);
  });

  it("runs blueprint-only checks (no scoring cross-reference) when scoringPolicy is omitted", () => {
    const input = validInput();
    const { scoringPolicy: _omitted, ...blueprintOnly } = input;
    expect(() => assertBlueprintVersionPublishable(blueprintOnly)).not.toThrow();
  });
});
