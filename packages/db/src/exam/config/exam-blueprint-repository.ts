// exam_blueprints/exam_blueprint_versions persistence (EXM-001).
//
// Mirrors packages/db/src/access/policy-repository.ts's draft -> publish
// checksum discipline exactly (compute on write, re-verify before locking,
// lockedAt stamped once on first entry into a locked status) - the SAME
// generic recordStatus mutability rule QST-001 established
// (@superlatif/domain/exam's assertExamConfigVersionMutable, imported from
// exam-config-lifecycle.ts, which itself reuses QST-001's own
// isQuestionVersionLocked without reimplementing it).
//
// `config` is validated against contracts/exam-blueprint.schema.json on
// EVERY write (draft create AND draft update), not only at publish -
// "draft rows are not exempt from validation, so an invalid policy is
// caught before it is ever published," the exact phrase
// policy-repository.ts's own module doc uses for entitlement-policy.schema.json,
// true here for the identical reason.

import { and, desc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  assertExamConfigVersionMutable,
  assertValidExamConfigStatusTransition,
  isExamConfigVersionLocked,
  type ActivationScope,
  type RecordStatus,
} from "@superlatif/domain/exam";
import { computeChecksum, type JsonValue } from "@superlatif/domain/shared";
import type { Queryable, Schema } from "../../db-types.ts";
import { examBlueprintVersions, examBlueprints } from "../../schema/index.ts";
import { assertValidExamBlueprintConfig } from "./exam-blueprint-schema-validator.ts";

export interface ExamBlueprintRow {
  readonly id: string;
  readonly code: string;
  readonly examFamilyId: string;
  readonly status: string;
}

const EXAM_BLUEPRINT_COLUMNS = {
  id: examBlueprints.id,
  code: examBlueprints.code,
  examFamilyId: examBlueprints.examFamilyId,
  status: examBlueprints.status,
};

export async function findExamBlueprintByCode(
  db: Queryable<Schema>,
  code: string,
): Promise<ExamBlueprintRow | null> {
  const [row] = await db
    .select(EXAM_BLUEPRINT_COLUMNS)
    .from(examBlueprints)
    .where(eq(examBlueprints.code, code))
    .limit(1);
  return row ?? null;
}

export async function findOrCreateExamBlueprint(
  db: Queryable<Schema>,
  input: { code: string; examFamilyId: string },
): Promise<ExamBlueprintRow> {
  const existing = await findExamBlueprintByCode(db, input.code);
  if (existing) return existing;
  const [row] = await db
    .insert(examBlueprints)
    .values({ code: input.code, examFamilyId: input.examFamilyId })
    .returning(EXAM_BLUEPRINT_COLUMNS);
  if (!row) throw new Error("findOrCreateExamBlueprint: insert returned no row");
  return row;
}

export interface ExamBlueprintVersionRow {
  readonly id: string;
  readonly blueprintId: string;
  readonly version: number;
  readonly status: RecordStatus;
  readonly activationScope: ActivationScope;
  readonly title: string;
  readonly config: Record<string, unknown>;
  readonly checksum: string;
  readonly createdByUserId: string | null;
}

const EXAM_BLUEPRINT_VERSION_COLUMNS = {
  id: examBlueprintVersions.id,
  blueprintId: examBlueprintVersions.blueprintId,
  version: examBlueprintVersions.version,
  status: examBlueprintVersions.status,
  activationScope: examBlueprintVersions.activationScope,
  title: examBlueprintVersions.title,
  config: examBlueprintVersions.config,
  checksum: examBlueprintVersions.checksum,
  createdByUserId: examBlueprintVersions.createdByUserId,
};

function blueprintConfigChecksum(config: Record<string, unknown>): string {
  return computeChecksum(config as JsonValue);
}

export interface CreateExamBlueprintVersionDraftInput {
  readonly blueprintId: string;
  readonly version: number;
  readonly activationScope: ActivationScope;
  readonly title: string;
  readonly config: Record<string, unknown>;
  readonly createdByUserId: string;
}

/** Validates `config` against contracts/exam-blueprint.schema.json BEFORE writing - an invalid document never reaches the database as a draft, matching policy-repository.ts's own "not exempt from validation" discipline. */
export async function createExamBlueprintVersionDraft(
  db: Queryable<Schema>,
  input: CreateExamBlueprintVersionDraftInput,
): Promise<ExamBlueprintVersionRow> {
  assertValidExamBlueprintConfig(input.config);
  const checksum = blueprintConfigChecksum(input.config);
  const [row] = await db
    .insert(examBlueprintVersions)
    .values({
      blueprintId: input.blueprintId,
      version: input.version,
      activationScope: input.activationScope,
      title: input.title,
      config: input.config,
      checksum,
      createdByUserId: input.createdByUserId,
    })
    .returning(EXAM_BLUEPRINT_VERSION_COLUMNS);
  if (!row) throw new Error("createExamBlueprintVersionDraft: insert returned no row");
  return row as ExamBlueprintVersionRow;
}

export class ExamBlueprintVersionNotFoundError extends Error {
  constructor(versionId: string) {
    super(`Exam blueprint version ${versionId} not found`);
    this.name = "ExamBlueprintVersionNotFoundError";
  }
}

export async function findExamBlueprintVersionById(
  db: Queryable<Schema>,
  versionId: string,
): Promise<ExamBlueprintVersionRow | null> {
  const [row] = await db
    .select(EXAM_BLUEPRINT_VERSION_COLUMNS)
    .from(examBlueprintVersions)
    .where(eq(examBlueprintVersions.id, versionId))
    .limit(1);
  return (row as ExamBlueprintVersionRow | undefined) ?? null;
}

export async function findLatestExamBlueprintVersion(
  db: Queryable<Schema>,
  blueprintId: string,
): Promise<ExamBlueprintVersionRow | null> {
  const [row] = await db
    .select(EXAM_BLUEPRINT_VERSION_COLUMNS)
    .from(examBlueprintVersions)
    .where(eq(examBlueprintVersions.blueprintId, blueprintId))
    .orderBy(desc(examBlueprintVersions.version))
    .limit(1);
  return (row as ExamBlueprintVersionRow | undefined) ?? null;
}

/** Whole-document replace (dok 15 §4's own mutable-in-place window, reused generically - see module doc). The replacement `config` is re-validated against the contract the same way the initial draft was - editing a draft is not exempt either. */
export async function updateExamBlueprintVersionDraft(
  db: Queryable<Schema>,
  versionId: string,
  config: Record<string, unknown>,
): Promise<ExamBlueprintVersionRow> {
  const [existing] = await db
    .select(EXAM_BLUEPRINT_VERSION_COLUMNS)
    .from(examBlueprintVersions)
    .where(eq(examBlueprintVersions.id, versionId))
    .limit(1);
  if (!existing) throw new ExamBlueprintVersionNotFoundError(versionId);
  const current = existing as ExamBlueprintVersionRow;
  assertExamConfigVersionMutable("blueprint_version", current.status);

  assertValidExamBlueprintConfig(config);
  const checksum = blueprintConfigChecksum(config);
  const activationScope = config["activationScope"] as ActivationScope;
  const title = config["title"] as string;

  const [row] = await db
    .update(examBlueprintVersions)
    .set({ config, checksum, activationScope, title })
    .where(eq(examBlueprintVersions.id, versionId))
    .returning(EXAM_BLUEPRINT_VERSION_COLUMNS);
  if (!row) throw new Error("updateExamBlueprintVersionDraft: update returned no row");
  return row as ExamBlueprintVersionRow;
}

export class ExamBlueprintVersionChecksumMismatchError extends Error {
  constructor(versionId: string) {
    super(
      `Exam blueprint version ${versionId}'s stored checksum no longer matches its content - refusing to lock`,
    );
    this.name = "ExamBlueprintVersionChecksumMismatchError";
  }
}

export async function transitionExamBlueprintVersionStatus(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  versionId: string,
  toStatus: RecordStatus,
  now: Date,
): Promise<ExamBlueprintVersionRow> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select(EXAM_BLUEPRINT_VERSION_COLUMNS)
      .from(examBlueprintVersions)
      .where(eq(examBlueprintVersions.id, versionId))
      .limit(1);
    if (!existing) throw new ExamBlueprintVersionNotFoundError(versionId);
    const current = existing as ExamBlueprintVersionRow;
    assertValidExamConfigStatusTransition(current.status, toStatus);

    if (toStatus === "approved" || toStatus === "published" || toStatus === "archived") {
      if (blueprintConfigChecksum(current.config) !== current.checksum) {
        throw new ExamBlueprintVersionChecksumMismatchError(versionId);
      }
    }

    const enteringLockForFirstTime =
      !isExamConfigVersionLocked(current.status) && isExamConfigVersionLocked(toStatus);
    const [row] = await tx
      .update(examBlueprintVersions)
      .set({ status: toStatus, ...(enteringLockForFirstTime ? { lockedAt: now } : {}) })
      .where(eq(examBlueprintVersions.id, versionId))
      .returning(EXAM_BLUEPRINT_VERSION_COLUMNS);
    if (!row) throw new Error("transitionExamBlueprintVersionStatus: update returned no row");
    return row as ExamBlueprintVersionRow;
  });
}

export async function findExamBlueprintVersionByBlueprintAndVersion(
  db: Queryable<Schema>,
  blueprintId: string,
  version: number,
): Promise<ExamBlueprintVersionRow | null> {
  const [row] = await db
    .select(EXAM_BLUEPRINT_VERSION_COLUMNS)
    .from(examBlueprintVersions)
    .where(
      and(eq(examBlueprintVersions.blueprintId, blueprintId), eq(examBlueprintVersions.version, version)),
    )
    .limit(1);
  return (row as ExamBlueprintVersionRow | undefined) ?? null;
}
