// Stimulus (shared passage/document) persistence (QST-001).
//
// Mirrors question-repository.ts's identity/version split and draft ->
// publish checksum discipline exactly, minus the answer-key/options layer a
// stimulus has none of. "Stimulus reuse" (the required test) is not
// anything this file enforces directly - it falls out for free from
// question_versions.stimulusVersionId being a plain FK any number of
// question versions can point at the same stimulus_versions row.

import { and, desc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  assertQuestionVersionMutable,
  assertValidQuestionStatusTransition,
  isQuestionVersionLocked,
  type RecordStatus,
} from "@superlatif/domain/exam";
import { computeChecksum, type JsonValue } from "@superlatif/domain/shared";
import type { Queryable, Schema } from "../db-types.ts";
import { stimulusVersions, stimuli } from "../schema/index.ts";

export interface StimulusRow {
  readonly id: string;
  readonly code: string;
  readonly status: string;
}

const STIMULUS_COLUMNS = { id: stimuli.id, code: stimuli.code, status: stimuli.status };

export async function findStimulusByCode(db: Queryable<Schema>, code: string): Promise<StimulusRow | null> {
  const [row] = await db.select(STIMULUS_COLUMNS).from(stimuli).where(eq(stimuli.code, code)).limit(1);
  return row ?? null;
}

/** Mirrors findStimulusByCode by primary key - QST-003's preview service only has a stimulusId (from a question_version's stimulusVersionId's parent) on hand, not the code. */
export async function findStimulusById(
  db: Queryable<Schema>,
  stimulusId: string,
): Promise<StimulusRow | null> {
  const [row] = await db.select(STIMULUS_COLUMNS).from(stimuli).where(eq(stimuli.id, stimulusId)).limit(1);
  return row ?? null;
}

export async function findOrCreateStimulus(db: Queryable<Schema>, code: string): Promise<StimulusRow> {
  const existing = await findStimulusByCode(db, code);
  if (existing) return existing;
  const [row] = await db.insert(stimuli).values({ code }).returning(STIMULUS_COLUMNS);
  if (!row) throw new Error("findOrCreateStimulus: insert returned no row");
  return row;
}

export interface StimulusVersionRow {
  readonly id: string;
  readonly stimulusId: string;
  readonly version: number;
  readonly status: RecordStatus;
  readonly bodyDocument: Record<string, unknown>;
  readonly checksum: string;
}

const STIMULUS_VERSION_COLUMNS = {
  id: stimulusVersions.id,
  stimulusId: stimulusVersions.stimulusId,
  version: stimulusVersions.version,
  status: stimulusVersions.status,
  bodyDocument: stimulusVersions.bodyDocument,
  checksum: stimulusVersions.checksum,
};

function bodyChecksum(bodyDocument: Record<string, unknown>): string {
  return computeChecksum(bodyDocument as JsonValue);
}

export interface CreateStimulusVersionDraftInput {
  readonly stimulusId: string;
  readonly version: number;
  readonly bodyDocument: Record<string, unknown>;
}

export async function createStimulusVersionDraft(
  db: Queryable<Schema>,
  input: CreateStimulusVersionDraftInput,
): Promise<StimulusVersionRow> {
  const checksum = bodyChecksum(input.bodyDocument);
  const [row] = await db
    .insert(stimulusVersions)
    .values({
      stimulusId: input.stimulusId,
      version: input.version,
      bodyDocument: input.bodyDocument,
      checksum,
    })
    .returning(STIMULUS_VERSION_COLUMNS);
  if (!row) throw new Error("createStimulusVersionDraft: insert returned no row");
  return row as StimulusVersionRow;
}

export class StimulusVersionNotFoundError extends Error {
  constructor(versionId: string) {
    super(`Stimulus version ${versionId} not found`);
    this.name = "StimulusVersionNotFoundError";
  }
}

export async function findStimulusVersionById(
  db: Queryable<Schema>,
  versionId: string,
): Promise<StimulusVersionRow | null> {
  const [row] = await db
    .select(STIMULUS_VERSION_COLUMNS)
    .from(stimulusVersions)
    .where(eq(stimulusVersions.id, versionId))
    .limit(1);
  return (row as StimulusVersionRow | undefined) ?? null;
}

export async function findStimulusVersionByStimulusAndVersion(
  db: Queryable<Schema>,
  stimulusId: string,
  version: number,
): Promise<StimulusVersionRow | null> {
  const [row] = await db
    .select(STIMULUS_VERSION_COLUMNS)
    .from(stimulusVersions)
    .where(and(eq(stimulusVersions.stimulusId, stimulusId), eq(stimulusVersions.version, version)))
    .limit(1);
  return (row as StimulusVersionRow | undefined) ?? null;
}

/** Mirrors question-repository.ts's findLatestQuestionVersion for the same reason - QST-002's import pipeline needs to know a passage_code's latest version status to decide create/update/revise. */
export async function findLatestStimulusVersion(
  db: Queryable<Schema>,
  stimulusId: string,
): Promise<StimulusVersionRow | null> {
  const [row] = await db
    .select(STIMULUS_VERSION_COLUMNS)
    .from(stimulusVersions)
    .where(eq(stimulusVersions.stimulusId, stimulusId))
    .orderBy(desc(stimulusVersions.version))
    .limit(1);
  return (row as StimulusVersionRow | undefined) ?? null;
}

/** Same mutable-in-place window as question_versions (assertQuestionVersionMutable's rule is not question-specific - it is the recordStatus workflow's own lock point, reused here unchanged). */
export async function updateStimulusVersionDraft(
  db: Queryable<Schema>,
  versionId: string,
  bodyDocument: Record<string, unknown>,
): Promise<StimulusVersionRow> {
  const [existing] = await db
    .select(STIMULUS_VERSION_COLUMNS)
    .from(stimulusVersions)
    .where(eq(stimulusVersions.id, versionId))
    .limit(1);
  if (!existing) throw new StimulusVersionNotFoundError(versionId);
  assertQuestionVersionMutable((existing as StimulusVersionRow).status);

  const checksum = bodyChecksum(bodyDocument);
  const [row] = await db
    .update(stimulusVersions)
    .set({ bodyDocument, checksum })
    .where(eq(stimulusVersions.id, versionId))
    .returning(STIMULUS_VERSION_COLUMNS);
  if (!row) throw new Error("updateStimulusVersionDraft: update returned no row");
  return row as StimulusVersionRow;
}

export class StimulusVersionChecksumMismatchError extends Error {
  constructor(versionId: string) {
    super(`Stimulus version ${versionId}'s stored checksum no longer matches its content - refusing to lock`);
    this.name = "StimulusVersionChecksumMismatchError";
  }
}

export async function transitionStimulusVersionStatus(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  versionId: string,
  toStatus: RecordStatus,
  now: Date,
): Promise<StimulusVersionRow> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select(STIMULUS_VERSION_COLUMNS)
      .from(stimulusVersions)
      .where(eq(stimulusVersions.id, versionId))
      .limit(1);
    if (!existing) throw new StimulusVersionNotFoundError(versionId);
    const current = existing as StimulusVersionRow;
    assertValidQuestionStatusTransition(current.status, toStatus);

    if (toStatus === "approved" || toStatus === "published" || toStatus === "archived") {
      if (bodyChecksum(current.bodyDocument) !== current.checksum) {
        throw new StimulusVersionChecksumMismatchError(versionId);
      }
    }

    const enteringLockForFirstTime =
      !isQuestionVersionLocked(current.status) && isQuestionVersionLocked(toStatus);
    const [row] = await tx
      .update(stimulusVersions)
      .set({ status: toStatus, ...(enteringLockForFirstTime ? { lockedAt: now } : {}) })
      .where(eq(stimulusVersions.id, versionId))
      .returning(STIMULUS_VERSION_COLUMNS);
    if (!row) throw new Error("transitionStimulusVersionStatus: update returned no row");
    return row as StimulusVersionRow;
  });
}
