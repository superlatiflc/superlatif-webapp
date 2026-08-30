// Answer save compare-and-swap decision (ATM-002).
//
// dok 16 §8 "Processing" steps 5-8, transcribed as one pure function:
//   5. Compare `expected_answer_revision` dengan current revision.
//   6. Jika sama, append mutation, update current answer, increment
//      revision, commit.
//   7. Jika payload sama dengan current, return idempotent success.
//   8. Jika berbeda dan stale, return 409 ANSWER_REVISION_CONFLICT dengan
//      safe current state.
//
// This is the ONE place "Answer save harus monotonic/revision-safe, tidak
// boleh lost update" (founder instruction) is decided - dok 16 §22 test
// invariants #2 ("same mutation ID tidak menambah revision dua kali") and
// #3 ("stale different mutation tidak menimpa current answer") both follow
// directly from this function's own three-way branch, with mutation-ID
// deduplication itself handled one layer up (the db-layer repository,
// which can look up a stored prior outcome before this function is ever
// called at all - see answer-mutation-repository.ts's own module doc).
//
// Pure and dependency-free: `currentRevision`/`currentPayload` are already-
// resolved values the caller reads fresh inside its own transaction: this
// function never queries anything itself.

import type { AnswerPayload } from "./answer-payload.ts";

function payloadsEqual(a: AnswerPayload | null, b: AnswerPayload | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "single_choice":
      return b.kind === "single_choice" && a.optionCode === b.optionCode;
    case "multiple_choice": {
      if (b.kind !== "multiple_choice") return false;
      const aSet = new Set(a.optionCodes);
      const bSet = new Set(b.optionCodes);
      if (aSet.size !== bSet.size) return false;
      for (const code of aSet) if (!bSet.has(code)) return false;
      return true;
    }
    case "statement_true_false": {
      if (b.kind !== "statement_true_false") return false;
      const aKeys = Object.keys(a.values);
      const bKeys = Object.keys(b.values);
      if (aKeys.length !== bKeys.length) return false;
      for (const key of aKeys) if (a.values[key] !== b.values[key]) return false;
      return true;
    }
    case "numeric":
      return b.kind === "numeric" && a.value === b.value;
  }
}

export interface AnswerSaveCasInput {
  readonly currentRevision: number;
  readonly currentPayload: AnswerPayload | null;
  readonly expectedRevision: number;
  readonly newPayload: AnswerPayload | null;
}

export type AnswerSaveCasOutcome =
  | { readonly kind: "accepted"; readonly newRevision: number }
  | { readonly kind: "idempotent_replay"; readonly revision: number; readonly payload: AnswerPayload | null }
  | {
      readonly kind: "conflict";
      readonly currentRevision: number;
      readonly currentPayload: AnswerPayload | null;
    };

export function resolveAnswerSaveOutcome(input: AnswerSaveCasInput): AnswerSaveCasOutcome {
  if (input.expectedRevision === input.currentRevision) {
    return { kind: "accepted", newRevision: input.currentRevision + 1 };
  }
  if (payloadsEqual(input.newPayload, input.currentPayload)) {
    return { kind: "idempotent_replay", revision: input.currentRevision, payload: input.currentPayload };
  }
  return { kind: "conflict", currentRevision: input.currentRevision, currentPayload: input.currentPayload };
}
