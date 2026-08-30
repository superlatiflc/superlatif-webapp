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
