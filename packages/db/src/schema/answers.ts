// Answer state (authoritative current answer) and answer mutation (append-
// only log) schema (ATM-002).
//
// dok 16 §3 "Concept separation" names these as two DISTINCT concepts:
// "Answer state | Jawaban terkini yang authoritative" and "Answer mutation
// | Log append-oriented perubahan jawaban" - this file owns exactly those
// two, mirroring the same event-log-plus-current-projection split this
// codebase already uses elsewhere (e.g. COM-002's raw/normalized commerce
// events).
//
// `answer_states` is the ONE row per (attempt, question instance) that
// `assessment - answer-save-cas.ts`'s compare-and-swap reads/writes -
// `revision` starts implicitly at 0 (no row = revision 0, payload null,
// see answer-state-repository.ts) and increments by exactly 1 on every
// ACCEPTED mutation, never on an idempotent replay or a conflict. This is
// what makes "Answer writes are idempotent and monotonic" (founder
// instruction) hold at the storage layer, not just in application code.
//
// `answer_mutations` is append-only and NEVER updated in place - dok 16
// §22 test invariant #2 ("same mutation ID tidak menambah revision dua
// kali") is enforced by `answer_mutation_attempt_instance_client_uq`: a
// retry with the SAME `client_mutation_id` hits this unique constraint,
// and the repository looks up the STORED row's own outcome instead of
// reprocessing (see answer-mutation-repository.ts's own module doc) -
// this is the literal mechanism behind "Offline reconnect harus idempotent
// dan tidak menggandakan answer" (founder instruction): a client retrying
// an unacknowledged mutation after reconnecting sends the identical
// `client_mutation_id` it always would have, and the server can only ever
// record it once.
//
// `outcome` mirrors @superlatif/domain/exam's `AnswerSaveCasOutcome` kinds
// plus the two timing-window outcomes (`late_sync_recovery_candidate`/
// `rejected`, @superlatif/domain/exam's `attempt-timing-window.ts`) - a
// `late_sync_recovery_candidate` mutation is stored here (dok 16 §24 RC2:
// "menyimpan payload, writer lease, waktu, checksum, dan state sebagai
// recovery candidate") but its own `answer_states` row is deliberately
// NEVER updated for that outcome - adjudication (accept/reject) is a later
// task this one does not build. `rejected` (past late_sync_cutoff_at) is
// refused before ever reaching this table at all (see attempt-service.ts).
//
// `leaseTokenHash` records WHICH lease authorized this mutation (dok 16
// §24 RC2's own "writer lease" field) - an audit trail, never used to
// re-derive authorization after the fact.

import { integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { attemptQuestionInstances, attempts } from "./attempts.ts";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const answerStates = pgTable(
  "answer_states",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => attempts.id),
    instanceId: uuid("instance_id")
      .notNull()
      .references(() => attemptQuestionInstances.id),
    revision: integer("revision").notNull().default(0),
    /** null = unanswered/cleared. Never a secret-bearing shape - see @superlatif/domain/exam's answer-payload.ts module doc. */
    payload: jsonb("payload").$type<Record<string, unknown> | null>(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("answer_state_attempt_instance_uq").on(table.attemptId, table.instanceId)],
);

export const answerMutations = pgTable(
  "answer_mutations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => attempts.id),
    instanceId: uuid("instance_id")
      .notNull()
      .references(() => attemptQuestionInstances.id),
    clientMutationId: uuid("client_mutation_id").notNull(),
    leaseTokenHash: text("lease_token_hash").notNull(),
    /** The `expectedRevision` this mutation's own request carried - compared against an incoming retry to detect a reused `client_mutation_id` with DIFFERENT content (dok 22 §14 `IDEMPOTENCY_KEY_REUSED`), the same pattern ATM-001's own `attempts.start_request_hash` already established. */
    expectedRevision: integer("expected_revision").notNull(),
    /** null = the client cleared/unanswered this instance in this mutation. */
    payload: jsonb("payload").$type<Record<string, unknown> | null>(),
    /** `accepted | idempotent_replay | conflict | late_sync_recovery_candidate` - see module doc. `rejected` (past cutoff) is refused before a row is ever inserted. */
    outcome: text("outcome").notNull(),
    /** The `answer_states.revision` this mutation resulted in (accepted) or observed (idempotent_replay/conflict) - null for `late_sync_recovery_candidate`, which never touches `answer_states`. */
    resultingRevision: integer("resulting_revision"),
    /** Client telemetry only (dok 16 §8: "untuk telemetry, bukan ordering authority") - never used for any timing decision. */
    capturedAtClient: timestamp("captured_at_client", { withTimezone: true }),
    serverReceivedAt: timestamp("server_received_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("answer_mutation_attempt_instance_client_uq").on(
      table.attemptId,
      table.instanceId,
      table.clientMutationId,
    ),
  ],
);
