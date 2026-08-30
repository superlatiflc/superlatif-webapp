import { describe, expect, it } from "vitest";
import {
  assertBlueprintTimingConsistent,
  BlueprintTimingInconsistentError,
} from "./blueprint-timing-validator.ts";
import type { BlueprintStructure } from "./blueprint-structure.ts";

function structureWith(
  sections: BlueprintStructure["sections"],
  totalDurationSeconds: number,
): BlueprintStructure {
  return {
    sections,
    timing: { mode: "per_section", totalDurationSeconds },
  };
}

describe("assertBlueprintTimingConsistent - dok 17 §2's own named invariant", () => {
  it("passes when per-section durations sum to the total", () => {
    const structure = structureWith(
      [
        {
          code: "TWK",
          title: "TWK",
          order: 1,
          allowedQuestionTypes: ["single_choice"],
          questionCount: 5,
          durationSeconds: 300,
        },
        {
          code: "TIU",
          title: "TIU",
          order: 2,
          allowedQuestionTypes: ["single_choice"],
          questionCount: 5,
          durationSeconds: 600,
        },
      ],
      900,
    );
    expect(() => assertBlueprintTimingConsistent(structure)).not.toThrow();
  });

  it("throws when the sum does not equal totalDurationSeconds", () => {
    const structure = structureWith(
      [
        {
          code: "TWK",
          title: "TWK",
          order: 1,
          allowedQuestionTypes: ["single_choice"],
          questionCount: 5,
          durationSeconds: 300,
        },
      ],
      900,
    );
    expect(() => assertBlueprintTimingConsistent(structure)).toThrow(BlueprintTimingInconsistentError);
  });

  it("throws when a section is missing durationSeconds under per_section mode", () => {
    const structure = structureWith(
      [{ code: "TWK", title: "TWK", order: 1, allowedQuestionTypes: ["single_choice"], questionCount: 5 }],
      300,
    );
    expect(() => assertBlueprintTimingConsistent(structure)).toThrow(/missing durationSeconds/);
  });

  it("is a no-op under global timing mode - no per-section sum required", () => {
    const structure: BlueprintStructure = {
      sections: [
        { code: "TWK", title: "TWK", order: 1, allowedQuestionTypes: ["single_choice"], questionCount: 5 },
      ],
      timing: { mode: "global", totalDurationSeconds: 900 },
    };
    expect(() => assertBlueprintTimingConsistent(structure)).not.toThrow();
  });
});
