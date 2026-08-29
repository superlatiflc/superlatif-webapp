// dok 11 §13.2 Next Action Card. dok 09 §5: every recommendation shows
// name, its program relationship, the reason it was chosen, and one
// primary action - never a bare label.

export interface NextActionCardProps {
  readonly title: string;
  readonly programName: string;
  readonly reasonText: string;
  readonly primaryActionLabel: string;
  readonly href: string;
}

export function NextActionCard({
  title,
  programName,
  reasonText,
  primaryActionLabel,
  href,
}: NextActionCardProps) {
  return (
    <div className="slf-next-action-card">
      <p className="slf-next-action-card__reason">{programName}</p>
      <h3 className="slf-next-action-card__title">{title}</h3>
      <p className="slf-next-action-card__reason">{reasonText}</p>
      <a className="slf-button slf-button--primary" href={href}>
        {primaryActionLabel}
      </a>
    </div>
  );
}
