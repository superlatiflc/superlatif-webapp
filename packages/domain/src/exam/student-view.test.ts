import { describe, expect, it } from "vitest";
import type { AnswerKey } from "./answer-key.ts";
import { toStudentResponseKind } from "./question-types.ts";
import { toStudentFacingQuestionView, type StudentFacingQuestionInput } from "./student-view.ts";

describe("toStudentResponseKind - weighted_choice server-only mapping", () => {
  it("maps weighted_choice to the single_choice student response shape", () => {
    expect(toStudentResponseKind("weighted_choice")).toBe("single_choice");
  });

  it("maps every other type onto itself", () => {
    expect(toStudentResponseKind("single_choice")).toBe("single_choice");
    expect(toStudentResponseKind("multiple_choice")).toBe("multiple_choice");
    expect(toStudentResponseKind("true_false")).toBe("true_false");
    expect(toStudentResponseKind("numeric")).toBe("numeric");
  });
});

describe("toStudentFacingQuestionView - no answer leak", () => {
  const baseInput: StudentFacingQuestionInput = {
    questionCode: "Q-SKD-001",
    version: 3,
    type: "weighted_choice",
    stemDocument: { text: "Pilih jawaban yang paling tepat." },
    options: [
      { optionCode: "A", order: 1, content: { text: "Opsi A" } },
      { optionCode: "B", order: 2, content: { text: "Opsi B" } },
    ],
    stimulus: { stimulusCode: "STM-001", version: 1, bodyDocument: { text: "Bacaan panjang..." } },
    assets: [
      {
        placement: "option",
        optionCode: "A",
        altText: "Diagram A",
        imagePurpose: "informative",
        assetId: "asset-1",
      },
    ],
  };

  it("never reports the internal weighted_choice type - only single_choice", () => {
    const view = toStudentFacingQuestionView(baseInput);
    expect(view.responseKind).toBe("single_choice");
  });

  it("carries only content fields - stem, options, stimulus, assets, no secret-shaped field", () => {
    const view = toStudentFacingQuestionView(baseInput);
    expect(Object.keys(view).sort()).toEqual(
      ["assets", "options", "questionCode", "responseKind", "stemDocument", "stimulus", "version"].sort(),
    );
  });

  it("serialized output never contains an answer-key-shaped payload, even if a caller tried to smuggle one onto the input object", () => {
    const tampered = {
      ...baseInput,
      // Not a field of StudentFacingQuestionInput - TypeScript already
      // rejects this at the call site; simulated here via a loosely-typed
      // spread to prove the OUTPUT stays clean even if that were bypassed.
      answerKey: { kind: "weighted_choice", optionWeights: { A: 1, B: 0 } } satisfies AnswerKey,
    };
    const view = toStudentFacingQuestionView(tampered);
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain("optionWeights");
    expect(serialized).not.toContain("answerKey");
    expect(serialized).not.toContain("correctOptionCode");
  });

  it("preserves option content and asset metadata without exposing storageRef", () => {
    const view = toStudentFacingQuestionView(baseInput);
    expect(view.assets[0]).toEqual({
      placement: "option",
      optionCode: "A",
      altText: "Diagram A",
      imagePurpose: "informative",
      assetId: "asset-1",
    });
    expect(JSON.stringify(view)).not.toContain("storageRef");
  });
});
