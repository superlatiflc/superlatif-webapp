import type { ReactNode } from "react";
import { StatusBadge, type StatusBadgeVariant } from "./StatusBadge.tsx";

// dok 11 §13.1 Program Card. Deliberately does NOT render "seluruh daftar
// fasilitas" (dok 07 §5: "Jangan menampilkan seluruh daftar fasilitas di
// kartu") - name, status, and one next-activity slot only.

export interface ProgramCardProps {
  readonly name: string;
  readonly statusLabel: string;
  readonly statusVariant: StatusBadgeVariant;
  /** True for the student's current primary program - dok 07 §5 "Program utama pilihan siswa" gets the featured treatment. */
  readonly isPrimary?: boolean;
  readonly href: string;
  readonly primaryActionLabel: string;
  readonly children?: ReactNode;
}

export function ProgramCard({
  name,
  statusLabel,
  statusVariant,
  isPrimary = false,
  href,
  primaryActionLabel,
  children,
}: ProgramCardProps) {
  return (
    <article className={`slf-program-card${isPrimary ? " slf-program-card--primary" : ""}`}>
      <div className="slf-program-card__header">
        <h3 className="slf-program-card__name">{name}</h3>
        <StatusBadge variant={statusVariant} label={statusLabel} />
      </div>
      {children}
      <a className="slf-button slf-button--primary" href={href}>
        {primaryActionLabel}
      </a>
    </article>
  );
}
