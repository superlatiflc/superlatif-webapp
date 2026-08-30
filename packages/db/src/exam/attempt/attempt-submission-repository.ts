// attempt_submissions persistence (ATM-003).
//
// `insertSubmission` is called ONLY after the caller has already checked
// `findSubmissionByAttemptId` and found nothing - but a concurrent
// user-submit and timeout-submit racing each other can still both reach
// this call. The unique index on `attempt_id` (schema/submissions.ts) is
// what actually decides the winner; the caller (attempt-service.ts's own
// `submitAttempt`) catches the resulting unique-violation and re-fetches
// the winner's row rather than treating it as a hard failure - see that
// file's own module doc for the full race-safe sequence ("Submit dan
// timeout race menghasilkan satu snapshot", dok 16 §22 test #8).

import { eq } from "drizzle-orm";
import type { Queryable, Schema } from "../../db-types.ts";
import { attemptSubmissions } from "../../schema/index.ts";

export interface AttemptSubmissionRow {
  readonly id: string;
  readonly attemptId: string;
  readonly mutationId: string | null;
  readonly triggeredBy: string;
  readonly answerSetChecksum: string;
  readonly attemptRevisionAtSubmit: number;
  readonly acknowledgedUnansweredCount: number | null;
  readonly submittedAt: Date;
}

const SUBMISSION_COLUMNS = {
  id: attemptSubmissions.id,
  attemptId: attemptSubmissions.attemptId,
  mutationId: attemptSubmissions.mutationId,
  triggeredBy: attemptSubmissions.triggeredBy,
  answerSetChecksum: attemptSubmissions.answerSetChecksum,
  attemptRevisionAtSubmit: attemptSubmissions.attemptRevisionAtSubmit,
  acknowledgedUnansweredCount: attemptSubmissions.acknowledgedUnansweredCount,
  submittedAt: attemptSubmissions.submittedAt,
};

export async function findSubmissionByAttemptId(
  db: Queryable<Schema>,
  attemptId: string,
): Promise<AttemptSubmissionRow | null> {
  const [row] = await db
    .select(SUBMISSION_COLUMNS)
    .from(attemptSubmissions)
    .where(eq(attemptSubmissions.attemptId, attemptId))
    .limit(1);
  return (row as AttemptSubmissionRow | undefined) ?? null;
}

export interface InsertSubmissionInput {
  readonly attemptId: string;
  readonly mutationId: string | null;
  readonly triggeredBy: string;
  readonly answerSetChecksum: string;
  readonly attemptRevisionAtSubmit: number;
  readonly acknowledgedUnansweredCount: number | null;
  readonly submittedAt: Date;
}

export async function insertSubmission(
  db: Queryable<Schema>,
  input: InsertSubmissionInput,
): Promise<AttemptSubmissionRow> {
  const [row] = await db.insert(attemptSubmissions).values(input).returning(SUBMISSION_COLUMNS);
  if (!row) throw new Error("insertSubmission: insert returned no row");
  return row as AttemptSubmissionRow;
}
