// ranking_snapshots/ranking_entries persistence (SCR-003).

import { and, desc, eq } from "drizzle-orm";
import type { Queryable, Schema } from "../../db-types.ts";
import { rankingEntries, rankingSnapshots } from "../../schema/index.ts";

export interface RankingSnapshotRow {
  readonly id: string;
  readonly batchId: string;
  readonly version: number;
  readonly isCurrent: boolean;
  readonly state: string;
  readonly rankingAttemptRule: string;
  readonly policyVersion: string;
  readonly generatedAt: Date;
}

const RANKING_SNAPSHOT_COLUMNS = {
  id: rankingSnapshots.id,
  batchId: rankingSnapshots.batchId,
  version: rankingSnapshots.version,
  isCurrent: rankingSnapshots.isCurrent,
  state: rankingSnapshots.state,
  rankingAttemptRule: rankingSnapshots.rankingAttemptRule,
  policyVersion: rankingSnapshots.policyVersion,
  generatedAt: rankingSnapshots.generatedAt,
};

export async function findCurrentRankingSnapshot(
  db: Queryable<Schema>,
  batchId: string,
): Promise<RankingSnapshotRow | null> {
  const [row] = await db
    .select(RANKING_SNAPSHOT_COLUMNS)
    .from(rankingSnapshots)
    .where(and(eq(rankingSnapshots.batchId, batchId), eq(rankingSnapshots.isCurrent, true)))
    .limit(1);
  return (row as RankingSnapshotRow | undefined) ?? null;
}

/** Highest existing version for a batch, or 0 if none exists yet - the next snapshot's own version is always this + 1. */
export async function findMaxRankingSnapshotVersion(db: Queryable<Schema>, batchId: string): Promise<number> {
  const [row] = await db
    .select({ version: rankingSnapshots.version })
    .from(rankingSnapshots)
    .where(eq(rankingSnapshots.batchId, batchId))
    .orderBy(desc(rankingSnapshots.version))
    .limit(1);
  return row?.version ?? 0;
}

export interface InsertRankingSnapshotInput {
  readonly batchId: string;
  readonly version: number;
  readonly isCurrent: boolean;
  readonly state: string;
  readonly rankingAttemptRule: string;
  readonly policyVersion: string;
  readonly generatedAt: Date;
}

export async function insertRankingSnapshot(
  db: Queryable<Schema>,
  input: InsertRankingSnapshotInput,
): Promise<RankingSnapshotRow> {
  const [row] = await db.insert(rankingSnapshots).values(input).returning(RANKING_SNAPSHOT_COLUMNS);
  if (!row) throw new Error("insertRankingSnapshot: insert returned no row");
  return row as RankingSnapshotRow;
}

/** MUST run and commit before a replacement row with `is_current = true` is inserted for the same batch - the partial unique index `ranking_snapshot_batch_current_uq` refuses two current rows at once (same discipline as `markResultVersionSuperseded`, SCR-002). */
export async function markRankingSnapshotSuperseded(
  db: Queryable<Schema>,
  snapshotId: string,
): Promise<void> {
  await db.update(rankingSnapshots).set({ isCurrent: false }).where(eq(rankingSnapshots.id, snapshotId));
}

export interface RankingEntryRow {
  readonly id: string;
  readonly rankingSnapshotId: string;
  readonly rankingSubjectId: string;
  readonly resultVersionId: string;
  readonly rank: number;
  readonly totalScore: number;
  readonly scoreSummary: Record<string, unknown>;
  readonly submittedAt: Date;
  readonly cohort: string | null;
}

const RANKING_ENTRY_COLUMNS = {
  id: rankingEntries.id,
  rankingSnapshotId: rankingEntries.rankingSnapshotId,
  rankingSubjectId: rankingEntries.rankingSubjectId,
  resultVersionId: rankingEntries.resultVersionId,
  rank: rankingEntries.rank,
  totalScore: rankingEntries.totalScore,
  scoreSummary: rankingEntries.scoreSummary,
  submittedAt: rankingEntries.submittedAt,
  cohort: rankingEntries.cohort,
};

export interface InsertRankingEntryInput {
  readonly rankingSnapshotId: string;
  readonly rankingSubjectId: string;
  readonly resultVersionId: string;
  readonly rank: number;
  readonly totalScore: number;
  readonly scoreSummary: Record<string, unknown>;
  readonly submittedAt: Date;
  readonly cohort: string | null;
}

export async function insertRankingEntry(
  db: Queryable<Schema>,
  input: InsertRankingEntryInput,
): Promise<RankingEntryRow> {
  const [row] = await db.insert(rankingEntries).values(input).returning(RANKING_ENTRY_COLUMNS);
  if (!row) throw new Error("insertRankingEntry: insert returned no row");
  return row as RankingEntryRow;
}

export async function listRankingEntriesForSnapshot(
  db: Queryable<Schema>,
  rankingSnapshotId: string,
): Promise<readonly RankingEntryRow[]> {
  const rows = await db
    .select(RANKING_ENTRY_COLUMNS)
    .from(rankingEntries)
    .where(eq(rankingEntries.rankingSnapshotId, rankingSnapshotId));
  return rows as RankingEntryRow[];
}
