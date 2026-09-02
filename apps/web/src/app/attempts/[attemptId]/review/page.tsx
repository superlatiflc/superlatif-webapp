import type { Metadata } from "next";
import { EmptyState, QuestionReviewCard, type QuestionReviewStatus } from "@superlatif/ui";
import { exam } from "@superlatif/db";
import type { AnswerReview } from "@superlatif/domain/exam";
import { getDb } from "../../../../lib/db.ts";
import { requireUserIdOrRedirect } from "../../../../lib/session.ts";
import { notFoundOnAttemptAccessError, parseAttemptId } from "../../../../lib/attempt-access.ts";
import { extractText } from "../../../../lib/rich-text.ts";

export const metadata: Metadata = {
  title: "Pembahasan Tryout | Superlatif",
};

// Production review/pembahasan page.
//
// Everything comes from `getAttemptReviewView` (this slice's one new db
// service), which enforces ownership first and the `review_open` release
// gate second, and reads NO answer key or explanation until both pass. The
// browser supplies nothing but `attemptId` - no answers, no score, no
// submission state.
//
// TKP HONESTY: a `weighted_choice` question has no correct answer, so its
// wording here is about SCORE, never correctness - "Skor tertinggi" /
// "Bukan skor tertinggi", plus the learner's own option weight against the
// maximum. Only `single_choice` gets Benar/Salah. This mirrors what the
// scorer itself actually computes (`gradeAnswer` returns a weight for TKP
// and a boolean only for TWK) rather than flattening both into a binary.

interface PageProps {
  readonly params: Promise<{ readonly attemptId: string }>;
}

function statusOf(review: AnswerReview): QuestionReviewStatus {
  if (review.kind === "binary") {
    return review.status === "correct" ? "benar" : review.status === "incorrect" ? "salah" : "kosong";
  }
  return review.status === "best" ? "benar" : review.status === "not_best" ? "salah" : "kosong";
}

function labelOf(review: AnswerReview): string {
  if (review.kind === "binary") {
    return review.status === "correct" ? "Benar" : review.status === "incorrect" ? "Salah" : "Belum dijawab";
  }
  if (review.status === "blank") return "Belum dijawab";
  return review.status === "best" ? "Skor tertinggi" : "Bukan skor tertinggi";
}

/** The honest TKP footnote: real weights, and an explicit statement that no option is "wrong". */
function weightedNote(review: AnswerReview): string | undefined {
  if (review.kind !== "weighted") return undefined;
  const own =
    review.selectedWeight === null
      ? "Kamu belum menjawab soal ini."
      : `Skor pilihanmu ${review.selectedWeight} dari skor maksimum ${review.maxWeight}.`;
  return `${own} Pada TKP semua pilihan sah dan bernilai - tidak ada jawaban yang "salah", yang membedakan hanya besar skornya.`;
}

export default async function ReviewPage({ params }: PageProps) {
  const userId = await requireUserIdOrRedirect();
  const { attemptId } = await params;
  parseAttemptId(attemptId);

  const view = await exam
    .getAttemptReviewView(getDb(), userId, attemptId, new Date())
    .catch(notFoundOnAttemptAccessError);

  if (!view.available) {
    return (
      <main className="slf-page">
        <h1 className="slf-section-title">Pembahasan</h1>
        <EmptyState
          title="Pembahasan belum dibuka"
          body="Pembahasan dan kunci jawaban baru tersedia setelah jadwal rilis pembahasan tryout ini. Hasil skormu tetap bisa dilihat lebih dulu."
          actionLabel="Lihat hasil"
          actionHref={`/attempts/${attemptId}/result`}
        />
      </main>
    );
  }

  return (
    <main className="slf-page">
      <h1 className="slf-section-title">Pembahasan tryout</h1>
      <p className="slf-empty-state__body">
        Pelajari setiap soal untuk memperkuat pemahamanmu - bukan cuma melihat skor.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {view.items.map((item) => {
          const bestOptionCode =
            item.review.kind === "binary"
              ? item.review.correctOptionCode
              : (item.review.bestOptionCodes[0] ?? "");
          const note = weightedNote(item.review);
          return (
            <QuestionReviewCard
              key={item.instanceId}
              sectionLabel={item.sectionCode}
              sequence={item.sequence}
              totalQuestions={view.items.length}
              stem={extractText(item.content.stemDocument) ?? "(Soal ini belum dapat ditampilkan.)"}
              options={item.content.options.map((option) => ({
                optionCode: option.optionCode,
                text: extractText(option.content) ?? option.optionCode,
              }))}
              selectedOptionCode={item.review.selectedOptionCode}
              bestOptionCode={bestOptionCode}
              status={statusOf(item.review)}
              statusLabel={labelOf(item.review)}
              explanation={
                extractText(item.explanationDocument) ?? "Pembahasan untuk soal ini belum tersedia."
              }
              concept={item.sectionCode}
              mindsetTip="Tinjau kembali soal yang belum kamu kuasai, lalu catat pola kesalahannya - itu yang membuat latihan berikutnya lebih efektif."
              {...(note ? { bestOptionNote: note } : {})}
            />
          );
        })}
      </div>

      <a className="slf-button slf-button--secondary" href={`/attempts/${attemptId}/result`}>
        Kembali ke hasil
      </a>
    </main>
  );
}
