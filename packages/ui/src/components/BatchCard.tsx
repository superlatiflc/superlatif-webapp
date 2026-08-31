import { StatusBadge, type StatusBadgeVariant } from "./StatusBadge.tsx";

// dok 12 §10 "S07 — Tab Tryout" Batch card: "Nama, blueprint/jenis ujian,
// periode pengerjaan, durasi, attempts, status akses, result release, dan
// CTA." Mirrors ProgramCard's own shape/conventions (StatusBadge reuse,
// slf-button CTA) rather than inventing a second card pattern.

export interface BatchCardProps {
  readonly title: string;
  readonly examFamilyLabel: string;
  readonly statusLabel: string;
  readonly statusVariant: StatusBadgeVariant;
  readonly attemptWindowLabel: string;
  readonly durationLabel: string;
  readonly attemptsUsed: number;
  readonly attemptsAllowed: number;
  readonly resultReleaseLabel: string;
  readonly href: string;
  readonly primaryActionLabel: string;
}

export function BatchCard({
  title,
  examFamilyLabel,
  statusLabel,
  statusVariant,
  attemptWindowLabel,
  durationLabel,
  attemptsUsed,
  attemptsAllowed,
  resultReleaseLabel,
  href,
  primaryActionLabel,
}: BatchCardProps) {
  return (
    <article className="slf-batch-card">
      <div className="slf-batch-card__header">
        <div>
          <p className="slf-batch-card__family">{examFamilyLabel}</p>
          <h3 className="slf-batch-card__title">{title}</h3>
        </div>
        <StatusBadge variant={statusVariant} label={statusLabel} />
      </div>
      <dl className="slf-batch-card__meta">
        <div>
          <dt>Periode</dt>
          <dd>{attemptWindowLabel}</dd>
        </div>
        <div>
          <dt>Durasi</dt>
          <dd>{durationLabel}</dd>
        </div>
        <div>
          <dt>Percobaan</dt>
          <dd>
            {attemptsUsed}/{attemptsAllowed}
          </dd>
        </div>
        <div>
          <dt>Hasil</dt>
          <dd>{resultReleaseLabel}</dd>
        </div>
      </dl>
      <a className="slf-button slf-button--primary" href={href}>
        {primaryActionLabel}
      </a>
    </article>
  );
}
