// exam_forms/exam_form_versions/exam_form_items persistence (EXM-001).
//
// dok 21 §9: "version links blueprint/scoring, composition, status,
// locked/checksum." `blueprintVersionId`/`scoringPolicyVersionId` are set
// ONCE at creation and are never part of the mutable-draft content an
// `updateExamFormVersionDraft`-style call could repoint - re-pairing a form
// to a different blueprint/scoring version is a new form version, not an
// edit, the same "some fields are identity, not content" split
// question_versions.questionId already has (QST-001 never lets a version's
// parent question change either).
//
// `replaceExamFormItems` mirrors question-repository.ts's
// `replaceQuestionOptions` exactly - whole-set replace in one transaction,
// refused once the version is locked. THE pin ("Form snapshot harus pin
// exact question version") is simply `exam_form_items.questionVersionId`
// being a plain FK into QST-001's own `question_versions.id` - once the
// form version locks, `assertExamConfigVersionMutable` refuses any further
// call to this function, so the FK values a locked form points at can
// never change again.

import { and, desc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  assertExamConfigVersionMutable,
  assertValidExamConfigStatusTransition,
  isExamConfigVersionLocked,
  type RecordStatus,
} from "@superlatif/domain/exam";
import { computeChecksum, type JsonValue } from "@superlatif/domain/shared";
import type { Queryable, Schema } from "../../db-types.ts";
import { examFormItems, examFormVersions, examForms } from "../../schema/index.ts";

export interface ExamFormRow {
  readonly id: string;
  readonly code: string;
  readonly status: string;
}

const EXAM_FORM_COLUMNS = { id: examForms.id, code: examForms.code, status: examForms.status };

export async function findExamFormByCode(db: Queryable<Schema>, code: string): Promise<ExamFormRow | null> {
  const [row] = await db.select(EXAM_FORM_COLUMNS).from(examForms).where(eq(examForms.code, code)).limit(1);
  return row ?? null;
}

export async function findOrCreateExamForm(db: Queryable<Schema>, code: string): Promise<ExamFormRow> {
  const existing = await findExamFormByCode(db, code);
  if (existing) return existing;
  const [row] = await db.insert(examForms).values({ code }).returning(EXAM_FORM_COLUMNS);
  if (!row) throw new Error("findOrCreateExamForm: insert returned no row");
  return row;
}

export interface ExamFormVersionRow {
  readonly id: string;
  readonly examFormId: string;
  readonly version: number;
  readonly status: RecordStatus;
  readonly blueprintVersionId: string;
  readonly scoringPolicyVersionId: string;
  readonly checksum: string;
}

const EXAM_FORM_VERSION_COLUMNS = {
  id: examFormVersions.id,
  examFormId: examFormVersions.examFormId,
  version: examFormVersions.version,
  status: examFormVersions.status,
  blueprintVersionId: examFormVersions.blueprintVersionId,
  scoringPolicyVersionId: examFormVersions.scoringPolicyVersionId,
  checksum: examFormVersions.checksum,
};

export interface CreateExamFormVersionDraftInput {
  readonly examFormId: string;
  readonly version: number;
  readonly blueprintVersionId: string;
  readonly scoringPolicyVersionId: string;
  readonly createdByUserId: string;
}

/** The form version's own checksum covers just its identity pairing (blueprint+scoring version) - item-set integrity is enforced separately by the unique constraints on exam_form_items and by the publication validator re-reading the full item set fresh at lock time (see exam-config-service.ts), not folded into this checksum. */
export async function createExamFormVersionDraft(
  db: Queryable<Schema>,
  input: CreateExamFormVersionDraftInput,
): Promise<ExamFormVersionRow> {
  const checksum = computeChecksum({
    blueprintVersionId: input.blueprintVersionId,
    scoringPolicyVersionId: input.scoringPolicyVersionId,
  } as JsonValue);
  const [row] = await db
    .insert(examFormVersions)
    .values({
      examFormId: input.examFormId,
      version: input.version,
      blueprintVersionId: input.blueprintVersionId,
      scoringPolicyVersionId: input.scoringPolicyVersionId,
      checksum,
      createdByUserId: input.createdByUserId,
    })
    .returning(EXAM_FORM_VERSION_COLUMNS);
  if (!row) throw new Error("createExamFormVersionDraft: insert returned no row");
  return row as ExamFormVersionRow;
}

export class ExamFormVersionNotFoundError extends Error {
  constructor(versionId: string) {
    super(`Exam form version ${versionId} not found`);
    this.name = "ExamFormVersionNotFoundError";
  }
}

export async function findExamFormVersionById(
  db: Queryable<Schema>,
  versionId: string,
): Promise<ExamFormVersionRow | null> {
  const [row] = await db
    .select(EXAM_FORM_VERSION_COLUMNS)
    .from(examFormVersions)
    .where(eq(examFormVersions.id, versionId))
    .limit(1);
  return (row as ExamFormVersionRow | undefined) ?? null;
}

export async function findLatestExamFormVersion(
  db: Queryable<Schema>,
  examFormId: string,
): Promise<ExamFormVersionRow | null> {
  const [row] = await db
    .select(EXAM_FORM_VERSION_COLUMNS)
    .from(examFormVersions)
    .where(eq(examFormVersions.examFormId, examFormId))
    .orderBy(desc(examFormVersions.version))
    .limit(1);
  return (row as ExamFormVersionRow | undefined) ?? null;
}

export interface ExamFormItemRow {
  readonly id: string;
  readonly examFormVersionId: string;
  readonly sectionCode: string;
  readonly order: number;
  readonly questionVersionId: string;
}

const EXAM_FORM_ITEM_COLUMNS = {
  id: examFormItems.id,
  examFormVersionId: examFormItems.examFormVersionId,
  sectionCode: examFormItems.sectionCode,
  order: examFormItems.order,
  questionVersionId: examFormItems.questionVersionId,
};

export interface ReplaceExamFormItemInput {
  readonly sectionCode: string;
  readonly order: number;
  readonly questionVersionId: string;
}

export async function replaceExamFormItems(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  examFormVersionId: string,
  items: readonly ReplaceExamFormItemInput[],
): Promise<readonly ExamFormItemRow[]> {
  const [version] = await db
    .select({ status: examFormVersions.status })
    .from(examFormVersions)
    .where(eq(examFormVersions.id, examFormVersionId))
    .limit(1);
  if (!version) throw new ExamFormVersionNotFoundError(examFormVersionId);
  assertExamConfigVersionMutable("exam_form_version", version.status);

  return db.transaction(async (tx) => {
    await tx.delete(examFormItems).where(eq(examFormItems.examFormVersionId, examFormVersionId));
    if (items.length === 0) return [];
    const inserted = await tx
      .insert(examFormItems)
      .values(
        items.map((item) => ({
          examFormVersionId,
          sectionCode: item.sectionCode,
          order: item.order,
          questionVersionId: item.questionVersionId,
        })),
      )
      .returning(EXAM_FORM_ITEM_COLUMNS);
    return inserted as ExamFormItemRow[];
  });
}

export async function listExamFormItems(
  db: Queryable<Schema>,
  examFormVersionId: string,
): Promise<readonly ExamFormItemRow[]> {
  const rows = await db
    .select(EXAM_FORM_ITEM_COLUMNS)
    .from(examFormItems)
    .where(eq(examFormItems.examFormVersionId, examFormVersionId));
  return rows as ExamFormItemRow[];
}

export class ExamFormVersionChecksumMismatchError extends Error {
  constructor(versionId: string) {
    super(
      `Exam form version ${versionId}'s stored checksum no longer matches its content - refusing to lock`,
    );
    this.name = "ExamFormVersionChecksumMismatchError";
  }
}

export async function transitionExamFormVersionStatus(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  versionId: string,
  toStatus: RecordStatus,
  now: Date,
): Promise<ExamFormVersionRow> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select(EXAM_FORM_VERSION_COLUMNS)
      .from(examFormVersions)
      .where(eq(examFormVersions.id, versionId))
      .limit(1);
    if (!existing) throw new ExamFormVersionNotFoundError(versionId);
    const current = existing as ExamFormVersionRow;
    assertValidExamConfigStatusTransition(current.status, toStatus);

    if (toStatus === "approved" || toStatus === "published" || toStatus === "archived") {
      const checksum = computeChecksum({
        blueprintVersionId: current.blueprintVersionId,
        scoringPolicyVersionId: current.scoringPolicyVersionId,
      } as JsonValue);
      if (checksum !== current.checksum) {
        throw new ExamFormVersionChecksumMismatchError(versionId);
      }
    }

    const enteringLockForFirstTime =
      !isExamConfigVersionLocked(current.status) && isExamConfigVersionLocked(toStatus);
    const [row] = await tx
      .update(examFormVersions)
      .set({ status: toStatus, ...(enteringLockForFirstTime ? { lockedAt: now } : {}) })
      .where(eq(examFormVersions.id, versionId))
      .returning(EXAM_FORM_VERSION_COLUMNS);
    if (!row) throw new Error("transitionExamFormVersionStatus: update returned no row");
    return row as ExamFormVersionRow;
  });
}

export async function findExamFormVersionByFormAndVersion(
  db: Queryable<Schema>,
  examFormId: string,
  version: number,
): Promise<ExamFormVersionRow | null> {
  const [row] = await db
    .select(EXAM_FORM_VERSION_COLUMNS)
    .from(examFormVersions)
    .where(and(eq(examFormVersions.examFormId, examFormId), eq(examFormVersions.version, version)))
    .limit(1);
  return (row as ExamFormVersionRow | undefined) ?? null;
}
