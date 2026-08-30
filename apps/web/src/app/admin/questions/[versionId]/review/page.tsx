import type { Metadata } from "next";
import { exam } from "@superlatif/db";
import { EmptyState, QuestionPreviewCard, StatusBadge, type StatusBadgeVariant } from "@superlatif/ui";
import { getDb } from "../../../../../lib/db.ts";

// dok 12 §29 "A06" section 8 (Preview desktop/mobile) / §31 "A09 — Review
// Queue" (QST-003). A moderator must see EXACTLY what a student would see
// before approving (dok 12 A09 "Student preview di tengah") plus the full,
// never-erased review history (founder instruction "rejected revisions
// harus preserve history"). This route is READ-ONLY: it proves the preview
// and history surfaces are REAL rendered UI, not only backend functions -
// the same "prove the state is real, not just a function" precedent
// `/programs/[programCode]` (PRG-001) already set for denied/unauthorized
// states. The Approve/Request-changes ACTIONS themselves
// (`approveQuestionVersion`/`requestQuestionVersionChanges`,
// `@superlatif/db`'s `exam` namespace) are fully built and integration-
// tested (question-moderation.integration.test.ts) but not wired to a
// Server Action button here - that interactive wiring is left to a
// follow-up task, matching every prior task's "service ready, write-action
// UI deferred" shape.
//
// `?userId=` is the same development/demo auth-stub seam every prior
// server-rendered route in this app uses (see `/home`'s own module doc) -
// NOT an authorization control. Authorization is decided entirely by
// `buildQuestionPreview`'s own `assertQuestionPermission` call
// underneath - denying an unauthorized actor here is that function's
// decision surfacing as a real page, not a route-level shortcut.

export const metadata: Metadata = {
  title: "Review Soal | Superlatif Admin",
};

interface ReviewPageProps {
  readonly params: Promise<{ readonly versionId: string }>;
  readonly searchParams: Promise<{ readonly userId?: string }>;
}

const STATUS_BADGE: Record<string, { readonly variant: StatusBadgeVariant; readonly label: string }> = {
  draft: { variant: "info", label: "Draft" },
  in_review: { variant: "warning", label: "Dalam review" },
  changes_requested: { variant: "danger", label: "Perlu revisi" },
  approved: { variant: "success", label: "Disetujui" },
  published: { variant: "success", label: "Dipublikasikan" },
  archived: { variant: "info", label: "Diarsipkan" },
};

const REVIEW_ACTION_LABEL: Record<string, string> = {
  submitted_for_review: "Diajukan untuk review",
  changes_requested: "Perubahan diminta",
  approved: "Disetujui",
  published: "Dipublikasikan",
  archived: "Diarsipkan",
};

function formatTimestamp(value: Date): string {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(value);
}

export default async function QuestionReviewPage({ params, searchParams }: ReviewPageProps) {
  const { versionId } = await params;
  const { userId } = await searchParams;

  if (!userId) {
    return (
      <main className="slf-page">
        <EmptyState
          title="Belum ada sesi aktif"
          body="Halaman ini memuat preview dan riwayat review berdasarkan akun yang masuk. Autentikasi sesi/cookie belum dibangun pada task ini - tambahkan ?userId=... pada URL untuk mode pengembangan."
        />
      </main>
    );
  }

  const db = getDb();

  let preview: Awaited<ReturnType<typeof exam.buildQuestionPreview>>;
  try {
    preview = await exam.buildQuestionPreview(db, userId, versionId);
  } catch (error) {
    if (error instanceof exam.QuestionActionNotAuthorizedError) {
      return (
        <main className="slf-page">
          <EmptyState
            title="Kamu belum memiliki akses ke soal ini"
            body="Melihat preview soal memerlukan peran penulis, moderator, atau admin akademik. Hubungi admin jika menurutmu ini keliru."
          />
        </main>
      );
    }
    if (error instanceof exam.QuestionVersionNotFoundForPreviewError) {
      return (
        <main className="slf-page">
          <EmptyState
            title="Soal tidak ditemukan"
            body="Versi soal ini mungkin sudah dihapus atau ID salah."
          />
        </main>
      );
    }
    return (
      <main className="slf-page">
        <EmptyState
          title="Preview sedang tidak dapat dimuat"
          body="Terjadi kendala teknis saat memuat preview. Coba muat ulang beberapa saat lagi."
        />
        {process.env["NODE_ENV"] !== "production" ? (
          <pre className="slf-empty-state__body">
            {error instanceof Error ? error.message : String(error)}
          </pre>
        ) : null}
      </main>
    );
  }

  const version = await exam.findQuestionVersionById(db, versionId);
  const history = await exam.listQuestionVersionReviewHistory(db, versionId);
  const statusBadge = version
    ? (STATUS_BADGE[version.status] ?? { variant: "info" as const, label: version.status })
    : null;

  return (
    <main className="slf-page">
      <div>
        <h1 className="slf-section-title">
          Review · {preview.questionCode} (v{preview.version})
        </h1>
        {statusBadge ? <StatusBadge variant={statusBadge.variant} label={statusBadge.label} /> : null}
      </div>

      <div className="slf-review-page__layout">
        <QuestionPreviewCard question={preview} />

        <aside aria-label="Riwayat review">
          <h2 className="slf-section-title">Riwayat</h2>
          {history.length === 0 ? (
            <EmptyState title="Belum ada riwayat" body="Soal ini belum pernah diajukan untuk review." />
          ) : (
            <ol className="slf-review-history">
              {history.map((entry) => (
                <li key={entry.id} className="slf-review-history__item">
                  <span className="slf-review-history__action">
                    {REVIEW_ACTION_LABEL[entry.action] ?? entry.action}
                  </span>
                  <p className="slf-review-history__meta">{formatTimestamp(entry.createdAt)}</p>
                  {entry.reason ? <p className="slf-review-history__reason">{entry.reason}</p> : null}
                </li>
              ))}
            </ol>
          )}
        </aside>
      </div>
    </main>
  );
}
