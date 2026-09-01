// Post-release answer review projection (production tryout core slice).
//
// The read-side sibling of answer-grading.ts's `gradeAnswer`: that module
// turns (question type, answer key, payload) into a SCORE input; this one
// turns the same three into an EXPLANATION-time comparison a learner can
// read. Both dispatch on the QUESTION's own type - never on the payload's
// wire kind, which is `single_choice` for both `single_choice` and
// `weighted_choice` questions (dok 16 §8).
//
// The whole reason this is a separate function rather than a field added
// to `GradedOutcome`: `gradeAnswer` is called during SCORING, whose output
// (`result_versions`) is readable at `provisional_released`. This one is
// called only after `resolveExplanationVisibility` passes (`review_open`).
// Keeping them separate keeps the answer key out of the scoring result's
// own persisted shape - `result_versions` deliberately stores no
// per-question breakdown (see schema/results.ts's own module doc).
//
// TKP HONESTY (the point of this module): a `weighted_choice` question has
// NO correct answer - `assertValidAnswerKey` requires every option to carry
// a weight, and `gradeAnswer` returns that weight verbatim rather than a
// boolean. So the weighted variant below reports the learner's OWN option
// weight against the maximum available, and names every option that ties
// for that maximum - it never reduces TKP to correct/incorrect, and it
// exposes no ordering claim the scorer itself does not make. Rendering
// wording ("skor tertinggi" / "bukan skor tertinggi" / "skor pilihanmu")
// is the UI's job; this module only supplies the honest numbers.

import type { AnswerKey } from "./answer-key.ts";
import type { AnswerPayload } from "./answer-payload.ts";
import type { QuestionType } from "./question-types.ts";
import { UngradeableQuestionTypeError, AnswerKeyShapeMismatchError } from "./answer-grading.ts";

/** A binary-scored question (single_choice): exactly one option is correct. */
export interface BinaryAnswerReview {
  readonly kind: "binary";
  readonly selectedOptionCode: string | null;
  readonly correctOptionCode: string;
  readonly status: "correct" | "incorrect" | "blank";
}

/** A weighted question (weighted_choice / TKP): every option is valid, options differ only in weight. */
export interface WeightedAnswerReview {
  readonly kind: "weighted";
  readonly selectedOptionCode: string | null;
  /** The weight of the learner's own choice - null when unanswered. */
  readonly selectedWeight: number | null;
  readonly maxWeight: number;
  /** Every option tying for `maxWeight` - a tie is legitimate and must not be presented as a single "key". */
  readonly bestOptionCodes: readonly string[];
  /** `best` means "scored the maximum available", NOT "correct" - see module doc. */
  readonly status: "best" | "not_best" | "blank";
}

export type AnswerReview = BinaryAnswerReview | WeightedAnswerReview;

/**
 * Scoped to the same two question types `gradeAnswer` supports, and throws
 * the same `UngradeableQuestionTypeError` for anything else - a review can
 * never claim to explain a question type this codebase's scorer cannot
 * actually grade.
 */
export function reviewAnswer(
  questionType: QuestionType,
  answerKey: AnswerKey,
  payload: AnswerPayload | null,
): AnswerReview {
  if (questionType !== "single_choice" && questionType !== "weighted_choice") {
    throw new UngradeableQuestionTypeError(questionType);
  }

  // Both supported question types carry a `single_choice` wire payload
  // (dok 16 §8) - anything else means a caller bypassed ATM-002's own
  // `assertAnswerPayloadMatchesQuestionType` save-time gate.
  if (payload !== null && payload.kind !== "single_choice") {
    throw new UngradeableQuestionTypeError(questionType);
  }
  const selectedOptionCode = payload === null ? null : payload.optionCode;

  if (questionType === "single_choice") {
    if (answerKey.kind !== "single_choice") {
      throw new AnswerKeyShapeMismatchError(questionType, answerKey.kind);
    }
    return {
      kind: "binary",
      selectedOptionCode,
      correctOptionCode: answerKey.correctOptionCode,
      status:
        selectedOptionCode === null
          ? "blank"
          : selectedOptionCode === answerKey.correctOptionCode
            ? "correct"
            : "incorrect",
    };
  }

  if (answerKey.kind !== "weighted_choice") {
    throw new AnswerKeyShapeMismatchError(questionType, answerKey.kind);
  }
  const entries = Object.entries(answerKey.optionWeights);
  if (entries.length === 0) {
    // assertValidAnswerKey (QST-001) already refuses an empty weight map at
    // write time; guarded rather than asserted, matching gradeAnswer's own
    // treatment of the structurally-near-unreachable case.
    throw new AnswerKeyShapeMismatchError(questionType, answerKey.kind);
  }
  const maxWeight = Math.max(...entries.map(([, weight]) => weight));
  const bestOptionCodes = entries.filter(([, weight]) => weight === maxWeight).map(([code]) => code);
  const selectedWeight =
    selectedOptionCode === null ? null : (answerKey.optionWeights[selectedOptionCode] ?? 0);

  return {
    kind: "weighted",
    selectedOptionCode,
    selectedWeight,
    maxWeight,
    bestOptionCodes,
    status: selectedOptionCode === null ? "blank" : selectedWeight === maxWeight ? "best" : "not_best",
  };
}
