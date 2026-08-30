// Attempt start, immutable snapshot, and writer-lease schema (ATM-001).
//
// dok 16 §3 "Concept separation" names `Attempt` and `Question instance` as
// distinct concepts from batch/form/blueprint - this file owns exactly
// those two, plus the writer-lease mechanism dok 16 §7 requires at start
// time. Answer state, answer mutation, submission, and result version
// (dok 16 §3's remaining rows) are explicitly OUT of scope - "Jangan
// bangun answer/save/submit/scoring/ranking dulu" (founder instruction).
//
// dok 16 §24 RC2 (binding): "Attempt menyimpan FK dan checksum form,
// blueprint, scoring policy, attempt policy snapshot, akomodasi, deadline/
// cutoff, serta start idempotency key." `examFormVersionId`/
// `blueprintVersionId`/`scoringPolicyVersionId` are stored DIRECTLY on the
// attempt (resolved once at start from the batch's own pin), not merely
// inherited via `batchId` - an attempt's own historical snapshot must stay
// intact even if the batch row it references is later voided/archived/
// superseded (EXM-002's own batch lock discipline already keeps a batch's
// own pin immutable once approved, but this attempt-level copy is what the
// RC2 resolution explicitly asks for, and is the field
// `computeAttemptSnapshotChecksum` covers). `attempt_policy_snapshot` and
// `accommodation` are NOT modeled here - `attempt_policies` does not exist
// as a table anywhere in this codebase yet (EXM-002's own ADR-065 already
// deferred it to a future ATM-series task), and accommodation is
// ATM-010/later scope; both are left out rather than guessed at.
//
// One partial UNIQUE index is the structural guarantee behind "Start harus
// idempotent dan tidak membuat attempt ganda" (founder instruction):
// `attempts_user_batch_active_uq` on `(user_id, batch_id)` WHERE
// `status <> 'voided'` - the database itself refuses a second non-voided
// attempt row for the same (user, batch) pair, not merely application
// discipline. A genuinely new attempt after a voided one is a NEW row,
// matching dok 16 §4's own state diagram (`Created|InProgress|Submitted ->
// Voided` is a terminal branch, not a reusable slot).
//
// `attempt_question_instances` is the "presented question and option
// order" persisted server-side (dok 16 §5 steps 5-6, §6 "Presented order is
// persisted explicitly, not reconstructed"). `presentedOptionOrder` is an
// array of option/statement codes in PRESENTED order - null for
// `numeric` questions, which have neither.
//
// `attempt_writer_leases` implements dok 16 §7/§24 RC2 literally: "Writer
// lease mempunyai flag `is_active` dengan partial unique index" -
// `attempt_writer_lease_active_uq` on `attempt_id` WHERE `is_active`. A new
// lease row is inserted on every issue/renew/takeover; old rows are never
// deleted, only flagged `is_active=false` with a `revokedAt`/`revokedReason`
// - an append-only history, the same "state changes are facts" discipline
// EXM-002 already applied to `voidedAt`. Only the token HASH is ever
// stored, matching dok 16 §20 ("Writer lease token hanya disimpan hash di
// server") and every other bearer-token table in this codebase
// (`live_session_join_references`, `asset_delivery_references`).

import {
  boolean,
  check,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { attemptStatus } from "./enums.ts";
import { users } from "./identity.ts";
import { examBatches } from "./exam-batches.ts";
import { examBlueprintVersions, examFormVersions, scoringPolicyVersions } from "./exam-config.ts";
import { questionVersions } from "./questions.ts";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const attempts = pgTable(
  "attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => examBatches.id),
    /** Pinned copies, resolved once at start - see module doc. */
    examFormVersionId: uuid("exam_form_version_id")
      .notNull()
      .references(() => examFormVersions.id),
    blueprintVersionId: uuid("blueprint_version_id")
      .notNull()
      .references(() => examBlueprintVersions.id),
    scoringPolicyVersionId: uuid("scoring_policy_version_id")
      .notNull()
      .references(() => scoringPolicyVersions.id),
    status: attemptStatus("status").notNull().default("created"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }).notNull(),
    lateSyncCutoffAt: timestamp("late_sync_cutoff_at", { withTimezone: true }).notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    /** Optimistic-concurrency counter for the future answer-save path (ATM-004/005, not built here) - initialized so that surface exists without this task depending on it. */
    attemptRevision: integer("attempt_revision").notNull().default(0),
    /** Covers batchId/examFormVersionId/blueprintVersionId/scoringPolicyVersionId + the full presented instance list - "Snapshot hash stability" (required test). */
    snapshotChecksum: text("snapshot_checksum").notNull(),
    /** The caller-supplied idempotency key from the start request (dok 22 §14). */
    startIdempotencyKey: text("start_idempotency_key").notNull(),
    /** Hash of the semantically-relevant start request content (currently just `clientCapabilities`) - same key + different hash is refused (`IDEMPOTENCY_KEY_REUSED`), matching dok 22 §14 exactly. */
    startRequestHash: text("start_request_hash").notNull(),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedReason: text("voided_reason"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("attempts_user_batch_active_uq")
      .on(table.userId, table.batchId)
      .where(sql`${table.status} <> 'voided'`),
    uniqueIndex("attempts_user_idempotency_key_uq").on(table.userId, table.startIdempotencyKey),
  ],
);

export const attemptQuestionInstances = pgTable(
  "attempt_question_instances",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => attempts.id),
    /** 1-based overall presented order across the whole attempt. */
    sequence: integer("sequence").notNull(),
    sectionCode: text("section_code").notNull(),
    /** Position within the section - mirrors exam_form_items.order for the pinned form. */
    order: integer("order").notNull(),
    questionVersionId: uuid("question_version_id")
      .notNull()
      .references(() => questionVersions.id),
    /** Array of option/statement codes in PRESENTED order - null for `numeric`. See module doc. */
    presentedOptionOrder: jsonb("presented_option_order").$type<readonly string[] | null>(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("attempt_question_instance_attempt_sequence_uq").on(table.attemptId, table.sequence),
    uniqueIndex("attempt_question_instance_attempt_question_uq").on(table.attemptId, table.questionVersionId),
  ],
);

export const attemptWriterLeases = pgTable(
  "attempt_writer_leases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => attempts.id),
    tokenHash: text("token_hash").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
    renewedAt: timestamp("renewed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedReason: text("revoked_reason"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("attempt_writer_lease_active_uq")
      .on(table.attemptId)
      .where(sql`${table.isActive}`),
    // `isActive` only ever flips to false on an EXPLICIT revoke (takeover) -
    // never a background "expiry" sweep. Whether an active lease has
    // simply timed out is DERIVED at read time from `expiresAt` vs `now`
    // (see @superlatif/domain/exam's deriveWriterLeaseState), not a second
    // stored status - the same "compute, don't store" discipline EXM-002
    // already applied to batch state.
    check(
      "attempt_writer_lease_revoked_shape_ck",
      sql`${table.isActive} = true OR (${table.isActive} = false AND ${table.revokedAt} IS NOT NULL)`,
    ),
  ],
);
