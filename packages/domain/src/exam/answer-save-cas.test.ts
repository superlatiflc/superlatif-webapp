import { describe, expect, it } from "vitest";
import { resolveAnswerSaveOutcome } from "./answer-save-cas.ts";
import type { AnswerPayload } from "./answer-payload.ts";

const A: AnswerPayload = { kind: "single_choice", optionCode: "A" };
const B: AnswerPayload = { kind: "single_choice", optionCode: "B" };

describe("resolveAnswerSaveOutcome - monotonic, revision-safe CAS", () => {
  it("accepts a save when expectedRevision matches the current revision, incrementing it", () => {
    const outcome = resolveAnswerSaveOutcome({
      currentRevision: 0,
      currentPayload: null,
      expectedRevision: 0,
      newPayload: A,
    });
    expect(outcome).toEqual({ kind: "accepted", newRevision: 1 });
  });

  it("accepts a subsequent save at the new revision", () => {
    const outcome = resolveAnswerSaveOutcome({
      currentRevision: 1,
      currentPayload: A,
      expectedRevision: 1,
      newPayload: B,
    });
    expect(outcome).toEqual({ kind: "accepted", newRevision: 2 });
  });

  it("is idempotent when the same mutation is replayed with a stale expectedRevision but IDENTICAL payload (dok 16 §8 step 7)", () => {
    const outcome = resolveAnswerSaveOutcome({
      currentRevision: 2,
      currentPayload: B,
      expectedRevision: 1, // stale - server already advanced to 2
      newPayload: B, // but the content matches what's already there
    });
    expect(outcome).toEqual({ kind: "idempotent_replay", revision: 2, payload: B });
  });

  it("returns a 409-equivalent conflict when expectedRevision is stale AND the payload genuinely differs (no lost update)", () => {
    const outcome = resolveAnswerSaveOutcome({
      currentRevision: 2,
      currentPayload: B,
      expectedRevision: 1,
      newPayload: A, // different from what's actually current
    });
    expect(outcome).toEqual({ kind: "conflict", currentRevision: 2, currentPayload: B });
  });

  it("treats null vs null as equal (idempotent) and null vs a real answer as different (conflict)", () => {
    expect(
      resolveAnswerSaveOutcome({
        currentRevision: 5,
        currentPayload: null,
        expectedRevision: 1,
        newPayload: null,
      }),
    ).toEqual({ kind: "idempotent_replay", revision: 5, payload: null });
    expect(
      resolveAnswerSaveOutcome({
        currentRevision: 5,
        currentPayload: A,
        expectedRevision: 1,
        newPayload: null,
      }),
    ).toEqual({ kind: "conflict", currentRevision: 5, currentPayload: A });
  });

  it("multiple_choice equality is order-independent (same set, different order, still idempotent)", () => {
    const set1: AnswerPayload = { kind: "multiple_choice", optionCodes: ["A", "B"] };
    const set2: AnswerPayload = { kind: "multiple_choice", optionCodes: ["B", "A"] };
    expect(
      resolveAnswerSaveOutcome({
        currentRevision: 3,
        currentPayload: set1,
        expectedRevision: 1,
        newPayload: set2,
      }),
    ).toEqual({ kind: "idempotent_replay", revision: 3, payload: set1 });
  });

  it("statement_true_false equality compares all key/value pairs", () => {
    const s1: AnswerPayload = { kind: "statement_true_false", values: { S1: true, S2: false } };
    const s2: AnswerPayload = { kind: "statement_true_false", values: { S1: true, S2: false } };
    const s3: AnswerPayload = { kind: "statement_true_false", values: { S1: true, S2: true } };
    expect(
      resolveAnswerSaveOutcome({
        currentRevision: 1,
        currentPayload: s1,
        expectedRevision: 0,
        newPayload: s2,
      }),
    ).toEqual({ kind: "idempotent_replay", revision: 1, payload: s1 });
    expect(
      resolveAnswerSaveOutcome({
        currentRevision: 1,
        currentPayload: s1,
        expectedRevision: 0,
        newPayload: s3,
      }),
    ).toEqual({ kind: "conflict", currentRevision: 1, currentPayload: s1 });
  });

  it("numeric equality is exact string comparison (no numeric coercion)", () => {
    const n1: AnswerPayload = { kind: "numeric", value: "3.10" };
    const n2: AnswerPayload = { kind: "numeric", value: "3.1" };
    // Different normalized strings - NOT treated as equal even though numerically same;
    // this function never parses the value, matching its own "pure comparison" scope.
    expect(
      resolveAnswerSaveOutcome({
        currentRevision: 1,
        currentPayload: n1,
        expectedRevision: 0,
        newPayload: n2,
      }),
    ).toEqual({ kind: "conflict", currentRevision: 1, currentPayload: n1 });
  });
});
