// Tryout batch authoring orchestration (EXM-002).
//
// Composes @superlatif/domain/authorization's authorize() with this
// folder's repositories, the same structural pattern
// exam-config-service.ts's own assertExamConfigPermission already
// establishes. Reuses the SINGLE existing "batch.publish" permission code
// (dok 24 §6's row for batch has no separate draft/first_approve tiers,
// unlike question.*/exam.blueprint.* - see permissions.ts's own matrix) for
// every batch-mutating action, mirroring SCH-001's own single-permission
// "live.occurrence.manage" shape for an operational/scheduling object
// rather than EXM-001's heavier three-tier academic-artifact shape. ZERO
// new permission codes were added for this task.
//
// `createExamBatchDraft` requires the pinned exam_form_version to already
// be PUBLISHED - "Batch harus pin exact published exam_form_version"
// (founder instruction), checked at draft-creation time, the exact same
// point `createExamFormDraft` (EXM-001) already requires its own
// blueprintVersion to be published.
//
// `approveExamBatch` runs the full fail-closed publish validator
// (assertBatchPublishable: form still published + window set internally
// coherent) BEFORE the batch is allowed to lock - the same point
// `approveExamBlueprintVersion` runs its own heavier validator. Once
// approved, the batch is locked (assertExamConfigVersionMutable) and its
// windows can never be edited in place again - this is what makes
// "Changing offer windows tidak boleh mengubah attempt/batch history" hold
// structurally.

import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { authorize } from "@superlatif/domain/authorization";
import { assertBatchPublishable, deriveBatchState, type BatchState } from "@superlatif/domain/exam";
import type { Schema } from "../../db-types.ts";
import { listActiveRoleHoldings } from "../../authorization/index.ts";
import { findExamFormVersionById } from "../config/exam-form-repository.ts";
import {
  ExamBatchNotFoundError,
  findExamBatchById,
  insertExamBatchDraft,
  transitionExamBatchStatus,
  updateExamBatchDraftRow,
  voidExamBatchRow,
  type ExamBatchRow,
  type InsertExamBatchDraftInput as InsertExamBatchDraftRowInput,
  type UpdateExamBatchDraftInput,
} from "./batch-repository.ts";
import {
  listBatchWindows,
  replaceBatchWindows,
  toBatchWindowSet,
  type ReplaceBatchWindowInput,
} from "./batch-window-repository.ts";

export class BatchActionNotAuthorizedError extends Error {
  constructor(readonly reasonCode: string) {
    super(`Batch action not authorized: ${reasonCode}`);
    this.name = "BatchActionNotAuthorizedError";
  }
}

export class BatchReasonRequiredError extends Error {
  constructor() {
    super("A non-empty reason is required for this batch action");
    this.name = "BatchReasonRequiredError";
  }
}

export class BatchFormVersionNotPublishedError extends Error {
  constructor(
    readonly examFormVersionId: string,
    readonly status: string,
  ) {
    super(`A batch can only pin a PUBLISHED exam_form_version (found "${status}" for ${examFormVersionId})`);
    this.name = "BatchFormVersionNotPublishedError";
  }
}

async function assertBatchPermission(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  actorUserId: string,
  creatorUserId?: string,
): Promise<void> {
  const roles = await listActiveRoleHoldings(db, actorUserId);
  const decision = authorize({
    actor: { userId: actorUserId, roles },
    action: { type: "batch.publish", permission: "batch.publish" },
    ...(creatorUserId !== undefined ? { object: { creatorUserId } } : {}),
  });
  if (!decision.allowed) throw new BatchActionNotAuthorizedError(decision.reasonCode);
}

export interface CreateExamBatchDraftInput {
  readonly code: string;
  readonly examFormVersionId: string;
  readonly title: string;
  readonly timezone: string;
  readonly rankingAttemptRule?: string;
  readonly leaderboardEnabled?: boolean;
}

export async function createExamBatchDraft(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  actorUserId: string,
  input: CreateExamBatchDraftInput,
): Promise<ExamBatchRow> {
  await assertBatchPermission(db, actorUserId);

  const formVersion = await findExamFormVersionById(db, input.examFormVersionId);
  if (!formVersion)
    throw new Error(`createExamBatchDraft: exam form version ${input.examFormVersionId} not found`);
  if (formVersion.status !== "published") {
    throw new BatchFormVersionNotPublishedError(input.examFormVersionId, formVersion.status);
  }

  const rowInput: InsertExamBatchDraftRowInput = {
    code: input.code,
    examFormVersionId: input.examFormVersionId,
    title: input.title,
    timezone: input.timezone,
    createdByUserId: actorUserId,
    ...(input.rankingAttemptRule !== undefined ? { rankingAttemptRule: input.rankingAttemptRule } : {}),
    ...(input.leaderboardEnabled !== undefined ? { leaderboardEnabled: input.leaderboardEnabled } : {}),
  };
  return insertExamBatchDraft(db, rowInput);
}

export async function updateExamBatchDraft(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  actorUserId: string,
  batchId: string,
  input: UpdateExamBatchDraftInput,
): Promise<ExamBatchRow> {
  await assertBatchPermission(db, actorUserId);
  return updateExamBatchDraftRow(db, batchId, input);
}

export async function setExamBatchWindows(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  actorUserId: string,
  batchId: string,
  windows: readonly ReplaceBatchWindowInput[],
) {
  await assertBatchPermission(db, actorUserId);
  return replaceBatchWindows(db, batchId, windows);
}

export async function submitExamBatchForReview(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  actorUserId: string,
  batchId: string,
): Promise<ExamBatchRow> {
  await assertBatchPermission(db, actorUserId);
  return transitionExamBatchStatus(db, batchId, "in_review", new Date());
}

export async function requestExamBatchChanges(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  actorUserId: string,
  batchId: string,
  reason: string,
): Promise<ExamBatchRow> {
  if (!reason.trim()) throw new BatchReasonRequiredError();
  await assertBatchPermission(db, actorUserId);
  return transitionExamBatchStatus(db, batchId, "changes_requested", new Date());
}

/**
 * Runs the fail-closed batch publication validator (form still published +
 * window set internally coherent) before locking the batch. Unlike
 * `exam.blueprint.first_approve` (whose permissions.ts cell explicitly
 * carries `requiresNonCreator: true`), dok 24 §6's `batch.publish` row
 * carries no "bukan creator" qualifier for any role - so this deliberately
 * does NOT pass `creatorUserId` into the permission check. `authorize()`'s
 * own maker-checker gate is unconditional whenever `object.creatorUserId`
 * is supplied at all (see its module doc), so passing it here without a
 * documented basis would silently invent a same-actor restriction the
 * source table never states - a single academic_admin/super_admin may
 * create, approve, and publish a batch, the same single-actor-capable
 * shape SCH-001's own `live.occurrence.manage` already has.
 */
export async function approveExamBatch(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  actorUserId: string,
  batchId: string,
): Promise<ExamBatchRow> {
  const batch = await findExamBatchById(db, batchId);
  if (!batch) throw new ExamBatchNotFoundError(batchId);
  await assertBatchPermission(db, actorUserId);

  const formVersion = await findExamFormVersionById(db, batch.examFormVersionId);
  if (!formVersion)
    throw new Error(`approveExamBatch: exam form version ${batch.examFormVersionId} not found`);
  const windowRows = await listBatchWindows(db, batchId);

  assertBatchPublishable({
    examFormVersionStatus: formVersion.status,
    windows: toBatchWindowSet(windowRows),
  });

  return transitionExamBatchStatus(db, batchId, "approved", new Date());
}

export async function publishExamBatch(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  actorUserId: string,
  batchId: string,
): Promise<ExamBatchRow> {
  await assertBatchPermission(db, actorUserId);
  return transitionExamBatchStatus(db, batchId, "published", new Date());
}

export async function archiveExamBatch(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  actorUserId: string,
  batchId: string,
): Promise<ExamBatchRow> {
  await assertBatchPermission(db, actorUserId);
  return transitionExamBatchStatus(db, batchId, "archived", new Date());
}

export async function voidExamBatch(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  actorUserId: string,
  batchId: string,
  reason: string,
): Promise<ExamBatchRow> {
  if (!reason.trim()) throw new BatchReasonRequiredError();
  await assertBatchPermission(db, actorUserId);
  return voidExamBatchRow(db, batchId, reason, new Date());
}

/**
 * Read-side composition: assembles the batch's governance status + voided
 * fact + full window set and derives the canonical operational state fresh
 * - never stored (see @superlatif/domain/exam's batch-state.ts). This is
 * the ONE place a caller should go for "what state is this batch in right
 * now", rather than reading `status` directly.
 */
export async function getExamBatchState(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  batchId: string,
  now: Date,
): Promise<BatchState> {
  const batch = await findExamBatchById(db, batchId);
  if (!batch) throw new ExamBatchNotFoundError(batchId);
  const windowRows = await listBatchWindows(db, batchId);
  const windowSet = toBatchWindowSet(windowRows);
  return deriveBatchState(
    {
      governanceStatus: batch.status,
      voidedAt: batch.voidedAt,
      ...(windowSet.registration !== undefined ? { registration: windowSet.registration } : {}),
      attempt: windowSet.attempt,
      ...(windowSet.lateSyncCutoff !== undefined ? { lateSyncCutoff: windowSet.lateSyncCutoff } : {}),
      ...(windowSet.provisionalResultRelease !== undefined
        ? { provisionalResultRelease: windowSet.provisionalResultRelease }
        : {}),
      ...(windowSet.finalResultRelease !== undefined
        ? { finalResultRelease: windowSet.finalResultRelease }
        : {}),
      ...(windowSet.explanationRelease !== undefined
        ? { explanationRelease: windowSet.explanationRelease }
        : {}),
    },
    now,
  );
}
