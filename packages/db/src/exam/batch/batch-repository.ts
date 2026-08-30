// exam_batches persistence (EXM-002).
//
// Mirrors exam-form-repository.ts's draft -> lock discipline exactly,
// reusing the SAME generic recordStatus rule
// (@superlatif/domain/exam's assertExamConfigVersionMutable /
// assertValidExamConfigStatusTransition, now also declared for
// `"exam_batch"` - see exam-config-lifecycle.ts's own module doc). A batch
// locks (windows become immutable, see batch-window-repository.ts) the
// instant its status reaches "approved" - the same point blueprint/scoring/
// form already lock at.
//
// `checksum` covers only this row's own identity fields (examFormVersionId/
// title/timezone/rankingAttemptRule/leaderboardEnabled) - the window SET's
// own integrity is enforced separately by batch_windows' unique constraint
// and by the publication validator re-reading the window set fresh at
// approve time (batch-service.ts), the exact same split
// exam_form_versions.checksum already applies relative to exam_form_items.
//
// `examBatchTargetRef` is the `exam_batch:` target-ref convention
// @superlatif/domain/access's entitlement claims already use for every
// other target type (mirrors program-repository.ts's own
// `programTargetRef`) - `targetType.exam_batch` already existed in
// enums.ts before this task, so a COM-001 product_component can already
// target a batch with ZERO new commerce code (dok 18 §2's "sales side
// reuses COM-001 offer/product" instruction, satisfied structurally).

import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  assertExamConfigVersionMutable,
  assertValidBatchRankingAttemptRule,
  assertValidExamConfigStatusTransition,
  isExamConfigVersionLocked,
  type BatchRankingAttemptRule,
  type RecordStatus,
} from "@superlatif/domain/exam";
import { computeChecksum, type JsonValue } from "@superlatif/domain/shared";
import type { Queryable, Schema } from "../../db-types.ts";
import { examBatches } from "../../schema/index.ts";

/** The `exam_batch:` target-ref convention - see module doc. */
export function examBatchTargetRef(code: string): string {
  return `exam_batch:${code}`;
}

export interface ExamBatchRow {
  readonly id: string;
  readonly code: string;
  readonly examFormVersionId: string;
  readonly title: string;
  readonly timezone: string;
  readonly rankingAttemptRule: BatchRankingAttemptRule;
  readonly leaderboardEnabled: boolean;
  readonly status: RecordStatus;
  readonly voidedAt: Date | null;
  readonly voidedReason: string | null;
  readonly checksum: string;
  readonly createdByUserId: string | null;
  readonly lockedAt: Date | null;
}

const EXAM_BATCH_COLUMNS = {
  id: examBatches.id,
  code: examBatches.code,
  examFormVersionId: examBatches.examFormVersionId,
  title: examBatches.title,
  timezone: examBatches.timezone,
  rankingAttemptRule: examBatches.rankingAttemptRule,
  leaderboardEnabled: examBatches.leaderboardEnabled,
  status: examBatches.status,
  voidedAt: examBatches.voidedAt,
  voidedReason: examBatches.voidedReason,
  checksum: examBatches.checksum,
  createdByUserId: examBatches.createdByUserId,
  lockedAt: examBatches.lockedAt,
};

function batchIdentityChecksum(identity: {
  examFormVersionId: string;
  title: string;
  timezone: string;
  rankingAttemptRule: string;
  leaderboardEnabled: boolean;
}): string {
  return computeChecksum(identity as unknown as JsonValue);
}

export async function findExamBatchByCode(db: Queryable<Schema>, code: string): Promise<ExamBatchRow | null> {
  const [row] = await db
    .select(EXAM_BATCH_COLUMNS)
    .from(examBatches)
    .where(eq(examBatches.code, code))
    .limit(1);
  return (row as ExamBatchRow | undefined) ?? null;
}

export class ExamBatchNotFoundError extends Error {
  constructor(batchId: string) {
    super(`Exam batch ${batchId} not found`);
    this.name = "ExamBatchNotFoundError";
  }
}

export async function findExamBatchById(
  db: Queryable<Schema>,
  batchId: string,
): Promise<ExamBatchRow | null> {
  const [row] = await db
    .select(EXAM_BATCH_COLUMNS)
    .from(examBatches)
    .where(eq(examBatches.id, batchId))
    .limit(1);
  return (row as ExamBatchRow | undefined) ?? null;
}

export interface InsertExamBatchDraftInput {
  readonly code: string;
  readonly examFormVersionId: string;
  readonly title: string;
  readonly timezone: string;
  readonly rankingAttemptRule?: string;
  readonly leaderboardEnabled?: boolean;
  readonly createdByUserId: string;
}

export async function insertExamBatchDraft(
  db: Queryable<Schema>,
  input: InsertExamBatchDraftInput,
): Promise<ExamBatchRow> {
  const rankingAttemptRule = input.rankingAttemptRule ?? "first";
  assertValidBatchRankingAttemptRule(rankingAttemptRule);
  const leaderboardEnabled = input.leaderboardEnabled ?? true;
  const checksum = batchIdentityChecksum({
    examFormVersionId: input.examFormVersionId,
    title: input.title,
    timezone: input.timezone,
    rankingAttemptRule,
    leaderboardEnabled,
  });
  const [row] = await db
    .insert(examBatches)
    .values({
      code: input.code,
      examFormVersionId: input.examFormVersionId,
      title: input.title,
      timezone: input.timezone,
      rankingAttemptRule,
      leaderboardEnabled,
      checksum,
      createdByUserId: input.createdByUserId,
    })
    .returning(EXAM_BATCH_COLUMNS);
  if (!row) throw new Error("createExamBatchDraft: insert returned no row");
  return row as ExamBatchRow;
}

export interface UpdateExamBatchDraftInput {
  readonly title: string;
  readonly timezone: string;
  readonly rankingAttemptRule: string;
  readonly leaderboardEnabled: boolean;
}

/** Whole-identity replace, refused once the batch is locked (approved/published/archived) - "editing" means the caller must void this batch and create a new one, the same discipline every other versioned artifact in this codebase applies. */
export async function updateExamBatchDraftRow(
  db: Queryable<Schema>,
  batchId: string,
  input: UpdateExamBatchDraftInput,
): Promise<ExamBatchRow> {
  const existing = await findExamBatchById(db, batchId);
  if (!existing) throw new ExamBatchNotFoundError(batchId);
  assertExamConfigVersionMutable("exam_batch", existing.status);
  assertValidBatchRankingAttemptRule(input.rankingAttemptRule);

  const checksum = batchIdentityChecksum({
    examFormVersionId: existing.examFormVersionId,
    title: input.title,
    timezone: input.timezone,
    rankingAttemptRule: input.rankingAttemptRule,
    leaderboardEnabled: input.leaderboardEnabled,
  });
  const [row] = await db
    .update(examBatches)
    .set({
      title: input.title,
      timezone: input.timezone,
      rankingAttemptRule: input.rankingAttemptRule,
      leaderboardEnabled: input.leaderboardEnabled,
      checksum,
    })
    .where(eq(examBatches.id, batchId))
    .returning(EXAM_BATCH_COLUMNS);
  if (!row) throw new Error("updateExamBatchDraft: update returned no row");
  return row as ExamBatchRow;
}

export class ExamBatchChecksumMismatchError extends Error {
  constructor(batchId: string) {
    super(`Exam batch ${batchId}'s stored checksum no longer matches its content - refusing to lock`);
    this.name = "ExamBatchChecksumMismatchError";
  }
}

export async function transitionExamBatchStatus(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  batchId: string,
  toStatus: RecordStatus,
  now: Date,
): Promise<ExamBatchRow> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select(EXAM_BATCH_COLUMNS)
      .from(examBatches)
      .where(eq(examBatches.id, batchId))
      .limit(1);
    if (!existing) throw new ExamBatchNotFoundError(batchId);
    const current = existing as ExamBatchRow;
    assertValidExamConfigStatusTransition(current.status, toStatus);

    if (toStatus === "approved" || toStatus === "published" || toStatus === "archived") {
      const checksum = batchIdentityChecksum({
        examFormVersionId: current.examFormVersionId,
        title: current.title,
        timezone: current.timezone,
        rankingAttemptRule: current.rankingAttemptRule,
        leaderboardEnabled: current.leaderboardEnabled,
      });
      if (checksum !== current.checksum) throw new ExamBatchChecksumMismatchError(batchId);
    }

    const enteringLockForFirstTime =
      !isExamConfigVersionLocked(current.status) && isExamConfigVersionLocked(toStatus);
    const [row] = await tx
      .update(examBatches)
      .set({ status: toStatus, ...(enteringLockForFirstTime ? { lockedAt: now } : {}) })
      .where(eq(examBatches.id, batchId))
      .returning(EXAM_BATCH_COLUMNS);
    if (!row) throw new Error("transitionExamBatchStatus: update returned no row");
    return row as ExamBatchRow;
  });
}

export class ExamBatchAlreadyVoidedError extends Error {
  constructor(batchId: string) {
    super(`Exam batch ${batchId} is already voided`);
    this.name = "ExamBatchAlreadyVoidedError";
  }
}

export class ExamBatchArchivedCannotVoidError extends Error {
  constructor(batchId: string) {
    super(`Exam batch ${batchId} is archived and cannot be voided`);
    this.name = "ExamBatchArchivedCannotVoidError";
  }
}

/**
 * Sets the `voidedAt`/`voidedReason` immutable fact (dok 18 §17 "Tidak ada
 * bulk extension tanpa impact preview, permission, reason, dan audit" - the
 * same audit discipline applies to voiding). Idempotent guard: refuses to
 * void an already-voided or archived batch, rather than silently
 * overwriting the original void reason/timestamp - voiding is itself a
 * once-only fact.
 */
export async function voidExamBatchRow(
  db: Queryable<Schema>,
  batchId: string,
  reason: string,
  now: Date,
): Promise<ExamBatchRow> {
  const existing = await findExamBatchById(db, batchId);
  if (!existing) throw new ExamBatchNotFoundError(batchId);
  if (existing.voidedAt !== null) throw new ExamBatchAlreadyVoidedError(batchId);
  if (existing.status === "archived") throw new ExamBatchArchivedCannotVoidError(batchId);

  const [row] = await db
    .update(examBatches)
    .set({ voidedAt: now, voidedReason: reason })
    .where(eq(examBatches.id, batchId))
    .returning(EXAM_BATCH_COLUMNS);
  if (!row) throw new Error("voidExamBatch: update returned no row");
  return row as ExamBatchRow;
}
