import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { exam } from "@superlatif/db";
import { EmptyState, QuestionPreviewCard, StatusBadge, type StatusBadgeVariant } from "@superlatif/ui";
import { getDb } from "../../../../../lib/db.ts";
import { requireUserIdOrRedirect } from "../../../../../lib/session.ts";

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
// IDENTITY AND AUTHORIZATION - DO NOT REINTRODUCE A QUERY-STRING SEAM.
//
// This route previously took the acting admin's identity from `?userId=`
// (ADR-052's dev seam). That was P0-1 of the production readiness audit and
// the most severe instance of it: reproduced live on the deployed staging
// URL, an anonymous caller supplying any UUID holding
// `question.draft.write` received HTTP 200 with the question stem, its
// options, and the full moderation history. Identity now comes ONLY from
// the server-side session (`requireUserIdOrRedirect`).
//
// Authorization is unchanged and still decided by the EXISTING primitive:
// `buildQuestionPreview` -> `assertQuestionPermission(db, actor,
// "question.draft.write")` -> `listActiveRoleHoldings` + IDN-004's
// `authorize()`. No new RBAC framework is introduced here; the narrowest
// existing check is simply now fed a session-derived actor it cannot
// forge.
//
// NON-DISCLOSURE: an unauthorized actor and a nonexistent version now
// collapse to the SAME `notFound()`. Previously they rendered two distinct
// messages, which let an unauthorized caller probe which version ids exist
// - the same oracle `lib/attempt-access.ts` already refuses for attempts,
// applied here for the same reason.
//
// `apps/web/src/app/no-query-identity.test.ts` fails the build if a
// production route reintroduces `userId` as a search param.

export const metadata: Metadata = {
  title: "Review Soal | Superlatif Admin",
};

interface ReviewPageProps {
  readonly params: Promise<{ readonly versionId: string }>;
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

export default async function QuestionReviewPage({ params }: ReviewPageProps) {
  const { versionId } = await params;
  const userId = await requireUserIdOrRedirect();

  const db = getDb();

  let preview: Awaited<ReturnType<typeof exam.buildQuestionPreview>>;
  try {
    preview = await exam.buildQuestionPreview(db, userId, versionId);
  } catch (error) {
    // Unauthorized and nonexistent deliberately produce the SAME 404 - see
    // the NON-DISCLOSURE note in this file's module doc. A genuine
    // technical fault still renders its own distinct state below, so a real
    // outage is never disguised as "not found".
    if (
      error instanceof exam.QuestionActionNotAuthorizedError ||
      error instanceof exam.QuestionVersionNotFoundForPreviewError
    ) {
      notFound();
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
