// Exam blueprint config shape (EXM-001), matching
// contracts/exam-blueprint.schema.json field-for-field.
//
// This type exists so the rest of this task's pure validators (timing sum,
// scoring cross-reference, form composition) get strongly-typed access to
// `config.sections`/`config.timing`/`config.presentation` without each
// re-declaring their own shape - the SHAPE ITSELF is owned by the JSON
// Schema contract (validated by AJV in packages/db/src/exam/config, which
// domain cannot import - it stays free of vendor SDKs), not by this file.
// This file only mirrors that already-reviewed shape in TypeScript; it
// never re-validates required-ness, patterns, or enums AJV already checks
// - it keeps ONLY the two structural checks the schema's own
// `x-superlatifSemanticInvariants` and dok 17 §12 explicitly say cannot be
// expressed portably in JSON Schema: section-code uniqueness and the
// per-section duration sum (blueprint-timing-validator.ts).
//
// `allowedQuestionTypes` reuses `WorkbookQuestionType` (QST-002's
// import-row-mapping.ts) rather than inventing a third vocabulary: the
// contract's own enum (`single_choice`/`multiple_choice`/
// `statement_true_false`/`weighted_choice`/`numeric`) is IDENTICAL to
// dok 15A's workbook vocabulary QST-002 already modeled and already has a
// mapping function to QST-001's schema vocabulary (`mapWorkbookQuestionType`,
// `statement_true_false` -> `true_false`) - exam-form-validator.ts reuses
// that same function rather than writing a second translator.

import type { WorkbookQuestionType } from "./import-row-mapping.ts";

export interface BlueprintSection {
  readonly code: string;
  readonly title: string;
  readonly order: number;
  readonly questionCount: number;
  /** Required only when `timing.mode = "per_section"` (the schema's own conditional `allOf` rule). */
  readonly durationSeconds?: number | null;
  readonly allowedQuestionTypes: readonly WorkbookQuestionType[];
}

export type BlueprintTimingMode = "global" | "per_section";

export interface BlueprintTiming {
  readonly mode: BlueprintTimingMode;
  readonly totalDurationSeconds: number;
}

export interface BlueprintPresentation {
  readonly questionOrder: "fixed";
  readonly optionOrder: "fixed" | "question_policy";
  readonly persistPresentedOrder: true;
  readonly watermarkMode?: "none" | "learner_id" | "session_code";
}

/** dok 17 §2's own vocabulary: a blueprint version pins a SPECIFIC, checksummed scoring policy version by reference, embedded in the document itself rather than only as a database foreign key - see exam-config-service.ts's own doc on why a form derives its scoring pairing from this field rather than an independent caller-supplied one. */
export interface BlueprintScoringPolicyRef {
  readonly code: string;
  readonly version: number;
  readonly checksum: string;
}

export interface BlueprintStructure {
  readonly sections: readonly BlueprintSection[];
  readonly timing: BlueprintTiming;
}

export class DuplicateSectionCodeError extends Error {
  constructor(readonly duplicateCodes: readonly string[]) {
    super(`Blueprint has duplicate section codes: ${duplicateCodes.join(", ")}`);
    this.name = "DuplicateSectionCodeError";
  }
}

/** The one structural check AJV's `sections` array schema cannot express portably: no two sections may share a `code`. */
export function assertSectionCodesUnique(sections: readonly BlueprintSection[]): void {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const section of sections) {
    if (seen.has(section.code)) duplicates.add(section.code);
    seen.add(section.code);
  }
  if (duplicates.size > 0) throw new DuplicateSectionCodeError([...duplicates]);
}
