// attempt_question_instances persistence (ATM-001).
//
// One insert-once-at-start call - `insertPresentedInstances` - and one read
// - `listPresentedInstances`, used by resume. There is no "replace" or
// "update" function here on purpose: dok 16 §6 "Same attempt always
// resumes the same presentation" - once written, this set is immutable for
// the life of the attempt (this task builds no code path that could ever
// call insert a second time for the same attemptId; the unique constraints
// on `(attemptId, sequence)`/`(attemptId, questionVersionId)` would refuse
// it anyway).

import { asc, eq } from "drizzle-orm";
import type { Queryable, Schema } from "../../db-types.ts";
import { attemptQuestionInstances } from "../../schema/index.ts";
import type { PresentedInstance } from "@superlatif/domain/exam";

export interface AttemptQuestionInstanceRow {
  readonly id: string;
  readonly attemptId: string;
  readonly sequence: number;
  readonly sectionCode: string;
  readonly order: number;
  readonly questionVersionId: string;
  readonly presentedOptionOrder: readonly string[] | null;
}

const INSTANCE_COLUMNS = {
  id: attemptQuestionInstances.id,
  attemptId: attemptQuestionInstances.attemptId,
  sequence: attemptQuestionInstances.sequence,
  sectionCode: attemptQuestionInstances.sectionCode,
  order: attemptQuestionInstances.order,
  questionVersionId: attemptQuestionInstances.questionVersionId,
  presentedOptionOrder: attemptQuestionInstances.presentedOptionOrder,
};

export async function insertPresentedInstances(
  db: Queryable<Schema>,
  attemptId: string,
  instances: readonly PresentedInstance[],
): Promise<readonly AttemptQuestionInstanceRow[]> {
  if (instances.length === 0) return [];
  const inserted = await db
    .insert(attemptQuestionInstances)
    .values(
      instances.map((instance) => ({
        attemptId,
        sequence: instance.sequence,
        sectionCode: instance.sectionCode,
        order: instance.order,
        questionVersionId: instance.questionVersionId,
        presentedOptionOrder: instance.presentedOptionOrder,
      })),
    )
    .returning(INSTANCE_COLUMNS);
  return inserted as AttemptQuestionInstanceRow[];
}

export async function listPresentedInstances(
  db: Queryable<Schema>,
  attemptId: string,
): Promise<readonly AttemptQuestionInstanceRow[]> {
  const rows = await db
    .select(INSTANCE_COLUMNS)
    .from(attemptQuestionInstances)
    .where(eq(attemptQuestionInstances.attemptId, attemptId))
    .orderBy(asc(attemptQuestionInstances.sequence));
  return rows as AttemptQuestionInstanceRow[];
}

/** ATM-002: one instance, looked up by its own id (the `{instanceId}` path segment of `PUT /attempts/{id}/answers/{instanceId}`). The caller still must verify `attemptId` ownership itself - this function does not scope by attempt. */
export async function findInstanceById(
  db: Queryable<Schema>,
  instanceId: string,
): Promise<AttemptQuestionInstanceRow | null> {
  const [row] = await db
    .select(INSTANCE_COLUMNS)
    .from(attemptQuestionInstances)
    .where(eq(attemptQuestionInstances.id, instanceId))
    .limit(1);
  return (row as AttemptQuestionInstanceRow | undefined) ?? null;
}
