// Privacy-safe versioned leaderboard schema (SCR-003).
//
// dok 21 §10 `ranking_subjects`/`ranking_snapshots`/`ranking_entries`:
// "`ranking_subjects` adalah mapping restricted user↔subject token/alias/
// privacy preference. Snapshot dan entry hanya menyimpan
// `ranking_subject_id`, score tuple, tie-break, dan cohort - tidak ada FK
// user langsung pada immutable entry. Public serializer meresolve alias
// saat baca dan tidak mengekspos subject token." - transcribed exactly:
// `ranking_entries` references `ranking_subjects.id`, never `users.id`
// directly. Only `ranking_subjects` itself (a genuinely restricted table,
// never joined into a student-facing response beyond its own
// `publicOptIn`/`displayAlias` columns) carries the real `userId`.
//
// `ranking_snapshots` mirrors `result_versions`' own versioned-immutable-
// history shape exactly (SCR-001/SCR-002): `(batch_id, version)` unique,
// plus a REAL partial unique index `(batch_id) WHERE is_current = true` -
// the same "one current, boolean flag, not a now() predicate" pattern
// `attempt_writer_lease_active_uq`/`result_version_attempt_current_uq`
// already established. "Corrections create a new ranking version"
// (acceptance) is this same mechanism, one layer up: `ranking-service.ts`
// supersedes the prior current snapshot and inserts a new one, never
// mutating an existing snapshot's own entries in place.
//
// `ranking_entries.score_summary` DENORMALIZES the score at generation
// time (rather than joining `result_versions` fresh on every leaderboard
// read) - a snapshot's own entries must stay a stable, immutable record of
// what the leaderboard actually showed at that version, even if
// (hypothetically) something about result_versions' own projection logic
// changed later. `result_version_id` is kept alongside purely for audit
// traceability, not as the read-time source of the displayed score.

import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { examBatches } from "./exam-batches.ts";
import { resultVersions } from "./results.ts";
import { users } from "./identity.ts";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/**
 * The ONE restricted table with a direct `userId` FK. `subjectToken` is an
 * opaque, internal join key - generated once, never serialized to any
 * client response (dok 21's own "tidak mengekspos subject token").
 * `publicOptIn`/`displayAlias` are mutable - dok 18 §15 "User dapat
 * memilih privacy display sesuai policy" - and resolved FRESH at every
 * leaderboard read (ranking-service.ts), never frozen into a snapshot
 * entry, so a privacy-preference change takes effect immediately even for
 * already-generated snapshots. Default `publicOptIn = false`: private
 * until the user explicitly opts in, matching this codebase's own
 * default-deny discipline (`PERMISSION_CODES`' own "absence means
 * denied").
 */
export const rankingSubjects = pgTable(
  "ranking_subjects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    subjectToken: text("subject_token").notNull(),
    publicOptIn: boolean("public_opt_in").notNull().default(false),
    displayAlias: text("display_alias"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("ranking_subject_user_uq").on(table.userId),
    uniqueIndex("ranking_subject_token_uq").on(table.subjectToken),
  ],
);

export const rankingSnapshots = pgTable(
  "ranking_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => examBatches.id),
    version: integer("version").notNull().default(1),
    isCurrent: boolean("is_current").notNull().default(true),
    /** "provisional" | "corrected" - this task's own two written values, mirroring result_versions.state exactly (SCR-002 added "corrected" there for the same reason). */
    state: text("state").notNull(),
    /** The batch's OWN `ranking_attempt_rule` value (EXM-002, exam_batches.ranking_attempt_rule) AT GENERATION TIME - carried for traceability, not re-derived; "Batch adalah satu-satunya pemilik" (dok 18 §21) is honored by reading, never redeclaring, that field. */
    rankingAttemptRule: text("ranking_attempt_rule").notNull(),
    /** @superlatif/domain/exam's RANKING_POLICY_VERSION constant - "Tie-break berversi" (dok 18 §15). */
    policyVersion: text("policy_version").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("ranking_snapshot_batch_version_uq").on(table.batchId, table.version),
    uniqueIndex("ranking_snapshot_batch_current_uq")
      .on(table.batchId)
      .where(sql`${table.isCurrent} = true`),
  ],
);

export const rankingEntries = pgTable(
  "ranking_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    rankingSnapshotId: uuid("ranking_snapshot_id")
      .notNull()
      .references(() => rankingSnapshots.id),
    rankingSubjectId: uuid("ranking_subject_id")
      .notNull()
      .references(() => rankingSubjects.id),
    /** Audit traceability only - see module doc; never the read-time source of `scoreSummary`. */
    resultVersionId: uuid("result_version_id")
      .notNull()
      .references(() => resultVersions.id),
    rank: integer("rank").notNull(),
    /** Hoisted scalar (matches result_versions.total_score's own precedent) - direct ORDER BY without JSON-path queries. */
    totalScore: doublePrecision("total_score").notNull(),
    /** {total, sectionScores, sectionMaxScores, overallPassed} - the SAME allowlisted shape StudentResultView.scoreSummary already uses (SCR-002), denormalized at generation time (see module doc). */
    scoreSummary: jsonb("score_summary").$type<Record<string, unknown>>().notNull(),
    /** The tie-break input actually used (dok 18 §15 "Tie-break berversi") - the attempt's own submittedAt at generation time. */
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull(),
    /** dok 18 §15 "Cohort dan eligible attempts eksplisit" - null in this task's own MVP scope (no cohort-grouping feature is built; every entry belongs to the whole-batch cohort implicitly). */
    cohort: text("cohort"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("ranking_entry_snapshot_subject_uq").on(table.rankingSnapshotId, table.rankingSubjectId),
  ],
);
