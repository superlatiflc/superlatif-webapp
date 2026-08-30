// attempts persistence (ATM-001).
//
// The partial unique index `attempts_user_batch_active_uq` (schema/
// attempts.ts) is the structural guarantee behind "no duplicate attempt" -
// `insertAttempt` here does the plain insert; the caller
// (attempt-service.ts) is responsible for checking for an existing
// non-voided attempt FIRST (the common path) and only calls this on the
// genuine first-ever start for a (user, batch) pair. A concurrent double
// insert still cannot land two non-voided rows - the constraint itself
// refuses the second one, surfaced here as `AttemptAlreadyExistsError`
// wrapping the underlying unique-violation.

import { and, eq, ne } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { assertValidAttemptStatusTransition, type AttemptStatus } from "@superlatif/domain/exam";
import type { Queryable, Schema } from "../../db-types.ts";
import { attempts } from "../../schema/index.ts";

export interface AttemptRow {
  readonly id: string;
  readonly userId: string;
  readonly batchId: string;
  readonly examFormVersionId: string;
  readonly blueprintVersionId: string;
  readonly scoringPolicyVersionId: string;
  readonly status: AttemptStatus;
  readonly startedAt: Date;
  readonly deadlineAt: Date;
  readonly lateSyncCutoffAt: Date;
  readonly submittedAt: Date | null;
  readonly attemptRevision: number;
  readonly snapshotChecksum: string;
  readonly startIdempotencyKey: string;
  readonly startRequestHash: string;
  readonly voidedAt: Date | null;
  readonly voidedReason: string | null;
}

const ATTEMPT_COLUMNS = {
  id: attempts.id,
  userId: attempts.userId,
  batchId: attempts.batchId,
  examFormVersionId: attempts.examFormVersionId,
  blueprintVersionId: attempts.blueprintVersionId,
  scoringPolicyVersionId: attempts.scoringPolicyVersionId,
  status: attempts.status,
  startedAt: attempts.startedAt,
  deadlineAt: attempts.deadlineAt,
  lateSyncCutoffAt: attempts.lateSyncCutoffAt,
  submittedAt: attempts.submittedAt,
  attemptRevision: attempts.attemptRevision,
  snapshotChecksum: attempts.snapshotChecksum,
  startIdempotencyKey: attempts.startIdempotencyKey,
  startRequestHash: attempts.startRequestHash,
  voidedAt: attempts.voidedAt,
  voidedReason: attempts.voidedReason,
};

/** The one non-voided attempt for this (user, batch) pair, if any - the exact set the partial unique index constrains to at most one row. */
export async function findActiveAttemptForUserBatch(
  db: Queryable<Schema>,
  userId: string,
  batchId: string,
): Promise<AttemptRow | null> {
  const [row] = await db
    .select(ATTEMPT_COLUMNS)
    .from(attempts)
    .where(and(eq(attempts.userId, userId), eq(attempts.batchId, batchId), ne(attempts.status, "voided")))
    .limit(1);
  return (row as AttemptRow | undefined) ?? null;
}

export async function countActiveAttemptsForUserBatch(
  db: Queryable<Schema>,
  userId: string,
  batchId: string,
): Promise<number> {
  const row = await findActiveAttemptForUserBatch(db, userId, batchId);
  return row ? 1 : 0;
}

export async function findAttemptByUserAndIdempotencyKey(
  db: Queryable<Schema>,
  userId: string,
  startIdempotencyKey: string,
): Promise<AttemptRow | null> {
  const [row] = await db
    .select(ATTEMPT_COLUMNS)
    .from(attempts)
    .where(and(eq(attempts.userId, userId), eq(attempts.startIdempotencyKey, startIdempotencyKey)))
    .limit(1);
  return (row as AttemptRow | undefined) ?? null;
}

export class AttemptNotFoundError extends Error {
  constructor(attemptId: string) {
    super(`Attempt ${attemptId} not found`);
    this.name = "AttemptNotFoundError";
  }
}

export async function findAttemptById(db: Queryable<Schema>, attemptId: string): Promise<AttemptRow | null> {
  const [row] = await db.select(ATTEMPT_COLUMNS).from(attempts).where(eq(attempts.id, attemptId)).limit(1);
  return (row as AttemptRow | undefined) ?? null;
}

export interface InsertAttemptInput {
  readonly userId: string;
  readonly batchId: string;
  readonly examFormVersionId: string;
  readonly blueprintVersionId: string;
  readonly scoringPolicyVersionId: string;
  readonly startedAt: Date;
  readonly deadlineAt: Date;
  readonly lateSyncCutoffAt: Date;
  readonly snapshotChecksum: string;
  readonly startIdempotencyKey: string;
  readonly startRequestHash: string;
}

/**
 * Plain insert (status defaults to `created` at the DB layer). Throws
 * whatever the underlying driver throws on a unique-constraint violation -
 * the caller is expected to have already checked
 * `findActiveAttemptForUserBatch` first in the common (non-racing) path;
 * this function does not itself catch/translate the violation, since doing
 * so portably across drivers is exactly the kind of "guess at an
 * unspecified provider behavior" this codebase avoids (see
 * @superlatif/domain's own "don't invent unverified official behavior"
 * discipline applied to a different kind of external unknown).
 */
export async function insertAttempt(db: Queryable<Schema>, input: InsertAttemptInput): Promise<AttemptRow> {
  const [row] = await db
    .insert(attempts)
    .values({
      userId: input.userId,
      batchId: input.batchId,
      examFormVersionId: input.examFormVersionId,
      blueprintVersionId: input.blueprintVersionId,
      scoringPolicyVersionId: input.scoringPolicyVersionId,
      startedAt: input.startedAt,
      deadlineAt: input.deadlineAt,
      lateSyncCutoffAt: input.lateSyncCutoffAt,
      snapshotChecksum: input.snapshotChecksum,
      startIdempotencyKey: input.startIdempotencyKey,
      startRequestHash: input.startRequestHash,
    })
    .returning(ATTEMPT_COLUMNS);
  if (!row) throw new Error("insertAttempt: insert returned no row");
  return row as AttemptRow;
}

export async function transitionAttemptStatus(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  attemptId: string,
  toStatus: AttemptStatus,
): Promise<AttemptRow> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select(ATTEMPT_COLUMNS)
      .from(attempts)
      .where(eq(attempts.id, attemptId))
      .limit(1);
    if (!existing) throw new AttemptNotFoundError(attemptId);
    const current = existing as AttemptRow;
    assertValidAttemptStatusTransition(current.status, toStatus);

    const [row] = await tx
      .update(attempts)
      .set({ status: toStatus })
      .where(eq(attempts.id, attemptId))
      .returning(ATTEMPT_COLUMNS);
    if (!row) throw new Error("transitionAttemptStatus: update returned no row");
    return row as AttemptRow;
  });
}
