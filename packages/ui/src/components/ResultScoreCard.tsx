import { StatusBadge, type StatusBadgeVariant } from "./StatusBadge.tsx";

// dok 12 §12 "S11/S12 — Hasil & Progres" Detail hasil: "Status: provisional/
// final/corrected... Total score dan label resmi/estimasi... Subscore dan
// target." Rule: "Passing grade resmi menyebut tahun/aturan. Target
// internal diberi label `Target belajar Superlatif`." - this component
// NEVER renders a bare pass/fail against an unlabeled number; `targetLabel`
// is always shown alongside `overallPassed`, and callers must supply an
// explicitly non-official one (dok 17 §17 "Hardcode passing grade" stays
// prohibited at the DATA layer - this component just refuses to hide the
// label, it does not invent the number).

export interface ResultSectionScore {
  readonly sectionCode: string;
  readonly sectionTitle: string;
  readonly score: number;
  readonly maxScore: number;
}

const STATE_BADGE: Record<string, { readonly variant: StatusBadgeVariant; readonly label: string }> = {
  processing: { variant: "info", label: "Sedang diproses" },
  provisional: { variant: "warning", label: "Hasil sementara" },
  final: { variant: "success", label: "Hasil final" },
  corrected: { variant: "info", label: "Hasil dikoreksi" },
  withheld: { variant: "warning", label: "Ditinjau lebih lanjut" },
  voided: { variant: "danger", label: "Dibatalkan" },
};

export interface ResultScoreCardProps {
  readonly state: string;
  readonly totalScore: number;
  readonly sections: readonly ResultSectionScore[];
  readonly overallPassed: boolean | null;
  readonly targetLabel: string;
  readonly releasedAtLabel: string | null;
}

export function ResultScoreCard({
  state,
  totalScore,
  sections,
  overallPassed,
  targetLabel,
  releasedAtLabel,
}: ResultScoreCardProps) {
  const badge = STATE_BADGE[state] ?? { variant: "info" as const, label: state };

  return (
    <section className="slf-result-card" aria-label="Ringkasan hasil">
      <div className="slf-result-card__header">
        <StatusBadge variant={badge.variant} label={badge.label} />
        {releasedAtLabel ? <p className="slf-result-card__released">Dirilis {releasedAtLabel}</p> : null}
      </div>

      <p className="slf-result-card__total-label">Skor total (simulasi)</p>
      <p className="slf-result-card__total">{totalScore}</p>

      {overallPassed !== null ? (
        <p className="slf-result-card__target">
          {overallPassed ? "Mencapai" : "Belum mencapai"} {targetLabel}
        </p>
      ) : null}

      <dl className="slf-result-card__sections">
        {sections.map((section) => (
          <div key={section.sectionCode} className="slf-result-card__section">
            <dt>{section.sectionTitle}</dt>
            <dd>
              {section.score}
              <span className="slf-result-card__section-max"> / {section.maxScore}</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
