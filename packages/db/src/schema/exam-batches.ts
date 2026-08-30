// Tryout batch and independent window schema (EXM-002).
//
// dok 18 "Flash Sale and Batch System" / dok 21 §9's ERD names `exam_batches`
// and `batch_windows` as two tables: the batch's own operational identity,
// and one row per independent window (registration/attempt/late-sync-
// cutoff/provisional-result-release/final-result-release/leaderboard-
// release/explanation-release/access-end). This mirrors
// contracts/drizzle-schema.ts's own table shape closely, with two
// deliberate, documented divergences (both from explicit founder
// instruction, CLAUDE.md "Source of truth" - a lower-layer reviewed
// contract does not override a founder decision for this task):
//
//   1. NO `state` column. "Batch state harus server-derived, jangan simpan
//      status mutable" - @superlatif/domain/exam's `deriveBatchState`
//      computes the canonical 11-value operational state fresh from
//      `windows` + `status` + `voidedAt` + `now` on every read, exactly
//      like `deriveOfferSaleState` (COM-001) and `deriveGrantStatus`
//      (ENT-001) already do for their own domains. See batch-state.ts's
//      own module doc for the full rationale.
//   2. NO `catalogue`/`sale` window rows are ever written here, even
//      though the underlying `batch_window_type` pg enum still carries
//      those two values for vocabulary parity with the reviewed contract.
//      dok 18 §2: "Harga tidak berada di batch. Exam window tidak berada
//      di offer." Sales side reuses COM-001's own `offers` unchanged - see
//      batch-repository.ts's own module doc for how a batch is targeted by
//      a product_component without any new commerce code
//      (`targetType.exam_batch` already exists in enums.ts).
//
// `examFormVersionId` is THE pin ("Batch harus pin exact published
// exam_form_version" - founder instruction): a plain FK into EXM-001's own
// `exam_form_versions.id`. batch-service.ts (EXM-002) refuses to create a
// batch pinning a form version that is not already `published`, the exact
// same "can only pin an already-locked artifact" discipline
// exam-config-service.ts's own `createExamFormDraft` already applies to
// blueprint versions.
//
// `status` (recordStatus, reused unchanged) is the batch's own GOVERNANCE
// gate - draft/in_review/changes_requested/approved/published/archived,
// the same lock-on-publish workflow blueprint/scoring/form versions use.
// Once `published`, the batch's `windows` become immutable
// (assertExamConfigVersionMutable refuses further calls to
// batch-window-repository's replace function) - this is what makes
// "Changing offer windows tidak boleh mengubah attempt/batch history" hold
// structurally: a published batch's own windows can never be edited in
// place, only voided (an explicit, audited, immutable fact - `voidedAt`)
// or superseded by an entirely new batch.
//
// `timezone` mirrors `schedule_items.timezone` exactly (SCH-001): an IANA
// zone recorded for AUTHORING/DISPLAY purposes only.
// `batch_windows.starts_at`/`ends_at` are always the canonical UTC instant
// - this is what makes the acceptance criterion "windows are independent
// and timezone-safe" hold at the storage layer, not just in application
// code.

import { boolean, check, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { batchWindowType, recordStatus } from "./enums.ts";
import { users } from "./identity.ts";
import { examFormVersions } from "./exam-config.ts";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const examBatches = pgTable(
  "exam_batches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: text("code").notNull(),
    examFormVersionId: uuid("exam_form_version_id")
      .notNull()
      .references(() => examFormVersions.id),
    title: text("title").notNull(),
    /** IANA zone, authoring/display only - see module doc. */
    timezone: text("timezone").notNull(),
    /** dok 18 §21 RC2: "Batch adalah satu-satunya pemilik ranking_attempt_rule." One of "first"/"best"/"latest" (@superlatif/domain/exam's assertValidBatchRankingAttemptRule) - free text, not a pg enum, matching `products.type`'s own extensibility choice (COM-001). */
    rankingAttemptRule: text("ranking_attempt_rule").notNull().default("first"),
    /** dok 18 §15: "Leaderboard boleh dimatikan per batch." */
    leaderboardEnabled: boolean("leaderboard_enabled").notNull().default(true),
    status: recordStatus("status").notNull().default("draft"),
    /** Non-null once an admin has explicitly voided the batch - an immutable fact, never cleared. See batch-state.ts's own module doc. */
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedReason: text("voided_reason"),
    /** Covers only this row's own identity fields (examFormVersionId/title/timezone/rankingAttemptRule/leaderboardEnabled) - window-set integrity is enforced separately by batch_windows' own unique constraint and by the publication validator re-reading the window set fresh at publish time, the exact same split exam_form_versions.checksum already applies to exam_form_items (see exam-form-repository.ts's own module doc). */
    checksum: text("checksum").notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("exam_batch_code_uq").on(table.code)],
);

/**
 * One row per independent window (dok 18 §3). `windowType` uses the full
 * ten-value canonical enum (vocabulary parity with
 * contracts/drizzle-schema.ts) but `catalogue`/`sale` are refused at the
 * domain/repository layer before they would ever reach this table - see
 * module doc. The CHECK constraint is a second, DB-level guard mirroring
 * the reviewed contract's own shape: `registration`/`attempt` are ranged
 * (endsAt required, after startsAt); every other type - including the two
 * never actually written here - is a single point in time (endsAt absent).
 */
export const batchWindows = pgTable(
  "batch_windows",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    examBatchId: uuid("exam_batch_id")
      .notNull()
      .references(() => examBatches.id),
    windowType: batchWindowType("window_type").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("batch_window_batch_type_uq").on(table.examBatchId, table.windowType),
    check(
      "batch_window_ranged_shape_ck",
      sql`(${table.windowType} IN ('registration', 'attempt') AND ${table.endsAt} IS NOT NULL AND ${table.endsAt} > ${table.startsAt})
        OR (${table.windowType} NOT IN ('registration', 'attempt') AND ${table.endsAt} IS NULL)`,
    ),
  ],
);
