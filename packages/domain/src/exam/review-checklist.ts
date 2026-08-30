// Moderator review checklist (QST-003).
//
// dok 12 §31 "A09 — Review Queue", "Checklist minimum" - transcribed
// verbatim into nine boolean fields. This is enforced, not decorative:
// `assertReviewChecklistComplete` is called by
// packages/db/src/exam/question-service.ts#approveQuestionVersion BEFORE a
// version is allowed to transition to `approved` - a reviewer cannot
// approve a question the screen contract says they have not actually
// checked. This is a NEW concern QST-001 did not build (QST-001 was
// question BANK model only - no review/moderation persistence), not a
// second copy of anything QST-001 already has.

export interface ReviewChecklist {
  readonly classificationCorrect: boolean;
  readonly stemClear: boolean;
  readonly optionsComplete: boolean;
  readonly answerScoringCorrect: boolean;
  readonly explanationAdequate: boolean;
  readonly mediaReadable: boolean;
  readonly sourceAndRightsOk: boolean;
  readonly accessibilityMetadataOk: boolean;
  readonly notDuplicate: boolean;
}

export function isReviewChecklistComplete(checklist: ReviewChecklist): boolean {
  return (
    checklist.classificationCorrect &&
    checklist.stemClear &&
    checklist.optionsComplete &&
    checklist.answerScoringCorrect &&
    checklist.explanationAdequate &&
    checklist.mediaReadable &&
    checklist.sourceAndRightsOk &&
    checklist.accessibilityMetadataOk &&
    checklist.notDuplicate
  );
}

export class ReviewChecklistIncompleteError extends Error {
  readonly incompleteItems: readonly (keyof ReviewChecklist)[];

  constructor(checklist: ReviewChecklist) {
    const incompleteItems = (Object.keys(checklist) as (keyof ReviewChecklist)[]).filter(
      (key) => !checklist[key],
    );
    super(`Review checklist is incomplete: ${incompleteItems.join(", ")}`);
    this.name = "ReviewChecklistIncompleteError";
    this.incompleteItems = incompleteItems;
  }
}

export function assertReviewChecklistComplete(checklist: ReviewChecklist): void {
  if (!isReviewChecklistComplete(checklist)) {
    throw new ReviewChecklistIncompleteError(checklist);
  }
}
