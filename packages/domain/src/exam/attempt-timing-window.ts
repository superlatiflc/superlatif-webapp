// Server-authoritative answer-timing window (ATM-002).
//
// dok 16 §10 "Timer dan deadline" / "Late sync" - "Client menghitung
// tampilan dari server time offset tetapi server memutuskan": every
// decision here is a pure comparison of already-resolved server `Date`
// values, never a client-supplied timestamp (`captured_at_client` is
// telemetry only, dok 16 §8 request fields - it is not even an input to
// this function). This is what makes "Timer harus server-authoritative"
// (founder instruction) hold structurally rather than by convention.
//
// - `normal`: before `deadlineAt` - answer save proceeds through the
//   ordinary CAS path (answer-save-cas.ts) and updates the attempt's
//   authoritative `answer_states`.
// - `late_sync_recovery_candidate`: at/after `deadlineAt`, before
//   `lateSyncCutoffAt` - dok 16 §24 RC2: "Mutation yang tiba sampai
//   late_sync_cutoff_at menyimpan payload, writer lease, waktu, checksum,
//   dan state sebagai recovery candidate; tidak otomatis masuk answer set/
//   scoring." Recorded in `answer_mutations` with this outcome, but never
//   applied to `answer_states` - a later adjudication task (not built
//   here) decides accept/reject.
// - `rejected`: at/after `lateSyncCutoffAt` - refused outright
//   (`ATTEMPT_DEADLINE_PASSED`, dok 16 §19's own stable code). dok 16 §10
//   allows an implementation to ALSO record a rejected mutation as
//   "diagnostic telemetry" ("dapat dicatat") - that capture pipeline is
//   explicitly not built by this task; a rejected mutation is refused, not
//   silently persisted as if it were a recovery candidate.

export type AnswerTimingWindow = "normal" | "late_sync_recovery_candidate" | "rejected";

/** Inclusive at the boundary instant, matching this codebase's established convention (e.g. EXM-002's own window-boundary rules): a mutation arriving EXACTLY at `deadlineAt` is already past the normal window. */
export function evaluateAnswerTimingWindow(
  now: Date,
  deadlineAt: Date,
  lateSyncCutoffAt: Date,
): AnswerTimingWindow {
  if (now.getTime() < deadlineAt.getTime()) return "normal";
  if (now.getTime() < lateSyncCutoffAt.getTime()) return "late_sync_recovery_candidate";
  return "rejected";
}
