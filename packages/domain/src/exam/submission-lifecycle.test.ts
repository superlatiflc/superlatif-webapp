import { describe, expect, it } from "vitest";
import {
  assertAttemptSubmittable,
  assertSubmitRevisionCurrent,
  AttemptNotSubmittableError,
  SubmitRevisionConflictError,
} from "./submission-lifecycle.ts";

describe("assertAttemptSubmittable", () => {
  it("allows starting a new submission only from in_progress", () => {
    expect(() => assertAttemptSubmittable("in_progress")).not.toThrow();
  });

  it("refuses every other status", () => {
    for (const status of ["created", "submitting", "submitted", "scoring", "scored", "voided"] as const) {
      expect(() => assertAttemptSubmittable(status)).toThrow(AttemptNotSubmittableError);
    }
  });
});

describe("assertSubmitRevisionCurrent", () => {
  it("allows a submit whose expected revision matches the current attempt revision", () => {
    expect(() => assertSubmitRevisionCurrent(3, 3)).not.toThrow();
  });

  it("refuses a stale expected revision (unsynced answers may still be landing)", () => {
    try {
      assertSubmitRevisionCurrent(2, 3);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(SubmitRevisionConflictError);
      expect((error as SubmitRevisionConflictError).expectedAttemptRevision).toBe(2);
      expect((error as SubmitRevisionConflictError).currentAttemptRevision).toBe(3);
    }
  });
});
