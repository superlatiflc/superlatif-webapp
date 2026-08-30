import { describe, expect, it } from "vitest";
import {
  assertAttemptWritable,
  assertValidAttemptStatusTransition,
  AttemptNotWritableError,
  InvalidAttemptStatusTransitionError,
  isAttemptTerminal,
} from "./attempt-lifecycle.ts";

describe("attempt lifecycle", () => {
  it("allows created -> in_progress (start acknowledged, dok 16 §4)", () => {
    expect(() => assertValidAttemptStatusTransition("created", "in_progress")).not.toThrow();
  });

  it("allows the void branch from created/in_progress/submitted", () => {
    expect(() => assertValidAttemptStatusTransition("created", "voided")).not.toThrow();
    expect(() => assertValidAttemptStatusTransition("in_progress", "voided")).not.toThrow();
    expect(() => assertValidAttemptStatusTransition("submitted", "voided")).not.toThrow();
  });

  it("rejects skipping straight from created to submitted", () => {
    expect(() => assertValidAttemptStatusTransition("created", "submitted")).toThrow(
      InvalidAttemptStatusTransitionError,
    );
  });

  it("rejects any transition out of a terminal status", () => {
    for (const from of ["scored", "voided"] as const) {
      expect(() => assertValidAttemptStatusTransition(from, "in_progress")).toThrow(
        InvalidAttemptStatusTransitionError,
      );
    }
  });

  it("treats scored/voided as terminal, everything else as not", () => {
    expect(isAttemptTerminal("scored")).toBe(true);
    expect(isAttemptTerminal("voided")).toBe(true);
    for (const status of ["created", "in_progress", "submitting", "submitted", "scoring"] as const) {
      expect(isAttemptTerminal(status)).toBe(false);
    }
  });
});

describe("assertAttemptWritable (ATM-002)", () => {
  it("allows writes only in in_progress", () => {
    expect(() => assertAttemptWritable("in_progress")).not.toThrow();
  });

  it("refuses writes in every other status", () => {
    for (const status of ["created", "submitting", "submitted", "scoring", "scored", "voided"] as const) {
      expect(() => assertAttemptWritable(status)).toThrow(AttemptNotWritableError);
    }
  });

  it("reports SUBMISSION_ALREADY_FINALIZED for post-submit statuses and ATTEMPT_NOT_RESUMABLE otherwise", () => {
    for (const status of ["submitting", "submitted", "scoring", "scored"] as const) {
      try {
        assertAttemptWritable(status);
        expect.unreachable();
      } catch (error) {
        expect((error as AttemptNotWritableError).code).toBe("SUBMISSION_ALREADY_FINALIZED");
      }
    }
    for (const status of ["created", "voided"] as const) {
      try {
        assertAttemptWritable(status);
        expect.unreachable();
      } catch (error) {
        expect((error as AttemptNotWritableError).code).toBe("ATTEMPT_NOT_RESUMABLE");
      }
    }
  });
});
