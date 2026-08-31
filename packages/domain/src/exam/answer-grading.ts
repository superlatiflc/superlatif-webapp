// Bridges a student's saved answer and the secret answer key into a
// GradedOutcome (SCR-001) - the ONE place that compares a student payload
// against a correct-option-code or looks up an option weight.
//
// dok 16 §8's own mapping table: a `weighted_choice` question's student
// payload is wire-shape `single_choice` (`AnswerPayload.kind ===
// "single_choice"`) - "weighted_choice adalah perbedaan scoring, bukan
// bentuk interaksi." This module is exactly that scoring difference: it
// dispatches on the QUESTION's own type (single_choice vs weighted_choice),
// not on the payload's wire kind (which is identical for both), and reads
// the section's OWN scorer kind (binary_choice vs weighted_option) to
// decide which secret shape (`SingleChoiceAnswerKey.correctOptionCode` vs
// `WeightedChoiceAnswerKey.optionWeights`) it needs.
//
// This file imports `AnswerKey` (QST-001, server-secret) - unlike every
// student-facing module in this codebase (student-view.ts, answer-
// payload.ts), that is deliberate here: grading an answer against its own
// key is the scorer's entire job. No function in this file returns
// anything shaped like a student-facing view; its only output
// (`GradedOutcome`) carries a correctness boolean or a bare weight NUMBER,
// never the key/weight map itself - see gradeAnswer's own return type.

import type { AnswerKey } from "./answer-key.ts";
import type { AnswerPayload } from "./answer-payload.ts";
import type { QuestionType } from "./question-types.ts";
import type { SectionScorerConfig } from "./scoring-policy.ts";
import type { GradedOutcome } from "./score-calculation.ts";

export class UngradeableQuestionTypeError extends Error {
  constructor(readonly type: QuestionType) {
    super(
      `Question type "${type}" has no scorer in this task (SCR-004 scope: binary_choice/single_choice and weighted_option/weighted_choice only)`,
    );
    this.name = "UngradeableQuestionTypeError";
  }
}

export class AnswerKeyShapeMismatchError extends Error {
  constructor(
    readonly questionType: QuestionType,
    readonly answerKeyKind: AnswerKey["kind"],
  ) {
    super(`Question type "${questionType}" does not match its own answer key kind "${answerKeyKind}"`);
    this.name = "AnswerKeyShapeMismatchError";
  }
}

/**
 * `payload === null` (never answered, or explicitly cleared) always
 * grades as `blank` - dok 16 §15 "zero untuk unanswered". A non-null
 * payload for a `single_choice`/`weighted_choice` question is always
 * `{kind: "single_choice", optionCode}` on the wire (dok 16 §8); this
 * function is the one place that resolves what that optionCode is
 * actually WORTH.
 *
 * Only `single_choice` and `weighted_choice` question types are
 * supported (SCR-004's own narrow requirement scope, matching the golden
 * fixture) - any other type throws `UngradeableQuestionTypeError` rather
 * than silently scoring 0, per this codebase's fail-closed-on-
 * unspecified-behavior discipline (e.g. `assertSupportedPresentationPolicy`,
 * ATM-001).
 */
export function gradeAnswer(
  questionType: QuestionType,
  answerKey: AnswerKey,
  payload: AnswerPayload | null,
): GradedOutcome {
  if (questionType !== "single_choice" && questionType !== "weighted_choice") {
    throw new UngradeableQuestionTypeError(questionType);
  }
  if (payload === null) return { kind: "blank" };

  // dok 16 §8: the wire payload kind for BOTH single_choice and
  // weighted_choice questions is "single_choice" - already enforced at
  // save time by assertAnswerPayloadMatchesQuestionType (ATM-002), so a
  // mismatch here would mean a caller bypassed that gate, not a normal
  // runtime case. Narrowed defensively rather than asserted away.
  if (payload.kind !== "single_choice") {
    throw new UngradeableQuestionTypeError(questionType);
  }

  if (questionType === "single_choice") {
    if (answerKey.kind !== "single_choice") {
      throw new AnswerKeyShapeMismatchError(questionType, answerKey.kind);
    }
    return { kind: "binary", correct: payload.optionCode === answerKey.correctOptionCode };
  }

  // questionType === "weighted_choice"
  if (answerKey.kind !== "weighted_choice") {
    throw new AnswerKeyShapeMismatchError(questionType, answerKey.kind);
  }
  const weight = answerKey.optionWeights[payload.optionCode];
  // assertValidAnswerKey (QST-001) requires EVERY known option code to
  // carry a weight, and assertAnswerPayloadMatchesQuestionType (ATM-002)
  // requires the payload's optionCode to be one of the presented (hence
  // known) codes - so `weight` should always be defined. Guarded rather
  // than asserted, matching score-calculation.ts's own "invalidCount"
  // field for the same structurally-near-unreachable class of case.
  return { kind: "weighted", weight: weight ?? 0 };
}

/**
 * Cross-checks a section's configured scorer kind against the question
 * TYPE it will actually grade, before any grading happens - a cheap,
 * early, explicit failure instead of a confusing mismatch surfacing deep
 * inside score-calculation.ts's own `ScorerOutcomeKindMismatchError`.
 * Structurally should never fire given `assertScoringPolicyConsistentWithStructure`
 * (scoring-policy.ts) already checked this at the POLICY level - this is
 * the scoring-TIME echo of that same check, since the policy and the
 * actual attempt's question versions are resolved independently.
 */
export function assertScorerMatchesQuestionType(
  scorer: SectionScorerConfig,
  questionType: QuestionType,
): void {
  if (scorer.kind === "binary_choice" && questionType !== "single_choice") {
    throw new UngradeableQuestionTypeError(questionType);
  }
  if (scorer.kind === "weighted_option" && questionType !== "weighted_choice") {
    throw new UngradeableQuestionTypeError(questionType);
  }
}
