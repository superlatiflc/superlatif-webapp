// scoring_job_outbox persistence (ATM-003; drain/mark-delivered added by
// SCR-001).
//
// One insert per submission (inside the SAME transaction, dok 16 §13 step
// 5: "Scoring job dibuat transactional outbox"). ATM-003 itself never
// read this table back ("Jangan bangun scoring engine" was ATM-003's own
// scope) - SCR-001 is the first real reader, exactly as ATM-003's own
// module doc anticipated ("a FUTURE scoring worker has a real table to
// poll"). `findPendingScoringJobs`/`markScoringJobDelivered` are that
// minimal internal drain path - "Drain/use scoring_job_outbox boleh
// dibuat sebatas jalur scoring internal yang diperlukan task ini"
// (founder instruction): a callable drain function, not a real
// scheduler/queue process. See scoring-service.ts's own
// `drainScoringJob`/`drainAllPendingScoringJobs`.

import { and, eq } from "drizzle-orm";
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

export async function findScoringJobById(
  db: Queryable<Schema>,
  jobId: string,
): Promise<ScoringJobOutboxRow | null> {
  const [row] = await db
    .select(SCORING_JOB_COLUMNS)
    .from(scoringJobOutbox)
    .where(eq(scoringJobOutbox.id, jobId))
    .limit(1);
  return (row as ScoringJobOutboxRow | undefined) ?? null;
}

/** Every row with `status = "pending"`, oldest first - a stand-in "worker tick" would call this to find work; this task never schedules that tick itself. */
export async function findPendingScoringJobs(db: Queryable<Schema>): Promise<readonly ScoringJobOutboxRow[]> {
  const rows = await db
    .select(SCORING_JOB_COLUMNS)
    .from(scoringJobOutbox)
    .where(eq(scoringJobOutbox.status, "pending"));
  return rows as ScoringJobOutboxRow[];
}

export async function markScoringJobDelivered(
  db: Queryable<Schema>,
  jobId: string,
  deliveredAt: Date,
): Promise<void> {
  await db
    .update(scoringJobOutbox)
    .set({ status: "delivered", deliveredAt })
    .where(and(eq(scoringJobOutbox.id, jobId), eq(scoringJobOutbox.status, "pending")));
}
