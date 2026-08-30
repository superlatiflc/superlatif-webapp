import { describe, expect, it } from "vitest";
import {
  assertAttemptStartEligible,
  AttemptAccessDeniedError,
  AttemptFormNotCompatibleError,
  AttemptLimitReachedError,
  AttemptWindowClosedError,
  type AttemptStartEligibilityInput,
} from "./attempt-eligibility.ts";

function baseInput(): AttemptStartEligibilityInput {
  return {
    effectiveAccess: {
      allowed: true,
      reasonCode: "ACTIVE_GRANT",
      studentReason: "Aktif - lanjutkan belajar",
    },
    batchState: "exam_open",
    formVersionStatus: "published",
    existingActiveAttemptCount: 0,
    allowanceLimit: 1,
  };
}

describe("assertAttemptStartEligible - authorized/unauthorized start", () => {
  it("allows a fully eligible start (authorized start)", () => {
    expect(() => assertAttemptStartEligible(baseInput())).not.toThrow();
  });

  it("rejects when effective access is not allowed (unauthorized start)", () => {
    const input: AttemptStartEligibilityInput = {
      ...baseInput(),
      effectiveAccess: { allowed: false, reasonCode: "NOT_CLAIMED", studentReason: "Belum ada akses." },
    };
    expect(() => assertAttemptStartEligible(input)).toThrow(AttemptAccessDeniedError);
  });

  it("rejects when the batch window is not exam_open (ATTEMPT_WINDOW_CLOSED)", () => {
    for (const batchState of ["draft", "scheduled", "registration_open", "exam_closed", "scoring"] as const) {
      expect(() => assertAttemptStartEligible({ ...baseInput(), batchState })).toThrow(
        AttemptWindowClosedError,
      );
    }
  });

  it("rejects when the allowance limit is already reached (ATTEMPT_LIMIT_REACHED)", () => {
    const input: AttemptStartEligibilityInput = {
      ...baseInput(),
      existingActiveAttemptCount: 1,
      allowanceLimit: 1,
    };
    expect(() => assertAttemptStartEligible(input)).toThrow(AttemptLimitReachedError);
  });

  it("rejects when the pinned form version is not published (defensive structural guard)", () => {
    const input: AttemptStartEligibilityInput = { ...baseInput(), formVersionStatus: "draft" };
    expect(() => assertAttemptStartEligible(input)).toThrow(AttemptFormNotCompatibleError);
  });

  it("checks access before window/allowance, so a denied user never learns batch timing", () => {
    const input: AttemptStartEligibilityInput = {
      ...baseInput(),
      effectiveAccess: { allowed: false, reasonCode: "NOT_CLAIMED", studentReason: "Belum ada akses." },
      batchState: "draft",
    };
    expect(() => assertAttemptStartEligible(input)).toThrow(AttemptAccessDeniedError);
  });
});
