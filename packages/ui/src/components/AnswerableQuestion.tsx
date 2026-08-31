// dok 12 §20 "E03/E04" Exam runner - the ANSWERABLE counterpart to
// QuestionPreviewCard (QST-003), which is deliberately read-only
// (`disabled`/`readOnly` on every input - see that file's own module doc).
// This component is a controlled input: it owns no state itself, matching
// React's own controlled-component convention and this package's existing
// "presentation only, business logic stays in the caller" boundary
// (workspace rule: packages/ui may depend on @superlatif/contracts only,
// never @superlatif/domain/db - see QuestionPreviewCardProps's own doc for
// why this type is written structurally rather than imported).
//
// Scoped to exactly the two question kinds this codebase's real scorer
// can grade end-to-end (SCR-004: binary_choice/single_choice and
// weighted_option/weighted_choice) - both render as a plain single-select
// radio group on the wire (dok 16 §8: "weighted_choice adalah perbedaan
// scoring, bukan bentuk interaksi"), so ONE input shape correctly covers
// both; no multiple_choice/true_false/numeric variant is offered here,
// matching answer-grading.ts's own UngradeableQuestionTypeError boundary.

export interface AnswerableQuestionOption {
  readonly optionCode: string;
  readonly text: string;
}

export interface AnswerableQuestionProps {
  readonly instanceId: string;
  readonly sectionLabel: string;
  readonly sequence: number;
  readonly totalQuestions: number;
  readonly stem: string;
  readonly options: readonly AnswerableQuestionOption[];
  /** null = unanswered - dok 12 §20 "Belum dijawab" is a real, distinct state, never defaulted to the first option. */
  readonly selectedOptionCode: string | null;
  readonly onSelect: (optionCode: string) => void;
  readonly flagged: boolean;
  readonly onToggleFlag: () => void;
}

export function AnswerableQuestion({
  instanceId,
  sectionLabel,
  sequence,
  totalQuestions,
  stem,
  options,
  selectedOptionCode,
  onSelect,
  flagged,
  onToggleFlag,
}: AnswerableQuestionProps) {
  return (
    <article className="slf-answerable-question" aria-label={`Soal ${sequence} dari ${totalQuestions}`}>
      <div className="slf-answerable-question__header">
        <p className="slf-question-preview__stimulus-label">
          {sectionLabel} · Soal {sequence}/{totalQuestions}
        </p>
        <button
          type="button"
          className={`slf-flag-toggle${flagged ? " slf-flag-toggle--active" : ""}`}
          aria-pressed={flagged}
          onClick={onToggleFlag}
        >
          <span aria-hidden="true">🚩</span> {flagged ? "Ditandai" : "Tandai"}
        </button>
      </div>
      <p className="slf-question-preview__stem">{stem}</p>
      <div className="slf-question-preview__options" role="radiogroup" aria-label="Pilihan jawaban">
        {options.map((option) => (
          <label
            key={option.optionCode}
            className="slf-question-preview__option slf-answerable-question__option"
          >
            <input
              type="radio"
              name={`answer-${instanceId}`}
              value={option.optionCode}
              checked={selectedOptionCode === option.optionCode}
              onChange={() => onSelect(option.optionCode)}
            />
            <span>{option.text}</span>
          </label>
        ))}
      </div>
    </article>
  );
}
