import { StatusBadge, type StatusBadgeVariant } from "./StatusBadge.tsx";

// Post-submission pembahasan (review/explanation) card - the read-only,
// answer-key-revealing counterpart to AnswerableQuestion (which never shows
// a correct answer, by design). Only ever mount this AFTER a result exists
// - see apps/web's QUESTION_REVIEW module doc for the "don't leak the
// answer key before result/release" boundary this component sits behind.
//
// `bestOptionLabel`/`bestOptionNote` let the caller phrase "correctness"
// differently for TWK (binary correct/wrong) vs TKP (highest-weighted
// option, not a claim that other options are wrong - dok 16 §8) while
// reusing one component and one visual language for both.

export type QuestionReviewStatus = "benar" | "salah" | "kosong";

export interface QuestionReviewOption {
  readonly optionCode: string;
  readonly text: string;
}

export interface QuestionReviewCardProps {
  readonly sectionLabel: string;
  readonly sequence: number;
  readonly totalQuestions: number;
  readonly stem: string;
  readonly options: readonly QuestionReviewOption[];
  readonly selectedOptionCode: string | null;
  readonly bestOptionCode: string;
  /** e.g. "Benar" / "Salah" / "Belum dijawab" for TWK, "Skor tertinggi" / "Bukan skor tertinggi" / "Belum dijawab" for TKP. */
  readonly statusLabel: string;
  readonly status: QuestionReviewStatus;
  readonly explanation: string;
  readonly concept: string;
  readonly mindsetTip: string;
  /** Only set for TKP items - the honesty footnote that no single option is "wrong". */
  readonly bestOptionNote?: string;
}

const STATUS_VARIANT: Record<QuestionReviewStatus, StatusBadgeVariant> = {
  benar: "success",
  salah: "danger",
  kosong: "warning",
};

export function QuestionReviewCard({
  sectionLabel,
  sequence,
  totalQuestions,
  stem,
  options,
  selectedOptionCode,
  bestOptionCode,
  statusLabel,
  status,
  explanation,
  concept,
  mindsetTip,
  bestOptionNote,
}: QuestionReviewCardProps) {
  return (
    <article
      className="slf-question-review-card"
      aria-label={`Pembahasan soal ${sequence} dari ${totalQuestions}`}
    >
      <div className="slf-question-review-card__header">
        <p className="slf-question-preview__stimulus-label">
          {sectionLabel} · Soal {sequence}/{totalQuestions}
        </p>
        <StatusBadge variant={STATUS_VARIANT[status]} label={statusLabel} />
      </div>

      <p className="slf-question-preview__stem">{stem}</p>

      <ul className="slf-question-review-card__options">
        {options.map((option) => {
          const isSelected = option.optionCode === selectedOptionCode;
          const isBest = option.optionCode === bestOptionCode;
          return (
            <li
              key={option.optionCode}
              className={`slf-question-review-card__option${isBest ? " slf-question-review-card__option--best" : ""}${isSelected ? " slf-question-review-card__option--selected" : ""}`}
            >
              <span>{option.text}</span>
              <span className="slf-question-review-card__option-tags">
                {isSelected ? <span className="slf-review-tag">Jawabanmu</span> : null}
                {isBest ? <span className="slf-review-tag slf-review-tag--best">Kunci</span> : null}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="slf-question-review-card__section">
        <h4>Pembahasan</h4>
        <p>{explanation}</p>
        {bestOptionNote ? <p className="slf-question-review-card__note">{bestOptionNote}</p> : null}
      </div>

      <div className="slf-question-review-card__section">
        <h4>Konsep yang diuji</h4>
        <span className="slf-review-tag">{concept}</span>
      </div>

      <div className="slf-mindset-tip">
        <p className="slf-mindset-tip__label">Tips Superlatif</p>
        <p>{mindsetTip}</p>
      </div>
    </article>
  );
}
