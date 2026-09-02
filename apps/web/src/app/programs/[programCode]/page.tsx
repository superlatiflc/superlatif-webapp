import type { Metadata } from "next";
import { program as programService } from "@superlatif/db";
import { EmptyState } from "@superlatif/ui";
import { getDb, getEffectiveAccessCache } from "../../../lib/db.ts";
import { requireUserIdOrRedirect } from "../../../lib/session.ts";

// IDENTITY RESOLUTION - DO NOT REINTRODUCE A QUERY-STRING SEAM. The acting
// user comes ONLY from the server-side session cookie
// (`requireUserIdOrRedirect`, lib/session.ts). The `?userId=` dev seam this
// route carried from ADR-052 was removed as P0-1 of the production
// readiness audit: it let an anonymous caller evaluate program access as
// any user whose UUID they knew. `assertProgramAccess` below is unchanged
// and still the only thing that DECIDES access - the fix is that it can no
// longer be handed a forged identity to decide about.
//
// `apps/web/src/app/no-query-identity.test.ts` fails the build if a
// production route reintroduces `userId` as a search param.
//
// Minimal program-access confirmation stub (PRG-001). This is NOT the
// Program Hub dok 07 §6 specifies (Roadmap/Jadwal/Tryout/Materi/Komunitas/
// Progres tabs) - "Jangan bangun seluruh LMS dulu" (founder instruction),
// and every one of those tabs needs schema this task does not own
// (PRG-002 roadmap, SCH-001 schedule, EXM-002 batches, LRN resources, a
// future community task). Its purpose is narrower and concrete: prove the
// "denied/unauthorized" state is a REAL rendered UI outcome, not only a
// backend function - `assertProgramAccess` (ENT-002 + IDN-004 composed,
// no new access rule) decides it, and this page is what a student
// actually sees when they follow a home-page link or type a program URL
// directly ("Navigasi tidak boleh menjadi satu-satunya kontrol
// keamanan," dok 07 §12). See ADR-052.

export const metadata: Metadata = {
  title: "Program | Superlatif",
};

interface ProgramPageProps {
  readonly params: Promise<{ readonly programCode: string }>;
}

const DENIAL_COPY: Record<string, { readonly title: string; readonly body: string }> = {
  ENTITLEMENT_DENIED: {
    title: "Program ini belum termasuk dalam aksesmu",
    body: "Program ini tidak termasuk dalam produk yang kamu miliki saat ini. Jelajahi katalog untuk melihat program yang sesuai.",
  },
  OBJECT_SCOPE_DENIED: {
    title: "Program ini belum termasuk dalam aksesmu",
    body: "Kamu belum memiliki akses ke program ini. Jelajahi katalog untuk melihat program yang sesuai.",
  },
};

export default async function ProgramPage({ params }: ProgramPageProps) {
  const { programCode } = await params;
  const userId = await requireUserIdOrRedirect();

  let decision: Awaited<ReturnType<typeof programService.assertProgramAccess>>;
  try {
    const db = getDb();
    const cache = getEffectiveAccessCache();
    decision = await programService.assertProgramAccess(db, cache, userId, programCode, new Date());
  } catch (error) {
    return (
      <main className="slf-page">
        <EmptyState
          title="Program sedang tidak dapat dimuat"
          body="Terjadi kendala teknis saat memeriksa akses. Progres dan aksesmu tetap aman; coba muat ulang beberapa saat lagi."
        />
        {process.env["NODE_ENV"] !== "production" ? (
          <pre className="slf-empty-state__body">
            {error instanceof Error ? error.message : String(error)}
          </pre>
        ) : null}
      </main>
    );
  }

  if (!decision.allowed) {
    const copy = DENIAL_COPY[decision.reasonCode] ?? {
      title: "Program ini belum termasuk dalam aksesmu",
      body: "Hubungi bantuan jika menurutmu ini keliru.",
    };
    return (
      <main className="slf-page">
        <EmptyState title={copy.title} body={copy.body} />
        <a className="slf-button slf-button--secondary" href="/home">
          Kembali ke Beranda
        </a>
      </main>
    );
  }

  return (
    <main className="slf-page">
      <h1 className="slf-section-title">Program {programCode}</h1>
      <p className="slf-greeting">
        Kamu memiliki akses ke program ini. Roadmap, jadwal, dan materi akan tersedia di sini pada task
        berikutnya.
      </p>
      <a className="slf-button slf-button--secondary" href="/home">
        Kembali ke Beranda
      </a>
    </main>
  );
}
