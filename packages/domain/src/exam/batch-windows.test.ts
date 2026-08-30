import { describe, expect, it } from "vitest";
import {
  assertBatchOwnsWindowType,
  assertBatchWindowsCoherent,
  BatchWindowsInvalidError,
  BatchWindowTypeNotOwnedByBatchError,
  isRangedBatchWindowType,
  type BatchWindowSet,
} from "./batch-windows.ts";

const attempt = { startsAt: new Date("2026-09-01T00:00:00Z"), endsAt: new Date("2026-09-01T02:00:00Z") };

function validWindows(): BatchWindowSet {
  return {
    registration: {
      startsAt: new Date("2026-08-20T00:00:00Z"),
      endsAt: new Date("2026-09-01T00:00:00Z"),
    },
    attempt,
    lateSyncCutoff: { startsAt: new Date("2026-09-01T02:00:30Z") },
    provisionalResultRelease: { startsAt: new Date("2026-09-02T00:00:00Z") },
    finalResultRelease: { startsAt: new Date("2026-09-05T00:00:00Z") },
    leaderboardRelease: { startsAt: new Date("2026-09-05T00:00:00Z") },
    explanationRelease: { startsAt: new Date("2026-09-06T00:00:00Z") },
    accessEnd: { startsAt: new Date("2026-12-01T00:00:00Z") },
  };
}

describe("assertBatchWindowsCoherent - window boundary matrix", () => {
  it("passes for a fully coherent, independent window set (allows the intentional registration/attempt overlap boundary)", () => {
    expect(() => assertBatchWindowsCoherent(validWindows())).not.toThrow();
  });

  it("passes with only the required attempt window present", () => {
    expect(() => assertBatchWindowsCoherent({ attempt })).not.toThrow();
  });

  it("rejects a ranged window whose end is not after its start", () => {
    const windows = { attempt: { startsAt: attempt.endsAt, endsAt: attempt.startsAt } };
    expect(() => assertBatchWindowsCoherent(windows)).toThrow(/must end after it starts/);
  });

  it("rejects registration ending before it starts", () => {
    const windows: BatchWindowSet = {
      ...validWindows(),
      registration: { startsAt: attempt.startsAt, endsAt: new Date("2026-08-01T00:00:00Z") },
    };
    expect(() => assertBatchWindowsCoherent(windows)).toThrow(/must end after it starts/);
  });

  it("rejects late_sync_cutoff before attempt end", () => {
    const windows: BatchWindowSet = {
      attempt,
      lateSyncCutoff: { startsAt: new Date("2026-09-01T01:00:00Z") },
    };
    expect(() => assertBatchWindowsCoherent(windows)).toThrow(
      /late_sync_cutoff.*must not be before.*attempt end/s,
    );
  });

  it("rejects provisional_result_release before attempt end", () => {
    const windows: BatchWindowSet = {
      attempt,
      provisionalResultRelease: { startsAt: new Date("2026-08-31T00:00:00Z") },
    };
    expect(() => assertBatchWindowsCoherent(windows)).toThrow(/provisional_result_release/);
  });

  it("rejects final_result_release before provisional_result_release when both are present", () => {
    const windows: BatchWindowSet = {
      attempt,
      provisionalResultRelease: { startsAt: new Date("2026-09-02T00:00:00Z") },
      finalResultRelease: { startsAt: new Date("2026-09-01T12:00:00Z") },
    };
    expect(() => assertBatchWindowsCoherent(windows)).toThrow(/final_result_release/);
  });

  it("allows final_result_release without a provisional window, anchored to attempt end instead", () => {
    const windows: BatchWindowSet = {
      attempt,
      finalResultRelease: { startsAt: new Date("2026-09-03T00:00:00Z") },
    };
    expect(() => assertBatchWindowsCoherent(windows)).not.toThrow();
  });

  it("rejects explanation_release before final_result_release", () => {
    const windows: BatchWindowSet = {
      attempt,
      finalResultRelease: { startsAt: new Date("2026-09-05T00:00:00Z") },
      explanationRelease: { startsAt: new Date("2026-09-04T00:00:00Z") },
    };
    expect(() => assertBatchWindowsCoherent(windows)).toThrow(/explanation_release/);
  });

  it("rejects access_end before attempt end", () => {
    const windows: BatchWindowSet = { attempt, accessEnd: { startsAt: new Date("2026-08-01T00:00:00Z") } };
    expect(() => assertBatchWindowsCoherent(windows)).toThrow(/access_end/);
  });

  it("rejects registration starting after the attempt window has already closed", () => {
    const windows: BatchWindowSet = {
      attempt,
      registration: { startsAt: new Date("2026-09-02T00:00:00Z"), endsAt: new Date("2026-09-03T00:00:00Z") },
    };
    expect(() => assertBatchWindowsCoherent(windows)).toThrow(
      /attempt end.*must not be before.*registration start/s,
    );
  });

  it("allows registration to overlap the attempt window (intentional overlap is not rejected)", () => {
    const windows: BatchWindowSet = {
      attempt,
      registration: { startsAt: new Date("2026-08-25T00:00:00Z"), endsAt: new Date("2026-09-01T01:00:00Z") },
    };
    expect(() => assertBatchWindowsCoherent(windows)).not.toThrow();
  });

  it("collects multiple issues in one BatchWindowsInvalidError", () => {
    try {
      assertBatchWindowsCoherent({
        attempt: { startsAt: attempt.endsAt, endsAt: attempt.startsAt },
        accessEnd: { startsAt: new Date("2020-01-01T00:00:00Z") },
      });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(BatchWindowsInvalidError);
      expect((error as BatchWindowsInvalidError).issues.length).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("assertBatchOwnsWindowType / isRangedBatchWindowType", () => {
  it("accepts every one of the eight batch-owned types", () => {
    for (const type of [
      "registration",
      "attempt",
      "late_sync_cutoff",
      "provisional_result_release",
      "final_result_release",
      "leaderboard_release",
      "explanation_release",
      "access_end",
    ]) {
      expect(() => assertBatchOwnsWindowType(type)).not.toThrow();
    }
  });

  it("rejects catalogue and sale - those belong to COM-001's offer, not the batch", () => {
    for (const type of ["catalogue", "sale"]) {
      try {
        assertBatchOwnsWindowType(type);
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(BatchWindowTypeNotOwnedByBatchError);
        expect((error as Error).message).toContain("offer");
      }
    }
  });

  it("classifies registration/attempt as ranged and everything else as point-in-time", () => {
    expect(isRangedBatchWindowType("registration")).toBe(true);
    expect(isRangedBatchWindowType("attempt")).toBe(true);
    expect(isRangedBatchWindowType("access_end")).toBe(false);
    expect(isRangedBatchWindowType("leaderboard_release")).toBe(false);
  });
});
