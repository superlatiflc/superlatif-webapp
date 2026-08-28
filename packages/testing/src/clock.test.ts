import { describe, expect, it } from "vitest";
import { DEFAULT_TEST_INSTANT, fixedClock, manualClock } from "./clock.ts";

describe("fixedClock", () => {
  it("returns the same instant on every read", () => {
    const clock = fixedClock("2026-03-01T09:15:00.000Z");
    const first = clock.now().toISOString();
    const second = clock.now().toISOString();
    expect(first).toBe("2026-03-01T09:15:00.000Z");
    expect(second).toBe(first);
  });

  it("defaults to the shared test instant", () => {
    expect(fixedClock().now().toISOString()).toBe(DEFAULT_TEST_INSTANT);
  });

  it("rejects an unparseable instant", () => {
    expect(() => fixedClock("not-a-date")).toThrow(TypeError);
  });
});

describe("manualClock", () => {
  it("only moves when the test moves it", () => {
    const clock = manualClock("2026-03-01T09:15:00.000Z");
    expect(clock.now().toISOString()).toBe("2026-03-01T09:15:00.000Z");
    clock.advance(90_000);
    expect(clock.now().toISOString()).toBe("2026-03-01T09:16:30.000Z");
  });

  it("refuses to move backwards, because a deadline that rewinds is not a deadline", () => {
    const clock = manualClock();
    expect(() => clock.advance(-1)).toThrow(RangeError);
  });

  it("rejects a non-finite advance", () => {
    const clock = manualClock();
    expect(() => clock.advance(Number.NaN)).toThrow(TypeError);
  });
});
