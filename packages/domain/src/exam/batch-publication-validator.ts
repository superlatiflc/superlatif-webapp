// Batch publication validator (EXM-002) - PARTIAL implementation of dok 18
// §12's checklist, scoped to what this task actually owns.
//
// dok 18 §12 lists ten checklist items ("form dan blueprint published",
// "attempt policy valid", "seluruh question version approved", "windows/
// timezone koheren", "result/review policy terdefinisi", "scoring fixtures
// lulus", "access path ada", "notification schedule valid", "live-ops
// owner assigned", "support copy/runbook linked"). EXM-002's own backlog
// acceptance criteria are narrower ("All windows are independent and
// timezone-safe", "Batch state is server-derived", "Changing offer windows
// cannot change attempt history") and the founder's explicit scope
// instruction excludes the attempt engine entirely ("Jangan bangun attempt
// engine/start-answer-submit-scoring; itu scope ATM-series").
// `attempt_policies` (dok 21 §9) does not exist as a table in this
// codebase yet either - it is ATM-series territory.
//
// This validator therefore checks only the two items EXM-002 genuinely
// owns end-to-end:
//   1. The pinned exam_form_version is PUBLISHED (reuses EXM-001's own
//      form artifact - "Batch harus pin exact published exam_form_version"
//      is a founder instruction, not a new invariant).
//   2. The batch's own window set is internally coherent
//      (assertBatchWindowsCoherent, this task).
//
// Fail-closed (dok 17 §17 / this task's own "Publication validator harus
// fail-closed" precedent from EXM-001): every issue is collected and
// reported, publish is refused if the list is non-empty. Attempt-policy
// validity, scoring fixtures, notification schedule, live-ops owner, and
// support-copy linkage are EXPLICITLY deferred to the tasks that will
// actually own those artifacts - this validator does not pretend to check
// them, and does not claim Gate C PASS.

import {
  assertBatchWindowsCoherent,
  BatchWindowsInvalidError,
  type BatchWindowSet,
} from "./batch-windows.ts";

export class BatchNotPublishableError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Batch is not publishable:\n${issues.map((issue) => `  - ${issue}`).join("\n")}`);
    this.name = "BatchNotPublishableError";
  }
}

export interface AssertBatchPublishableInput {
  readonly examFormVersionStatus: string;
  readonly windows: BatchWindowSet;
}

export function assertBatchPublishable(input: AssertBatchPublishableInput): void {
  const issues: string[] = [];

  if (input.examFormVersionStatus !== "published") {
    issues.push(
      `pinned exam_form_version is "${input.examFormVersionStatus}", not "published" - a batch can only pin an already-published, immutable form version`,
    );
  }

  try {
    assertBatchWindowsCoherent(input.windows);
  } catch (error) {
    if (error instanceof BatchWindowsInvalidError) {
      issues.push(...error.issues);
    } else {
      throw error;
    }
  }

  if (issues.length > 0) throw new BatchNotPublishableError(issues);
}
