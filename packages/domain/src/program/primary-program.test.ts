import { describe, expect, it } from "vitest";
import { selectPrimaryProgram, type ProgramEnrollmentCandidate } from "./primary-program.ts";

function enrollment(
  overrides: Partial<ProgramEnrollmentCandidate> & Pick<ProgramEnrollmentCandidate, "programId">,
): ProgramEnrollmentCandidate {
  return {
    isPrimary: false,
    enrolledAt: new Date("2026-08-01T00:00:00Z"),
    lastActivityAt: null,
    ...overrides,
  };
}

describe("selectPrimaryProgram - required test: no active program", () => {
  it("returns null when there are zero accessible programs", () => {
    expect(selectPrimaryProgram([])).toBeNull();
  });
});

describe("selectPrimaryProgram - required test: active program selection", () => {
  it("auto-selects the only program (ONLY_PROGRAM)", () => {
    const only = enrollment({ programId: "program-1" });
    expect(selectPrimaryProgram([only])).toEqual({ programId: "program-1", reasonCode: "ONLY_PROGRAM" });
  });

  it("a manual primary choice wins over every other program, even a more recently active one (locked UX decision, dok 09 §8.1/§18)", () => {
    const manual = enrollment({
      programId: "chosen",
      isPrimary: true,
      lastActivityAt: new Date("2026-08-01T00:00:00Z"),
    });
    const moreRecent = enrollment({
      programId: "more-recent",
      isPrimary: false,
      lastActivityAt: new Date("2026-08-29T00:00:00Z"),
    });
    expect(selectPrimaryProgram([moreRecent, manual])).toEqual({
      programId: "chosen",
      reasonCode: "MANUAL_SELECTION",
    });
  });

  it("with no manual choice, picks the most recently active program (MOST_RECENT_ACTIVITY)", () => {
    const stale = enrollment({ programId: "stale", lastActivityAt: new Date("2026-08-01T00:00:00Z") });
    const fresh = enrollment({ programId: "fresh", lastActivityAt: new Date("2026-08-29T00:00:00Z") });
    expect(selectPrimaryProgram([stale, fresh])).toEqual({
      programId: "fresh",
      reasonCode: "MOST_RECENT_ACTIVITY",
    });
  });

  it("falls back to enrolledAt when lastActivityAt is null for both candidates", () => {
    const older = enrollment({
      programId: "older",
      enrolledAt: new Date("2026-01-01T00:00:00Z"),
      lastActivityAt: null,
    });
    const newer = enrollment({
      programId: "newer",
      enrolledAt: new Date("2026-08-01T00:00:00Z"),
      lastActivityAt: null,
    });
    expect(selectPrimaryProgram([older, newer])?.programId).toBe("newer");
  });

  it("breaks an exact recency tie by earliest enrollment, then stable ID", () => {
    const sameActivity = new Date("2026-08-15T00:00:00Z");
    const a = enrollment({
      programId: "a",
      enrolledAt: new Date("2026-01-01T00:00:00Z"),
      lastActivityAt: sameActivity,
    });
    const b = enrollment({
      programId: "b",
      enrolledAt: new Date("2026-02-01T00:00:00Z"),
      lastActivityAt: sameActivity,
    });
    expect(selectPrimaryProgram([b, a])?.programId).toBe("a");
  });
});
