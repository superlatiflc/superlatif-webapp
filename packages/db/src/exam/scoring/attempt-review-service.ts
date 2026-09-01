// Student review/pembahasan projection (production tryout core slice).
//
// Deliberately shaped as a near-copy of result-release-service.ts's own
// `getStudentResultView` - same ownership check first, same "recompute
// batch state FRESH on every call rather than trusting a stored flag"
// discipline, same "return the safe empty view rather than throw" outcome
// when the release window has not opened. The ONE difference is which gate
// it consults: `resolveExplanationVisibility` (`review_open`) instead of
// `resolveResultVisibility` (`provisional_released` and later).
//
// THE ORDERING INVARIANT THIS FILE EXISTS TO ENFORCE: nothing reads
// `question_version_secrets` (the answer key) or `explanation_document`
// until AFTER both the ownership check and the visibility gate have
// passed. The early return below is not an optimization - it is the
// security boundary. Reading the key first and filtering afterwards would
// put an answer key in this process's memory (and one careless log/error
// message away from a learner) for an attempt whose review window has not
// opened. See dok 16 §16: "sebelum review release: tanpa correct answers/
// weights/explanation."

import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  resolveExplanationVisibility,
  reviewAnswer,
  type AnswerKey,
  type AnswerPayload,
  type AnswerReview,
  type ResultState,
  type StudentFacingQuestionView,
} from "@superlatif/domain/exam";
import type { Schema } from "../../db-types.ts";
import { AttemptNotFoundError, findAttemptById } from "../attempt/attempt-repository.ts";
import { listPresentedInstances } from "../attempt/attempt-question-instance-repository.ts";
import { listAnswerStatesForAttempt } from "../attempt/answer-state-repository.ts";
import { getExamBatchState } from "../batch/index.ts";
import { findQuestionVersionById } from "../question-repository.ts";
import { requireQuestionVersionSecret } from "../question-secret-repository.ts";
import { assembleStudentFacingQuestionView } from "../question-preview-service.ts";
import { findCurrentResultByAttemptId } from "./result-repository.ts";
import { ResultNotOwnedError } from "./result-release-service.ts";

export interface AttemptReviewItem {
  readonly instanceId: string;
  readonly sequence: number;
  readonly sectionCode: string;
  /** The same student-safe projection the attempt player itself renders (assembleStudentFacingQuestionView) - reused rather than re-derived, so stem/option content can never drift between answering and reviewing. */
  readonly content: StudentFacingQuestionView;
  /** Binary (correct/incorrect/blank) for single_choice; weight-based (best/not_best/blank) for weighted_choice - see @superlatif/domain/exam's answer-review.ts. */
  readonly review: AnswerReview;
  /** dok 15 §6's own editor field, `question_versions.explanation_document` - null when an author never wrote one. */
  readonly explanationDocument: Record<string, unknown> | null;
}

export interface AttemptReviewView {
  readonly state: ResultState | "processing";
  readonly available: boolean;
  readonly items: readonly AttemptReviewItem[];
}

/** Returned whenever the review window has not opened (or nothing is scored yet). Carries no item, no key, no explanation - structurally, not by filtering. */
const UNAVAILABLE_REVIEW: AttemptReviewView = { state: "processing", available: false, items: [] };

/**
 * Ownership is checked unconditionally, before anything about the attempt's
 * content is loaded - dok 24 §23 acceptance #1 ("User cannot access another
 * user's attempt/result by changing UUID"), the same first-line check
 * `getStudentResultView`/`saveAnswer`/`submitAttempt` all already perform.
 */
export async function getAttemptReviewView(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  userId: string,
  attemptId: string,
  now: Date,
): Promise<AttemptReviewView> {
  const attempt = await findAttemptById(db, attemptId);
  if (!attempt) throw new AttemptNotFoundError(attemptId);
  if (attempt.userId !== userId) throw new ResultNotOwnedError(attemptId);

  const result = await findCurrentResultByAttemptId(db, attemptId);
  const batchState = await getExamBatchState(db, attempt.batchId, now);
  const visible = resolveExplanationVisibility(result ? (result.state as ResultState) : null, batchState);

  // SECURITY BOUNDARY - see module doc. No answer key or explanation is
  // read above this line, and none is read below it unless `visible`.
  if (!visible || !result) return UNAVAILABLE_REVIEW;

  const instances = await listPresentedInstances(db, attemptId);
  const answerStates = await listAnswerStatesForAttempt(db, attemptId);
  const payloadByInstanceId = new Map(
    answerStates.map((row) => [row.instanceId, row.payload as unknown as AnswerPayload | null]),
  );

  const items: AttemptReviewItem[] = [];
  for (const instance of instances) {
    const questionVersion = await findQuestionVersionById(db, instance.questionVersionId);
    if (!questionVersion) {
      throw new Error(
        `getAttemptReviewView: question version ${instance.questionVersionId} not found while assembling review`,
      );
    }
    const answerKey: AnswerKey = await requireQuestionVersionSecret(db, instance.questionVersionId);
    items.push({
      instanceId: instance.id,
      sequence: instance.sequence,
      sectionCode: instance.sectionCode,
      content: await assembleStudentFacingQuestionView(db, instance.questionVersionId),
      review: reviewAnswer(questionVersion.type, answerKey, payloadByInstanceId.get(instance.id) ?? null),
      explanationDocument: questionVersion.explanationDocument,
    });
  }

  return { state: result.state as ResultState, available: true, items };
}
