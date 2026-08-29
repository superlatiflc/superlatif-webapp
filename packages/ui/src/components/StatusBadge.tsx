// dok 09 UX invariant #3: "Status tidak boleh hanya dibedakan oleh warna" -
// every variant renders a text label AND an icon glyph, never color alone.

export type StatusBadgeVariant = "success" | "info" | "warning" | "danger";

export interface StatusBadgeProps {
  readonly variant: StatusBadgeVariant;
  readonly label: string;
}

const ICON_BY_VARIANT: Record<StatusBadgeVariant, string> = {
  success: "✓",
  info: "ℹ",
  warning: "!",
  danger: "✕",
};

export function StatusBadge({ variant, label }: StatusBadgeProps) {
  return (
    <span className={`slf-status-badge slf-status-badge--${variant}`}>
      <span className="slf-status-badge__icon" aria-hidden="true">
        {ICON_BY_VARIANT[variant]}
      </span>
      <span>{label}</span>
    </span>
  );
}
