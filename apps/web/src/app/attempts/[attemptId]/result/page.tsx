import type { Metadata } from "next";
import { EmptyState, ResultScoreCard, type ResultSectionScore } from "@superlatif/ui";
import { exam } from "@superlatif/db";
import { getDb } from "../../../../lib/db.ts";
import { requireUserIdOrRedirect } from "../../../../lib/session.ts";
import { notFoundOnAttemptAccessError } from "../../../../lib/attempt-access.ts";

export const metadata: Metadata = {
  title: "Hasil Tryout | Superlatif",
};

// Production result page.
//
// The ONLY input is `attemptId` from the path. No score, section score,
// answer, or ranking is read from the query string - `getStudentResultView`
// (SCR-002) resolves everything from `result_versions`, and re-derives the
// batch's release state FRESH on every call, so an unreleased result stays
// invisible even if a row already exists for it.
//
// Ownership is enforced inside that same function (`ResultNotOwnedError`)
// before any score is loaded, so swapping the attempt id in the URL for
// someone else's cannot reveal their score.

interface PageProps {
  readonly params: Promise<{ readonly attemptId: string }>;
}

function toSections(scoreSummary: Record<string, unknown>): readonly ResultSectionScore[] {
  const sectionScores = (scoreSummary["sectionScores"] ?? {}) as Record<string, number>;
  const sectionMaxScores = (scoreSummary["sectionMaxScores"] ?? {}) as Record<string, number>;
  return Object.keys(sectionScores).map((sectionCode) => ({
    sectionCode,
    sectionTitle: sectionCode,
    score: sectionScores[sectionCode] ?? 0,
    maxScore: sectionMaxScores[sectionCode] ?? 0,
  }));
}

export default async function ResultPage({ params }: PageProps) {
  const userId = await requireUserIdOrRedirect();
  const { attemptId } = await params;

  const view = await exam
    .getStudentResultView(getDb(), userId, attemptId, new Date())
    .catch(notFoundOnAttemptAccessError);

  if (!view.scoreSummary) {
    return (
      <main className="slf-page">
        <h1 className="slf-section-title">Hasil tryout</h1>
        <EmptyState
          title="Hasil belum tersedia"
          body="Jawabanmu sudah tersimpan dengan aman. Hasil akan muncul di sini setelah proses penilaian dan jadwal rilis selesai."
        />
      </main>
    );
  }

  const summary = view.scoreSummary;

  return (
    <main className="slf-page">
      <h1 className="slf-section-title">Hasil tryout</h1>
      <p className="slf-empty-state__body">
        Skor ini dihitung oleh server dari jawaban yang tersimpan, dan merupakan simulasi untuk latihan -
        bukan skor resmi SKD.
      </p>

      <ResultScoreCard
        state={view.state}
        totalScore={Number(summary["total"] ?? 0)}
        sections={toSections(summary)}
        overallPassed={(summary["overallPassed"] as boolean | null) ?? null}
        targetLabel="Target belajar Superlatif"
        releasedAtLabel={view.releasedAt ? view.releasedAt.toISOString().slice(0, 10) : null}
      />

      <a className="slf-button slf-button--primary" href={`/attempts/${attemptId}/review`}>
        Lihat Pembahasan
      </a>
    </main>
  );
}
