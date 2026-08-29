// Question type vocabulary and the student-response-kind mapping (QST-001).
//
// dok 15 §4 "Question types MVP", transcribed verbatim: single choice,
// multiple/complex choice, true-false per statement, weighted choice,
// numeric answer. "text, formula, table, and images" and "shared
// stimulus/passage" are content FORMATS/links a question of any type can
// carry, not question types of their own.

export type QuestionType = "single_choice" | "multiple_choice" | "true_false" | "weighted_choice" | "numeric";

export const QUESTION_TYPES: readonly QuestionType[] = [
  "single_choice",
  "multiple_choice",
  "true_false",
  "weighted_choice",
  "numeric",
];

/**
 * CLAUDE.md: "weighted_choice uses the student response shape
 * kind=single_choice + optionCode; option weights remain server-only
 * secrets." A weighted_choice question's INTERNAL type stays
 * "weighted_choice" (for scoring/classification), but the shape a client
 * ever receives or submits reports it as "single_choice" - this function is
 * the one place that mapping happens, so nothing downstream has to
 * remember the rule independently.
 */
export type StudentResponseKind = "single_choice" | "multiple_choice" | "true_false" | "numeric";

export function toStudentResponseKind(type: QuestionType): StudentResponseKind {
  return type === "weighted_choice" ? "single_choice" : type;
}
