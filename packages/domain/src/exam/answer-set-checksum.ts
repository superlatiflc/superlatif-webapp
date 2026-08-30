// Frozen answer-set checksum at submit time (ATM-003).
//
// `contracts/openapi.yaml`'s own `SubmissionEnvelope.data.answerSetChecksum`
// - the value that pins EXACTLY which answer states (and at which
// revisions) were locked in the instant an attempt was finalized.
// "Submitted snapshot harus pin answer state/revision saat submit"
// (founder instruction) is this checksum's entire reason to exist: two
// submissions with the same checksum are provably scoring the identical
// answer content, the same "Scoring sama untuk input checksum yang sama"
// invariant dok 16 §22 test #6 already names for the (not-yet-built)
// scorer - this module only produces the input side of that guarantee.
//
// Deterministic and order-sensitive by `instanceId` (sorted here, not left
// to caller ordering) so the same underlying `answer_states` rows always
// produce the same checksum regardless of the order a SQL query happened
// to return them in.

import { computeChecksum, type JsonValue } from "../shared/checksum.ts";
import type { AnswerPayload } from "./answer-payload.ts";

export interface FrozenAnswerEntry {
  readonly instanceId: string;
  readonly revision: number;
  readonly payload: AnswerPayload | null;
}

export function computeAnswerSetChecksum(entries: readonly FrozenAnswerEntry[]): string {
  const sorted = [...entries].sort((a, b) =>
    a.instanceId < b.instanceId ? -1 : a.instanceId > b.instanceId ? 1 : 0,
  );
  return computeChecksum(
    sorted.map((entry) => ({
      instanceId: entry.instanceId,
      revision: entry.revision,
      payload: entry.payload,
    })) as unknown as JsonValue,
  );
}
