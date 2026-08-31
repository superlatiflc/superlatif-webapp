import type { Metadata } from "next";
import { EmptyState, StatusBadge } from "@superlatif/ui";
import { notFound } from "next/navigation";
import {
  DEMO_BATCH_SLUG,
  PREVIEW_BATCH_DETAIL,
  PREVIEW_BATCH_SUMMARIES,
} from "../../../../../lib/preview-data/index.ts";

// UI Preview Track batch detail + instructions (dok 12 §11 "E01"). Only
// the demo batch has a fully modeled detail/section breakdown in this
// preview build - the other two mock batches (upcoming/completed) still
// resolve here so the tryout list's links all work, but show a lighter
// summary-only view with an honest note about the limitation.

interface PageProps {
  readonly params: Promise<{ readonly batchSlug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { batchSlug } = await params;
  const summary = PREVIEW_BATCH_SUMMARIES.find((batch) => batch.batchSlug === batchSlug);
  return { title: summary ? `${summary.title} | Superlatif` : "Tryout | Superlatif" };
}

export default async function PreviewBatchDetailPage({ params }: PageProps) {
  const { batchSlug } = await params;
  const summary = PREVIEW_BATCH_SUMMARIES.find((batch) => batch.batchSlug === batchSlug);

  if (!summary) {
    notFound();
  }

  const isDemoBatch = batchSlug === DEMO_BATCH_SLUG;
  const canStart = summary.statusGroup === "available" || summary.statusGroup === "in_progress";
  const isCompleted = summary.statusGroup === "completed";

  return (
    <main className="slf-page">
      <p className="slf-batch-card__family">{summary.examFamilyLabel}</p>
      <h1 className="slf-section-title">{summary.title}</h1>

      <dl className="slf-batch-card__meta" style={{ maxWidth: "32rem" }}>
        <div>
          <dt>Periode</dt>
          <dd>{summary.attemptWindowLabel}</dd>
        </div>
        <div>
          <dt>Durasi</dt>
          <dd>{summary.durationLabel}</dd>
        </div>
        <div>
          <dt>Percobaan</dt>
          <dd>
            {summary.attemptsUsed}/{summary.attemptsAllowed}
          </dd>
        </div>
        <div>
          <dt>Hasil</dt>
          <dd>{summary.resultReleaseLabel}</dd>
        </div>
      </dl>

      {isDemoBatch ? (
        <>
          <section aria-labelledby="sections-heading">
            <h2 id="sections-heading" className="slf-section-title">
              Subtes
            </h2>
            <ul>
              {PREVIEW_BATCH_DETAIL.sections.map((section) => (
                <li key={section.code}>
                  <strong>{section.title}</strong> — {section.questionCount} soal, {section.durationLabel}
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="policy-heading">
            <h2 id="policy-heading" className="slf-section-title">
              Kebijakan
            </h2>
            <p className="slf-empty-state__body">{PREVIEW_BATCH_DETAIL.navigationPolicyLabel}</p>
            <p className="slf-empty-state__body">{PREVIEW_BATCH_DETAIL.scoringPolicyLabel}</p>
            <p className="slf-empty-state__body">{PREVIEW_BATCH_DETAIL.integrityNotice}</p>
            <p className="slf-empty-state__body">{PREVIEW_BATCH_DETAIL.deviceNotice}</p>
          </section>
        </>
      ) : (
        <EmptyState
          title="Detail lengkap belum tersedia di pratinjau ini"
          body="Build pratinjau ini hanya memodelkan pengalaman lengkap untuk satu tryout demo. Batch lain ditampilkan agar alur daftar tetap terasa nyata."
        />
      )}

      {canStart ? (
        <a className="slf-button slf-button--primary" href={`/preview/tryouts/${batchSlug}/attempt`}>
          Mulai tryout
        </a>
      ) : isCompleted ? (
        <a className="slf-button slf-button--primary" href={`/preview/tryouts/${batchSlug}/result`}>
          Lihat hasil
        </a>
      ) : (
        <StatusBadge variant="info" label="Belum dibuka" />
      )}
    </main>
  );
}
