// answer_states persistence (ATM-002) - the authoritative CURRENT answer
// per (attempt, question instance).
//
// `upsertAnswerState` is called ONLY from inside the answer-save
// transaction, ONLY on a CAS `"accepted"` outcome
// (@superlatif/domain/exam#resolveAnswerSaveOutcome) - it is never called
// for `idempotent_replay` (nothing changed) or `conflict` (the write was
// refused). This one call site is what makes `revision` monotonic at the
// storage layer: it always sets `revision` to exactly `current + 1`, never
// to an arbitrary caller-supplied number.

import { and, eq } from "drizzle-orm";
import type { Queryable, Schema } from "../../db-types.ts";
import { answerStates } from "../../schema/index.ts";

export interface AnswerStateRow {
  readonly id: string;
  readonly attemptId: string;
  readonly instanceId: string;
  readonly revision: number;
  readonly payload: Record<string, unknown> | null;
  readonly updatedAt: Date;
}

const ANSWER_STATE_COLUMNS = {
  id: answerStates.id,
  attemptId: answerStates.attemptId,
  instanceId: answerStates.instanceId,
  revision: answerStates.revision,
  payload: answerStates.payload,
  updatedAt: answerStates.updatedAt,
};

export async function findAnswerState(
  db: Queryable<Schema>,
  attemptId: string,
  instanceId: string,
): Promise<AnswerStateRow | null> {
  const [row] = await db
    .select(ANSWER_STATE_COLUMNS)
    .from(answerStates)
    .where(and(eq(answerStates.attemptId, attemptId), eq(answerStates.instanceId, instanceId)))
    .limit(1);
  return (row as AnswerStateRow | undefined) ?? null;
}

export async function listAnswerStatesForAttempt(
  db: Queryable<Schema>,
  attemptId: string,
): Promise<readonly AnswerStateRow[]> {
  const rows = await db
    .select(ANSWER_STATE_COLUMNS)
    .from(answerStates)
    .where(eq(answerStates.attemptId, attemptId));
  return rows as AnswerStateRow[];
}

/** Insert-or-update in one call - the caller has already verified (inside its own transaction) that `revision` is the correct next value via the CAS decision. */
export async function upsertAnswerState(
  db: Queryable<Schema>,
  attemptId: string,
  instanceId: string,
  revision: number,
  payload: Record<string, unknown> | null,
  now: Date,
): Promise<AnswerStateRow> {
  const existing = await findAnswerState(db, attemptId, instanceId);
  if (existing) {
    const [row] = await db
      .update(answerStates)
      .set({ revision, payload, updatedAt: now })
      .where(eq(answerStates.id, existing.id))
      .returning(ANSWER_STATE_COLUMNS);
    if (!row) throw new Error("upsertAnswerState: update returned no row");
    return row as AnswerStateRow;
  }
  const [row] = await db
    .insert(answerStates)
    .values({ attemptId, instanceId, revision, payload, updatedAt: now })
    .returning(ANSWER_STATE_COLUMNS);
  if (!row) throw new Error("upsertAnswerState: insert returned no row");
  return row as AnswerStateRow;
}
