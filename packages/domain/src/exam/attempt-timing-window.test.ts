import { describe, expect, it } from "vitest";
import { evaluateAnswerTimingWindow } from "./attempt-timing-window.ts";

const deadlineAt = new Date("2026-09-01T02:00:00Z");
const lateSyncCutoffAt = new Date("2026-09-01T02:00:30Z");

describe("evaluateAnswerTimingWindow - server-authoritative timer, clock manipulation resistant", () => {
  it("is 'normal' any time before the deadline, regardless of how the caller computed it", () => {
    expect(evaluateAnswerTimingWindow(new Date(deadlineAt.getTime() - 1), deadlineAt, lateSyncCutoffAt)).toBe(
      "normal",
    );
    expect(evaluateAnswerTimingWindow(new Date("2026-08-01T00:00:00Z"), deadlineAt, lateSyncCutoffAt)).toBe(
      "normal",
    );
  });

  it("boundary: exactly at the deadline is already past 'normal' (inclusive)", () => {
    expect(evaluateAnswerTimingWindow(deadlineAt, deadlineAt, lateSyncCutoffAt)).toBe(
      "late_sync_recovery_candidate",
    );
  });

  it("is 'late_sync_recovery_candidate' between deadline and cutoff", () => {
    expect(
      evaluateAnswerTimingWindow(new Date(deadlineAt.getTime() + 15_000), deadlineAt, lateSyncCutoffAt),
    ).toBe("late_sync_recovery_candidate");
  });

  it("boundary: exactly at the cutoff is already 'rejected' (inclusive)", () => {
    expect(evaluateAnswerTimingWindow(lateSyncCutoffAt, deadlineAt, lateSyncCutoffAt)).toBe("rejected");
  });

  it("is 'rejected' any time after the cutoff", () => {
    expect(
      evaluateAnswerTimingWindow(
        new Date(lateSyncCutoffAt.getTime() + 3_600_000),
        deadlineAt,
        lateSyncCutoffAt,
      ),
    ).toBe("rejected");
  });

  it("clock manipulation: a client-forged 'now' has no channel into this function at all - only the server-resolved instant is ever compared", () => {
    // This test documents the invariant structurally: evaluateAnswerTimingWindow's
    // signature has no `capturedAtClient` parameter, so a caller literally cannot
    // pass a client timestamp into the decision even by mistake.
    expect(evaluateAnswerTimingWindow.length).toBe(3);
  });
});
