import { describe, expect, it } from "vitest";
import { assertValidAnswerKey, AnswerKeyValidationError, type AnswerKey } from "./answer-key.ts";

const OPTION_CODES = ["A", "B", "C", "D"];

describe("assertValidAnswerKey - single_choice", () => {
  it("accepts a correct option code that exists", () => {
    const key: AnswerKey = { kind: "single_choice", correctOptionCode: "B" };
    expect(() => assertValidAnswerKey("single_choice", key, OPTION_CODES)).not.toThrow();
  });

  it("rejects an invalid option key", () => {
    const key: AnswerKey = { kind: "single_choice", correctOptionCode: "Z" };
    expect(() => assertValidAnswerKey("single_choice", key, OPTION_CODES)).toThrow(AnswerKeyValidationError);
    try {
      assertValidAnswerKey("single_choice", key, OPTION_CODES);
    } catch (error) {
      expect((error as AnswerKeyValidationError).code).toBe("unknown_option_code");
    }
  });

  it("rejects a kind mismatch against the question's own type", () => {
    const key: AnswerKey = { kind: "single_choice", correctOptionCode: "A" };
    expect(() => assertValidAnswerKey("multiple_choice", key, OPTION_CODES)).toThrow(/does not match/);
  });
});

describe("assertValidAnswerKey - weighted_choice (server-only)", () => {
  it("accepts a weight for every known option", () => {
    const key: AnswerKey = {
      kind: "weighted_choice",
      optionWeights: { A: 1, B: 0.5, C: 0, D: -0.25 },
    };
    expect(() => assertValidAnswerKey("weighted_choice", key, OPTION_CODES)).not.toThrow();
  });

  it("rejects a weighted_choice answer key missing a weight for a known option", () => {
    const key: AnswerKey = { kind: "weighted_choice", optionWeights: { A: 1, B: 0.5, C: 0 } };
    expect(() => assertValidAnswerKey("weighted_choice", key, OPTION_CODES)).toThrow(/missing a weight/);
  });

  it("rejects an invalid option key in the weights map", () => {
    const key: AnswerKey = { kind: "weighted_choice", optionWeights: { A: 1, B: 0.5, C: 0, D: 0, Z: 1 } };
    expect(() => assertValidAnswerKey("weighted_choice", key, OPTION_CODES)).toThrow(/unknown option code/);
  });

  it("rejects a non-finite weight", () => {
    const key: AnswerKey = { kind: "weighted_choice", optionWeights: { A: Number.NaN, B: 0, C: 0, D: 0 } };
    expect(() => assertValidAnswerKey("weighted_choice", key, OPTION_CODES)).toThrow(/non-finite/);
  });
});

describe("assertValidAnswerKey - multiple_choice", () => {
  it("accepts at least one correct option with a partial-score policy", () => {
    const key: AnswerKey = {
      kind: "multiple_choice",
      correctOptionCodes: ["A", "C"],
      partialScorePolicy: "proportional",
    };
    expect(() => assertValidAnswerKey("multiple_choice", key, OPTION_CODES)).not.toThrow();
  });

  it("rejects an empty correct-option list", () => {
    const key: AnswerKey = {
      kind: "multiple_choice",
      correctOptionCodes: [],
      partialScorePolicy: "all_or_nothing",
    };
    expect(() => assertValidAnswerKey("multiple_choice", key, OPTION_CODES)).toThrow(/at least one/);
  });

  it("rejects an invalid option key", () => {
    const key: AnswerKey = {
      kind: "multiple_choice",
      correctOptionCodes: ["A", "Z"],
      partialScorePolicy: "all_or_nothing",
    };
    expect(() => assertValidAnswerKey("multiple_choice", key, OPTION_CODES)).toThrow(/unknown option code/);
  });
});

describe("assertValidAnswerKey - true_false", () => {
  const statementCodes = ["S1", "S2", "S3"];

  it("accepts an expected value for every statement", () => {
    const key: AnswerKey = { kind: "true_false", statementAnswers: { S1: true, S2: false, S3: true } };
    expect(() => assertValidAnswerKey("true_false", key, statementCodes)).not.toThrow();
  });

  it("rejects a statement missing an expected value", () => {
    const key: AnswerKey = { kind: "true_false", statementAnswers: { S1: true, S2: false } };
    expect(() => assertValidAnswerKey("true_false", key, statementCodes)).toThrow(
      /missing an expected value/,
    );
  });

  it("rejects an invalid option key", () => {
    const key: AnswerKey = {
      kind: "true_false",
      statementAnswers: { S1: true, S2: false, S3: true, S9: true },
    };
    expect(() => assertValidAnswerKey("true_false", key, statementCodes)).toThrow(/unknown option code/);
  });
});

describe("assertValidAnswerKey - numeric", () => {
  it("accepts a finite accepted value and non-negative tolerance", () => {
    const key: AnswerKey = { kind: "numeric", acceptedValue: 42, tolerance: 0.5, unit: "kg" };
    expect(() => assertValidAnswerKey("numeric", key, [])).not.toThrow();
  });

  it("rejects a negative tolerance", () => {
    const key: AnswerKey = { kind: "numeric", acceptedValue: 42, tolerance: -1, unit: null };
    expect(() => assertValidAnswerKey("numeric", key, [])).toThrow(/tolerance/);
  });

  it("rejects a non-finite accepted value", () => {
    const key: AnswerKey = {
      kind: "numeric",
      acceptedValue: Number.POSITIVE_INFINITY,
      tolerance: 0,
      unit: null,
    };
    expect(() => assertValidAnswerKey("numeric", key, [])).toThrow(/accepted value/);
  });
});
