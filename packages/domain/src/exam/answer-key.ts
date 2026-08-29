// The server-only answer key / weight shapes, and their pure validation
// rules (QST-001).
//
// dok 15 §6 "Manual Question Editor" answer/scoring metadata rules,
// transcribed per type:
// - single choice: exactly one correct option.
// - complex/multiple choice: at least one correct option, and an explicit
//   partial-score policy.
// - true/false: every statement has an expected value.
// - weighted choice: every option has a numeric weight.
// - numeric: a complete accepted-value/tolerance/unit policy.
//
// These types are never imported by anything that also builds a
// student-facing view (student-view.ts) - that module's own input type has
// no field an AnswerKey could be assigned to, so the separation is
// structural, not just a naming convention.

import type { QuestionType } from "./question-types.ts";

export interface SingleChoiceAnswerKey {
  readonly kind: "single_choice";
  readonly correctOptionCode: string;
}

/** Internal `type` stays "weighted_choice" for classification/scoring; only toStudentResponseKind's OUTPUT ever reports "single_choice". */
export interface WeightedChoiceAnswerKey {
  readonly kind: "weighted_choice";
  readonly optionWeights: Readonly<Record<string, number>>;
}

export type PartialScorePolicy = "all_or_nothing" | "proportional";

export interface MultipleChoiceAnswerKey {
  readonly kind: "multiple_choice";
  readonly correctOptionCodes: readonly string[];
  readonly partialScorePolicy: PartialScorePolicy;
}

export interface TrueFalseAnswerKey {
  readonly kind: "true_false";
  readonly statementAnswers: Readonly<Record<string, boolean>>;
}

export interface NumericAnswerKey {
  readonly kind: "numeric";
  readonly acceptedValue: number;
  readonly tolerance: number;
  readonly unit: string | null;
}

export type AnswerKey =
  | SingleChoiceAnswerKey
  | WeightedChoiceAnswerKey
  | MultipleChoiceAnswerKey
  | TrueFalseAnswerKey
  | NumericAnswerKey;

export class AnswerKeyValidationError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "AnswerKeyValidationError";
  }
}

/**
 * Every rule from dok 15 §6, plus the "invalid option key" requirement (dok
 * 21 §8): an answer key must only ever reference optionCodes that actually
 * exist as `question_options` rows for the same version. `optionCodes` is
 * the caller-supplied list of the version's own actual option codes -
 * this function never queries anything itself, it stays pure.
 */
export function assertValidAnswerKey(
  type: QuestionType,
  answerKey: AnswerKey,
  optionCodes: readonly string[],
): void {
  if (answerKey.kind !== type) {
    throw new AnswerKeyValidationError(
      `answer key kind "${answerKey.kind}" does not match question type "${type}"`,
      "answer_key_type_mismatch",
    );
  }

  const knownCodes = new Set(optionCodes);
  const assertKnown = (code: string) => {
    if (!knownCodes.has(code)) {
      throw new AnswerKeyValidationError(
        `answer key references unknown option code "${code}"`,
        "unknown_option_code",
      );
    }
  };

  switch (answerKey.kind) {
    case "single_choice": {
      assertKnown(answerKey.correctOptionCode);
      return;
    }
    case "weighted_choice": {
      const weightedCodes = Object.keys(answerKey.optionWeights);
      if (weightedCodes.length === 0) {
        throw new AnswerKeyValidationError(
          "weighted_choice answer key must weight at least one option",
          "empty_weights",
        );
      }
      for (const code of weightedCodes) assertKnown(code);
      // dok 15 §6: "every option has a numeric weight" - every KNOWN option
      // must be covered, not merely every weighted code be known.
      for (const code of optionCodes) {
        if (!(code in answerKey.optionWeights)) {
          throw new AnswerKeyValidationError(
            `option code "${code}" is missing a weight`,
            "missing_option_weight",
          );
        }
        if (!Number.isFinite(answerKey.optionWeights[code])) {
          throw new AnswerKeyValidationError(
            `option code "${code}" has a non-finite weight`,
            "invalid_option_weight",
          );
        }
      }
      return;
    }
    case "multiple_choice": {
      if (answerKey.correctOptionCodes.length === 0) {
        throw new AnswerKeyValidationError(
          "multiple_choice answer key must have at least one correct option",
          "empty_correct_options",
        );
      }
      for (const code of answerKey.correctOptionCodes) assertKnown(code);
      return;
    }
    case "true_false": {
      const statementCodes = Object.keys(answerKey.statementAnswers);
      if (statementCodes.length === 0) {
        throw new AnswerKeyValidationError(
          "true_false answer key must cover at least one statement",
          "empty_statements",
        );
      }
      for (const code of statementCodes) assertKnown(code);
      // dok 15 §6: "every statement has an expected value" - every KNOWN
      // statement/option must be covered.
      for (const code of optionCodes) {
        if (!(code in answerKey.statementAnswers)) {
          throw new AnswerKeyValidationError(
            `statement "${code}" is missing an expected value`,
            "missing_statement_answer",
          );
        }
      }
      return;
    }
    case "numeric": {
      if (!Number.isFinite(answerKey.acceptedValue)) {
        throw new AnswerKeyValidationError(
          "numeric answer key must have a finite accepted value",
          "invalid_accepted_value",
        );
      }
      if (!Number.isFinite(answerKey.tolerance) || answerKey.tolerance < 0) {
        throw new AnswerKeyValidationError(
          "numeric answer key must have a non-negative finite tolerance",
          "invalid_tolerance",
        );
      }
      return;
    }
  }
}
