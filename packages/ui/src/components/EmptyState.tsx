// dok 09 §6.2: an empty state answers three questions - what's missing, why,
// and what to do. `title`/`body` answer the first two; `actionHref`/
// `actionLabel` (optional - some empty states have no action, e.g. "Tidak
// ada program lain" per dok 07 §15, which hides the section entirely
// instead) answer the third.

export interface EmptyStateProps {
  readonly title: string;
  readonly body: string;
  readonly actionLabel?: string;
  readonly actionHref?: string;
}

export function EmptyState({ title, body, actionLabel, actionHref }: EmptyStateProps) {
  return (
    <div className="slf-empty-state" role="status">
      <h2 className="slf-empty-state__title">{title}</h2>
      <p className="slf-empty-state__body">{body}</p>
      {actionLabel && actionHref ? (
        <a className="slf-button slf-button--primary" href={actionHref}>
          {actionLabel}
        </a>
      ) : null}
    </div>
  );
}
