// question_version_reviews persistence (QST-003).
//
// Append-only audit trail for moderation actions - see
// schema/question-reviews.ts's own module doc for why this table exists.
// Never updated or deleted; `listQuestionVersionReviewHistory` returns
// every row in chronological order, satisfying "rejected revisions harus
// preserve history" directly - a `changes_requested` row is never removed
// or overwritten when the version later gets resubmitted and approved.

import { asc, eq } from "drizzle-orm";
import type { Queryable, Schema } from "../db-types.ts";
import { questionVersionReviews } from "../schema/index.ts";

export type QuestionReviewAction =
  "submitted_for_review" | "changes_requested" | "approved" | "published" | "archived";

export interface QuestionVersionReviewRow {
  readonly id: string;
  readonly questionVersionId: string;
  readonly actorUserId: string | null;
  readonly action: QuestionReviewAction;
  readonly reason: string | null;
  readonly checklist: Record<string, unknown> | null;
  readonly createdAt: Date;
}

const REVIEW_COLUMNS = {
  id: questionVersionReviews.id,
  questionVersionId: questionVersionReviews.questionVersionId,
  actorUserId: questionVersionReviews.actorUserId,
  action: questionVersionReviews.action,
  reason: questionVersionReviews.reason,
  checklist: questionVersionReviews.checklist,
  createdAt: questionVersionReviews.createdAt,
};

export interface RecordQuestionVersionReviewInput {
  readonly questionVersionId: string;
  readonly actorUserId: string;
  readonly action: QuestionReviewAction;
  readonly reason?: string | null;
  readonly checklist?: Record<string, unknown> | null;
}

export async function recordQuestionVersionReview(
  db: Queryable<Schema>,
  input: RecordQuestionVersionReviewInput,
): Promise<QuestionVersionReviewRow> {
  const [row] = await db
    .insert(questionVersionReviews)
    .values({
      questionVersionId: input.questionVersionId,
      actorUserId: input.actorUserId,
      action: input.action,
      reason: input.reason ?? null,
      checklist: input.checklist ?? null,
    })
    .returning(REVIEW_COLUMNS);
  if (!row) throw new Error("recordQuestionVersionReview: insert returned no row");
  return row as QuestionVersionReviewRow;
}

/** Chronological (oldest first) - the natural reading order for an "open history" timeline. */
export async function listQuestionVersionReviewHistory(
  db: Queryable<Schema>,
  questionVersionId: string,
): Promise<readonly QuestionVersionReviewRow[]> {
  const rows = await db
    .select(REVIEW_COLUMNS)
    .from(questionVersionReviews)
    .where(eq(questionVersionReviews.questionVersionId, questionVersionId))
    .orderBy(asc(questionVersionReviews.createdAt));
  return rows as QuestionVersionReviewRow[];
}
