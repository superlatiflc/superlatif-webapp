import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { EmptyState, StatusBadge } from "@superlatif/ui";
import { exam } from "@superlatif/db";
import { getDb } from "../../../lib/db.ts";
import { getSessionUserId } from "../../../lib/session.ts";
import { startAttemptAction } from "../../attempts/actions.ts";
import type { AttemptStartDenialCode } from "../../../lib/attempt-start-error.ts";

export const metadata: Metadata = {
  title: "Mulai Tryout | Superlatif",
};

// Batch detail + start CTA. The batch's operational state is SERVER-DERIVED
// on every render (`getExamBatchState`, EXM-002) - never a stored mutable
// status - so a learner opening this page one second after the attempt
// window closes sees the closed state, not a cached open one.
//
// Access itself is NOT decided here: `startOrResumeAttempt` runs the real
// ENT-002 effective-access + attempt-allowance check server-side when the
// form is submitted. This page only decides what to RENDER, and menu
// visibility is never treated as authorization.
//
// `?error=`/`?reason=`: startAttemptAction redirects back here with these
// when the domain refuses to start an attempt for one of three EXPECTED
// reasons (classifyStartAttemptError) - never for a genuine server error,
// which still surfaces as a real error page unchanged. `reason` (only ever
// set for `error=denied`) is `EffectiveAccessDecision.studentReason`,
// already documented safe-to-show verbatim; the other two codes have no
// such pre-vetted string, so their copy lives here instead.

const DENIAL_COPY: Record<AttemptStartDenialCode, string> = {
  denied: "Kamu belum memiliki akses ke tryout ini.",
  window_closed: "Tryout ini sedang tidak dalam periode pengerjaan.",
  limit_reached: "Kamu sudah menggunakan seluruh kesempatan mengerjakan tryout ini.",
};

function isDenialCode(value: string): value is AttemptStartDenialCode {
  return value === "denied" || value === "window_closed" || value === "limit_reached";
}

interface PageProps {
  readonly params: Promise<{ readonly batchCode: string }>;
  readonly searchParams: Promise<{ readonly error?: string; readonly reason?: string }>;
}

export default async function TryoutStartPage({ params, searchParams }: PageProps) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/signin");

  const { batchCode } = await params;
  const { error, reason } = await searchParams;
  const db = getDb();
  const batch = await exam.findExamBatchByCode(db, decodeURIComponent(batchCode));
  if (!batch) notFound();

  const state = await exam.getExamBatchState(db, batch.id, new Date());
  const canStart = state === "exam_open";

  const denialMessage = error && isDenialCode(error) ? (reason ?? DENIAL_COPY[error]) : null;

  return (
    <main className="slf-page">
      <h1 className="slf-section-title">{batch.title}</h1>
      <StatusBadge
        variant={canStart ? "success" : "info"}
        label={canStart ? "Bisa dikerjakan" : "Belum bisa dikerjakan"}
      />

      {denialMessage ? (
        <div role="alert">
          <p className="slf-empty-state__body">{denialMessage}</p>
          <a className="slf-button slf-button--secondary" href="/tryouts">
            Kembali ke Tryout
          </a>
        </div>
      ) : null}

      {canStart ? (
        <>
          <p className="slf-empty-state__body">
            Waktu pengerjaan dihitung oleh server dan tidak berhenti saat kamu berpindah tab atau memuat ulang
            halaman. Jawabanmu tersimpan otomatis setiap kali kamu memilih.
          </p>
          <form action={startAttemptAction}>
            <input type="hidden" name="batchCode" value={batch.code} />
            <button type="submit" className="slf-button slf-button--primary">
              Mulai tryout
            </button>
          </form>
        </>
      ) : !denialMessage ? (
        <EmptyState
          title="Tryout belum dibuka"
          body="Tryout ini sedang tidak dalam periode pengerjaan. Cek kembali sesuai jadwal yang diberikan pengajarmu."
        />
      ) : null}
    </main>
  );
}
