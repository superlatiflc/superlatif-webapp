// question_version / stimulus_version mutability rule (QST-001).
//
// dok 15 §4 "Stable identity dan version": "question adalah identity/kode
// yang stabil. question_version immutable setelah approved/published/used.
// Draft boleh diedit; publish membuat version snapshot." This is a
// genuinely DIFFERENT rule from every other versioned artifact in this
// codebase (ENT-001 access_policies, COM-001 product_versions, PRG-002
// resource_versions all lock from creation) - here, draft/in_review/
// changes_requested rows are mutable in place, and only
// approved/published/archived lock them. Honored literally rather than
// forced into the codebase's usual pattern, per dok 15's own explicit
// language.
//
// `RecordStatus` matches schema/enums.ts's `recordStatus` pgEnum exactly -
// reused as-is, not duplicated, the same way question_versions.status and
// stimulus_versions.status both reuse it at the schema layer.

export type RecordStatus =
  "draft" | "in_review" | "changes_requested" | "approved" | "published" | "archived";

const LOCKED_QUESTION_STATUSES: ReadonlySet<RecordStatus> = new Set(["approved", "published", "archived"]);

export function isQuestionVersionLocked(status: RecordStatus): boolean {
  return LOCKED_QUESTION_STATUSES.has(status);
}

export class QuestionVersionLockedError extends Error {
  constructor(readonly status: RecordStatus) {
    super(
      `question version is locked (status "${status}") and cannot be mutated in place; create a new version instead`,
    );
    this.name = "QuestionVersionLockedError";
  }
}

/** Throws unless `status` is still mutable-in-place. */
export function assertQuestionVersionMutable(status: RecordStatus): void {
  if (isQuestionVersionLocked(status)) {
    throw new QuestionVersionLockedError(status);
  }
}

const VALID_TRANSITIONS: Readonly<Record<RecordStatus, readonly RecordStatus[]>> = {
  draft: ["in_review"],
  in_review: ["changes_requested", "approved"],
  changes_requested: ["in_review"],
  approved: ["published"],
  published: ["archived"],
  archived: [],
};

export class InvalidQuestionStatusTransitionError extends Error {
  constructor(
    readonly from: RecordStatus,
    readonly to: RecordStatus,
  ) {
    super(`cannot transition question version status "${from}" to "${to}"`);
    this.name = "InvalidQuestionStatusTransitionError";
  }
}

export function assertValidQuestionStatusTransition(from: RecordStatus, to: RecordStatus): void {
  if (!VALID_TRANSITIONS[from].includes(to)) {
    throw new InvalidQuestionStatusTransitionError(from, to);
  }
}
