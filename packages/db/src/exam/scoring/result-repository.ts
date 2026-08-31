// result_versions persistence (SCR-001).
//
// `findCurrentResultByAttemptId` is the check-existing-first read
// `scoreSubmission` (scoring-service.ts) uses BEFORE ever computing a
// score - the same "check existing first, DB constraint as the real race
// arbiter" shape `startOrResumeAttempt` (ATM-001) and `submitAttempt`
// (ATM-003) already established. `insertResultVersion` is a plain insert;
// it does not itself catch a unique-violation race - see
// scoring-service.ts's own module doc for why this task accepts the
// weaker (ATM-001-style) race tolerance here rather than ATM-003's own
// catch-and-refetch pattern.

import { and, eq } from "drizzle-orm";
import type { Queryable, Schema } from "../../db-types.ts";
import { resultVersions } from "../../schema/index.ts";

export interface ResultVersionRow {
  readonly id: string;
  readonly attemptId: string;
  readonly submissionId: string;
  readonly scoringPolicyVersionId: string;
  readonly version: number;
  readonly isCurrent: boolean;
  readonly state: string;
  readonly scores: Record<string, unknown>;
  readonly evaluation: Record<string, unknown>;
  readonly totalScore: number;
  readonly overallPassed: boolean | null;
  readonly scoringEngineVersion: string;
  readonly inputChecksum: string;
  readonly releasedAt: Date | null;
  readonly correctedAt: Date | null;
  readonly computedAt: Date;
}

const RESULT_VERSION_COLUMNS = {
  id: resultVersions.id,
  attemptId: resultVersions.attemptId,
  submissionId: resultVersions.submissionId,
  scoringPolicyVersionId: resultVersions.scoringPolicyVersionId,
  version: resultVersions.version,
  isCurrent: resultVersions.isCurrent,
  state: resultVersions.state,
  scores: resultVersions.scores,
  evaluation: resultVersions.evaluation,
  totalScore: resultVersions.totalScore,
  overallPassed: resultVersions.overallPassed,
  scoringEngineVersion: resultVersions.scoringEngineVersion,
  inputChecksum: resultVersions.inputChecksum,
  releasedAt: resultVersions.releasedAt,
  correctedAt: resultVersions.correctedAt,
  computedAt: resultVersions.computedAt,
};

export async function findCurrentResultByAttemptId(
  db: Queryable<Schema>,
  attemptId: string,
): Promise<ResultVersionRow | null> {
  const [row] = await db
    .select(RESULT_VERSION_COLUMNS)
    .from(resultVersions)
    .where(and(eq(resultVersions.attemptId, attemptId), eq(resultVersions.isCurrent, true)))
    .limit(1);
  return (row as ResultVersionRow | undefined) ?? null;
}

export interface InsertResultVersionInput {
  readonly attemptId: string;
  readonly submissionId: string;
  readonly scoringPolicyVersionId: string;
  readonly version: number;
  readonly isCurrent: boolean;
  readonly state: string;
  readonly scores: Record<string, unknown>;
  readonly evaluation: Record<string, unknown>;
  readonly totalScore: number;
  readonly overallPassed: boolean | null;
  readonly scoringEngineVersion: string;
  readonly inputChecksum: string;
  readonly computedAt: Date;
}

export async function insertResultVersion(
  db: Queryable<Schema>,
  input: InsertResultVersionInput,
): Promise<ResultVersionRow> {
  const [row] = await db.insert(resultVersions).values(input).returning(RESULT_VERSION_COLUMNS);
  if (!row) throw new Error("insertResultVersion: insert returned no row");
  return row as ResultVersionRow;
}
