import type { Metadata } from "next";
import { program as programService } from "@superlatif/db";
import { EmptyState, NextActionCard, ProgramCard } from "@superlatif/ui";
import { getDb, getEffectiveAccessCache } from "../../lib/db.ts";
import { requireUserIdOrRedirect } from "../../lib/session.ts";

// dok 07 §4 "Struktur Beranda" / dok 09 §8.1. Server Component: the view
// model is built once, server-side, from @superlatif/db/program's
// buildHomeViewModel (ENT-002 resolver + IDN-004 authorize() underneath -
// this route invents no access rule of its own).
//
// IDENTITY RESOLUTION - DO NOT REINTRODUCE A QUERY-STRING SEAM. The acting
// user comes ONLY from the server-side session cookie
// (`requireUserIdOrRedirect`, lib/session.ts). The `?userId=` dev seam this
// route carried from ADR-052 was removed as P0-1 of the production
// readiness audit: it was an authentication bypass, not merely a stub -
// an anonymous request with `?userId=<victim>` rendered that victim's
// dashboard, reproduced live on the deployed staging URL. Authorization
// was never the broken part (buildHomeViewModel/assertProgramAccess decide
// correctly); the app was faithfully authorizing a CLAIMED identity, and
// user UUIDs are not secrets. Identity must come from a credential the
// caller cannot forge - here, the session cookie whose secret is stored
// only as a hash server-side (IDN-001).
//
// `apps/web/src/app/no-query-identity.test.ts` fails the build if a
// production route reintroduces `userId` as a search param.

export const metadata: Metadata = {
  title: "Beranda | Superlatif",
};

export default async function HomePage() {
  const userId = await requireUserIdOrRedirect();

  let model: Awaited<ReturnType<typeof programService.buildHomeViewModel>>;
  try {
    const db = getDb();
    const cache = getEffectiveAccessCache();
    model = await programService.buildHomeViewModel(db, cache, userId, new Date());
  } catch (error) {
    return (
      <main className="slf-page">
        <EmptyState
          title="Beranda sedang tidak dapat dimuat"
          body="Terjadi kendala teknis saat mengambil data program. Progres dan aksesmu tetap aman; coba muat ulang beberapa saat lagi."
        />
        {process.env["NODE_ENV"] !== "production" ? (
          <pre className="slf-empty-state__body" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {error instanceof Error ? error.message : String(error)}
          </pre>
        ) : null}
      </main>
    );
  }

  if (model.status === "no_program") {
    return (
      <main className="slf-page">
        <p className="slf-greeting">Selamat datang kembali.</p>
        <EmptyState
          title="Belum ada program yang aktif"
          body="Program membantumu belajar dengan roadmap, jadwal, dan tryout dalam satu tempat terstruktur. Katalog program akan tersedia di sini pada task berikutnya."
        />
      </main>
    );
  }

  const primary = model.primaryProgram!;

  return (
    <main className="slf-page">
      <p className="slf-greeting">Selamat datang kembali.</p>

      <section aria-labelledby="primary-program-heading">
        <h2 id="primary-program-heading" className="slf-section-title">
          Program utama
        </h2>
        <ProgramCard
          name={primary.name}
          statusLabel="Aktif"
          statusVariant="success"
          isPrimary
          href={`/programs/${primary.code}`}
          primaryActionLabel="Lanjutkan belajar"
        />
      </section>

      <section aria-labelledby="next-action-heading">
        <h2 id="next-action-heading" className="slf-section-title">
          Aktivitas berikutnya
        </h2>
        {model.nextAction ? (
          <NextActionCard
            title={model.nextAction.candidate.title}
            programName={primary.name}
            reasonText={reasonCodeCopy[model.nextAction.reasonCode] ?? model.nextAction.reasonCode}
            primaryActionLabel="Lanjutkan"
            href={`/programs/${primary.code}`}
          />
        ) : (
          <EmptyState
            title="Program siap"
            body="Jadwal atau materi akan segera diperbarui untuk program ini."
            actionLabel="Lihat program"
            actionHref={`/programs/${primary.code}`}
          />
        )}
      </section>

      {model.otherPrograms.length > 0 ? (
        <section aria-labelledby="other-programs-heading">
          <h2 id="other-programs-heading" className="slf-section-title">
            Program lain yang dimiliki
          </h2>
          <div className="slf-program-grid">
            {model.otherPrograms.map((otherProgram) => (
              <ProgramCard
                key={otherProgram.id}
                name={otherProgram.name}
                statusLabel="Aktif"
                statusVariant="success"
                href={`/programs/${otherProgram.code}`}
                primaryActionLabel="Buka program"
              />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}

const reasonCodeCopy: Record<string, string> = {
  LIVE_NOW: "Kelas sedang berlangsung sekarang.",
  DEADLINE_SOON: "Tenggat kurang dari 24 jam.",
  RESUME_IN_PROGRESS: "Lanjutkan yang sudah kamu mulai.",
  REQUIRED_WITHIN_24H: "Wajib dimulai dalam 24 jam.",
  ROADMAP_NEXT: "Langkah berikutnya sesuai roadmap.",
  RESULT_REMEDIATION: "Perbaikan berdasarkan hasil terakhir.",
  OPTIONAL_RECOMMENDATION: "Rekomendasi tambahan, tidak wajib.",
};
