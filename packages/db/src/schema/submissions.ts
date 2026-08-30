// Final submission, scoring-job outbox, and attempt audit-event schema
// (ATM-003).
//
// dok 16 §3 "Submission" is its own named concept, distinct from "Answer
// state"/"Answer mutation" (ATM-002). `attempt_submissions.attempt_id` is
// UNIQUE - "Satu final submit per attempt" (dok 16 §24 RC2) is a real
// database constraint, not application discipline alone, the same class
// of guarantee `attempts_user_batch_active_uq` (ATM-001) and
// `answer_mutation_attempt_instance_client_uq` (ATM-002) already
// established for their own no-duplicate invariants. "Manual dan
// automatic submit are idempotent" and "Worker retry tidak boleh membuat
// submit ganda" hold BECAUSE of this constraint: whichever caller's
// insert lands first wins, and every other caller (user retry, timeout
// re-fire, worker retry) finds the existing row and returns it unchanged
// - see attempt-service.ts's own `submitAttempt`/`finalizeExpiredAttempt`
// module doc for the exact race-safe sequence.
//
// `scoring_job_outbox` mirrors `commerce_outbox`'s own shape exactly
// (COM-003 - id/targetId/eventType/payload/status/createdAt/deliveredAt)
// - the same transactional-outbox pattern this codebase already
// established, applied to a new domain. dok 16 §13 step 5: "Scoring job
// dibuat transactional outbox" - the row is inserted in the SAME
// transaction as the submission itself. `payload` is deliberately minimal
// (just the submission/attempt id references) - "Jangan bangun scoring
// engine" (founder instruction) means no worker ever reads this table in
// this task; a future scoring worker re-reads `answer_states`/
// `attempt_submissions` fresh from their own id, matching dok 16 §14's own
// "Scoring input hanya: submission answer snapshot..." - the outbox never
// duplicates that data itself.
//
// `attempt_audit_events` is an append-only, ALLOWLISTED-BY-CONSTRUCTION
// record - every column is an explicit, individually-typed, already-safe
// field (attempt id, event type, trigger, actor, revision-at-event,
// checksum, recovery state). There is no JSONB "metadata" column here at
// all, unlike `commerce_outbox`'s own free-form `payload` - a structural
// guarantee, not review discipline, that answer payloads/secrets can
// never end up in this table, the same "no field exists to assign a
// secret to" pattern `StudentFacingQuestionView`/`AnswerPayload` already
// established for their own domains. "Audit telemetry harus bisa
// rekonstruksi incident tanpa logging answer payload/secrets" (founder
// instruction) holds by this table's own shape, not by what a caller
// remembers not to log.

import { integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { attempts } from "./attempts.ts";
import { users } from "./identity.ts";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const attemptSubmissions = pgTable(
  "attempt_submissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => attempts.id),
    /** Client-supplied for a user-triggered submit; null for a timeout/system-triggered finalization (dok 16 §13's own "Scheduler/worker... dapat memicu finalization"). */
    mutationId: uuid("mutation_id"),
    /** "user" | "timeout" - see attempt-service.ts's own `SubmitTrigger` union. Recorded for audit reconstruction, not re-interpreted by any code that reads this row back. */
    triggeredBy: text("triggered_by").notNull(),
    answerSetChecksum: text("answer_set_checksum").notNull(),
    /** The `attempts.attemptRevision` value that was current AT the instant of finalization - "Submitted snapshot harus pin answer state/revision saat submit." */
    attemptRevisionAtSubmit: integer("attempt_revision_at_submit").notNull(),
    acknowledgedUnansweredCount: integer("acknowledged_unanswered_count"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("attempt_submissions_attempt_id_uq").on(table.attemptId)],
);

export const scoringJobOutbox = pgTable("scoring_job_outbox", {
  id: uuid("id").defaultRandom().primaryKey(),
  submissionId: uuid("submission_id")
    .notNull()
    .references(() => attemptSubmissions.id),
  attemptId: uuid("attempt_id")
    .notNull()
    .references(() => attempts.id),
  eventType: text("event_type").notNull().default("score_attempt"),
  /** Deliberately minimal - {submissionId, attemptId} only. See module doc. */
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: createdAt(),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
});

export const attemptAuditEvents = pgTable("attempt_audit_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  attemptId: uuid("attempt_id")
    .notNull()
    .references(() => attempts.id),
  /** "submitted" | "submission_replayed" | "scoring_job_enqueued" - see attempt-service.ts. */
  eventType: text("event_type").notNull(),
  /** "user" | "timeout" - null is not a valid value; every audited event has a known trigger source. */
  triggeredBy: text("triggered_by").notNull(),
  /** null for a timeout/system-triggered event - no student actor initiated it. */
  actorUserId: uuid("actor_user_id").references(() => users.id),
  attemptRevisionAtEvent: integer("attempt_revision_at_event").notNull(),
  answerSetChecksum: text("answer_set_checksum"),
  /** "none" | "candidate_stored" | "under_adjudication" | "accepted" | "rejected" - contracts/openapi.yaml's own `SubmissionEnvelope.data.recoveryState` enum, transcribed. */
  recoveryState: text("recovery_state"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});
