import type { Metadata } from "next";
import { EmptyState } from "@superlatif/ui";
import { PREVIEW_QUESTIONS, QUESTION_REVIEW } from "../../../../../../lib/preview-data/content.ts";
import { ReviewList, type ReviewRow } from "./ReviewList.tsx";

// Pembahasan tryout (feedback dari preview: "belum ada halaman pembahasan
// setelah tryout... sangat penting untuk Superlatif"). This page is gated
// on an "answers" query - the ONLY evidence, in this mock, that the visitor
// actually submitted this attempt (forwarded by AttemptPlayer's own submit
// step). Without it, this page shows NOTHING from QUESTION_REVIEW - no
// answer key, no explanation - matching the instruction "jangan bocorkan
// answer key sebelum result/release" even in a client-side mock with no
// real backend to enforce it server-side yet.

export const metadata: Metadata = {
  title: "Pembahasan Tryout (Pratinjau) | Superlatif",
};

interface PageProps {
  readonly params: Promise<{ readonly batchSlug: string }>;
  readonly searchParams: Promise<{
    readonly total?: string;
    readonly twk?: string;
    readonly tkp?: string;
    readonly answers?: string;
  }>;
}

function parseAnswers(raw: string | undefined): Record<string, string | null> | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    return parsed as Record<string, string | null>;
  } catch {
    return null;
  }
}

export default async function PreviewReviewPage({ params, searchParams }: PageProps) {
  const { batchSlug } = await params;
  const query = await searchParams;
  const answers = parseAnswers(query.answers);

  if (!answers) {
    return (
      <main className="slf-page">
        <h1 className="slf-section-title">Pembahasan</h1>
        <EmptyState
          title="Pembahasan belum tersedia"
          body="Pembahasan hanya tersedia setelah kamu menyelesaikan dan mengirim tryout ini - jawaban benar tidak ditampilkan sebelumnya."
          actionLabel="Mulai tryout"
          actionHref={`/preview/tryouts/${batchSlug}/attempt`}
        />
      </main>
    );
  }

  const rows: readonly ReviewRow[] = PREVIEW_QUESTIONS.map((question) => {
    const review = QUESTION_REVIEW[question.instanceId]!;
    const selectedOptionCode = answers[question.instanceId] ?? null;
    const isTwk = question.sectionCode === "TWK";

    const status =
      selectedOptionCode === null
        ? "kosong"
        : selectedOptionCode === review.bestOptionCode
          ? "benar"
          : "salah";

    const statusLabel = isTwk
      ? { benar: "Benar", salah: "Salah", kosong: "Belum dijawab" }[status]
      : { benar: "Skor tertinggi", salah: "Bukan skor tertinggi", kosong: "Belum dijawab" }[status];

    return {
      instanceId: question.instanceId,
      sequence: question.sequence,
      sectionLabel: question.sectionTitle,
      stem: question.stem,
      options: question.options,
      selectedOptionCode,
      bestOptionCode: review.bestOptionCode,
      status,
      statusLabel,
      explanation: review.explanation,
      concept: review.concept,
      mindsetTip: review.mindsetTip,
      bestOptionNote: isTwk
        ? undefined
        : 'Pada TKP, semua pilihan sah - tanda "skor tertinggi" menunjukkan pilihan dengan skor simulasi paling tinggi, bukan satu-satunya jawaban yang benar.',
    };
  });

  const leaderboardQuery = new URLSearchParams({
    total: query.total ?? "46",
    twk: query.twk ?? "20",
    tkp: query.tkp ?? "26",
  }).toString();

  return (
    <main className="slf-page">
      <h1 className="slf-section-title">Pembahasan tryout</h1>
      <p className="slf-empty-state__body">
        Pelajari setiap soal untuk memperkuat pemahamanmu - bukan cuma melihat skor.
      </p>

      <ReviewList rows={rows} />

      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <a
          className="slf-button slf-button--secondary"
          href={`/preview/tryouts/${batchSlug}/result?${leaderboardQuery}`}
        >
          Kembali ke hasil
        </a>
        <a
          className="slf-button slf-button--primary"
          href={`/preview/tryouts/${batchSlug}/leaderboard?${leaderboardQuery}`}
        >
          Lanjut ke peringkat
        </a>
      </div>
    </main>
  );
}
