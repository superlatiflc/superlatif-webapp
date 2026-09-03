import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { exam } from "@superlatif/db";
import { getDb } from "../../../../lib/db.ts";
import { requireUserIdOrRedirect } from "../../../../lib/session.ts";
import { notFoundOnAttemptAccessError, parseAttemptId } from "../../../../lib/attempt-access.ts";
import { readLeaseToken } from "../../../../lib/attempt-lease.ts";
import { submitAttemptAction } from "../../actions.ts";

export const metadata: Metadata = {
  title: "Kirim Jawaban | Superlatif",
};

// Submit confirmation. Every number shown is read fresh from the server's
// own attempt view - the count of answered questions is derived from
// `answer_states`, not from anything the browser reports.
//
// `expectedAttemptRevision` is likewise taken from the SERVER's current
// view, not echoed from the client: `assertSubmitRevisionCurrent`
// (ATM-003) uses it to refuse a submit that races an in-flight answer
// save, and letting a browser choose that value would defeat the check.

interface PageProps {
  readonly params: Promise<{ readonly attemptId: string }>;
  readonly searchParams: Promise<{ readonly error?: string }>;
}

const SUBMIT_ERROR_COPY: Record<string, string> = {
  lease_lost:
    "Tryout ini sedang terbuka di perangkat atau tab lain, jadi pengiriman dihentikan. Buka kembali halaman soal untuk melanjutkan di perangkat ini.",
  not_submittable:
    "Ada jawaban yang baru saja berubah, atau tryout ini sudah dikirim sebelumnya. Muat ulang halaman untuk melihat kondisi terbaru.",
  // Jawaban aman: throttling terjadi sebelum pengiriman diproses, dan
  // pengiriman tetap idempoten saat dicoba lagi (P0-3).
  rate_limited: "Permintaan terlalu cepat. Coba lagi beberapa saat. Jawabanmu tetap tersimpan.",
  // P0-2. Safe to say answers remain saved here: the guard runs before
  // submitAttempt, so the attempt is untouched and every previously saved
  // answer is still committed. It does NOT claim the submission succeeded.
  writes_disabled:
    "Pengiriman sedang dihentikan sementara untuk pemeliharaan. Jawabanmu tetap tersimpan dan tryout ini belum dikirim. Coba lagi beberapa saat.",
  feature_disabled:
    "Pengiriman tryout sedang tidak tersedia. Jawabanmu tetap tersimpan dan tryout ini belum dikirim. Hubungi tim dukungan jika ini berlanjut.",
};

export default async function SubmitPage({ params, searchParams }: PageProps) {
  const userId = await requireUserIdOrRedirect();
  const { attemptId } = await params;
  parseAttemptId(attemptId);
  const { error } = await searchParams;

  const view = await exam
    .getAttemptResumeView(getDb(), userId, attemptId, await readLeaseToken(attemptId), new Date())
    .catch(notFoundOnAttemptAccessError);

  if (view.status !== "in_progress" && view.status !== "created") {
    redirect(`/attempts/${attemptId}/result`);
  }

  const answered = view.answers.filter(
    (answer) => answer.payload !== null && answer.payload.kind === "single_choice",
  ).length;
  const total = view.instances.length;
  const unanswered = total - answered;

  return (
    <main className="slf-page">
      <h1 className="slf-section-title">Kirim jawaban</h1>

      {error && SUBMIT_ERROR_COPY[error] ? (
        <p className="slf-empty-state__body" role="alert">
          {SUBMIT_ERROR_COPY[error]}
        </p>
      ) : null}

      <p className="slf-empty-state__body">
        {answered} dari {total} soal sudah dijawab
        {unanswered > 0 ? `, ${unanswered} soal masih kosong` : ""}. Setelah dikirim, jawaban tidak bisa
        diubah lagi.
      </p>

      <div className="slf-player-footer">
        <a className="slf-button slf-button--secondary" href={`/attempts/${attemptId}`}>
          Kembali ke soal
        </a>
        <form action={submitAttemptAction}>
          <input type="hidden" name="attemptId" value={attemptId} />
          <input type="hidden" name="expectedAttemptRevision" value={view.attemptRevision} />
          <button type="submit" className="slf-button slf-button--primary">
            Kirim jawaban
          </button>
        </form>
      </div>
    </main>
  );
}
