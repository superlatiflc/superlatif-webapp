// Per-question save sequencing for the attempt player.
//
// The server checks every save against the revision the client last saw
// (compare-and-swap). Firing a second save for the same question before the
// first is acknowledged sends the SAME expected revision twice, so the second
// is refused as a conflict - and the learner's latest choice is lost. This
// module keeps at most one save in flight per question, coalesces any choices
// made meanwhile into "the latest one", and always sends the revision the
// server last acknowledged. It is pure so the ordering can be tested without
// a browser.

export interface AckedAnswer {
  readonly optionCode: string | null;
  readonly revision: number;
}

export interface AnswerSlot {
  /** What the server last acknowledged. Never optimistic. */
  readonly acked: AckedAnswer;
  /** The choice currently being saved, if any. */
  readonly inFlight: string | null;
  /** The learner's latest choice made while a save was in flight. */
  readonly queued: string | null;
}

export interface SaveRequest {
  readonly optionCode: string;
  readonly expectedRevision: number;
}

export type Transition = readonly [AnswerSlot, SaveRequest | null];

export function initialSlot(acked: AckedAnswer = { optionCode: null, revision: 0 }): AnswerSlot {
  return { acked, inFlight: null, queued: null };
}

/** What the player shows as selected: the learner's latest intent. */
export function displayedChoice(slot: AnswerSlot): string | null {
  return slot.queued ?? slot.inFlight ?? slot.acked.optionCode;
}

export function isSaving(slot: AnswerSlot): boolean {
  return slot.inFlight !== null;
}

export function choose(slot: AnswerSlot, optionCode: string): Transition {
  if (slot.inFlight !== null) {
    // Wait for the in-flight save; remember only the latest choice.
    return [{ ...slot, queued: optionCode === slot.inFlight ? null : optionCode }, null];
  }
  if (optionCode === slot.acked.optionCode) return [slot, null];
  return [
    { ...slot, inFlight: optionCode, queued: null },
    { optionCode, expectedRevision: slot.acked.revision },
  ];
}

/** The in-flight save was accepted at `revision`; send the queued choice, if any, on top of it. */
export function acknowledge(slot: AnswerSlot, revision: number): Transition {
  const acked: AckedAnswer = { optionCode: slot.inFlight, revision };
  const next = slot.queued;
  if (next !== null && next !== acked.optionCode) {
    return [
      { acked, inFlight: next, queued: null },
      { optionCode: next, expectedRevision: revision },
    ];
  }
  return [{ acked, inFlight: null, queued: null }, null];
}

/** The in-flight save was refused; fall back to what the server holds and drop the queue. */
export function reject(slot: AnswerSlot): AnswerSlot {
  return { acked: slot.acked, inFlight: null, queued: null };
}
