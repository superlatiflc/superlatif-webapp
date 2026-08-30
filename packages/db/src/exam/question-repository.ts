// Question/question_version/question_options persistence (QST-001).
//
// Mirrors packages/db/src/access/policy-repository.ts's draft -> publish
// checksum discipline (compute on write, re-verify before locking) and
// packages/db/src/program/curriculum-repository.ts's "draft gate" pattern
// (assertQuestionVersionIsMutable before any content write) - but the
// MUTABILITY RULE itself is different: dok 15 §4 says a question_version
// stays mutable through draft/in_review/changes_requested and only locks at
// approved/published/archived (@superlatif/domain/exam's
// assertQuestionVersionMutable), not "immutable from creation" the way
// access_policies/product_versions/resource_versions are.
//
// The checksum stored on `question_versions` covers only that row's OWN
// content columns (type, stimulusVersionId, classification, stemDocument,
// explanationDocument) - not question_options/question_assets/the secret
// row, which are separate relational rows locked by the SAME version-level
// status gate rather than folded into one JSON blob.

import { and, desc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  assertQuestionVersionMutable,
  assertValidQuestionStatusTransition,
  isQuestionVersionLocked,
  type QuestionType,
  type RecordStatus,
} from "@superlatif/domain/exam";
import { computeChecksum, type JsonValue } from "@superlatif/domain/shared";
import type { Queryable, Schema } from "../db-types.ts";
import { questionOptions, questionVersions, questions } from "../schema/index.ts";

export interface QuestionRow {
  readonly id: string;
  readonly code: string;
  readonly status: string;
}

const QUESTION_COLUMNS = { id: questions.id, code: questions.code, status: questions.status };

export async function findQuestionByCode(db: Queryable<Schema>, code: string): Promise<QuestionRow | null> {
  const [row] = await db.select(QUESTION_COLUMNS).from(questions).where(eq(questions.code, code)).limit(1);
  return row ?? null;
}

/** Creates the stable question identity row if `code` is not already taken - the FIRST version of a question also creates its parent `questions` row, matching stimuli's own identity/version split. */
export async function findOrCreateQuestion(db: Queryable<Schema>, code: string): Promise<QuestionRow> {
  const existing = await findQuestionByCode(db, code);
  if (existing) return existing;
  const [row] = await db.insert(questions).values({ code }).returning(QUESTION_COLUMNS);
  if (!row) throw new Error("findOrCreateQuestion: insert returned no row");
  return row;
}

export interface QuestionVersionRow {
  readonly id: string;
  readonly questionId: string;
  readonly version: number;
  readonly type: QuestionType;
  readonly status: RecordStatus;
  readonly stimulusVersionId: string | null;
  readonly classification: Record<string, unknown>;
  readonly stemDocument: Record<string, unknown>;
  readonly explanationDocument: Record<string, unknown> | null;
  readonly checksum: string;
  readonly createdByUserId: string | null;
}

const QUESTION_VERSION_COLUMNS = {
  id: questionVersions.id,
  questionId: questionVersions.questionId,
  version: questionVersions.version,
  type: questionVersions.type,
  status: questionVersions.status,
  stimulusVersionId: questionVersions.stimulusVersionId,
  classification: questionVersions.classification,
  stemDocument: questionVersions.stemDocument,
  explanationDocument: questionVersions.explanationDocument,
  checksum: questionVersions.checksum,
  createdByUserId: questionVersions.createdByUserId,
};

function questionVersionContentChecksum(content: {
  type: QuestionType;
  stimulusVersionId: string | null;
  classification: Record<string, unknown>;
  stemDocument: Record<string, unknown>;
  explanationDocument: Record<string, unknown> | null;
}): string {
  return computeChecksum(content as unknown as JsonValue);
}

export interface CreateQuestionVersionDraftInput {
  readonly questionId: string;
  readonly version: number;
  readonly type: QuestionType;
  readonly stimulusVersionId?: string | null;
  readonly classification?: Record<string, unknown>;
  readonly stemDocument: Record<string, unknown>;
  readonly explanationDocument?: Record<string, unknown> | null;
  readonly createdByUserId: string;
}

export async function createQuestionVersionDraft(
  db: Queryable<Schema>,
  input: CreateQuestionVersionDraftInput,
): Promise<QuestionVersionRow> {
  const content = {
    type: input.type,
    stimulusVersionId: input.stimulusVersionId ?? null,
    classification: input.classification ?? {},
    stemDocument: input.stemDocument,
    explanationDocument: input.explanationDocument ?? null,
  };
  const checksum = questionVersionContentChecksum(content);
  const [row] = await db
    .insert(questionVersions)
    .values({
      questionId: input.questionId,
      version: input.version,
      type: content.type,
      stimulusVersionId: content.stimulusVersionId,
      classification: content.classification,
      stemDocument: content.stemDocument,
      explanationDocument: content.explanationDocument,
      checksum,
      createdByUserId: input.createdByUserId,
    })
    .returning(QUESTION_VERSION_COLUMNS);
  if (!row) throw new Error("createQuestionVersionDraft: insert returned no row");
  return row as QuestionVersionRow;
}

export async function findQuestionVersionById(
  db: Queryable<Schema>,
  versionId: string,
): Promise<QuestionVersionRow | null> {
  const [row] = await db
    .select(QUESTION_VERSION_COLUMNS)
    .from(questionVersions)
    .where(eq(questionVersions.id, versionId))
    .limit(1);
  return (row as QuestionVersionRow | undefined) ?? null;
}

export class QuestionVersionNotFoundError extends Error {
  constructor(versionId: string) {
    super(`Question version ${versionId} not found`);
    this.name = "QuestionVersionNotFoundError";
  }
}

async function requireQuestionVersion(db: Queryable<Schema>, versionId: string): Promise<QuestionVersionRow> {
  const row = await findQuestionVersionById(db, versionId);
  if (!row) throw new QuestionVersionNotFoundError(versionId);
  return row;
}

export interface UpdateQuestionVersionDraftInput {
  readonly stimulusVersionId?: string | null;
  readonly classification?: Record<string, unknown>;
  readonly stemDocument?: Record<string, unknown>;
  readonly explanationDocument?: Record<string, unknown> | null;
}

/**
 * dok 15 §4's mutable-in-place window: refuses via
 * `assertQuestionVersionMutable` once status is approved/published/archived
 * (`QuestionVersionLockedError`) - the "published version cannot mutate"
 * required test exercises exactly this guard.
 */
export async function updateQuestionVersionDraft(
  db: Queryable<Schema>,
  versionId: string,
  patch: UpdateQuestionVersionDraftInput,
): Promise<QuestionVersionRow> {
  const existing = await requireQuestionVersion(db, versionId);
  assertQuestionVersionMutable(existing.status);

  const content = {
    type: existing.type,
    stimulusVersionId:
      patch.stimulusVersionId !== undefined ? patch.stimulusVersionId : existing.stimulusVersionId,
    classification: patch.classification ?? existing.classification,
    stemDocument: patch.stemDocument ?? existing.stemDocument,
    explanationDocument:
      patch.explanationDocument !== undefined ? patch.explanationDocument : existing.explanationDocument,
  };
  const checksum = questionVersionContentChecksum(content);

  const [row] = await db
    .update(questionVersions)
    .set({
      stimulusVersionId: content.stimulusVersionId,
      classification: content.classification,
      stemDocument: content.stemDocument,
      explanationDocument: content.explanationDocument,
      checksum,
    })
    .where(eq(questionVersions.id, versionId))
    .returning(QUESTION_VERSION_COLUMNS);
  if (!row) throw new Error("updateQuestionVersionDraft: update returned no row");
  return row as QuestionVersionRow;
}

export class QuestionVersionChecksumMismatchError extends Error {
  constructor(versionId: string) {
    super(`Question version ${versionId}'s stored checksum no longer matches its content - refusing to lock`);
    this.name = "QuestionVersionChecksumMismatchError";
  }
}

/**
 * Advances `status` along the workflow (@superlatif/domain/exam's
 * assertValidQuestionStatusTransition guards the edge). When the
 * destination locks the version (approved/published/archived per
 * isQuestionVersionLocked), re-verifies the stored checksum against the
 * stored content first - the same "re-verify before lock" discipline
 * policy-repository.ts#publishPolicyVersion uses - and stamps `lockedAt`
 * once, on the FIRST transition into a locked status (publish after
 * approve does not re-stamp it).
 */
export async function transitionQuestionVersionStatus(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  versionId: string,
  toStatus: RecordStatus,
  now: Date,
): Promise<QuestionVersionRow> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select(QUESTION_VERSION_COLUMNS)
      .from(questionVersions)
      .where(eq(questionVersions.id, versionId))
      .limit(1);
    if (!existing) throw new QuestionVersionNotFoundError(versionId);
    const current = existing as QuestionVersionRow;
    assertValidQuestionStatusTransition(current.status, toStatus);

    const content = {
      type: current.type,
      stimulusVersionId: current.stimulusVersionId,
      classification: current.classification,
      stemDocument: current.stemDocument,
      explanationDocument: current.explanationDocument,
    };
    if (toStatus === "approved" || toStatus === "published" || toStatus === "archived") {
      if (questionVersionContentChecksum(content) !== current.checksum) {
        throw new QuestionVersionChecksumMismatchError(versionId);
      }
    }

    // `lockedAt` is stamped once, the first time the version enters a
    // locked status (typically draft -> ... -> approved) - a later
    // approved -> published -> archived step never overwrites it, so it
    // keeps recording when the version first became immutable.
    const enteringLockForFirstTime =
      !isQuestionVersionLocked(current.status) && isQuestionVersionLocked(toStatus);

    const [row] = await tx
      .update(questionVersions)
      .set({ status: toStatus, ...(enteringLockForFirstTime ? { lockedAt: now } : {}) })
      .where(eq(questionVersions.id, versionId))
      .returning(QUESTION_VERSION_COLUMNS);
    if (!row) throw new Error("transitionQuestionVersionStatus: update returned no row");
    return row as QuestionVersionRow;
  });
}

export interface QuestionOptionRow {
  readonly id: string;
  readonly questionVersionId: string;
  readonly optionCode: string;
  readonly order: number;
  readonly content: Record<string, unknown>;
}

const QUESTION_OPTION_COLUMNS = {
  id: questionOptions.id,
  questionVersionId: questionOptions.questionVersionId,
  optionCode: questionOptions.optionCode,
  order: questionOptions.order,
  content: questionOptions.content,
};

export interface ReplaceQuestionOptionInput {
  readonly optionCode: string;
  readonly order: number;
  readonly content: Record<string, unknown>;
}

/**
 * Whole-set replace (delete-then-insert in one transaction), matching a
 * draft editor that resubmits its full option list on every save rather
 * than patching individual rows - simplest correct behavior while the
 * version is still mutable. Refuses once the version is locked, same guard
 * as updateQuestionVersionDraft.
 */
export async function replaceQuestionOptions(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  versionId: string,
  options: readonly ReplaceQuestionOptionInput[],
): Promise<readonly QuestionOptionRow[]> {
  const version = await requireQuestionVersion(db, versionId);
  assertQuestionVersionMutable(version.status);

  return db.transaction(async (tx) => {
    await tx.delete(questionOptions).where(eq(questionOptions.questionVersionId, versionId));
    if (options.length === 0) return [];
    const inserted = await tx
      .insert(questionOptions)
      .values(
        options.map((option) => ({
          questionVersionId: versionId,
          optionCode: option.optionCode,
          order: option.order,
          content: option.content,
        })),
      )
      .returning(QUESTION_OPTION_COLUMNS);
    return inserted as QuestionOptionRow[];
  });
}

export async function listQuestionOptions(
  db: Queryable<Schema>,
  versionId: string,
): Promise<readonly QuestionOptionRow[]> {
  const rows = await db
    .select(QUESTION_OPTION_COLUMNS)
    .from(questionOptions)
    .where(eq(questionOptions.questionVersionId, versionId));
  return rows as QuestionOptionRow[];
}

export async function findQuestionVersionByQuestionAndVersion(
  db: Queryable<Schema>,
  questionId: string,
  version: number,
): Promise<QuestionVersionRow | null> {
  const [row] = await db
    .select(QUESTION_VERSION_COLUMNS)
    .from(questionVersions)
    .where(and(eq(questionVersions.questionId, questionId), eq(questionVersions.version, version)))
    .limit(1);
  return (row as QuestionVersionRow | undefined) ?? null;
}

/** The highest-numbered version row for a question, or null if the question has no versions at all. QST-002's import pipeline uses this to decide (via @superlatif/domain/exam's resolveImportRowIntent) whether a `question_code` from a workbook is brand new, still-mutable, or locked. */
export async function findLatestQuestionVersion(
  db: Queryable<Schema>,
  questionId: string,
): Promise<QuestionVersionRow | null> {
  const [row] = await db
    .select(QUESTION_VERSION_COLUMNS)
    .from(questionVersions)
    .where(eq(questionVersions.questionId, questionId))
    .orderBy(desc(questionVersions.version))
    .limit(1);
  return (row as QuestionVersionRow | undefined) ?? null;
}
