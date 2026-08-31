import type { Metadata } from "next";
import { BatchCard, type StatusBadgeVariant } from "@superlatif/ui";
import { PREVIEW_BATCH_SUMMARIES, type BatchStatusGroup } from "../../../../lib/preview-data/index.ts";

// UI Preview Track tryout list (dok 12 §10 "S07 - Tab Tryout"): batches
// grouped by status, matching the screen spec's own grouping order.

export const metadata: Metadata = {
  title: "Tryout (Pratinjau) | Superlatif",
};

const GROUP_ORDER: readonly BatchStatusGroup[] = [
  "in_progress",
  "available",
  "upcoming",
  "awaiting_result",
  "completed",
];

const GROUP_LABEL: Record<BatchStatusGroup, string> = {
  in_progress: "Sedang berlangsung",
  available: "Bisa dikerjakan",
  upcoming: "Akan datang",
  awaiting_result: "Menunggu hasil",
  completed: "Selesai",
};

const GROUP_BADGE: Record<
  BatchStatusGroup,
  { readonly label: string; readonly variant: StatusBadgeVariant }
> = {
  in_progress: { label: "Berlangsung", variant: "warning" },
  available: { label: "Bisa dikerjakan", variant: "success" },
  upcoming: { label: "Akan datang", variant: "info" },
  awaiting_result: { label: "Menunggu hasil", variant: "info" },
  completed: { label: "Selesai", variant: "success" },
};

export default function PreviewTryoutListPage() {
  const groups = GROUP_ORDER.map((group) => ({
    group,
    batches: PREVIEW_BATCH_SUMMARIES.filter((batch) => batch.statusGroup === group),
  })).filter((entry) => entry.batches.length > 0);

  return (
    <main className="slf-page">
      <h1 className="slf-section-title">Tryout</h1>

      {groups.map(({ group, batches }) => (
        <section key={group} aria-labelledby={`group-${group}-heading`}>
          <h2 id={`group-${group}-heading`} className="slf-section-title">
            {GROUP_LABEL[group]}
          </h2>
          <div className="slf-program-grid">
            {batches.map((batch) => (
              <BatchCard
                key={batch.batchSlug}
                title={batch.title}
                examFamilyLabel={batch.examFamilyLabel}
                statusLabel={GROUP_BADGE[batch.statusGroup].label}
                statusVariant={GROUP_BADGE[batch.statusGroup].variant}
                attemptWindowLabel={batch.attemptWindowLabel}
                durationLabel={batch.durationLabel}
                attemptsUsed={batch.attemptsUsed}
                attemptsAllowed={batch.attemptsAllowed}
                resultReleaseLabel={batch.resultReleaseLabel}
                href={`/preview/tryouts/${batch.batchSlug}`}
                primaryActionLabel="Lihat detail"
              />
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
