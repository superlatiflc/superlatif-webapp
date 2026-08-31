import type { Metadata } from "next";
import { buildMockLeaderboard, DEMO_STUDENT_NAME } from "../../../../../../lib/preview-data/content.ts";
import { LeaderboardOptIn } from "./LeaderboardOptIn.tsx";

// UI Preview Track leaderboard (dok 12 §23A.3 "S18", kontrak tertutup).
// `total`/`twk`/`tkp` carry forward from the result page's own query so a
// learner who just finished the mock tryout sees where their OWN score
// would land - a direct visit falls back to the same representative
// example the result page uses.

export const metadata: Metadata = {
  title: "Papan Peringkat (Pratinjau) | Superlatif",
};

interface PageProps {
  readonly searchParams: Promise<{ readonly total?: string; readonly twk?: string; readonly tkp?: string }>;
}

export default async function PreviewLeaderboardPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const total = query.total ? Number(query.total) : 46;
  const twk = query.twk ? Number(query.twk) : 20;
  const tkp = query.tkp ? Number(query.tkp) : 26;

  const leaderboard = buildMockLeaderboard(total, { TWK: twk, TKP: tkp });

  return (
    <main className="slf-page">
      <h1 className="slf-section-title">Papan peringkat</h1>
      <p className="slf-empty-state__body">
        Snapshot #{leaderboard.snapshotVersion} · status {leaderboard.state}. Peringkat bersifat sementara dan
        bisa berubah sampai hasil final dirilis.
      </p>

      <LeaderboardOptIn
        rows={leaderboard.entries.map((entry) => ({
          rank: entry.rank,
          totalScore: entry.scoreSummary.total,
          displayAlias: entry.displayAlias,
          publicOptIn: entry.publicOptIn,
          percentile: entry.percentile,
          isCurrentLearner: entry.isCurrentLearner,
        }))}
        ownAlias={DEMO_STUDENT_NAME}
      />
    </main>
  );
}
