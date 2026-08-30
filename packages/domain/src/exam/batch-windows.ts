// Tryout batch window vocabulary and coherence validator (EXM-002).
//
// dok 18 §3 "Timeline" names ten independent windows and is explicit that
// "Validation memastikan urutan logis tetapi mengizinkan overlap yang
// memang dimaksud" (validation ensures logical order but allows
// intentionally overlapping windows) - this module enforces only the
// invariants that are ALWAYS true regardless of business model (a ranged
// window's end is after its start; a downstream milestone cannot precede
// the upstream one it depends on), and deliberately does NOT force
// adjacency or non-overlap between windows that dok 18 says may overlap on
// purpose (e.g. registration closing exactly when the attempt opens is one
// valid design, not the only one).
//
// `catalogue`/`sale` are part of contracts/drizzle-schema.ts's full
// `batchWindowType` vocabulary (transcribed verbatim in
// packages/db/src/schema/enums.ts) but are explicitly OUT of this task's
// scope: dok 18 §2 "Harga tidak berada di batch. Exam window tidak berada
// di offer" - those two windows stay owned by COM-001's own
// `offers.saleStartsAt`/`saleEndsAt`Batch never duplicates them. This
// module's own `BatchWindowType` therefore only names the eight window
// types a batch itself may own; `assertBatchWindowsCoherent` never even
// sees a catalogue/sale row because the db-layer batch-window-repository
// (EXM-002) refuses to persist one in the first place.

/** The eight window types a batch itself owns - excludes `catalogue`/`sale` (COM-001's own `offers`, see module doc). */
export const BATCH_WINDOW_TYPES = [
  "registration",
  "attempt",
  "late_sync_cutoff",
  "provisional_result_release",
  "final_result_release",
  "leaderboard_release",
  "explanation_release",
  "access_end",
] as const;

export type BatchWindowType = (typeof BATCH_WINDOW_TYPES)[number];

/** dok 18 §21 audit resolution + drizzle-schema.ts's own CHECK constraint shape: `registration`/`attempt` are ranged (endsAt required, endsAt > startsAt); every other type is a single point in time (endsAt must be absent). */
export const RANGED_BATCH_WINDOW_TYPES: readonly BatchWindowType[] = ["registration", "attempt"];

export function isRangedBatchWindowType(type: BatchWindowType): boolean {
  return (RANGED_BATCH_WINDOW_TYPES as readonly string[]).includes(type);
}

export interface BatchRangedWindow {
  readonly startsAt: Date;
  readonly endsAt: Date;
}

export interface BatchPointWindow {
  readonly startsAt: Date;
}

/** One slot per window type, all optional except `attempt` - matches contracts/openapi.yaml's `Batch.windows` schema, which requires only `attemptStartsAt`/`attemptEndsAt`. */
export interface BatchWindowSet {
  readonly registration?: BatchRangedWindow;
  readonly attempt: BatchRangedWindow;
  readonly lateSyncCutoff?: BatchPointWindow;
  readonly provisionalResultRelease?: BatchPointWindow;
  readonly finalResultRelease?: BatchPointWindow;
  readonly leaderboardRelease?: BatchPointWindow;
  readonly explanationRelease?: BatchPointWindow;
  readonly accessEnd?: BatchPointWindow;
}

export class BatchWindowsInvalidError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Batch windows are invalid:\n${issues.map((issue) => `  - ${issue}`).join("\n")}`);
    this.name = "BatchWindowsInvalidError";
  }
}

export class BatchWindowTypeNotOwnedByBatchError extends Error {
  constructor(readonly type: string) {
    super(
      `Batch does not own a "${type}" window - catalogue/sale windows belong to the linked COM-001 offer (dok 18 §2 "Exam window tidak berada di offer")`,
    );
    this.name = "BatchWindowTypeNotOwnedByBatchError";
  }
}

/** Guards every insert path (batch-window-repository, EXM-002) - never let a `catalogue`/`sale` row reach `batch_windows` even though the underlying pg enum still carries those two values for vocabulary parity with contracts/drizzle-schema.ts. */
export function assertBatchOwnsWindowType(type: string): asserts type is BatchWindowType {
  if (!(BATCH_WINDOW_TYPES as readonly string[]).includes(type)) {
    throw new BatchWindowTypeNotOwnedByBatchError(type);
  }
}

/**
 * Validates internal coherence of one batch's full window set at a given
 * instant. Pure and timezone-safe: every `Date` here is already a UTC
 * instant (the caller resolves any authoring-timezone display separately,
 * the same split `schedule_items.timezone` (SCH-001) already uses) - this
 * function only ever compares instants, so it produces the same verdict
 * regardless of which timezone a browser or server process happens to run
 * in.
 */
export function assertBatchWindowsCoherent(windows: BatchWindowSet): void {
  const issues: string[] = [];

  function checkRanged(label: string, window: BatchRangedWindow | undefined, required: boolean): void {
    if (!window) {
      if (required) issues.push(`"${label}" window is required but missing`);
      return;
    }
    if (window.endsAt.getTime() <= window.startsAt.getTime()) {
      issues.push(`"${label}" window must end after it starts`);
    }
  }

  checkRanged("attempt", windows.attempt, true);
  checkRanged("registration", windows.registration, false);

  // Only enforced when BOTH windows are present - see module doc on
  // "allows intentional overlap".
  function requireAtOrAfter(
    laterLabel: string,
    laterAt: Date | undefined,
    earlierLabel: string,
    earlierAt: Date | undefined,
  ): void {
    if (laterAt === undefined || earlierAt === undefined) return;
    if (laterAt.getTime() < earlierAt.getTime()) {
      issues.push(
        `"${laterLabel}" (${laterAt.toISOString()}) must not be before "${earlierLabel}" (${earlierAt.toISOString()})`,
      );
    }
  }

  const attemptEndsAt = windows.attempt?.endsAt;
  requireAtOrAfter("late_sync_cutoff", windows.lateSyncCutoff?.startsAt, "attempt end", attemptEndsAt);
  requireAtOrAfter(
    "provisional_result_release",
    windows.provisionalResultRelease?.startsAt,
    "attempt end",
    attemptEndsAt,
  );
  requireAtOrAfter(
    "final_result_release",
    windows.finalResultRelease?.startsAt,
    "provisional_result_release",
    windows.provisionalResultRelease?.startsAt,
  );
  if (windows.provisionalResultRelease === undefined) {
    requireAtOrAfter(
      "final_result_release",
      windows.finalResultRelease?.startsAt,
      "attempt end",
      attemptEndsAt,
    );
  }
  requireAtOrAfter(
    "explanation_release",
    windows.explanationRelease?.startsAt,
    "final_result_release",
    windows.finalResultRelease?.startsAt,
  );
  if (windows.finalResultRelease === undefined) {
    requireAtOrAfter(
      "explanation_release",
      windows.explanationRelease?.startsAt,
      "attempt end",
      attemptEndsAt,
    );
  }
  requireAtOrAfter("leaderboard_release", windows.leaderboardRelease?.startsAt, "attempt end", attemptEndsAt);
  requireAtOrAfter("access_end", windows.accessEnd?.startsAt, "attempt end", attemptEndsAt);
  if (windows.registration) {
    requireAtOrAfter("attempt end", attemptEndsAt, "registration start", windows.registration.startsAt);
  }

  if (issues.length > 0) throw new BatchWindowsInvalidError(issues);
}
