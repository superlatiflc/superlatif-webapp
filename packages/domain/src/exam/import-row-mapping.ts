// Workbook vocabulary -> QST-001 domain vocabulary mapping (QST-002).
//
// The import template (dok 15A) and QST-001's own schema were authored
// independently and use two adjacent but not identical vocabularies for
// the same concepts. Rather than changing QST-001's already-shipped,
// tested schema to match the workbook (or building a second, parallel
// question-type/placement vocabulary), this module is the ONE place the
// translation happens - every other file imports QuestionType/
// QuestionAssetPlacement from QST-001's own modules unchanged.

import type { QuestionType } from "./question-types.ts";

/** dok 15A §4's own `question_type` column values. */
export type WorkbookQuestionType =
  "single_choice" | "weighted_choice" | "multiple_choice" | "statement_true_false" | "numeric";

export class UnknownWorkbookQuestionTypeError extends Error {
  constructor(readonly value: string) {
    super(`Unknown workbook question_type "${value}"`);
    this.name = "UnknownWorkbookQuestionTypeError";
  }
}

/** dok 15A §4's `statement_true_false` is QST-001 schema's `true_false` - every other value passes through unchanged. */
export function mapWorkbookQuestionType(value: string): QuestionType {
  switch (value) {
    case "single_choice":
    case "weighted_choice":
    case "multiple_choice":
    case "numeric":
      return value;
    case "statement_true_false":
      return "true_false";
    default:
      throw new UnknownWorkbookQuestionTypeError(value);
  }
}

/** dok 15A §3's Assets sheet `asset_role` column values (`stem`, `option`, `explanation`, `passage`, `other`). */
export type WorkbookAssetRole = "stem" | "option" | "explanation" | "passage" | "other";

export class UnsupportedWorkbookAssetRoleError extends Error {
  constructor(readonly value: string) {
    super(`Unsupported workbook asset_role "${value}"`);
    this.name = "UnsupportedWorkbookAssetRoleError";
  }
}

/**
 * dok 15A's `passage` role owns a stimulus_version, mapped onto QST-001
 * schema's `stimulus_body` placement (its own vocabulary for the same
 * concept - see schema/questions.ts's own doc comment). `other` has no
 * QST-001 owner column to attach to and is rejected outright rather than
 * silently dropped.
 */
export function mapWorkbookAssetRole(value: string): "stem" | "option" | "explanation" | "stimulus_body" {
  switch (value) {
    case "stem":
    case "option":
    case "explanation":
      return value;
    case "passage":
      return "stimulus_body";
    case "other":
      throw new UnsupportedWorkbookAssetRoleError(value);
    default:
      throw new UnsupportedWorkbookAssetRoleError(value);
  }
}
