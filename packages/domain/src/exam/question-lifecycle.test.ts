import { describe, expect, it } from "vitest";
import {
  assertQuestionVersionMutable,
  assertValidQuestionStatusTransition,
  isQuestionVersionLocked,
  InvalidQuestionStatusTransitionError,
  QuestionVersionLockedError,
} from "./question-lifecycle.ts";

describe("isQuestionVersionLocked - dok 15 §4 mutable-in-place window", () => {
  it("draft, in_review, and changes_requested are mutable", () => {
    expect(isQuestionVersionLocked("draft")).toBe(false);
    expect(isQuestionVersionLocked("in_review")).toBe(false);
    expect(isQuestionVersionLocked("changes_requested")).toBe(false);
  });

  it("approved, published, and archived are locked", () => {
    expect(isQuestionVersionLocked("approved")).toBe(true);
    expect(isQuestionVersionLocked("published")).toBe(true);
    expect(isQuestionVersionLocked("archived")).toBe(true);
  });
});

describe("assertQuestionVersionMutable - version immutability / published version cannot mutate", () => {
  it("does not throw for a mutable status", () => {
    expect(() => assertQuestionVersionMutable("draft")).not.toThrow();
    expect(() => assertQuestionVersionMutable("in_review")).not.toThrow();
    expect(() => assertQuestionVersionMutable("changes_requested")).not.toThrow();
  });

  it("throws QuestionVersionLockedError once published", () => {
    expect(() => assertQuestionVersionMutable("published")).toThrow(QuestionVersionLockedError);
  });

  it("throws QuestionVersionLockedError once approved (locked before publish, not only after)", () => {
    expect(() => assertQuestionVersionMutable("approved")).toThrow(QuestionVersionLockedError);
  });

  it("throws QuestionVersionLockedError once archived", () => {
    expect(() => assertQuestionVersionMutable("archived")).toThrow(QuestionVersionLockedError);
  });
});

describe("assertValidQuestionStatusTransition", () => {
  it("allows the documented workflow edges", () => {
    expect(() => assertValidQuestionStatusTransition("draft", "in_review")).not.toThrow();
    expect(() => assertValidQuestionStatusTransition("in_review", "approved")).not.toThrow();
    expect(() => assertValidQuestionStatusTransition("in_review", "changes_requested")).not.toThrow();
    expect(() => assertValidQuestionStatusTransition("changes_requested", "in_review")).not.toThrow();
    expect(() => assertValidQuestionStatusTransition("approved", "published")).not.toThrow();
    expect(() => assertValidQuestionStatusTransition("published", "archived")).not.toThrow();
  });

  it("rejects skipping straight from draft to published", () => {
    expect(() => assertValidQuestionStatusTransition("draft", "published")).toThrow(
      InvalidQuestionStatusTransitionError,
    );
  });

  it("rejects any transition out of archived", () => {
    expect(() => assertValidQuestionStatusTransition("archived", "draft")).toThrow(
      InvalidQuestionStatusTransitionError,
    );
  });
});
