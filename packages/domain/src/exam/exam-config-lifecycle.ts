// Blueprint/scoring-policy/form-version mutability rule (EXM-001).
//
// Reuses QST-001's own recordStatus lock point (question-lifecycle.ts's
// own module doc already says this rule "is not question-specific - it is
// the recordStatus workflow's own lock point") - imported and re-exported
// here, not reimplemented, so a change to the underlying lock rule can
// never drift between the two artifact families. Wrapped with an
// artifact-kind-aware error so a blueprint's error message never says
// "question version" by accident.

import {
  assertValidQuestionStatusTransition,
  isQuestionVersionLocked,
  type RecordStatus,
} from "./question-lifecycle.ts";

export type ExamConfigArtifactKind = "blueprint_version" | "scoring_policy_version" | "exam_form_version";

export const isExamConfigVersionLocked = isQuestionVersionLocked;
export const assertValidExamConfigStatusTransition = assertValidQuestionStatusTransition;

export class ExamConfigVersionLockedError extends Error {
  constructor(
    readonly artifactKind: ExamConfigArtifactKind,
    readonly status: RecordStatus,
  ) {
    super(
      `${artifactKind} is locked (status "${status}") and cannot be mutated in place; create a new version instead`,
    );
    this.name = "ExamConfigVersionLockedError";
  }
}

export function assertExamConfigVersionMutable(
  artifactKind: ExamConfigArtifactKind,
  status: RecordStatus,
): void {
  if (isExamConfigVersionLocked(status)) {
    throw new ExamConfigVersionLockedError(artifactKind, status);
  }
}
