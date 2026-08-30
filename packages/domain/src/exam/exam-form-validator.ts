// Exam form composition validator (EXM-001) - dok 17 §14 checklist item
// "Form composition validation pass."
//
// Pure function: the caller (packages/db/src/exam/config) resolves each
// form item's actual question TYPE and STATUS from QST-001's own
// question_versions table and passes the resolved list in - this module
// never queries a database itself, matching this codebase's established
// "pure validator, impure caller resolves data" split
// (@superlatif/domain/exam's own assertValidAnswerKey is the same shape).
//
// "Form snapshot harus pin exact question version... Published
// blueprint/form harus immutable" (founder instruction): a form can only
// lock once every item's question version is itself already `published`
// (locked, per QST-001's own isQuestionVersionLocked) - an exam form can
// never pin a still-editable draft question, because pinning a mutable
// question would silently change the form's own content out from under it
// later.
//
// A section's `allowedQuestionTypes` is in the blueprint CONTRACT's own
// vocabulary (`WorkbookQuestionType` - identical to dok 15A's workbook
// vocabulary, QST-002's import-row-mapping.ts), not QST-001's schema
// vocabulary directly (`statement_true_false` vs `true_false`) - this
// reuses QST-002's own `mapWorkbookQuestionType` translator rather than
// writing a second one.

import { mapWorkbookQuestionType, UnknownWorkbookQuestionTypeError } from "./import-row-mapping.ts";
import type { QuestionType } from "./question-types.ts";
import type { RecordStatus } from "./question-lifecycle.ts";
import type { BlueprintStructure } from "./blueprint-structure.ts";

export interface ResolvedExamFormItem {
  readonly sectionCode: string;
  readonly order: number;
  readonly questionVersionId: string;
  readonly questionType: QuestionType;
  readonly questionVersionStatus: RecordStatus;
}

export class ExamFormCompositionInvalidError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Exam form composition is invalid:\n${issues.map((issue) => `  - ${issue}`).join("\n")}`);
    this.name = "ExamFormCompositionInvalidError";
  }
}

export function assertExamFormComposable(
  items: readonly ResolvedExamFormItem[],
  structure: BlueprintStructure,
): void {
  const issues: string[] = [];
  if (items.length === 0) issues.push("exam form must have at least one item");

  const sectionByCode = new Map(structure.sections.map((section) => [section.code, section]));
  const countBySection = new Map<string, number>();
  const seenQuestionVersionIds = new Set<string>();

  for (const item of items) {
    if (seenQuestionVersionIds.has(item.questionVersionId)) {
      issues.push(`question version "${item.questionVersionId}" appears more than once in the form`);
    }
    seenQuestionVersionIds.add(item.questionVersionId);

    const section = sectionByCode.get(item.sectionCode);
    if (!section) {
      issues.push(`item references unknown section "${item.sectionCode}"`);
      continue;
    }
    const allowedTypes = section.allowedQuestionTypes.flatMap((workbookType) => {
      try {
        return [mapWorkbookQuestionType(workbookType)];
      } catch (error) {
        if (error instanceof UnknownWorkbookQuestionTypeError) return [];
        throw error;
      }
    });
    if (!allowedTypes.includes(item.questionType)) {
      issues.push(
        `question version "${item.questionVersionId}" has type "${item.questionType}", not allowed in section "${item.sectionCode}" (allowed: ${allowedTypes.join(", ")})`,
      );
    }
    if (item.questionVersionStatus !== "published") {
      issues.push(
        `question version "${item.questionVersionId}" is "${item.questionVersionStatus}", not "published" - only published question versions may be pinned into a form`,
      );
    }
    countBySection.set(item.sectionCode, (countBySection.get(item.sectionCode) ?? 0) + 1);
  }

  for (const section of structure.sections) {
    const actual = countBySection.get(section.code) ?? 0;
    if (actual !== section.questionCount) {
      issues.push(
        `section "${section.code}" has ${actual} item(s), expected exactly ${section.questionCount} per blueprint structure`,
      );
    }
  }

  if (issues.length > 0) throw new ExamFormCompositionInvalidError(issues);
}
