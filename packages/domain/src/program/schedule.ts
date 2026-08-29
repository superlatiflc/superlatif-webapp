// Schedule, live class, and join-window domain (SCH-001).
//
// dok 14 §11 "Schedule domain" / §12 "Join flow" taken literally: a join
// attempt must clear TWO independent, purely time/state-based checks
// before program access (ENT-002/IDN-004) is even asked - session STATUS
// (only "scheduled"/"live" are joinable at all - a cancelled or ended
// session is never joinable regardless of who is asking) and JOIN WINDOW
// (now must fall inside [startsAt - before, endsAt + after]). Both are pure
// and dependency-free; the service layer (packages/db/src/program/
// schedule-service.ts) is what composes them with the actual access check.

export type ScheduleItemType = "live_class" | "exam_window" | "deadline" | "announcement" | "other";

/** dok 14 §11 "Status" - transcribed verbatim. */
export type LiveSessionStatus = "draft" | "scheduled" | "live" | "ended" | "cancelled" | "rescheduled";

const JOINABLE_STATUSES: readonly LiveSessionStatus[] = ["scheduled", "live"];

/** A cancelled/ended/rescheduled/draft session is never joinable, independent of access or window. */
export function isLiveSessionJoinable(status: LiveSessionStatus): boolean {
  return JOINABLE_STATUSES.includes(status);
}

/** dok 14 §11 "join window" - minutes on either side of the session's own starts_at/ends_at during which a join attempt is allowed at all. */
export interface JoinWindowConfig {
  readonly joinWindowBeforeMinutes: number;
  readonly joinWindowAfterMinutes: number;
}

export type JoinWindowState = "not_open_yet" | "open" | "closed";

/** Pure, no I/O - `now` is always caller-injected, never `Date.now()`. */
export function evaluateJoinWindow(
  session: { readonly startsAt: Date; readonly endsAt: Date },
  config: JoinWindowConfig,
  now: Date,
): JoinWindowState {
  const windowStart = new Date(session.startsAt.getTime() - config.joinWindowBeforeMinutes * 60_000);
  const windowEnd = new Date(session.endsAt.getTime() + config.joinWindowAfterMinutes * 60_000);
  if (now.getTime() < windowStart.getTime()) return "not_open_yet";
  if (now.getTime() > windowEnd.getTime()) return "closed";
  return "open";
}

/**
 * SCH-001 acceptance: "Schedule uses canonical UTC with user-local
 * rendering." Storage is always the canonical UTC instant (a `timestamptz`
 * column); this renders that SAME instant into a specific IANA zone for
 * display only - it never changes what instant is stored or compared.
 * `Intl.DateTimeFormat` is a JS-runtime built-in, not a vendor SDK.
 */
export function renderInTimezone(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .format(instant)
    .replace(",", "");
}
