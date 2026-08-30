// scoring_job_outbox persistence (ATM-003).
//
// One insert per submission (inside the SAME transaction, dok 16 §13 step
// 5: "Scoring job dibuat transactional outbox") - never read back by any
// code in this task ("Jangan bangun scoring engine"). This module exists
// so a FUTURE scoring worker has a real table to poll; it is not itself
// polled or delivered here.

import type { Queryable, Schema } from "../../db-types.ts";
import { scoringJobOutbox } from "../../schema/index.ts";

export interface ScoringJobOutboxRow {
  readonly id: string;
  readonly submissionId: string;
  readonly attemptId: string;
  readonly eventType: string;
  readonly payload: Record<string, unknown>;
  readonly status: string;
}

const SCORING_JOB_COLUMNS = {
  id: scoringJobOutbox.id,
  submissionId: scoringJobOutbox.submissionId,
  attemptId: scoringJobOutbox.attemptId,
  eventType: scoringJobOutbox.eventType,
  payload: scoringJobOutbox.payload,
  status: scoringJobOutbox.status,
};

export async function enqueueScoringJob(
  db: Queryable<Schema>,
  submissionId: string,
  attemptId: string,
): Promise<ScoringJobOutboxRow> {
  const [row] = await db
    .insert(scoringJobOutbox)
    .values({
      submissionId,
      attemptId,
      payload: { submissionId, attemptId },
    })
    .returning(SCORING_JOB_COLUMNS);
  if (!row) throw new Error("enqueueScoringJob: insert returned no row");
  return row as ScoringJobOutboxRow;
}
