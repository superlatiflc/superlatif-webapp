// dok 09 §6.1: "Gunakan skeleton yang menyerupai struktur akhir, bukan
// spinner satu halaman."

export interface SkeletonProps {
  readonly height: number;
  readonly width?: string;
  readonly label?: string;
}

export function Skeleton({ height, width = "100%", label = "Memuat" }: SkeletonProps) {
  return <div className="slf-skeleton" style={{ height, width }} role="status" aria-label={label} />;
}
