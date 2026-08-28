// Injected clock (27_QA_TESTING_AND_UAT_PLAN.md §2 "Deterministic", §4 "Clock
// injection digunakan untuk sale, batch, deadline, expiry, dan scheduled
// notification").
//
// Server time is authoritative for exam deadlines, so nothing in a test may
// read the wall clock directly. Tests take a Clock and are given one.

/** The single time source a test-visible component is allowed to read. */
export interface Clock {
  now(): Date;
}

/** A clock a test can move deliberately. */
export interface ManualClock extends Clock {
  advance(milliseconds: number): void;
  set(instant: string | Date): void;
}

/** Fixed instant used when a test does not care which instant it is. */
export const DEFAULT_TEST_INSTANT = "2026-01-01T00:00:00.000Z";

function parseInstant(instant: string | Date): number {
  const value = instant instanceof Date ? instant.getTime() : Date.parse(instant);
  if (Number.isNaN(value)) {
    throw new TypeError(`Invalid instant: ${String(instant)}`);
  }
  return value;
}

/** A clock that never advances. Use when elapsed time must not affect a result. */
export function fixedClock(instant: string | Date = DEFAULT_TEST_INSTANT): Clock {
  const epochMilliseconds = parseInstant(instant);
  return {
    now: () => new Date(epochMilliseconds),
  };
}

/** A clock that only moves when a test moves it. */
export function manualClock(instant: string | Date = DEFAULT_TEST_INSTANT): ManualClock {
  let epochMilliseconds = parseInstant(instant);
  return {
    now: () => new Date(epochMilliseconds),
    advance(milliseconds: number) {
      if (!Number.isFinite(milliseconds)) {
        throw new TypeError(`advance() requires a finite number, received ${String(milliseconds)}`);
      }
      if (milliseconds < 0) {
        // A deadline that can move backwards is not a deadline.
        throw new RangeError("A manual clock must not move backwards");
      }
      epochMilliseconds += milliseconds;
    },
    set(next: string | Date) {
      epochMilliseconds = parseInstant(next);
    },
  };
}
