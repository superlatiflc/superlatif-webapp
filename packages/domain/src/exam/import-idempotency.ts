// Per-row create/update/revise/skip decision (QST-002).
//
// dok 15A §6 "Idempotency dan versi", transcribed into one pure decision
// table: "Kode baru membuat question + draft version. Kode lama dengan
// latest version draft atau changes_requested dapat di-update hanya jika
// mode job update_draft dipilih. Kode lama yang approved, published, atau
// pernah digunakan tidak ditimpa; mode create_revision membuat version
// baru." This function decides WHAT to do with one row; it never touches a
// database itself - the caller (packages/db/src/exam/import) supplies the
// existing question's latest-version status (or null for a brand new
// code) and reads the result to decide which QST-001 question-service.ts
// function to call. No new write path is invented here: every intent this
// function can return maps onto an EXISTING QST-001 service function.

import { isQuestionVersionLocked, type RecordStatus } from "./question-lifecycle.ts";

export type ImportJobMode = "update_draft" | "create_revision";

export type ImportRowIntent =
  | { readonly kind: "create" }
  | { readonly kind: "update_draft" }
  | { readonly kind: "create_revision" }
  | {
      readonly kind: "skip";
      readonly reasonCode: "locked_requires_create_revision" | "unlocked_requires_update_draft";
    };

export interface ResolveImportRowIntentInput {
  /** The existing question's LATEST version status, or null if `question_code` has never been seen before. */
  readonly existingLatestVersionStatus: RecordStatus | null;
  readonly jobMode: ImportJobMode;
}

export function resolveImportRowIntent(input: ResolveImportRowIntentInput): ImportRowIntent {
  if (input.existingLatestVersionStatus === null) {
    return { kind: "create" };
  }

  const locked = isQuestionVersionLocked(input.existingLatestVersionStatus);

  if (locked) {
    if (input.jobMode === "create_revision") return { kind: "create_revision" };
    return { kind: "skip", reasonCode: "locked_requires_create_revision" };
  }

  if (input.jobMode === "update_draft") return { kind: "update_draft" };
  return { kind: "skip", reasonCode: "unlocked_requires_update_draft" };
}
