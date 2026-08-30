// Attempt snapshot checksum (ATM-001) - the "Snapshot hash stability"
// required test.
//
// dok 16 §24 RC2: "Attempt menyimpan FK dan checksum form, blueprint,
// scoring policy... serta start idempotency key." This checksum covers the
// pinned version identifiers PLUS the full presented-instance list
// (question version + presented option order per instance) - the complete
// set of scoring-relevant facts an attempt snapshots at start. Two calls
// with identical inputs MUST produce identical output (deterministic,
// order-sensitive on `instances` - the array order IS the presented
// sequence, so this checksum also detects an accidental reordering, not
// just a changed reference).

import { computeChecksum, type JsonValue } from "../shared/checksum.ts";
import type { PresentedInstance } from "./attempt-presentation.ts";

export interface AttemptSnapshotIdentity {
  readonly batchId: string;
  readonly examFormVersionId: string;
  readonly blueprintVersionId: string;
  readonly scoringPolicyVersionId: string;
  readonly instances: readonly PresentedInstance[];
}

export function computeAttemptSnapshotChecksum(identity: AttemptSnapshotIdentity): string {
  return computeChecksum({
    batchId: identity.batchId,
    examFormVersionId: identity.examFormVersionId,
    blueprintVersionId: identity.blueprintVersionId,
    scoringPolicyVersionId: identity.scoringPolicyVersionId,
    instances: identity.instances.map((instance) => ({
      sequence: instance.sequence,
      sectionCode: instance.sectionCode,
      order: instance.order,
      questionVersionId: instance.questionVersionId,
      presentedOptionOrder: instance.presentedOptionOrder,
    })),
  } as unknown as JsonValue);
}
