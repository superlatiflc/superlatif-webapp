import { describe, expect, it } from "vitest";
import {
  gradeAnswer,
  assertScorerMatchesQuestionType,
  UngradeableQuestionTypeError,
  AnswerKeyShapeMismatchError,
} from "./answer-grading.ts";
import type { AnswerKey } from "./answer-key.ts";

const SINGLE_CHOICE_KEY: AnswerKey = { kind: "single_choice", correctOptionCode: "B" };
const WEIGHTED_KEY: AnswerKey = { kind: "weighted_choice", optionWeights: { A: 1, B: 2, D: 5 } };

describe("gradeAnswer - single_choice (binary)", () => {
  it("grades the correct option as correct", () => {
    expect(
      gradeAnswer("single_choice", SINGLE_CHOICE_KEY, { kind: "single_choice", optionCode: "B" }),
    ).toStrictEqual({
      kind: "binary",
      correct: true,
    });
  });

  it("grades any other known option as incorrect", () => {
    expect(
      gradeAnswer("single_choice", SINGLE_CHOICE_KEY, { kind: "single_choice", optionCode: "A" }),
    ).toStrictEqual({
      kind: "binary",
      correct: false,
    });
  });

  it("grades a null (unanswered) payload as blank", () => {
    expect(gradeAnswer("single_choice", SINGLE_CHOICE_KEY, null)).toStrictEqual({ kind: "blank" });
  });

  it("refuses an answer key of the wrong kind", () => {
    expect(() =>
      gradeAnswer("single_choice", WEIGHTED_KEY, { kind: "single_choice", optionCode: "A" }),
    ).toThrow(AnswerKeyShapeMismatchError);
  });
});

describe("gradeAnswer - weighted_choice (weighted)", () => {
  it("grades the selected option's own weight, never a duplicated/independent number", () => {
    expect(
      gradeAnswer("weighted_choice", WEIGHTED_KEY, { kind: "single_choice", optionCode: "D" }),
    ).toStrictEqual({
      kind: "weighted",
      weight: 5,
    });
  });

  it("wire payload kind stays single_choice for a weighted_choice question (dok 16 §8)", () => {
    // The payload's own `.kind` is "single_choice" even though the
    // question TYPE is "weighted_choice" - this is not a mismatch.
    const result = gradeAnswer("weighted_choice", WEIGHTED_KEY, { kind: "single_choice", optionCode: "A" });
    expect(result).toStrictEqual({ kind: "weighted", weight: 1 });
  });

  it("grades a null (unanswered) payload as blank", () => {
    expect(gradeAnswer("weighted_choice", WEIGHTED_KEY, null)).toStrictEqual({ kind: "blank" });
  });

  it("refuses an answer key of the wrong kind", () => {
    expect(() =>
      gradeAnswer("weighted_choice", SINGLE_CHOICE_KEY, { kind: "single_choice", optionCode: "A" }),
    ).toThrow(AnswerKeyShapeMismatchError);
  });
});

describe("gradeAnswer - unsupported question types (SCR-004 narrow scope)", () => {
  it("refuses multiple_choice", () => {
    expect(() =>
      gradeAnswer(
        "multiple_choice",
        { kind: "multiple_choice", correctOptionCodes: ["A"], partialScorePolicy: "all_or_nothing" },
        { kind: "multiple_choice", optionCodes: ["A"] },
      ),
    ).toThrow(UngradeableQuestionTypeError);
  });

  it("refuses true_false", () => {
    expect(() =>
      gradeAnswer(
        "true_false",
        { kind: "true_false", statementAnswers: { s1: true } },
        { kind: "statement_true_false", values: { s1: true } },
      ),
    ).toThrow(UngradeableQuestionTypeError);
  });

  it("refuses numeric", () => {
    expect(() =>
      gradeAnswer(
        "numeric",
        { kind: "numeric", acceptedValue: 1, tolerance: 0, unit: null },
        { kind: "numeric", value: "1" },
      ),
    ).toThrow(UngradeableQuestionTypeError);
  });
});

describe("assertScorerMatchesQuestionType", () => {
  it("allows binary_choice scorer with single_choice question", () => {
    expect(() =>
      assertScorerMatchesQuestionType(
        { kind: "binary_choice", correctScore: 5, incorrectScore: 0, blankScore: 0 },
        "single_choice",
      ),
    ).not.toThrow();
  });

  it("allows weighted_option scorer with weighted_choice question", () => {
    expect(() =>
      assertScorerMatchesQuestionType({ kind: "weighted_option", blankScore: 0 }, "weighted_choice"),
    ).not.toThrow();
  });

  it("refuses a binary_choice scorer paired with a weighted_choice question", () => {
    expect(() =>
      assertScorerMatchesQuestionType(
        { kind: "binary_choice", correctScore: 5, incorrectScore: 0, blankScore: 0 },
        "weighted_choice",
      ),
    ).toThrow(UngradeableQuestionTypeError);
  });

  it("refuses a weighted_option scorer paired with a single_choice question", () => {
    expect(() =>
      assertScorerMatchesQuestionType({ kind: "weighted_option", blankScore: 0 }, "single_choice"),
    ).toThrow(UngradeableQuestionTypeError);
  });
});
