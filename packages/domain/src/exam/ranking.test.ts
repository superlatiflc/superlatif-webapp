import { describe, expect, it } from "vitest";
import {
  computePercentile,
  projectLeaderboardEntry,
  rankCandidates,
  resolveLeaderboardWireState,
  type RankingCandidate,
} from "./ranking.ts";

const T1 = new Date("2026-09-01T01:00:00Z");
const T2 = new Date("2026-09-01T01:05:00Z");
const T3 = new Date("2026-09-01T01:10:00Z");

describe("rankCandidates - Tie-break policy", () => {
  it("ranks strictly by totalScore descending when there is no tie", () => {
    const candidates: RankingCandidate<string>[] = [
      { subjectKey: "a", totalScore: 10, submittedAt: T1 },
      { subjectKey: "b", totalScore: 30, submittedAt: T1 },
      { subjectKey: "c", totalScore: 20, submittedAt: T1 },
    ];
    const ranked = rankCandidates(candidates);
    expect(ranked.map((r) => [r.subjectKey, r.rank])).toStrictEqual([
      ["b", 1],
      ["c", 2],
      ["a", 3],
    ]);
  });

  it("Tie-break policy: an EARLIER submission wins a tie on equal score", () => {
    const candidates: RankingCandidate<string>[] = [
      { subjectKey: "late", totalScore: 20, submittedAt: T3 },
      { subjectKey: "early", totalScore: 20, submittedAt: T1 },
      { subjectKey: "middle", totalScore: 20, submittedAt: T2 },
    ];
    const ranked = rankCandidates(candidates);
    expect(ranked.map((r) => r.subjectKey)).toStrictEqual(["early", "middle", "late"]);
    expect(ranked.map((r) => r.rank)).toStrictEqual([1, 2, 3]);
  });

  it("gives a genuine tie (same score AND same submittedAt) the SAME rank, skipping the next slot", () => {
    const candidates: RankingCandidate<string>[] = [
      { subjectKey: "a", totalScore: 20, submittedAt: T1 },
      { subjectKey: "b", totalScore: 20, submittedAt: T1 },
      { subjectKey: "c", totalScore: 10, submittedAt: T1 },
    ];
    const ranked = rankCandidates(candidates);
    const byKey = Object.fromEntries(ranked.map((r) => [r.subjectKey, r.rank]));
    expect(byKey["a"]).toBe(1);
    expect(byKey["b"]).toBe(1);
    expect(byKey["c"]).toBe(3); // skips rank 2 (standard competition ranking)
  });

  it("is deterministic regardless of input array order", () => {
    const candidates: RankingCandidate<string>[] = [
      { subjectKey: "a", totalScore: 10, submittedAt: T1 },
      { subjectKey: "b", totalScore: 30, submittedAt: T1 },
      { subjectKey: "c", totalScore: 20, submittedAt: T1 },
    ];
    const forward = rankCandidates(candidates);
    const reversed = rankCandidates([...candidates].reverse());
    expect(forward).toStrictEqual(reversed);
  });

  it("handles a single candidate", () => {
    const ranked = rankCandidates([{ subjectKey: "solo", totalScore: 5, submittedAt: T1 }]);
    expect(ranked).toStrictEqual([{ subjectKey: "solo", totalScore: 5, submittedAt: T1, rank: 1 }]);
  });

  it("handles an empty candidate set", () => {
    expect(rankCandidates([])).toStrictEqual([]);
  });
});

describe("projectLeaderboardEntry - Opt-out privacy", () => {
  const baseEntry = {
    subjectKey: "s1",
    totalScore: 20,
    submittedAt: T1,
    rank: 1,
    scoreSummary: { total: 20 },
    percentile: 90,
  };

  it("shows the displayAlias to OTHER viewers when the subject opted in", () => {
    const projection = projectLeaderboardEntry(
      baseEntry,
      { publicOptIn: true, displayAlias: "Rajin97" },
      false,
    );
    expect(projection.displayAlias).toBe("Rajin97");
    expect(projection.publicOptIn).toBe(true);
  });

  it("Opt-out privacy: withholds the displayAlias from OTHER viewers when the subject opted out", () => {
    const projection = projectLeaderboardEntry(
      baseEntry,
      { publicOptIn: false, displayAlias: "Rajin97" },
      false,
    );
    expect(projection.displayAlias).toBeNull();
    expect(projection.publicOptIn).toBe(false);
    // rank/score/percentile are NEVER gated - a position without a name is still privacy-safe.
    expect(projection.rank).toBe(1);
    expect(projection.scoreSummary).toStrictEqual({ total: 20 });
    expect(projection.percentile).toBe(90);
  });

  it("always shows the subject their OWN alias, opted in or not (isCurrentLearner)", () => {
    const projection = projectLeaderboardEntry(
      baseEntry,
      { publicOptIn: false, displayAlias: "Rajin97" },
      true,
    );
    expect(projection.displayAlias).toBe("Rajin97");
    expect(projection.isCurrentLearner).toBe(true);
  });

  it("shows null displayAlias when opted in but no alias was ever set", () => {
    const projection = projectLeaderboardEntry(baseEntry, { publicOptIn: true, displayAlias: null }, false);
    expect(projection.displayAlias).toBeNull();
  });
});

describe("resolveLeaderboardWireState", () => {
  it("is disabled when the batch's leaderboardEnabled is false, regardless of anything else", () => {
    expect(resolveLeaderboardWireState(false, true, "provisional")).toBe("disabled");
    expect(resolveLeaderboardWireState(false, false, null)).toBe("disabled");
  });

  it("is not_released before the leaderboard window opens", () => {
    expect(resolveLeaderboardWireState(true, false, null)).toBe("not_released");
  });

  it("is processing once the window opens but no snapshot has been generated yet", () => {
    expect(resolveLeaderboardWireState(true, true, null)).toBe("processing");
  });

  it("reflects the snapshot's own state once one exists and the window is open", () => {
    expect(resolveLeaderboardWireState(true, true, "provisional")).toBe("provisional");
    expect(resolveLeaderboardWireState(true, true, "corrected")).toBe("corrected");
  });
});

describe("computePercentile", () => {
  it("returns null when there is only one (or zero) candidates", () => {
    expect(computePercentile(1, 1)).toBeNull();
    expect(computePercentile(1, 0)).toBeNull();
  });

  it("rank 1 of N outperforms/ties everyone (100th percentile)", () => {
    expect(computePercentile(1, 10)).toBe(100);
  });

  it("the last rank is at the bottom", () => {
    expect(computePercentile(10, 10)).toBe(10);
  });
});
