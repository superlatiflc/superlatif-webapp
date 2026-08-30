import { describe, expect, it } from "vitest";
import {
  AnswerSchemaInvalidError,
  assertAnswerPayloadMatchesQuestionType,
  toAnswerKind,
} from "./answer-payload.ts";

describe("toAnswerKind", () => {
  it("maps weighted_choice to single_choice (dok 16 §8: scoring difference, not interaction shape)", () => {
    expect(toAnswerKind("weighted_choice")).toBe("single_choice");
    expect(toAnswerKind("single_choice")).toBe("single_choice");
  });

  it("maps true_false to statement_true_false (contract's own wire discriminator, distinct from StudentResponseKind)", () => {
    expect(toAnswerKind("true_false")).toBe("statement_true_false");
  });

  it("maps multiple_choice and numeric unchanged", () => {
    expect(toAnswerKind("multiple_choice")).toBe("multiple_choice");
    expect(toAnswerKind("numeric")).toBe("numeric");
  });
});

describe("assertAnswerPayloadMatchesQuestionType", () => {
  it("always allows null (clearing/unanswering) regardless of type", () => {
    expect(() => assertAnswerPayloadMatchesQuestionType("single_choice", null, ["A", "B"])).not.toThrow();
    expect(() => assertAnswerPayloadMatchesQuestionType("numeric", null, [])).not.toThrow();
  });

  it("accepts a valid single_choice payload for a single_choice question", () => {
    expect(() =>
      assertAnswerPayloadMatchesQuestionType("single_choice", { kind: "single_choice", optionCode: "A" }, [
        "A",
        "B",
      ]),
    ).not.toThrow();
  });

  it("accepts a single_choice payload for a weighted_choice question (student never sees weighted_choice kind)", () => {
    expect(() =>
      assertAnswerPayloadMatchesQuestionType("weighted_choice", { kind: "single_choice", optionCode: "A" }, [
        "A",
        "B",
      ]),
    ).not.toThrow();
  });

  it("rejects a mismatched kind (e.g. multiple_choice payload for a single_choice question)", () => {
    expect(() =>
      assertAnswerPayloadMatchesQuestionType(
        "single_choice",
        { kind: "multiple_choice", optionCodes: ["A"] },
        ["A", "B"],
      ),
    ).toThrow(AnswerSchemaInvalidError);
  });

  it("rejects an unknown option code", () => {
    expect(() =>
      assertAnswerPayloadMatchesQuestionType("single_choice", { kind: "single_choice", optionCode: "Z" }, [
        "A",
        "B",
      ]),
    ).toThrow(/unknown option\/statement code/);
  });

  it("rejects a duplicated option code in multiple_choice", () => {
    expect(() =>
      assertAnswerPayloadMatchesQuestionType(
        "multiple_choice",
        { kind: "multiple_choice", optionCodes: ["A", "A"] },
        ["A", "B"],
      ),
    ).toThrow(/duplicated/);
  });

  it("allows a PARTIAL multiple_choice selection, including zero options (in-progress answer, not a final key)", () => {
    expect(() =>
      assertAnswerPayloadMatchesQuestionType(
        "multiple_choice",
        { kind: "multiple_choice", optionCodes: [] },
        ["A", "B"],
      ),
    ).not.toThrow();
  });

  it("allows a PARTIAL statement_true_false answer (not every statement covered yet)", () => {
    expect(() =>
      assertAnswerPayloadMatchesQuestionType(
        "true_false",
        { kind: "statement_true_false", values: { S1: true } },
        ["S1", "S2", "S3"],
      ),
    ).not.toThrow();
  });

  it("rejects a numeric value that is not a normalized decimal string", () => {
    expect(() =>
      assertAnswerPayloadMatchesQuestionType("numeric", { kind: "numeric", value: "not-a-number" }, []),
    ).toThrow(/normalized decimal string/);
  });

  it("accepts valid numeric decimal strings including negative and comma-decimal", () => {
    for (const value of ["42", "-3.14", "3,14", "0"]) {
      expect(() =>
        assertAnswerPayloadMatchesQuestionType("numeric", { kind: "numeric", value }, []),
      ).not.toThrow();
    }
  });
});
