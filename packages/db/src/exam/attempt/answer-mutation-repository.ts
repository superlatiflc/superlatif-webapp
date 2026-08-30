// answer_mutations persistence (ATM-002) - append-only, one row per
// distinct `client_mutation_id` ever processed for a (attempt, instance)
// pair, regardless of outcome.
//
// dok 16 §8 processing step 3 ("Deduplicate client_mutation_id") is NOT a
// "skip if seen" check alone - dok 22 §14's own idempotency contract
// requires "same key + same hash returns recorded outcome" for EVERY
// outcome, not just success. This is why a row is inserted here even for
// `conflict` and `late_sync_recovery_candidate` outcomes, not only
// `accepted`/`idempotent_replay`: a client retrying (offline reconnect,
// or a plain network-uncertainty retry) must get back the EXACT same
// answer every time it resends the same mutation ID, whatever that answer
// originally was - see attempt-service.ts's own `saveAnswer` for how a
// found row short-circuits straight to a reconstructed response without
// ever re-running the CAS decision.
//
// The unique constraint `answer_mutation_attempt_instance_client_uq`
// (schema/answers.ts) is the structural guarantee behind "Offline
// reconnect harus idempotent dan tidak menggandakan answer" - a second
// insert attempt for the same (attempt, instance, mutation ID) triple
// fails at the database, not merely by application discipline.

import { and, eq } from "drizzle-orm";
import type { Queryable, Schema } from "../../db-types.ts";
import { answerMutations } from "../../schema/index.ts";

export type AnswerMutationOutcome =
  "accepted" | "idempotent_replay" | "conflict" | "late_sync_recovery_candidate";

export interface AnswerMutationRow {
  readonly id: string;
  readonly attemptId: string;
  readonly instanceId: string;
  readonly clientMutationId: string;
  readonly leaseTokenHash: string;
  readonly expectedRevision: number;
  readonly payload: Record<string, unknown> | null;
  readonly outcome: AnswerMutationOutcome;
  readonly resultingRevision: number | null;
  readonly capturedAtClient: Date | null;
  readonly serverReceivedAt: Date;
}

const ANSWER_MUTATION_COLUMNS = {
  id: answerMutations.id,
  attemptId: answerMutations.attemptId,
  instanceId: answerMutations.instanceId,
  clientMutationId: answerMutations.clientMutationId,
  leaseTokenHash: answerMutations.leaseTokenHash,
  expectedRevision: answerMutations.expectedRevision,
  payload: answerMutations.payload,
  outcome: answerMutations.outcome,
  resultingRevision: answerMutations.resultingRevision,
  capturedAtClient: answerMutations.capturedAtClient,
  serverReceivedAt: answerMutations.serverReceivedAt,
};

export async function findMutationByClientId(
  db: Queryable<Schema>,
  attemptId: string,
  instanceId: string,
  clientMutationId: string,
): Promise<AnswerMutationRow | null> {
  const [row] = await db
    .select(ANSWER_MUTATION_COLUMNS)
    .from(answerMutations)
    .where(
      and(
        eq(answerMutations.attemptId, attemptId),
        eq(answerMutations.instanceId, instanceId),
        eq(answerMutations.clientMutationId, clientMutationId),
      ),
    )
    .limit(1);
  return (row as AnswerMutationRow | undefined) ?? null;
}

export interface InsertAnswerMutationInput {
  readonly attemptId: string;
  readonly instanceId: string;
  readonly clientMutationId: string;
  readonly leaseTokenHash: string;
  readonly expectedRevision: number;
  readonly payload: Record<string, unknown> | null;
  readonly outcome: AnswerMutationOutcome;
  readonly resultingRevision: number | null;
  readonly capturedAtClient: Date | null;
  readonly serverReceivedAt: Date;
}

export async function insertAnswerMutation(
  db: Queryable<Schema>,
  input: InsertAnswerMutationInput,
): Promise<AnswerMutationRow> {
  const [row] = await db.insert(answerMutations).values(input).returning(ANSWER_MUTATION_COLUMNS);
  if (!row) throw new Error("insertAnswerMutation: insert returned no row");
  return row as AnswerMutationRow;
}

/** ATM-003: does this attempt have any `late_sync_recovery_candidate` mutation at all? Feeds `SubmissionEnvelope.data.recoveryState` ("none" vs "candidate_stored") - this task builds no adjudication workflow, so `under_adjudication`/`accepted`/`rejected` are never produced here. */
export async function hasRecoveryCandidateMutations(
  db: Queryable<Schema>,
  attemptId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: answerMutations.id })
    .from(answerMutations)
    .where(
      and(
        eq(answerMutations.attemptId, attemptId),
        eq(answerMutations.outcome, "late_sync_recovery_candidate"),
      ),
    )
    .limit(1);
  return row !== undefined;
}
