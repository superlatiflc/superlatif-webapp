// Bulk question import job ledger (QST-002).
//
// dok 15A §6: "`import_job_id` unik untuk upload; retry byte-identik
// mengembalikan job yang sama." `contentChecksum` (sha256 over the
// workbook+ZIP bytes) IS that idempotency key - a caller does not supply
// one, the content itself defines it, so a byte-identical resubmission is
// mechanically indistinguishable from the original upload and can never
// double-import. See packages/db/src/exam/import/question-import-service.ts
// for the lookup-before-process discipline this table exists to support.
//
// `status` only ever takes two values in this task, `completed`/`failed` -
// a deliberate scope reduction from dok 15A §7's full async pipeline
// (`awaiting_upload → queued → scanning → parsing → validating →
// preview_ready → blocked|importing → completed|partial|failed|cancelled`).
// This task runs the whole pipeline synchronously inside one call and
// commits atomically ("Import harus rollback kalau ada error" - founder
// instruction): every row is validated BEFORE anything is written, and the
// write phase is one database transaction, so there is no real
// `partial`/`blocked`/`cancelled` state to represent. A future async-worker
// task can widen this column's vocabulary without a destructive migration
// - text, not a closed pgEnum, for exactly that reason (same choice
// `questions.status`/`stimuli.status` already made in QST-001).
// `resultSummary` never stores raw workbook/ZIP bytes or row content -
// only counts and safe, code-identified issue messages (question codes,
// reason codes) - matching COM-002's redaction discipline for external
// payloads.

import { jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./identity.ts";

export const questionImportJobs = pgTable(
  "question_import_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    contentChecksum: text("content_checksum").notNull(),
    /** "update_draft" | "create_revision" - dok 15A §6. */
    jobMode: text("job_mode").notNull(),
    templateVersion: text("template_version").notNull(),
    /** "completed" | "failed" - see module doc for why this stays a small closed set in this task. */
    status: text("status").notNull(),
    resultSummary: jsonb("result_summary").$type<Record<string, unknown>>().notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("question_import_job_checksum_uq").on(table.contentChecksum)],
);
