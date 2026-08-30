// Question/stimulus authoring orchestration (QST-001).
//
// Composes @superlatif/domain/authorization's authorize() with the
// repositories in this folder - zero changes to permissions.ts, reusing
// IDN-004's existing question.draft.write / question.first_approve /
// question.ranked_publish permission codes exactly as already granted
// (tutor_writer/moderator_reviewer/academic_admin/super_admin, matching
// COM-006/SCH-001's own "the matrix already had this task in mind"
// precedent). `question.first_approve`'s `requiresNonCreator: true` grant
// is what makes authorize() run the maker-checker check (object.creatorUserId
// vs actor.userId) for approveQuestionVersion - a writer cannot approve
// their own draft.

import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { authorize } from "@superlatif/domain/authorization";
import {
  assertReviewChecklistComplete,
  type AnswerKey,
  type QuestionType,
  type RecordStatus,
  type ReviewChecklist,
} from "@superlatif/domain/exam";
import type { Schema } from "../db-types.ts";
import { listActiveRoleHoldings } from "../authorization/index.ts";
import {
  insertQuestionAsset,
  type AddQuestionAssetInput,
  type QuestionAssetRow,
} from "./question-asset-repository.ts";
import {
  createQuestionVersionDraft,
  findLatestQuestionVersion,
  findOrCreateQuestion,
  findQuestionVersionById,
  replaceQuestionOptions,
  transitionQuestionVersionStatus,
  updateQuestionVersionDraft,
  type QuestionOptionRow,
  type QuestionVersionRow,
  type ReplaceQuestionOptionInput,
  type UpdateQuestionVersionDraftInput,
} from "./question-repository.ts";
import { recordQuestionVersionReview } from "./question-review-repository.ts";
import { upsertQuestionVersionSecret } from "./question-secret-repository.ts";
import {
  createStimulusVersionDraft,
  findLatestStimulusVersion,
  findOrCreateStimulus,
  transitionStimulusVersionStatus,
  updateStimulusVersionDraft,
  type StimulusVersionRow,
} from "./stimulus-repository.ts";

export class QuestionActionNotAuthorizedError extends Error {
  constructor(readonly reasonCode: string) {
    super(`Question action not authorized: ${reasonCode}`);
    this.name = "QuestionActionNotAuthorizedError";
  }
}

export class QuestionReasonRequiredError extends Error {
  constructor() {
    super("A non-empty reason is required for this action");
    this.name = "QuestionReasonRequiredError";
  }
}

export type QuestionPermission =
  "question.draft.write" | "question.first_approve" | "question.ranked_publish";

/** Exported for question-import-service.ts (QST-002) to reuse for its own upfront job-level check - the same permission-checking code path, not a second one. */
export async function assertQuestionPermission(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  actorUserId: string,
  permission: QuestionPermission,
  creatorUserId?: string,
): Promise<void> {
  const roles = await listActiveRoleHoldings(db, actorUserId);
  const decision = authorize({
    actor: { userId: actorUserId, roles },
    action: { type: permission, permission },
    ...(creatorUserId !== undefined ? { object: { creatorUserId } } : {}),
  });
  if (!decision.allowed) throw new QuestionActionNotAuthorizedError(decision.reasonCode);
}

export interface CreateQuestionDraftInput {
  readonly questionCode: string;
  readonly version: number;
  readonly type: QuestionType;
  readonly stimulusVersionId?: string | null;
  readonly classification?: Record<string, unknown>;
  readonly stemDocument: Record<string, unknown>;
  readonly explanationDocument?: Record<string, unknown> | null;
}

export async function createQuestionDraft(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  actorUserId: string,
  input: CreateQuestionDraftInput,
): Promise<QuestionVersionRow> {
  await assertQuestionPermission(db, actorUserId, "question.draft.write");
  const question = await findOrCreateQuestion(db, input.questionCode);
  return createQuestionVersionDraft(db, {
    questionId: question.id,
    version: input.version,
    type: input.type,
    stimulusVersionId: input.stimulusVersionId ?? null,
    classification: input.classification ?? {},
    stemDocument: input.stemDocument,
    explanationDocument: input.explanationDocument ?? null,
    createdByUserId: actorUserId,
  });
}

export async function updateQuestionDraft(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  actorUserId: string,
  versionId: string,
  patch: UpdateQuestionVersionDraftInput,
): Promise<QuestionVersionRow> {
  await assertQuestionPermission(db, actorUserId, "question.draft.write");
  return updateQuestionVersionDraft(db, versionId, patch);
}

/**
 * dok 15A §6: "Kode lama yang approved, published, atau pernah digunakan
 * tidak ditimpa; mode create_revision membuat version baru." Requires the
 * question to already exist (unlike createQuestionDraft, this never creates
 * a new `questions` identity row) and computes the next version number
 * itself from the current latest version - the caller (QST-002's import
 * pipeline) never guesses a version number.
 */
export async function createQuestionRevision(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  actorUserId: string,
  questionId: string,
  input: {
    readonly type: QuestionType;
    readonly stimulusVersionId?: string | null;
    readonly classification?: Record<string, unknown>;
    readonly stemDocument: Record<string, unknown>;
    readonly explanationDocument?: Record<string, unknown> | null;
  },
): Promise<QuestionVersionRow> {
  await assertQuestionPermission(db, actorUserId, "question.draft.write");
  const latest = await findLatestQuestionVersion(db, questionId);
  const nextVersion = (latest?.version ?? 0) + 1;
  return createQuestionVersionDraft(db, {
    questionId,
    version: nextVersion,
    type: input.type,
    stimulusVersionId: input.stimulusVersionId ?? null,
    classification: input.classification ?? {},
    stemDocument: input.stemDocument,
    explanationDocument: input.explanationDocument ?? null,
    createdByUserId: actorUserId,
  });
}

export async function setQuestionOptions(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  actorUserId: string,
  versionId: string,
  options: readonly ReplaceQuestionOptionInput[],
): Promise<readonly QuestionOptionRow[]> {
  await assertQuestionPermission(db, actorUserId, "question.draft.write");
  return replaceQuestionOptions(db, versionId, options);
}

export async function setQuestionAnswerKey(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  actorUserId: string,
  versionId: string,
  answerKey: AnswerKey,
): Promise<void> {
  await assertQuestionPermission(db, actorUserId, "question.draft.write");
  await upsertQuestionVersionSecret(db, versionId, answerKey);
}

export async function addQuestionAsset(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  actorUserId: string,
  input: AddQuestionAssetInput,
): Promise<QuestionAssetRow> {
  await assertQuestionPermission(db, actorUserId, "question.draft.write");
  return insertQuestionAsset(db, input);
}

/**
 * The creator submits their own draft for review - no maker-checker check
 * here (that only applies at approval). Logs a `submitted_for_review` row
 * to `question_version_reviews` (QST-003) in the SAME transaction as the
 * status transition - the audit trail can never disagree with the status
 * it describes.
 */
export async function submitQuestionVersionForReview(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  actorUserId: string,
  versionId: string,
): Promise<QuestionVersionRow> {
  await assertQuestionPermission(db, actorUserId, "question.draft.write");
  return db.transaction(async (tx) => {
    const version = await transitionQuestionVersionStatus(tx, versionId, "in_review", new Date());
    await recordQuestionVersionReview(tx, {
      questionVersionId: versionId,
      actorUserId,
      action: "submitted_for_review",
    });
    return version;
  });
}

/**
 * dok 12 §31/founder instruction "rejected revisions harus preserve
 * history": `reason` is persisted to `question_version_reviews`, not just
 * required-then-discarded - a later re-approval never erases WHY changes
 * were requested the first time.
 */
export async function requestQuestionVersionChanges(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  actorUserId: string,
  versionId: string,
  reason: string,
): Promise<QuestionVersionRow> {
  if (!reason.trim()) throw new QuestionReasonRequiredError();
  await assertQuestionPermission(db, actorUserId, "question.first_approve");
  return db.transaction(async (tx) => {
    const version = await transitionQuestionVersionStatus(tx, versionId, "changes_requested", new Date());
    await recordQuestionVersionReview(tx, {
      questionVersionId: versionId,
      actorUserId,
      action: "changes_requested",
      reason,
    });
    return version;
  });
}

/**
 * `question.first_approve`'s `requiresNonCreator: true` grant means
 * authorize() checks `object.creatorUserId` unconditionally here - a writer
 * approving their own draft is denied with MAKER_CHECKER_VIOLATION before
 * the permission matrix is even consulted (dok 02 §5.3 / CLAUDE.md
 * "requester cannot approve the same high-risk action").
 *
 * dok 12 §31's nine-item review checklist (@superlatif/domain/exam's
 * `ReviewChecklist`) is REQUIRED and enforced - `assertReviewChecklistComplete`
 * throws `ReviewChecklistIncompleteError` before the status transition is
 * even attempted if any item is unchecked. It runs AFTER the maker-checker
 * check, so a self-approval attempt is still denied first regardless of
 * checklist completeness - authorization always precedes content checks in
 * this codebase's own established order.
 */
export async function approveQuestionVersion(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  actorUserId: string,
  versionId: string,
  checklist: ReviewChecklist,
): Promise<QuestionVersionRow> {
  const version = await findQuestionVersionById(db, versionId);
  if (!version) throw new Error(`approveQuestionVersion: question version ${versionId} not found`);
  await assertQuestionPermission(
    db,
    actorUserId,
    "question.first_approve",
    version.createdByUserId ?? undefined,
  );
  assertReviewChecklistComplete(checklist);
  return db.transaction(async (tx) => {
    const approved = await transitionQuestionVersionStatus(tx, versionId, "approved", new Date());
    await recordQuestionVersionReview(tx, {
      questionVersionId: versionId,
      actorUserId,
      action: "approved",
      checklist: checklist as unknown as Record<string, unknown>,
    });
    return approved;
  });
}

/** `question.ranked_publish` is granted with `requiresApproval: true` in the permission matrix - informational only per IDN-004's own documented precedent; the two-actor REQUEST/DECIDE persistence workflow (ENT-004) is out of this task's scope. */
export async function publishQuestionVersion(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  actorUserId: string,
  versionId: string,
): Promise<QuestionVersionRow> {
  await assertQuestionPermission(db, actorUserId, "question.ranked_publish");
  return db.transaction(async (tx) => {
    const version = await transitionQuestionVersionStatus(tx, versionId, "published", new Date());
    await recordQuestionVersionReview(tx, { questionVersionId: versionId, actorUserId, action: "published" });
    return version;
  });
}

export async function archiveQuestionVersion(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  actorUserId: string,
  versionId: string,
): Promise<QuestionVersionRow> {
  await assertQuestionPermission(db, actorUserId, "question.ranked_publish");
  return db.transaction(async (tx) => {
    const version = await transitionQuestionVersionStatus(tx, versionId, "archived", new Date());
    await recordQuestionVersionReview(tx, { questionVersionId: versionId, actorUserId, action: "archived" });
    return version;
  });
}

export interface CreateStimulusDraftInput {
  readonly stimulusCode: string;
  readonly version: number;
  readonly bodyDocument: Record<string, unknown>;
}

export async function createStimulusDraft(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  actorUserId: string,
  input: CreateStimulusDraftInput,
): Promise<StimulusVersionRow> {
  await assertQuestionPermission(db, actorUserId, "question.draft.write");
  const stimulus = await findOrCreateStimulus(db, input.stimulusCode);
  return createStimulusVersionDraft(db, {
    stimulusId: stimulus.id,
    version: input.version,
    bodyDocument: input.bodyDocument,
  });
}

export async function updateStimulusDraft(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  actorUserId: string,
  versionId: string,
  bodyDocument: Record<string, unknown>,
): Promise<StimulusVersionRow> {
  await assertQuestionPermission(db, actorUserId, "question.draft.write");
  return updateStimulusVersionDraft(db, versionId, bodyDocument);
}

/** Mirrors createQuestionRevision for a passage/stimulus - same dok 15A §6 rule, generalized to any recordStatus-locked artifact. */
export async function createStimulusRevision(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  actorUserId: string,
  stimulusId: string,
  bodyDocument: Record<string, unknown>,
): Promise<StimulusVersionRow> {
  await assertQuestionPermission(db, actorUserId, "question.draft.write");
  const latest = await findLatestStimulusVersion(db, stimulusId);
  const nextVersion = (latest?.version ?? 0) + 1;
  return createStimulusVersionDraft(db, { stimulusId, version: nextVersion, bodyDocument });
}

export async function addStimulusAsset(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  actorUserId: string,
  input: AddQuestionAssetInput,
): Promise<QuestionAssetRow> {
  await assertQuestionPermission(db, actorUserId, "question.draft.write");
  return insertQuestionAsset(db, input);
}

export async function submitStimulusVersionForReview(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  actorUserId: string,
  versionId: string,
): Promise<StimulusVersionRow> {
  await assertQuestionPermission(db, actorUserId, "question.draft.write");
  return transitionStimulusVersionStatus(db, versionId, "in_review", new Date());
}

export async function approveStimulusVersion(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  actorUserId: string,
  versionId: string,
): Promise<StimulusVersionRow> {
  await assertQuestionPermission(db, actorUserId, "question.first_approve");
  return transitionStimulusVersionStatus(db, versionId, "approved", new Date());
}

export async function publishStimulusVersion(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  actorUserId: string,
  versionId: string,
): Promise<StimulusVersionRow> {
  await assertQuestionPermission(db, actorUserId, "question.ranked_publish");
  return transitionStimulusVersionStatus(db, versionId, "published", new Date());
}

export async function archiveStimulusVersion(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  actorUserId: string,
  versionId: string,
): Promise<StimulusVersionRow> {
  await assertQuestionPermission(db, actorUserId, "question.ranked_publish");
  return transitionStimulusVersionStatus(db, versionId, "archived", new Date());
}

export type { RecordStatus };
