import { describe, expect, it } from "vitest";
import { computeAttemptSnapshotChecksum, type AttemptSnapshotIdentity } from "./attempt-snapshot-checksum.ts";
import type { PresentedInstance } from "./attempt-presentation.ts";

const instances: PresentedInstance[] = [
  { sequence: 1, sectionCode: "TWK", order: 1, questionVersionId: "q1", presentedOptionOrder: ["A", "B"] },
  { sequence: 2, sectionCode: "TKP", order: 1, questionVersionId: "q2", presentedOptionOrder: null },
];

function identity(): AttemptSnapshotIdentity {
  return {
    batchId: "batch-1",
    examFormVersionId: "form-v-1",
    blueprintVersionId: "bp-v-1",
    scoringPolicyVersionId: "sp-v-1",
    instances,
  };
}

describe("computeAttemptSnapshotChecksum - snapshot hash stability", () => {
  it("is deterministic for identical input", () => {
    expect(computeAttemptSnapshotChecksum(identity())).toBe(computeAttemptSnapshotChecksum(identity()));
  });

  it("changes when any pinned identifier changes", () => {
    const base = computeAttemptSnapshotChecksum(identity());
    expect(computeAttemptSnapshotChecksum({ ...identity(), examFormVersionId: "form-v-2" })).not.toBe(base);
    expect(computeAttemptSnapshotChecksum({ ...identity(), blueprintVersionId: "bp-v-2" })).not.toBe(base);
    expect(computeAttemptSnapshotChecksum({ ...identity(), scoringPolicyVersionId: "sp-v-2" })).not.toBe(
      base,
    );
    expect(computeAttemptSnapshotChecksum({ ...identity(), batchId: "batch-2" })).not.toBe(base);
  });

  it("changes when the presented order changes, even with the same set of questions", () => {
    const reordered: PresentedInstance[] = [
      { ...instances[1]!, sequence: 1 },
      { ...instances[0]!, sequence: 2 },
    ];
    const base = computeAttemptSnapshotChecksum(identity());
    expect(computeAttemptSnapshotChecksum({ ...identity(), instances: reordered })).not.toBe(base);
  });

  it("changes when a presented option order changes", () => {
    const changed: PresentedInstance[] = [
      { ...instances[0]!, presentedOptionOrder: ["B", "A"] },
      instances[1]!,
    ];
    const base = computeAttemptSnapshotChecksum(identity());
    expect(computeAttemptSnapshotChecksum({ ...identity(), instances: changed })).not.toBe(base);
  });
});
