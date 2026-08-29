import { describe, expect, it } from "vitest";
import { evaluateJoinWindow, isLiveSessionJoinable, renderInTimezone } from "./schedule.ts";

describe("isLiveSessionJoinable", () => {
  it("only scheduled and live are joinable", () => {
    expect(isLiveSessionJoinable("scheduled")).toBe(true);
    expect(isLiveSessionJoinable("live")).toBe(true);
  });

  it("draft, ended, cancelled, and rescheduled are never joinable", () => {
    expect(isLiveSessionJoinable("draft")).toBe(false);
    expect(isLiveSessionJoinable("ended")).toBe(false);
    expect(isLiveSessionJoinable("cancelled")).toBe(false);
    expect(isLiveSessionJoinable("rescheduled")).toBe(false);
  });
});

describe("evaluateJoinWindow", () => {
  const session = {
    startsAt: new Date("2026-08-29T10:00:00.000Z"),
    endsAt: new Date("2026-08-29T11:00:00.000Z"),
  };
  const config = { joinWindowBeforeMinutes: 15, joinWindowAfterMinutes: 30 };

  it("is not_open_yet before the window starts", () => {
    const now = new Date("2026-08-29T09:44:00.000Z"); // 16 min before start
    expect(evaluateJoinWindow(session, config, now)).toBe("not_open_yet");
  });

  it("is open exactly at the window boundary before start", () => {
    const now = new Date("2026-08-29T09:45:00.000Z"); // exactly 15 min before
    expect(evaluateJoinWindow(session, config, now)).toBe("open");
  });

  it("is open during the session itself", () => {
    const now = new Date("2026-08-29T10:30:00.000Z");
    expect(evaluateJoinWindow(session, config, now)).toBe("open");
  });

  it("is open exactly at the window boundary after end", () => {
    const now = new Date("2026-08-29T11:30:00.000Z"); // exactly 30 min after end
    expect(evaluateJoinWindow(session, config, now)).toBe("open");
  });

  it("is closed after the window ends", () => {
    const now = new Date("2026-08-29T11:31:00.000Z");
    expect(evaluateJoinWindow(session, config, now)).toBe("closed");
  });
});

describe("required test: timezone boundary", () => {
  it("renders the same UTC instant differently depending on the target timezone - including a day boundary", () => {
    // 2026-08-29T17:30:00Z is still 2026-08-29 in UTC, but already
    // 2026-08-30 in Asia/Jakarta (UTC+7) - a genuine day-boundary case, not
    // just a formatting difference.
    const instant = new Date("2026-08-29T17:30:00.000Z");
    expect(renderInTimezone(instant, "UTC")).toBe("2026-08-29 17:30:00");
    expect(renderInTimezone(instant, "Asia/Jakarta")).toBe("2026-08-30 00:30:00");
  });

  it("never changes the underlying stored instant - only the rendered string differs", () => {
    const instant = new Date("2026-08-29T00:00:00.000Z");
    renderInTimezone(instant, "Asia/Jakarta");
    expect(instant.toISOString()).toBe("2026-08-29T00:00:00.000Z"); // unchanged
  });
});
