// Privacy-safe versioned leaderboard - ranking, tie-break, and identity
// projection (SCR-003).
//
// dok 18 §15 "Leaderboard": cohort/eligible attempts explicit, best/first/
// latest attempt policy versioned (EXM-002's own `BatchRankingAttemptRule`,
// batch-ranking-rule.ts - reused verbatim, NOT redefined here, per the
// founder's explicit "jangan bikin ranking rule kedua" instruction and
// dok 18 §21's own binding audit resolution: "Batch adalah satu-satunya
// pemilik `ranking_attempt_rule`"), tie-break versioned, result correction
// creates a new snapshot, display name resolved AT READ TIME, user chooses
// privacy display.
//
// `rankCandidates` is a pure, deterministic sort+rank function - no DB, no
// clock (submittedAt is an already-resolved input, not read fresh) - the
// exact same "pure core, thin db wiring" split SCR-001's own
// score-calculation.ts already established. `projectLeaderboardEntry` is
// the privacy gate: an opted-out subject's SCORE/RANK still appears (a
// leaderboard position without a name is still "privacy-safe", not
// "invisible") but its `displayAlias` is withheld from every viewer except
// the subject's own current-learner view - "Leaderboard identity display
// follows consent and pseudonym rules" (acceptance) holds structurally,
// not by a call site remembering to check `publicOptIn` correctly.

export const RANKING_POLICY_VERSION = "scr-003-tiebreak-v1";

/** contracts/openapi.yaml's own `LeaderboardEnvelope.data.state` enum, transcribed verbatim. Only `"provisional"`/`"corrected"` are ever WRITTEN by this task (mirrors result-lifecycle.ts's own `ResultState` - a snapshot row's stored state); `"not_released"`/`"processing"`/`"disabled"` are read-time DERIVED states (see `resolveLeaderboardWireState`), and `"final"` is not produced by any code this task ships (no human-review "final" transition exists yet, matching SCR-002's own scope boundary). */
export const LEADERBOARD_WIRE_STATES = [
  "not_released",
  "processing",
  "provisional",
  "final",
  "corrected",
  "disabled",
] as const;

export type LeaderboardWireState = (typeof LEADERBOARD_WIRE_STATES)[number];

/** The only two values this task's own snapshot-generation code ever writes to `ranking_snapshots.state`. */
export type RankingSnapshotState = "provisional" | "corrected";

/**
 * dok 18 §15 "Leaderboard boleh dimatikan per batch" - `leaderboardEnabled`
 * is `exam_batches.leaderboard_enabled` (EXM-002 already built this exact
 * column, sitting right alongside its own `ranking_attempt_rule` - "Batch
 * adalah satu-satunya pemilik" applies to both), NOT a new flag this task
 * invents. `leaderboardWindowReached` is the batch's own independent
 * `leaderboard_release` window (EXM-002's own `BATCH_WINDOW_TYPES` - a
 * window separate from `provisionalResultRelease`/`finalResultRelease`,
 * since dok 18 §3 lists "leaderboard visibility" as its own independent
 * timeline milestone, and `deriveBatchState` deliberately does not fold it
 * into the canonical `BatchState` enum).
 */
export function resolveLeaderboardWireState(
  leaderboardEnabled: boolean,
  leaderboardWindowReached: boolean,
  snapshotState: RankingSnapshotState | null,
): LeaderboardWireState {
  if (!leaderboardEnabled) return "disabled";
  if (!leaderboardWindowReached) return "not_released";
  if (snapshotState === null) return "processing";
  return snapshotState;
}

export interface RankingCandidate<T> {
  readonly subjectKey: T;
  readonly totalScore: number;
  /** Tie-break input (dok 18 §15 "Tie-break berversi") - earlier submission wins a tie on score. `RANKING_POLICY_VERSION` names this exact rule; bump it if the rule itself ever changes. */
  readonly submittedAt: Date;
}

export interface RankedEntry<T> extends RankingCandidate<T> {
  /** Standard competition ranking (1224): a genuine tie (same score AND same submittedAt) shares a rank; the NEXT distinct entry's rank still reflects its true position (skips the tied slots), not a dense 1-2-3 renumbering. */
  readonly rank: number;
}

/**
 * Pure, deterministic: the same candidate set always produces the same
 * ranks, regardless of input array order - the golden-fixture-testable
 * core of "Tie-break policy" (required test).
 */
export function rankCandidates<T>(candidates: readonly RankingCandidate<T>[]): readonly RankedEntry<T>[] {
  const sorted = [...candidates].sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    return a.submittedAt.getTime() - b.submittedAt.getTime();
  });

  let rank = 0;
  return sorted.map((entry, index) => {
    const previous = sorted[index - 1];
    const tiedWithPrevious =
      previous !== undefined &&
      previous.totalScore === entry.totalScore &&
      previous.submittedAt.getTime() === entry.submittedAt.getTime();
    if (!tiedWithPrevious) rank = index + 1;
    return { ...entry, rank };
  });
}

export interface RankingSubjectPrivacy {
  readonly publicOptIn: boolean;
  readonly displayAlias: string | null;
}

export interface LeaderboardEntryProjection {
  readonly rank: number;
  readonly scoreSummary: Record<string, unknown>;
  readonly publicOptIn: boolean;
  readonly displayAlias: string | null;
  readonly percentile: number | null;
  readonly isCurrentLearner: boolean;
}

/**
 * The privacy gate itself - `contracts/openapi.yaml`'s own `LeaderboardEntry`
 * shape, transcribed. `displayAlias` is withheld from every viewer UNLESS
 * the subject opted in OR this entry belongs to the requesting viewer
 * (`isCurrentLearner`) - a student always sees their OWN alias/name
 * reflected back, opted in or not, matching `ownEntry`'s own purpose in
 * the wire contract. `rank`/`scoreSummary`/`percentile` are never gated -
 * a leaderboard POSITION without a name is still privacy-safe, not
 * something this task hides.
 */
export function projectLeaderboardEntry(
  entry: RankedEntry<unknown> & {
    readonly scoreSummary: Record<string, unknown>;
    readonly percentile: number | null;
  },
  privacy: RankingSubjectPrivacy,
  isCurrentLearner: boolean,
): LeaderboardEntryProjection {
  const showAlias = privacy.publicOptIn || isCurrentLearner;
  return {
    rank: entry.rank,
    scoreSummary: entry.scoreSummary,
    publicOptIn: privacy.publicOptIn,
    displayAlias: showAlias ? privacy.displayAlias : null,
    percentile: entry.percentile,
    isCurrentLearner,
  };
}

/** dok 16 §18 "percentile" - the share of the cohort a candidate outperformed or tied at. `totalCandidates` includes the entry itself. */
export function computePercentile(rank: number, totalCandidates: number): number | null {
  if (totalCandidates <= 1) return null;
  const outperformedOrTied = totalCandidates - rank + 1;
  return Math.round((outperformedOrTied / totalCandidates) * 1000) / 10; // one decimal place
}
