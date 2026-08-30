// attempt_audit_events persistence (ATM-003).
//
// `AttemptAuditEventRow` mirrors the schema's own allowlisted-by-
// construction shape exactly - see schema/submissions.ts's own module doc
// for why there is no free-form metadata column here at all. This is the
// read path "Audit reconstruction" (required test) exercises: given an
// attemptId, reconstruct exactly what happened (submitted by whom/what
// trigger, at which revision, with which checksum) without ever touching
// `answer_states`/`answer_mutations`.

import { asc, eq } from "drizzle-orm";
import type { Queryable, Schema } from "../../db-types.ts";
import { attemptAuditEvents } from "../../schema/index.ts";

export type AttemptAuditEventType = "submitted" | "submission_replayed" | "scoring_job_enqueued";
export type AttemptAuditTrigger = "user" | "timeout";

export interface AttemptAuditEventRow {
  readonly id: string;
  readonly attemptId: string;
  readonly eventType: AttemptAuditEventType;
  readonly triggeredBy: AttemptAuditTrigger;
  readonly actorUserId: string | null;
  readonly attemptRevisionAtEvent: number;
  readonly answerSetChecksum: string | null;
  readonly recoveryState: string | null;
  readonly occurredAt: Date;
}

const AUDIT_EVENT_COLUMNS = {
  id: attemptAuditEvents.id,
  attemptId: attemptAuditEvents.attemptId,
  eventType: attemptAuditEvents.eventType,
  triggeredBy: attemptAuditEvents.triggeredBy,
  actorUserId: attemptAuditEvents.actorUserId,
  attemptRevisionAtEvent: attemptAuditEvents.attemptRevisionAtEvent,
  answerSetChecksum: attemptAuditEvents.answerSetChecksum,
  recoveryState: attemptAuditEvents.recoveryState,
  occurredAt: attemptAuditEvents.occurredAt,
};

export interface InsertAuditEventInput {
  readonly attemptId: string;
  readonly eventType: AttemptAuditEventType;
  readonly triggeredBy: AttemptAuditTrigger;
  readonly actorUserId: string | null;
  readonly attemptRevisionAtEvent: number;
  readonly answerSetChecksum: string | null;
  readonly recoveryState: string | null;
  readonly occurredAt: Date;
}

export async function insertAuditEvent(
  db: Queryable<Schema>,
  input: InsertAuditEventInput,
): Promise<AttemptAuditEventRow> {
  const [row] = await db.insert(attemptAuditEvents).values(input).returning(AUDIT_EVENT_COLUMNS);
  if (!row) throw new Error("insertAuditEvent: insert returned no row");
  return row as AttemptAuditEventRow;
}

export async function listAuditEventsForAttempt(
  db: Queryable<Schema>,
  attemptId: string,
): Promise<readonly AttemptAuditEventRow[]> {
  const rows = await db
    .select(AUDIT_EVENT_COLUMNS)
    .from(attemptAuditEvents)
    .where(eq(attemptAuditEvents.attemptId, attemptId))
    .orderBy(asc(attemptAuditEvents.occurredAt));
  return rows as AttemptAuditEventRow[];
}
