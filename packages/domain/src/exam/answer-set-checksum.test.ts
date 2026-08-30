import { describe, expect, it } from "vitest";
import { computeAnswerSetChecksum, type FrozenAnswerEntry } from "./answer-set-checksum.ts";

const entries: FrozenAnswerEntry[] = [
  { instanceId: "b-instance", revision: 2, payload: { kind: "single_choice", optionCode: "B" } },
  { instanceId: "a-instance", revision: 1, payload: { kind: "single_choice", optionCode: "A" } },
];

describe("computeAnswerSetChecksum - submitted snapshot pins answer state/revision", () => {
  it("is deterministic for identical input", () => {
    expect(computeAnswerSetChecksum(entries)).toBe(computeAnswerSetChecksum(entries));
  });

  it("is independent of the input array's own order (sorted by instanceId internally)", () => {
    const reversed = [...entries].reverse();
    expect(computeAnswerSetChecksum(entries)).toBe(computeAnswerSetChecksum(reversed));
  });

  it("changes when any answer's revision changes", () => {
    const base = computeAnswerSetChecksum(entries);
    const bumped: FrozenAnswerEntry[] = [{ ...entries[0]!, revision: 99 }, entries[1]!];
    expect(computeAnswerSetChecksum(bumped)).not.toBe(base);
  });

  it("changes when any answer's payload changes", () => {
    const base = computeAnswerSetChecksum(entries);
    const changed: FrozenAnswerEntry[] = [
      { ...entries[0]!, payload: { kind: "single_choice", optionCode: "Z" } },
      entries[1]!,
    ];
    expect(computeAnswerSetChecksum(changed)).not.toBe(base);
  });

  it("changes when an instance is added or removed", () => {
    const base = computeAnswerSetChecksum(entries);
    const withExtra: FrozenAnswerEntry[] = [
      ...entries,
      { instanceId: "c-instance", revision: 1, payload: null },
    ];
    expect(computeAnswerSetChecksum(withExtra)).not.toBe(base);
    expect(computeAnswerSetChecksum([entries[0]!])).not.toBe(base);
  });

  it("handles an entirely empty (all-unanswered) attempt deterministically", () => {
    expect(computeAnswerSetChecksum([])).toBe(computeAnswerSetChecksum([]));
  });
});
