import { describe, expect, it } from "vitest";
import { deriveBatchState, type DeriveBatchStateInput } from "./batch-state.ts";

const attempt = { startsAt: new Date("2026-09-01T00:00:00Z"), endsAt: new Date("2026-09-01T02:00:00Z") };

function baseInput(): DeriveBatchStateInput {
  return {
    governanceStatus: "published",
    voidedAt: null,
    registration: { startsAt: new Date("2026-08-20T00:00:00Z"), endsAt: new Date("2026-09-01T00:00:00Z") },
    attempt,
    lateSyncCutoff: { startsAt: new Date("2026-09-01T02:00:30Z") },
    provisionalResultRelease: { startsAt: new Date("2026-09-02T00:00:00Z") },
    finalResultRelease: { startsAt: new Date("2026-09-05T00:00:00Z") },
    explanationRelease: { startsAt: new Date("2026-09-06T00:00:00Z") },
  };
}

describe("deriveBatchState - server-derived batch state transitions", () => {
  it("is 'draft' whenever governance status has not reached published, regardless of windows", () => {
    for (const governanceStatus of ["draft", "in_review", "changes_requested", "approved"] as const) {
      expect(deriveBatchState({ ...baseInput(), governanceStatus }, new Date("2026-09-01T01:00:00Z"))).toBe(
        "draft",
      );
    }
  });

  it("is 'archived' once governance status is archived, even mid-attempt-window", () => {
    expect(
      deriveBatchState({ ...baseInput(), governanceStatus: "archived" }, new Date("2026-09-01T01:00:00Z")),
    ).toBe("archived");
  });

  it("is 'voided' whenever voidedAt is set, taking priority over every other input", () => {
    expect(
      deriveBatchState(
        { ...baseInput(), voidedAt: new Date("2026-08-15T00:00:00Z") },
        new Date("2026-09-01T01:00:00Z"),
      ),
    ).toBe("voided");
  });

  it("walks the full timeline for a published batch: scheduled -> registration_open -> scheduled(gap) -> exam_open -> exam_closed -> scoring -> provisional_released -> final_released -> review_open", () => {
    const input = baseInput();
    expect(deriveBatchState(input, new Date("2026-08-01T00:00:00Z"))).toBe("scheduled");
    expect(deriveBatchState(input, new Date("2026-08-25T00:00:00Z"))).toBe("registration_open");
    expect(deriveBatchState(input, new Date("2026-09-01T00:30:00Z"))).toBe("exam_open");
    expect(deriveBatchState(input, new Date("2026-09-01T02:00:15Z"))).toBe("exam_closed");
    expect(deriveBatchState(input, new Date("2026-09-01T12:00:00Z"))).toBe("scoring");
    expect(deriveBatchState(input, new Date("2026-09-03T00:00:00Z"))).toBe("provisional_released");
    expect(deriveBatchState(input, new Date("2026-09-05T12:00:00Z"))).toBe("final_released");
    expect(deriveBatchState(input, new Date("2026-09-07T00:00:00Z"))).toBe("review_open");
  });

  it("skips straight to exam_open with no registration window configured", () => {
    const input: DeriveBatchStateInput = { governanceStatus: "published", voidedAt: null, attempt };
    expect(deriveBatchState(input, new Date("2026-08-01T00:00:00Z"))).toBe("scheduled");
    expect(deriveBatchState(input, new Date("2026-09-01T01:00:00Z"))).toBe("exam_open");
  });

  it("uses attempt end as the exam_closed boundary when no late_sync_cutoff is configured", () => {
    const input: DeriveBatchStateInput = { governanceStatus: "published", voidedAt: null, attempt };
    expect(deriveBatchState(input, new Date("2026-09-01T02:00:01Z"))).toBe("scoring");
  });

  it("stays 'scoring' indefinitely with no result-release window configured at all", () => {
    const input: DeriveBatchStateInput = { governanceStatus: "published", voidedAt: null, attempt };
    expect(deriveBatchState(input, new Date("2030-01-01T00:00:00Z"))).toBe("scoring");
  });

  it("stays 'provisional_released' indefinitely with no final_result_release configured", () => {
    const input: DeriveBatchStateInput = {
      governanceStatus: "published",
      voidedAt: null,
      attempt,
      provisionalResultRelease: { startsAt: new Date("2026-09-02T00:00:00Z") },
    };
    expect(deriveBatchState(input, new Date("2030-01-01T00:00:00Z"))).toBe("provisional_released");
  });

  it("goes straight from scoring to final_released with no provisional window configured", () => {
    const input: DeriveBatchStateInput = {
      governanceStatus: "published",
      voidedAt: null,
      attempt,
      finalResultRelease: { startsAt: new Date("2026-09-03T00:00:00Z") },
    };
    expect(deriveBatchState(input, new Date("2026-09-02T00:00:00Z"))).toBe("scoring");
    expect(deriveBatchState(input, new Date("2026-09-04T00:00:00Z"))).toBe("final_released");
  });

  it("recognizes explanation release as review_open even without an explicit final_result_release window (dok 18 §20 scenario 6)", () => {
    const input: DeriveBatchStateInput = {
      governanceStatus: "published",
      voidedAt: null,
      attempt,
      explanationRelease: { startsAt: new Date("2026-09-04T00:00:00Z") },
    };
    expect(deriveBatchState(input, new Date("2026-09-03T00:00:00Z"))).toBe("scoring");
    expect(deriveBatchState(input, new Date("2026-09-05T00:00:00Z"))).toBe("review_open");
  });

  it("boundary: state flips exactly at the instant a window is reached (inclusive)", () => {
    const input = baseInput();
    // baseInput()'s registration window ends exactly at attempt.startsAt, so
    // the instant just before attempt start is still "registration_open" -
    // the registration window has not closed yet at that instant.
    expect(deriveBatchState(input, attempt.startsAt)).toBe("exam_open");
    expect(deriveBatchState(input, new Date(attempt.startsAt.getTime() - 1))).toBe("registration_open");
    expect(deriveBatchState(input, attempt.endsAt)).toBe("exam_closed");
    expect(deriveBatchState(input, new Date(attempt.endsAt.getTime() - 1))).toBe("exam_open");
  });
});
