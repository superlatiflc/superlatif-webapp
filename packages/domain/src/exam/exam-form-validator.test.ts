import { describe, expect, it } from "vitest";
import {
  assertExamFormComposable,
  ExamFormCompositionInvalidError,
  type ResolvedExamFormItem,
} from "./exam-form-validator.ts";
import type { BlueprintStructure } from "./blueprint-structure.ts";

const STRUCTURE: BlueprintStructure = {
  sections: [
    { code: "TWK", title: "TWK", order: 1, allowedQuestionTypes: ["single_choice"], questionCount: 2 },
    { code: "TKP", title: "TKP", order: 2, allowedQuestionTypes: ["weighted_choice"], questionCount: 1 },
  ],
  timing: { mode: "global", totalDurationSeconds: 900 },
};

function validItems(): ResolvedExamFormItem[] {
  return [
    {
      sectionCode: "TWK",
      order: 1,
      questionVersionId: "q1",
      questionType: "single_choice",
      questionVersionStatus: "published",
    },
    {
      sectionCode: "TWK",
      order: 2,
      questionVersionId: "q2",
      questionType: "single_choice",
      questionVersionStatus: "published",
    },
    {
      sectionCode: "TKP",
      order: 1,
      questionVersionId: "q3",
      questionType: "weighted_choice",
      questionVersionStatus: "published",
    },
  ];
}

describe("assertExamFormComposable", () => {
  it("passes for a fully composed, published-only form matching the blueprint structure", () => {
    expect(() => assertExamFormComposable(validItems(), STRUCTURE)).not.toThrow();
  });

  it("rejects a question version that is not published (the form-snapshot immutability guard)", () => {
    const items = validItems();
    items[0] = { ...items[0]!, questionVersionStatus: "draft" };
    expect(() => assertExamFormComposable(items, STRUCTURE)).toThrow(/not "published"/);
  });

  it("rejects a question type not allowed in its section", () => {
    const items = validItems();
    items[2] = { ...items[2]!, questionType: "numeric" };
    expect(() => assertExamFormComposable(items, STRUCTURE)).toThrow(/not allowed in section/);
  });

  it("rejects an item referencing an unknown section", () => {
    const items = validItems();
    items[0] = { ...items[0]!, sectionCode: "UNKNOWN" };
    expect(() => assertExamFormComposable(items, STRUCTURE)).toThrow(/unknown section/);
  });

  it("rejects the same question version appearing twice", () => {
    const items = validItems();
    items[1] = { ...items[1]!, questionVersionId: items[0]!.questionVersionId };
    expect(() => assertExamFormComposable(items, STRUCTURE)).toThrow(/appears more than once/);
  });

  it("rejects a section with too few or too many items versus questionCount", () => {
    const tooFew = validItems().filter((item) => item.sectionCode !== "TKP");
    expect(() => assertExamFormComposable(tooFew, STRUCTURE)).toThrow(ExamFormCompositionInvalidError);

    const tooMany = [
      ...validItems(),
      {
        sectionCode: "TKP",
        order: 2,
        questionVersionId: "q4",
        questionType: "weighted_choice" as const,
        questionVersionStatus: "published" as const,
      },
    ];
    expect(() => assertExamFormComposable(tooMany, STRUCTURE)).toThrow(/expected exactly 1/);
  });

  it("rejects an empty form", () => {
    expect(() => assertExamFormComposable([], STRUCTURE)).toThrow(/at least one item/);
  });
});
