// Attempt status vocabulary and transition rule (ATM-001).
//
// Transcribed verbatim from CLAUDE.md's canonical "Attempt states" and dok
// 16 §4's own mermaid state diagram - a genuinely new vocabulary for this
// codebase, but not an invented one (CLAUDE.md "Do not introduce synonyms
// without updating the domain document" - this IS the domain document's
// own vocabulary, transcribed exactly).
//
// This task creates attempts only in `created` and immediately transitions
// to `in_progress` once the writer lease is issued (dok 16 §4: "Created ->
// InProgress: start acknowledged" - start itself is the acknowledgement,
// there is no separate "acknowledge" step in this task's scope). No other
// transition is exercised by ATM-001's own code (submitting/submitted/
// scoring/scored belong to the answer-save/submit/scoring tasks this task
// explicitly does not build) - `assertValidAttemptStatusTransition` still
// declares the FULL state machine so a later task can reuse this same rule
// unchanged, the same "declare the whole rule now, only exercise part of
// it" precedent QST-001's own recordStatus lock rule already set.

export type AttemptStatus =
  "created" | "in_progress" | "submitting" | "submitted" | "scoring" | "scored" | "voided";

const TERMINAL_ATTEMPT_STATUSES: ReadonlySet<AttemptStatus> = new Set(["scored", "voided"]);

/** dok 16 §4: "Attempt state berhenti pada scored|voided." */
export function isAttemptTerminal(status: AttemptStatus): boolean {
  return TERMINAL_ATTEMPT_STATUSES.has(status);
}

const VALID_ATTEMPT_TRANSITIONS: Readonly<Record<AttemptStatus, readonly AttemptStatus[]>> = {
  created: ["in_progress", "voided"],
  in_progress: ["submitting", "voided"],
  submitting: ["submitted"],
  submitted: ["scoring", "voided"],
  scoring: ["scored"],
  scored: [],
  voided: [],
};

export class InvalidAttemptStatusTransitionError extends Error {
  constructor(
    readonly from: AttemptStatus,
    readonly to: AttemptStatus,
  ) {
    super(`cannot transition attempt status "${from}" to "${to}"`);
    this.name = "InvalidAttemptStatusTransitionError";
  }
}

export function assertValidAttemptStatusTransition(from: AttemptStatus, to: AttemptStatus): void {
  if (!VALID_ATTEMPT_TRANSITIONS[from].includes(to)) {
    throw new InvalidAttemptStatusTransitionError(from, to);
  }
}

// ---------------------------------------------------------------------------
// ATM-002: answer-save writability guard.
// ---------------------------------------------------------------------------

const FINALIZED_ATTEMPT_STATUSES: ReadonlySet<AttemptStatus> = new Set([
  "submitting",
  "submitted",
  "scoring",
  "scored",
]);

/** Maps to dok 16 §19's own stable codes: `SUBMISSION_ALREADY_FINALIZED` once a (future) submit path has moved the attempt past `in_progress`, `ATTEMPT_NOT_RESUMABLE` otherwise (`created`/`voided`). */
export class AttemptNotWritableError extends Error {
  readonly code: "SUBMISSION_ALREADY_FINALIZED" | "ATTEMPT_NOT_RESUMABLE";
  constructor(readonly status: AttemptStatus) {
    const code = FINALIZED_ATTEMPT_STATUSES.has(status)
      ? "SUBMISSION_ALREADY_FINALIZED"
      : "ATTEMPT_NOT_RESUMABLE";
    super(`${code}: attempt status "${status}" does not accept answer writes`);
    this.name = "AttemptNotWritableError";
    this.code = code;
  }
}

/**
 * Only `in_progress` accepts answer writes. `created` should be
 * unreachable in practice (start already transitions to `in_progress`
 * atomically, ATM-001) but is refused defensively rather than assumed
 * away. `submitting`/`submitted`/`scoring`/`scored` are dok 16 §19's own
 * `SUBMISSION_ALREADY_FINALIZED` territory - this task builds no submit
 * path, so those statuses are never actually reached by any code this
 * task ships, but the guard is total (covers every `AttemptStatus`) so a
 * future submit task's writes are refused here automatically, not by
 * remembering to add a case.
 */
export function assertAttemptWritable(status: AttemptStatus): void {
  if (status !== "in_progress") throw new AttemptNotWritableError(status);
}
