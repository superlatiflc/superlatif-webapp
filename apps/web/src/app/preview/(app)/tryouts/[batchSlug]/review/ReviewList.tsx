"use client";

import { useMemo, useState } from "react";
import { QuestionReviewCard, type QuestionReviewStatus } from "@superlatif/ui";

// Pembahasan tryout (dok 12 §12-adjacent, this feature's own scope: "daftar
// soal, jawaban siswa, jawaban benar, status benar/salah/kosong, pembahasan
// singkat, konsep yang diuji, tips belajar"). Filtering is client-side over
// data already resolved server-side (review/page.tsx) - this component
// never fetches or decides correctness itself, it only filters/renders.

export interface ReviewRow {
  readonly instanceId: string;
  readonly sequence: number;
  readonly sectionLabel: string;
  readonly stem: string;
  readonly options: readonly { readonly optionCode: string; readonly text: string }[];
  readonly selectedOptionCode: string | null;
  readonly bestOptionCode: string;
  readonly status: QuestionReviewStatus;
  readonly statusLabel: string;
  readonly explanation: string;
  readonly concept: string;
  readonly mindsetTip: string;
  readonly bestOptionNote: string | undefined;
}

export interface ReviewListProps {
  readonly rows: readonly ReviewRow[];
}

type FilterKey = "semua" | "benar" | "salah" | "kosong";

const FILTERS: readonly { readonly key: FilterKey; readonly label: string }[] = [
  { key: "semua", label: "Semua" },
  { key: "salah", label: "Salah" },
  { key: "benar", label: "Benar" },
  { key: "kosong", label: "Belum Dijawab" },
];

export function ReviewList({ rows }: ReviewListProps) {
  const [filter, setFilter] = useState<FilterKey>("semua");

  const counts = useMemo(
    () => ({
      semua: rows.length,
      benar: rows.filter((row) => row.status === "benar").length,
      salah: rows.filter((row) => row.status === "salah").length,
      kosong: rows.filter((row) => row.status === "kosong").length,
    }),
    [rows],
  );

  const filteredRows = filter === "semua" ? rows : rows.filter((row) => row.status === filter);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div className="slf-review-summary">
        <span className="slf-review-tag slf-review-tag--best">{counts.benar} benar</span>
        <span className="slf-review-tag">{counts.salah} salah</span>
        <span className="slf-review-tag">{counts.kosong} belum dijawab</span>
      </div>

      <div className="slf-review-filter-bar" role="group" aria-label="Filter pembahasan">
        {FILTERS.map((option) => (
          <button
            key={option.key}
            type="button"
            className={`slf-review-filter-bar__button${filter === option.key ? " slf-review-filter-bar__button--active" : ""}`}
            aria-pressed={filter === option.key}
            onClick={() => setFilter(option.key)}
          >
            {option.label} ({counts[option.key]})
          </button>
        ))}
      </div>

      {filteredRows.length === 0 ? (
        <p className="slf-empty-state__body">Tidak ada soal pada kategori ini.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {filteredRows.map((row) => (
            <QuestionReviewCard
              key={row.instanceId}
              sectionLabel={row.sectionLabel}
              sequence={row.sequence}
              totalQuestions={rows.length}
              stem={row.stem}
              options={row.options}
              selectedOptionCode={row.selectedOptionCode}
              bestOptionCode={row.bestOptionCode}
              status={row.status}
              statusLabel={row.statusLabel}
              explanation={row.explanation}
              concept={row.concept}
              mindsetTip={row.mindsetTip}
              {...(row.bestOptionNote ? { bestOptionNote: row.bestOptionNote } : {})}
            />
          ))}
        </div>
      )}
    </div>
  );
}
