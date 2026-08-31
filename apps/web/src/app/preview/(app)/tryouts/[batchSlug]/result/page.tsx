import type { Metadata } from "next";
import { ResultScoreCard } from "@superlatif/ui";
import { buildMockResult, SECTION_MAX_SCORES } from "../../../../../../lib/preview-data/content.ts";

// UI Preview Track result page (dok 12 §12 "S11/S12"). `total`/`twk`/`tkp`
// arrive via query string from the attempt player's own submit step - a
// direct visit (no query) falls back to a representative example so the
// page never looks broken on its own. `targetLabel` is always shown
// alongside pass/fail (CLAUDE.md: never a bare number against an
// unofficial threshold) - see ResultScoreCard's own module doc.

export const metadata: Metadata = {
  title: "Hasil Tryout (Pratinjau) | Superlatif",
};

interface PageProps {
  readonly params: Promise<{ readonly batchSlug: string }>;
  readonly searchParams: Promise<{ readonly total?: string; readonly twk?: string; readonly tkp?: string }>;
}

export default async function PreviewResultPage({ params, searchParams }: PageProps) {
  const { batchSlug } = await params;
  const query = await searchParams;
  const total = query.total ? Number(query.total) : 46;
  const twk = query.twk ? Number(query.twk) : 20;
  const tkp = query.tkp ? Number(query.tkp) : 26;

  const result = buildMockResult(total, { TWK: twk, TKP: tkp });

  return (
    <main className="slf-page">
      <h1 className="slf-section-title">Hasil tryout</h1>
      <p className="slf-empty-state__body">
        Skor di bawah ini simulasi untuk latihan, bukan skor resmi SKD. Gunakan untuk memantau progres
        belajarmu.
      </p>

      <ResultScoreCard
        state={result.state}
        totalScore={result.scoreSummary!.total}
        sections={[
          {
            sectionCode: "TWK",
            sectionTitle: "Tes Wawasan Kebangsaan",
            score: twk,
            maxScore: SECTION_MAX_SCORES["TWK"]!,
          },
          {
            sectionCode: "TKP",
            sectionTitle: "Tes Karakteristik Pribadi",
            score: tkp,
            maxScore: SECTION_MAX_SCORES["TKP"]!,
          },
        ]}
        overallPassed={result.scoreSummary!.overallPassed}
        targetLabel="Target belajar Superlatif"
        releasedAtLabel="beberapa saat lalu"
      />

      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <a className="slf-button slf-button--secondary" href={`/preview/tryouts/${batchSlug}`}>
          Lihat detail tryout
        </a>
        <a
          className="slf-button slf-button--primary"
          href={`/preview/tryouts/${batchSlug}/leaderboard?total=${total}&twk=${twk}&tkp=${tkp}`}
        >
          Lihat peringkat
        </a>
      </div>
    </main>
  );
}
