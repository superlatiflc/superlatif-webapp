import type { Metadata } from "next";
import { NextActionCard, ProgramCard } from "@superlatif/ui";
import { DEMO_BATCH_SLUG, DEMO_BATCH_TITLE, DEMO_PROGRAM_NAME } from "../../../../lib/preview-data/index.ts";

// UI Preview Track dashboard - visually the SAME components as the real
// /home (dok 07 §4 / dok 09 §8.1: Program utama, Aktivitas berikutnya,
// Program lain), fed a mock view-model that mirrors buildHomeViewModel's
// own shape (packages/db/src/program/home-view-service.ts) instead of a
// live database call.

export const metadata: Metadata = {
  title: "Dashboard (Pratinjau) | Superlatif",
};

export default function PreviewDashboardPage() {
  return (
    <main className="slf-page">
      <section aria-labelledby="primary-program-heading">
        <h2 id="primary-program-heading" className="slf-section-title">
          Program utama
        </h2>
        <ProgramCard
          name={DEMO_PROGRAM_NAME}
          statusLabel="Aktif"
          statusVariant="success"
          isPrimary
          href="/preview/tryouts"
          primaryActionLabel="Lanjutkan belajar"
        />
      </section>

      <section aria-labelledby="next-action-heading">
        <h2 id="next-action-heading" className="slf-section-title">
          Aktivitas berikutnya
        </h2>
        <NextActionCard
          title={DEMO_BATCH_TITLE}
          programName={DEMO_PROGRAM_NAME}
          reasonText="Tryout ini bisa kamu kerjakan sekarang."
          primaryActionLabel="Buka tryout"
          href={`/preview/tryouts/${DEMO_BATCH_SLUG}`}
        />
      </section>
    </main>
  );
}
