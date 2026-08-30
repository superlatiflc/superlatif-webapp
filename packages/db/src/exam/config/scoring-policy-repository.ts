// scoring_policies/scoring_policy_versions persistence (EXM-001).
//
// Mirrors exam-blueprint-repository.ts's own checksum/lock discipline
// exactly, over a single consolidated `policyConfig` JSONB column - the
// same "one config blob" choice question_versions.classification (QST-001)
// already made.

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
import { scoringPolicyVersions, scoringPolicies } from "../../schema/index.ts";

export interface ScoringPolicyRow {
  readonly id: string;
  readonly code: string;
  readonly status: string;
}

const SCORING_POLICY_COLUMNS = {
  id: scoringPolicies.id,
  code: scoringPolicies.code,
  status: scoringPolicies.status,
};

export async function findScoringPolicyByCode(
  db: Queryable<Schema>,
  code: string,
): Promise<ScoringPolicyRow | null> {
  const [row] = await db
    .select(SCORING_POLICY_COLUMNS)
    .from(scoringPolicies)
    .where(eq(scoringPolicies.code, code))
    .limit(1);
  return row ?? null;
}

export async function findOrCreateScoringPolicy(
  db: Queryable<Schema>,
  code: string,
): Promise<ScoringPolicyRow> {
  const existing = await findScoringPolicyByCode(db, code);
  if (existing) return existing;
  const [row] = await db.insert(scoringPolicies).values({ code }).returning(SCORING_POLICY_COLUMNS);
  if (!row) throw new Error("findOrCreateScoringPolicy: insert returned no row");
  return row;
}

export interface ScoringPolicyVersionRow {
  readonly id: string;
  readonly scoringPolicyId: string;
  readonly version: number;
  readonly status: RecordStatus;
  readonly policyConfig: Record<string, unknown>;
  readonly checksum: string;
}

const SCORING_POLICY_VERSION_COLUMNS = {
  id: scoringPolicyVersions.id,
  scoringPolicyId: scoringPolicyVersions.scoringPolicyId,
  version: scoringPolicyVersions.version,
  status: scoringPolicyVersions.status,
  policyConfig: scoringPolicyVersions.policyConfig,
  checksum: scoringPolicyVersions.checksum,
};

function policyChecksum(policyConfig: Record<string, unknown>): string {
  return computeChecksum(policyConfig as JsonValue);
}

export interface CreateScoringPolicyVersionDraftInput {
  readonly scoringPolicyId: string;
  readonly version: number;
  readonly policyConfig: Record<string, unknown>;
  readonly createdByUserId: string;
}

export async function createScoringPolicyVersionDraft(
  db: Queryable<Schema>,
  input: CreateScoringPolicyVersionDraftInput,
): Promise<ScoringPolicyVersionRow> {
  const checksum = policyChecksum(input.policyConfig);
  const [row] = await db
    .insert(scoringPolicyVersions)
    .values({
      scoringPolicyId: input.scoringPolicyId,
      version: input.version,
      policyConfig: input.policyConfig,
      checksum,
      createdByUserId: input.createdByUserId,
    })
    .returning(SCORING_POLICY_VERSION_COLUMNS);
  if (!row) throw new Error("createScoringPolicyVersionDraft: insert returned no row");
  return row as ScoringPolicyVersionRow;
}

export class ScoringPolicyVersionNotFoundError extends Error {
  constructor(versionId: string) {
    super(`Scoring policy version ${versionId} not found`);
    this.name = "ScoringPolicyVersionNotFoundError";
  }
}

export async function findScoringPolicyVersionById(
  db: Queryable<Schema>,
  versionId: string,
): Promise<ScoringPolicyVersionRow | null> {
  const [row] = await db
    .select(SCORING_POLICY_VERSION_COLUMNS)
    .from(scoringPolicyVersions)
    .where(eq(scoringPolicyVersions.id, versionId))
    .limit(1);
  return (row as ScoringPolicyVersionRow | undefined) ?? null;
}

export async function findLatestScoringPolicyVersion(
  db: Queryable<Schema>,
  scoringPolicyId: string,
): Promise<ScoringPolicyVersionRow | null> {
  const [row] = await db
    .select(SCORING_POLICY_VERSION_COLUMNS)
    .from(scoringPolicyVersions)
    .where(eq(scoringPolicyVersions.scoringPolicyId, scoringPolicyId))
    .orderBy(desc(scoringPolicyVersions.version))
    .limit(1);
  return (row as ScoringPolicyVersionRow | undefined) ?? null;
}

export async function updateScoringPolicyVersionDraft(
  db: Queryable<Schema>,
  versionId: string,
  policyConfig: Record<string, unknown>,
): Promise<ScoringPolicyVersionRow> {
  const [existing] = await db
    .select(SCORING_POLICY_VERSION_COLUMNS)
    .from(scoringPolicyVersions)
    .where(eq(scoringPolicyVersions.id, versionId))
    .limit(1);
  if (!existing) throw new ScoringPolicyVersionNotFoundError(versionId);
  assertExamConfigVersionMutable("scoring_policy_version", (existing as ScoringPolicyVersionRow).status);

  const checksum = policyChecksum(policyConfig);
  const [row] = await db
    .update(scoringPolicyVersions)
    .set({ policyConfig, checksum })
    .where(eq(scoringPolicyVersions.id, versionId))
    .returning(SCORING_POLICY_VERSION_COLUMNS);
  if (!row) throw new Error("updateScoringPolicyVersionDraft: update returned no row");
  return row as ScoringPolicyVersionRow;
}

export class ScoringPolicyVersionChecksumMismatchError extends Error {
  constructor(versionId: string) {
    super(
      `Scoring policy version ${versionId}'s stored checksum no longer matches its content - refusing to lock`,
    );
    this.name = "ScoringPolicyVersionChecksumMismatchError";
  }
}

export async function transitionScoringPolicyVersionStatus(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  versionId: string,
  toStatus: RecordStatus,
  now: Date,
): Promise<ScoringPolicyVersionRow> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select(SCORING_POLICY_VERSION_COLUMNS)
      .from(scoringPolicyVersions)
      .where(eq(scoringPolicyVersions.id, versionId))
      .limit(1);
    if (!existing) throw new ScoringPolicyVersionNotFoundError(versionId);
    const current = existing as ScoringPolicyVersionRow;
    assertValidExamConfigStatusTransition(current.status, toStatus);

    if (toStatus === "approved" || toStatus === "published" || toStatus === "archived") {
      if (policyChecksum(current.policyConfig) !== current.checksum) {
        throw new ScoringPolicyVersionChecksumMismatchError(versionId);
      }
    }

    const enteringLockForFirstTime =
      !isExamConfigVersionLocked(current.status) && isExamConfigVersionLocked(toStatus);
    const [row] = await tx
      .update(scoringPolicyVersions)
      .set({ status: toStatus, ...(enteringLockForFirstTime ? { lockedAt: now } : {}) })
      .where(eq(scoringPolicyVersions.id, versionId))
      .returning(SCORING_POLICY_VERSION_COLUMNS);
    if (!row) throw new Error("transitionScoringPolicyVersionStatus: update returned no row");
    return row as ScoringPolicyVersionRow;
  });
}

export async function findScoringPolicyVersionByPolicyAndVersion(
  db: Queryable<Schema>,
  scoringPolicyId: string,
  version: number,
): Promise<ScoringPolicyVersionRow | null> {
  const [row] = await db
    .select(SCORING_POLICY_VERSION_COLUMNS)
    .from(scoringPolicyVersions)
    .where(
      and(
        eq(scoringPolicyVersions.scoringPolicyId, scoringPolicyId),
        eq(scoringPolicyVersions.version, version),
      ),
    )
    .limit(1);
  return (row as ScoringPolicyVersionRow | undefined) ?? null;
}
