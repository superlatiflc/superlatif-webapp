import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { EmptyState, StatusBadge } from "@superlatif/ui";
import { exam } from "@superlatif/db";
import { getDb } from "../../../lib/db.ts";
import { getSessionUserId } from "../../../lib/session.ts";
import { startAttemptAction } from "../../attempts/actions.ts";

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

interface PageProps {
  readonly params: Promise<{ readonly batchCode: string }>;
}

export default async function TryoutStartPage({ params }: PageProps) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/signin");

  const { batchCode } = await params;
  const db = getDb();
  const batch = await exam.findExamBatchByCode(db, decodeURIComponent(batchCode));
  if (!batch) notFound();

  const state = await exam.getExamBatchState(db, batch.id, new Date());
  const canStart = state === "exam_open";

  return (
    <main className="slf-page">
      <h1 className="slf-section-title">{batch.title}</h1>
      <StatusBadge
        variant={canStart ? "success" : "info"}
        label={canStart ? "Bisa dikerjakan" : "Belum bisa dikerjakan"}
      />

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
      ) : (
        <EmptyState
          title="Tryout belum dibuka"
          body="Tryout ini sedang tidak dalam periode pengerjaan. Cek kembali sesuai jadwal yang diberikan pengajarmu."
        />
      )}
    </main>
  );
}
