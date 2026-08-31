// Privacy-safe versioned leaderboard generation + read (SCR-003).
//
// dok 16 §18: "Eligibility publik ditentukan effective access; attempt
// yang dihitung untuk ranking ditentukan batch `ranking_attempt_rule`."
// `generateRankingSnapshot` is that population step, made explicit
// ("Ranking input population is explicit", acceptance): every attempt in
// the batch is checked against THREE independent gates before it can
// contribute an entry - (1) not voided, (2) its current result is
// actually RELEASED (SCR-002's own `resolveResultVisibility`, reused
// verbatim - "Leaderboard harus berdasarkan released result, bukan hasil
// draft/unreleased", founder instruction), and (3) the attempt's own
// batch access is still effectively active (ENT-002's `getEffectiveAccess`
// - a refunded/expired grant excludes a student from a public leaderboard
// even if their attempt/result still physically exist, matching "Refund
// tidak menghapus attempt/result/ranking historis" from dok 18 §21 while
// still keeping them off a CURRENT public ranking).
//
// `exam_batches.ranking_attempt_rule` (EXM-002) is read and carried onto
// the snapshot for traceability, never redeclared - "Batch adalah
// satu-satunya pemilik `ranking_attempt_rule`" (dok 18 §21 RC2, binding).
// It has no actual disambiguation work to do in THIS codebase today:
// `attempts_user_batch_active_uq` (ATM-001) already guarantees at most one
// non-voided attempt per (user, batch), so `listAttemptsForBatch` never
// returns more than one candidate per user to choose "first/best/latest"
// among - a future attempt-policy task that allows multiple attempts per
// batch would be the one to actually implement that selection, reading
// this same carried field.
//
// `getBatchLeaderboardView` is the READ path - it recomputes the
// leaderboard's OWN wire state fresh on every call (batch's
// `leaderboardEnabled` + `leaderboard_release` window, independent of
// `deriveBatchState`'s own canonical BatchState enum - dok 18 §3 lists
// leaderboard visibility as its own independent timeline milestone), the
// exact same "fresh computation, never a trusted stored flag" discipline
// SCR-002's own `getStudentResultView` already established for result
// release.

import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { EffectiveAccessCache } from "@superlatif/domain/access";
import {
  computePercentile,
  projectLeaderboardEntry,
  rankCandidates,
  resolveLeaderboardWireState,
  resolveResultVisibility,
  RANKING_POLICY_VERSION,
  type LeaderboardEntryProjection,
  type LeaderboardWireState,
  type RankingSnapshotState,
  type ResultState,
} from "@superlatif/domain/exam";
import type { Schema } from "../../db-types.ts";
import { listAttemptsForBatch } from "../attempt/attempt-repository.ts";
import { findSubmissionByAttemptId } from "../attempt/attempt-submission-repository.ts";
import {
  examBatchTargetRef,
  ExamBatchNotFoundError,
  findExamBatchById,
  getExamBatchState,
  listBatchWindows,
  toBatchWindowSet,
} from "../batch/index.ts";
import { getEffectiveAccess } from "../../access/index.ts";
import { findCurrentResultByAttemptId } from "./result-repository.ts";
import { findOrCreateRankingSubject, listRankingSubjectsByIds } from "./ranking-subject-repository.ts";
import {
  findCurrentRankingSnapshot,
  findMaxRankingSnapshotVersion,
  insertRankingEntry,
  insertRankingSnapshot,
  listRankingEntriesForSnapshot,
  markRankingSnapshotSuperseded,
  type RankingSnapshotRow,
} from "./ranking-repository.ts";

export class RankingSnapshotEmptyError extends Error {
  constructor(readonly batchId: string) {
    super(`Batch ${batchId} has no eligible (released-result) attempts to rank yet`);
    this.name = "RankingSnapshotEmptyError";
  }
}

export class LeaderboardNotAuthorizedError extends Error {
  constructor(readonly batchId: string) {
    super(`Actor does not have effective access to batch ${batchId}'s leaderboard`);
    this.name = "LeaderboardNotAuthorizedError";
  }
}

/**
 * Always creates a NEW snapshot version when called - deliberately not
 * idempotent-on-content the way `scoreSubmission` (SCR-001) is, because a
 * leaderboard has no single natural identity key to dedupe against (it
 * reflects the WHOLE batch's aggregate state at generation time, not one
 * submission). "Corrections create a new ranking version" (acceptance) is
 * exactly this: call it again after a correction and a new version is
 * exactly what results. Not itself a trigger - nothing in this task calls
 * this automatically after `decideResultCorrection` (SCR-002); wiring that
 * trigger is future-task scope, matching every other "callable, not a
 * scheduler" function this codebase has built (`drainScoringJob`,
 * `releaseResult`).
 */
export async function generateRankingSnapshot(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  cache: EffectiveAccessCache,
  batchId: string,
  now: Date,
): Promise<RankingSnapshotRow> {
  const batch = await findExamBatchById(db, batchId);
  if (!batch) throw new ExamBatchNotFoundError(batchId);

  const batchState = await getExamBatchState(db, batchId, now);
  const attempts = await listAttemptsForBatch(db, batchId);

  interface Candidate {
    readonly userId: string;
    readonly resultVersionId: string;
    readonly totalScore: number;
    readonly submittedAt: Date;
    readonly scoreSummary: Record<string, unknown>;
  }
  const candidates: Candidate[] = [];

  for (const attempt of attempts) {
    const result = await findCurrentResultByAttemptId(db, attempt.id);
    if (!result) continue; // not scored (yet) - not an eligible ranking input
    if (!resolveResultVisibility(result.state as ResultState, batchState)) continue; // not RELEASED

    const query = {
      targetType: "exam_batch",
      targetRef: examBatchTargetRef(batch.code),
      action: "start_attempt",
    };
    const access = await getEffectiveAccess(db, cache, attempt.userId, query, now);
    if (!access.allowed) continue; // access no longer effectively active (e.g. refunded)

    // NOT `attempt.submittedAt` - that column is declared on `attempts`
    // but never actually written by ATM-003's own `submitAttempt` (a
    // pre-existing gap this task found but does not fix, out of scope for
    // a scorer/leaderboard task). `attempt_submissions.submittedAt`
    // (ATM-003's own table) is the real, reliably-written source of "when
    // did this student actually submit" - the tie-break input dok 18 §15
    // itself depends on.
    const submission = await findSubmissionByAttemptId(db, attempt.id);
    if (!submission) continue; // a current result implies a submission exists; defensive skip if not

    candidates.push({
      userId: attempt.userId,
      resultVersionId: result.id,
      totalScore: result.totalScore,
      submittedAt: submission.submittedAt,
      scoreSummary: {
        total: result.totalScore,
        sectionScores: (result.scores as { sectionScores?: unknown }).sectionScores ?? {},
        sectionMaxScores: (result.scores as { sectionMaxScores?: unknown }).sectionMaxScores ?? {},
        overallPassed: result.overallPassed,
      },
    });
  }

  if (candidates.length === 0) throw new RankingSnapshotEmptyError(batchId);

  const ranked = rankCandidates(
    candidates.map((candidate) => ({
      subjectKey: candidate.userId,
      totalScore: candidate.totalScore,
      submittedAt: candidate.submittedAt,
    })),
  );
  const byUserId = new Map(candidates.map((candidate) => [candidate.userId, candidate]));

  const priorCurrent = await findCurrentRankingSnapshot(db, batchId);
  const nextVersion = (await findMaxRankingSnapshotVersion(db, batchId)) + 1;
  const state: RankingSnapshotState = priorCurrent ? "corrected" : "provisional";

  return db.transaction(async (tx) => {
    // MUST supersede the old current snapshot before inserting the new
    // one - the partial unique index ranking_snapshot_batch_current_uq
    // refuses two current rows for the same batch at once.
    if (priorCurrent) await markRankingSnapshotSuperseded(tx, priorCurrent.id);

    const snapshot = await insertRankingSnapshot(tx, {
      batchId,
      version: nextVersion,
      isCurrent: true,
      state,
      rankingAttemptRule: batch.rankingAttemptRule,
      policyVersion: RANKING_POLICY_VERSION,
      generatedAt: now,
    });

    for (const rankedEntry of ranked) {
      const candidate = byUserId.get(rankedEntry.subjectKey)!;
      const subject = await findOrCreateRankingSubject(tx, candidate.userId);
      await insertRankingEntry(tx, {
        rankingSnapshotId: snapshot.id,
        rankingSubjectId: subject.id,
        resultVersionId: candidate.resultVersionId,
        rank: rankedEntry.rank,
        totalScore: rankedEntry.totalScore,
        scoreSummary: candidate.scoreSummary,
        submittedAt: rankedEntry.submittedAt,
        cohort: null,
      });
    }

    return snapshot;
  });
}

export interface LeaderboardView {
  readonly state: LeaderboardWireState;
  readonly snapshotVersion: number | null;
  readonly generatedAt: Date | null;
  readonly policyVersion: string | null;
  readonly entries: readonly LeaderboardEntryProjection[];
  readonly ownEntry: LeaderboardEntryProjection | null;
}

const UNAVAILABLE_VIEW: Omit<LeaderboardView, "state"> = {
  snapshotVersion: null,
  generatedAt: null,
  policyVersion: null,
  entries: [],
  ownEntry: null,
};

/**
 * dok 24 §23-adjacent object-level check ("User cannot access another
 * user's... result by changing UUID"), applied here to the VIEWER of a
 * batch leaderboard: an actor with no effective access to the batch gets
 * `LeaderboardNotAuthorizedError` (the service-layer equivalent of the
 * contract's own `403` response) before anything about the leaderboard
 * itself is read.
 */
export async function getBatchLeaderboardView(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  cache: EffectiveAccessCache,
  viewerUserId: string,
  batchId: string,
  now: Date,
): Promise<LeaderboardView> {
  const batch = await findExamBatchById(db, batchId);
  if (!batch) throw new ExamBatchNotFoundError(batchId);

  const query = {
    targetType: "exam_batch",
    targetRef: examBatchTargetRef(batch.code),
    action: "start_attempt",
  };
  const access = await getEffectiveAccess(db, cache, viewerUserId, query, now);
  if (!access.allowed) throw new LeaderboardNotAuthorizedError(batchId);

  const windowSet = toBatchWindowSet(await listBatchWindows(db, batchId));
  const leaderboardWindowReached =
    windowSet.leaderboardRelease !== undefined &&
    now.getTime() >= windowSet.leaderboardRelease.startsAt.getTime();

  const snapshot = await findCurrentRankingSnapshot(db, batchId);
  const wireState = resolveLeaderboardWireState(
    batch.leaderboardEnabled,
    leaderboardWindowReached,
    snapshot ? (snapshot.state as RankingSnapshotState) : null,
  );

  if (
    snapshot === null ||
    (wireState !== "provisional" && wireState !== "final" && wireState !== "corrected")
  ) {
    return { state: wireState, ...UNAVAILABLE_VIEW };
  }

  const entryRows = await listRankingEntriesForSnapshot(db, snapshot.id);
  const subjectRows = await listRankingSubjectsByIds(
    db,
    entryRows.map((row) => row.rankingSubjectId),
  );
  const subjectById = new Map(subjectRows.map((subject) => [subject.id, subject]));
  const totalCandidates = entryRows.length;

  let ownEntry: LeaderboardEntryProjection | null = null;
  const entries: LeaderboardEntryProjection[] = entryRows.map((row) => {
    const subject = subjectById.get(row.rankingSubjectId)!;
    const isCurrentLearner = subject.userId === viewerUserId;
    const projection = projectLeaderboardEntry(
      {
        subjectKey: row.rankingSubjectId,
        totalScore: row.totalScore,
        submittedAt: row.submittedAt,
        rank: row.rank,
        scoreSummary: row.scoreSummary,
        percentile: computePercentile(row.rank, totalCandidates),
      },
      { publicOptIn: subject.publicOptIn, displayAlias: subject.displayAlias },
      isCurrentLearner,
    );
    if (isCurrentLearner) ownEntry = projection;
    return projection;
  });
  entries.sort((a, b) => a.rank - b.rank);

  return {
    state: wireState,
    snapshotVersion: snapshot.version,
    generatedAt: snapshot.generatedAt,
    policyVersion: snapshot.policyVersion,
    entries,
    ownEntry,
  };
}
