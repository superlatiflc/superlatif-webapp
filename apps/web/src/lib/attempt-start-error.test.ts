import { describe, expect, it } from "vitest";
import {
  AttemptAccessDeniedError,
  AttemptFormNotCompatibleError,
  AttemptLimitReachedError,
  AttemptWindowClosedError,
} from "@superlatif/domain/exam";
import { classifyStartAttemptError } from "./attempt-start-error.ts";

describe("classifyStartAttemptError", () => {
  it("classifies an ineligible student (no supporting grant) as 'denied', carrying the domain's own safe reason", () => {
    const error = new AttemptAccessDeniedError({
      allowed: false,
      reasonCode: "NOT_CLAIMED",
      studentReason: "Belum ada akses yang terdaftar untuk ini.",
    });

    const result = classifyStartAttemptError(error);

    expect(result).toEqual({ code: "denied", reason: "Belum ada akses yang terdaftar untuk ini." });
  });

  it("classifies a closed attempt window as 'window_closed'", () => {
    const result = classifyStartAttemptError(new AttemptWindowClosedError("scheduled"));
    expect(result).toEqual({ code: "window_closed" });
  });

  it("classifies an exhausted attempt allowance as 'limit_reached'", () => {
    const result = classifyStartAttemptError(new AttemptLimitReachedError(1, 1));
    expect(result).toEqual({ code: "limit_reached" });
  });

  it("does NOT classify a data-integrity error - genuine bugs must still surface, not be repainted as access-denied", () => {
    expect(classifyStartAttemptError(new AttemptFormNotCompatibleError("draft"))).toBeUndefined();
  });

  it("does NOT classify an unrelated/unexpected error - it must be rethrown by the caller, never swallowed", () => {
    expect(classifyStartAttemptError(new Error("connection reset"))).toBeUndefined();
    expect(classifyStartAttemptError(new TypeError("boom"))).toBeUndefined();
    expect(classifyStartAttemptError("not even an Error instance")).toBeUndefined();
    expect(classifyStartAttemptError(null)).toBeUndefined();
  });
});
