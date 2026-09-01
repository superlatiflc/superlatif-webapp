import { describe, expect, it } from "vitest";
import { reviewAnswer } from "./answer-review.ts";
import { UngradeableQuestionTypeError, AnswerKeyShapeMismatchError } from "./answer-grading.ts";
import type { AnswerKey } from "./answer-key.ts";

const SINGLE_KEY: AnswerKey = { kind: "single_choice", correctOptionCode: "B" };
const WEIGHTED_KEY: AnswerKey = { kind: "weighted_choice", optionWeights: { A: 5, B: 3, C: 5, D: 1 } };

describe("reviewAnswer - single_choice (binary)", () => {
  it("marks the correct option correct", () => {
    const review = reviewAnswer("single_choice", SINGLE_KEY, { kind: "single_choice", optionCode: "B" });
    expect(review).toEqual({
      kind: "binary",
      selectedOptionCode: "B",
      correctOptionCode: "B",
      status: "correct",
    });
  });

  it("marks a different option incorrect", () => {
    const review = reviewAnswer("single_choice", SINGLE_KEY, { kind: "single_choice", optionCode: "A" });
    expect(review.status).toBe("incorrect");
  });

  it("marks an unanswered question blank, still exposing the correct option", () => {
    const review = reviewAnswer("single_choice", SINGLE_KEY, null);
    expect(review).toMatchObject({ status: "blank", selectedOptionCode: null, correctOptionCode: "B" });
  });
});

describe("reviewAnswer - weighted_choice (TKP)", () => {
  it("never reports correct/incorrect, only best/not_best against real weights", () => {
    const review = reviewAnswer("weighted_choice", WEIGHTED_KEY, { kind: "single_choice", optionCode: "B" });
    expect(review.kind).toBe("weighted");
    expect(review.status).toBe("not_best");
    if (review.kind !== "weighted") throw new Error("expected weighted review");
    expect(review.selectedWeight).toBe(3);
    expect(review.maxWeight).toBe(5);
    // The vocabulary itself must not contain a correctness claim.
    expect(Object.values(review)).not.toContain("correct");
    expect(Object.values(review)).not.toContain("incorrect");
  });

  it("reports every option tying for the maximum weight, not a single 'key'", () => {
    const review = reviewAnswer("weighted_choice", WEIGHTED_KEY, { kind: "single_choice", optionCode: "A" });
    if (review.kind !== "weighted") throw new Error("expected weighted review");
    expect(review.status).toBe("best");
    expect([...review.bestOptionCodes].sort()).toEqual(["A", "C"]);
  });

  it("marks an unanswered weighted question blank with a null weight", () => {
    const review = reviewAnswer("weighted_choice", WEIGHTED_KEY, null);
    if (review.kind !== "weighted") throw new Error("expected weighted review");
    expect(review.status).toBe("blank");
    expect(review.selectedWeight).toBeNull();
    expect(review.maxWeight).toBe(5);
  });

  it("treats an option missing from the weight map as weight 0 rather than throwing", () => {
    const review = reviewAnswer("weighted_choice", WEIGHTED_KEY, { kind: "single_choice", optionCode: "Z" });
    if (review.kind !== "weighted") throw new Error("expected weighted review");
    expect(review.selectedWeight).toBe(0);
    expect(review.status).toBe("not_best");
  });
});

describe("reviewAnswer - scope and shape guards", () => {
  it("refuses question types the scorer itself cannot grade", () => {
    for (const type of ["multiple_choice", "true_false", "numeric"] as const) {
      expect(() => reviewAnswer(type, SINGLE_KEY, null)).toThrow(UngradeableQuestionTypeError);
    }
  });

  it("refuses an answer key whose shape disagrees with the question type", () => {
    expect(() => reviewAnswer("single_choice", WEIGHTED_KEY, null)).toThrow(AnswerKeyShapeMismatchError);
    expect(() => reviewAnswer("weighted_choice", SINGLE_KEY, null)).toThrow(AnswerKeyShapeMismatchError);
  });

  it("refuses a payload whose wire kind is not single_choice", () => {
    expect(() => reviewAnswer("single_choice", SINGLE_KEY, { kind: "numeric", value: "1" })).toThrow(
      UngradeableQuestionTypeError,
    );
  });
});
