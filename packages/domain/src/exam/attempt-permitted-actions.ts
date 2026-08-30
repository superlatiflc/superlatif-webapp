// Permitted-actions projection (ATM-001).
//
// `contracts/openapi.yaml`'s own `Attempt.permittedActions` enum
// (`answer|flag|navigate|submit|takeover_writer|report_question|
// view_result`) transcribed verbatim. This task builds none of
// answer-save/flag/submit/report/result themselves - this function only
// tells the caller which actions WOULD currently be legal, matching resume
// response shape, so a future task's actual handlers stay authorization-
// consistent with what resume already advertised.

import type { AttemptStatus } from "./attempt-lifecycle.ts";
import type { WriterLeaseState } from "./attempt-writer-lease.ts";

export type AttemptPermittedAction =
  "answer" | "flag" | "navigate" | "submit" | "takeover_writer" | "report_question" | "view_result";

export function computePermittedActions(
  status: AttemptStatus,
  writerLeaseState: WriterLeaseState,
): readonly AttemptPermittedAction[] {
  const actions: AttemptPermittedAction[] = [];

  if (status === "created" || status === "in_progress") {
    actions.push("navigate", "report_question");
    if (writerLeaseState === "held_here") {
      actions.push("answer", "flag", "submit");
    } else {
      actions.push("takeover_writer");
    }
  }

  if (status === "scored") actions.push("view_result");

  return actions;
}
