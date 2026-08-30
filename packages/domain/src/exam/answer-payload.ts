// Student answer payload shapes and question-type mapping (ATM-002).
//
// `contracts/openapi.yaml`'s own `AnswerSaveRequest.answer` / `AnswerState.
// payload` schema, transcribed verbatim: `SingleChoiceAnswer`,
// `MultipleChoiceAnswer`, `StatementAnswer`, `NumericAnswer`, or `null`
// (clearing/unanswering). This is a DELIBERATELY SEPARATE type family from
// `answer-key.ts`'s `AnswerKey` (QST-001) - that module's own doc already
// establishes the precedent this file follows: "These types are never
// imported by anything that also builds a student-facing view... the
// separation is structural, not just a naming convention." A student
// payload can only ever carry the option/statement/value the STUDENT
// selected - it has no field a correct answer or option weight could ever
// be assigned to, by construction.
//
// dok 16 §8's own mapping table names the wire-format `answer.kind` for
// each `QuestionType` - NOTE this is a genuinely different vocabulary from
// `student-view.ts`'s own `StudentResponseKind` ("true_false", used for
// rendering): the contract's own discriminator for that question type is
// `"statement_true_false"`, not `"true_false"`. `toAnswerKind` is this
// file's own mapping, kept deliberately separate from
// `toStudentResponseKind` rather than forcing the two already-independent,
// already-tested vocabularies to agree.

import type { QuestionType } from "./question-types.ts";

export type AnswerKind = "single_choice" | "multiple_choice" | "statement_true_false" | "numeric";

/** dok 16 §8: "weighted_choice adalah perbedaan scoring, bukan bentuk interaksi" - reports as `single_choice`, exactly like `toStudentResponseKind` already does for rendering, but kept as this file's own mapping (see module doc). */
export function toAnswerKind(type: QuestionType): AnswerKind {
  switch (type) {
    case "single_choice":
    case "weighted_choice":
      return "single_choice";
    case "multiple_choice":
      return "multiple_choice";
    case "true_false":
      return "statement_true_false";
    case "numeric":
      return "numeric";
  }
}

export interface SingleChoiceAnswerPayload {
  readonly kind: "single_choice";
  readonly optionCode: string;
}

export interface MultipleChoiceAnswerPayload {
  readonly kind: "multiple_choice";
  readonly optionCodes: readonly string[];
}

export interface StatementAnswerPayload {
  readonly kind: "statement_true_false";
  readonly values: Readonly<Record<string, boolean>>;
}

export interface NumericAnswerPayload {
  readonly kind: "numeric";
  /** A normalized decimal string, matching contracts/openapi.yaml's own `NumericAnswer.value` pattern - never a float, to avoid floating-point round-trip ambiguity between client and server. */
  readonly value: string;
}

export type AnswerPayload =
  SingleChoiceAnswerPayload | MultipleChoiceAnswerPayload | StatementAnswerPayload | NumericAnswerPayload;

/** `contracts/openapi.yaml`'s own `NumericAnswer.value` pattern, transcribed verbatim. */
const NUMERIC_VALUE_PATTERN = /^-?[0-9]+([.,][0-9]+)?$/;

export class AnswerSchemaInvalidError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(`ANSWER_SCHEMA_INVALID: ${message}`);
    this.name = "AnswerSchemaInvalidError";
    this.code = code;
  }
}

/**
 * `payload === null` (clearing/unanswering) is always valid regardless of
 * question type - dok 16 §12: presented order/answer state is separate
 * from whether an answer currently exists. `knownCodes` is the question
 * instance's own presented option/statement codes (from
 * `attempt_question_instances.presentedOptionOrder`) - this function never
 * queries anything itself, it stays pure, matching `assertValidAnswerKey`'s
 * own "caller resolves data" split.
 *
 * Unlike `assertValidAnswerKey` (which requires a KEY to cover every known
 * option/statement), a student's IN-PROGRESS answer is allowed to be
 * partial - `statement_true_false` need not cover every statement yet, and
 * `multiple_choice` may select zero options (a legitimate "I haven't
 * decided" state distinct from `null`/unanswered).
 */
export function assertAnswerPayloadMatchesQuestionType(
  type: QuestionType,
  payload: AnswerPayload | null,
  knownCodes: readonly string[],
): void {
  if (payload === null) return;

  const expectedKind = toAnswerKind(type);
  if (payload.kind !== expectedKind) {
    throw new AnswerSchemaInvalidError(
      `answer kind "${payload.kind}" does not match question type "${type}" (expected "${expectedKind}")`,
      "answer_kind_mismatch",
    );
  }

  const known = new Set(knownCodes);
  const assertKnown = (code: string) => {
    if (!known.has(code)) {
      throw new AnswerSchemaInvalidError(
        `answer references unknown option/statement code "${code}"`,
        "unknown_code",
      );
    }
  };

  switch (payload.kind) {
    case "single_choice": {
      assertKnown(payload.optionCode);
      return;
    }
    case "multiple_choice": {
      const seen = new Set<string>();
      for (const code of payload.optionCodes) {
        if (seen.has(code)) {
          throw new AnswerSchemaInvalidError(
            `option code "${code}" is duplicated in the answer`,
            "duplicate_option_code",
          );
        }
        seen.add(code);
        assertKnown(code);
      }
      return;
    }
    case "statement_true_false": {
      for (const code of Object.keys(payload.values)) assertKnown(code);
      return;
    }
    case "numeric": {
      if (!NUMERIC_VALUE_PATTERN.test(payload.value)) {
        throw new AnswerSchemaInvalidError(
          `numeric value "${payload.value}" is not a normalized decimal string`,
          "invalid_numeric_value",
        );
      }
      return;
    }
  }
}
