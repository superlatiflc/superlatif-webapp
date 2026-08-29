// Versioned question bank schema (QST-001).
//
// dok 15 §4 "Stable identity dan version": "question adalah identity/kode
// yang stabil. question_version immutable setelah approved/published/used.
// Draft boleh diedit; publish membuat version snapshot." A genuinely
// DIFFERENT mutability rule from ENT-001/COM-001/PRG-002's "immutable from
// creation" policies: here, a draft/in_review/changes_requested version IS
// mutable in place - only approved/published/archived lock it. See
// exam/question-service.ts for the enforced boundary.
//
// The security boundary dok 21 §8 names directly: "question_version_secrets
// memisahkan kunci/bobot dari konten yang dapat diserialisasi ke siswa"
// (separates the answer key/weights from content that CAN be serialized to
// students). `question_version_secrets` is a SEPARATE table, not a column
// on `question_versions` - the student-facing serializer
// (@superlatif/domain/exam#toStudentFacingQuestionView) has a function
// signature that does not even ACCEPT a secrets row as an argument, so
// leaking one is a type error, not a discipline failure.
//
// `stimuli`/`stimulus_versions` mirror `questions`/`question_versions`'
// own identity/version split - "Shared passage/document" (dok 21 §8): one
// stimulus_version can be linked from many question_versions without
// duplicating its content.
//
// `question_assets` is dok 21 §8's own table for "Question/stimulus
// version, placement (stem, option, explanation), option key/order, asset,
// alt metadata" with an XOR owner constraint (dok 21 §8's own words).
// `storageRef` reuses LRN-001's exact opaque-reference discipline
// (schema/assets.ts's module doc) - never a real, resolvable object-storage
// URL in this task - but this is a NEW table, not a retrofit of LRN-001's
// own `assets` (owned by resource_version, a curriculum concept unrelated
// to a question/stimulus version) - the same "reuse the PATTERN, not force
// an unrelated FK" choice SCH-001 already made for its own join-link table.

import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { questionType, recordStatus } from "./enums.ts";
import { users } from "./identity.ts";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/** The question LINE's own simple lifecycle (active/archived) - separate from question_versions' full editorial workflow, same split products.status/productVersions.status (COM-001) already established. */
export const questions = pgTable(
  "questions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: text("code").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("question_code_uq").on(table.code)],
);

export const stimuli = pgTable(
  "stimuli",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: text("code").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("stimulus_code_uq").on(table.code)],
);

export const stimulusVersions = pgTable(
  "stimulus_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    stimulusId: uuid("stimulus_id")
      .notNull()
      .references(() => stimuli.id),
    version: integer("version").notNull(),
    status: recordStatus("status").notNull().default("draft"),
    bodyDocument: jsonb("body_document").$type<Record<string, unknown>>().notNull(),
    checksum: text("checksum").notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("stimulus_version_stimulus_version_uq").on(table.stimulusId, table.version)],
);

/**
 * `classification` (JSONB) holds dok 15 §4's classification fields (exam
 * family, subject/section, topic/subtopic, competency code, difficulty
 * editorial, source/provenance/year, language, sensitivity/copyright note)
 * - versioned CONFIGURATION attached to one specific version (classification
 * can change between versions), not core relational integrity a later
 * exam_families/subjects table would need to enforce - CLAUDE.md "JSONB
 * stores versioned configuration/snapshots, not core relational integrity."
 * `explanationDocument` is deliberately NOT in question_version_secrets:
 * dok 15 §6 lists "explanation" as its own manual-editor section, distinct
 * from "answer/scoring metadata" - shown to students post-attempt per a
 * later task's release policy, not a permanent secret.
 * `createdByUserId` is what authorize()'s maker-checker check
 * (question.first_approve/question.ranked_publish, IDN-004) compares an
 * approver/publisher against.
 */
export const questionVersions = pgTable(
  "question_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id),
    version: integer("version").notNull(),
    type: questionType("type").notNull(),
    status: recordStatus("status").notNull().default("draft"),
    stimulusVersionId: uuid("stimulus_version_id").references(() => stimulusVersions.id),
    classification: jsonb("classification").$type<Record<string, unknown>>().notNull().default({}),
    stemDocument: jsonb("stem_document").$type<Record<string, unknown>>().notNull(),
    explanationDocument: jsonb("explanation_document").$type<Record<string, unknown>>(),
    checksum: text("checksum").notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("question_version_question_version_uq").on(table.questionId, table.version),
    index("question_version_stimulus_idx").on(table.stimulusVersionId),
  ],
);

/**
 * Relational, NOT JSONB - `optionCode` must be a stable, individually
 * addressable key (CLAUDE.md: "weighted_choice uses the student response
 * shape kind=single_choice + optionCode"; dok 21 §8's `question_assets`
 * references it too). For `type = "true_false"`, a row here represents one
 * STATEMENT (its `content` is the statement text, dok 15 §6 "true/false:
 * setiap statement memiliki expected value") rather than a traditional
 * option - the secret's `answerKey.statementAnswers` keys into the same
 * optionCode values. Option/statement CONTENT is never secret - only
 * correctness/weight is (question_version_secrets below).
 */
export const questionOptions = pgTable(
  "question_options",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    questionVersionId: uuid("question_version_id")
      .notNull()
      .references(() => questionVersions.id),
    optionCode: text("option_code").notNull(),
    order: integer("order").notNull(),
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("question_option_version_code_uq").on(table.questionVersionId, table.optionCode),
    index("question_option_version_idx").on(table.questionVersionId),
  ],
);

/**
 * THE security boundary table. `answerKey`'s shape depends on `type`
 * (@superlatif/domain/exam's AnswerKey union) - single_choice/weighted_choice
 * carry `correctOptionCode`; multiple_choice carries `correctOptionCodes` +
 * a partial-score policy; true_false carries `statementAnswers` keyed by
 * optionCode; numeric carries accepted value/tolerance/range/unit. Every
 * `answerKey` is validated against the version's own actual optionCodes
 * before this row is ever written (@superlatif/db/exam's
 * assertAnswerKeyReferencesKnownOptions) - "invalid option key" required
 * test. One row per question_version (1:1) - never read by any
 * student-facing/active-attempt code path in this task.
 */
export const questionVersionSecrets = pgTable(
  "question_version_secrets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    questionVersionId: uuid("question_version_id")
      .notNull()
      .references(() => questionVersions.id),
    answerKey: jsonb("answer_key").$type<Record<string, unknown>>().notNull(),
    checksum: text("checksum").notNull(),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("question_version_secret_version_uq").on(table.questionVersionId)],
);

/**
 * `placement`: "stem" | "option" | "explanation" | "stimulus_body".
 * `optionCode` is set only when `placement = "option"`. Exactly one of
 * `questionVersionId`/`stimulusVersionId` is set (XOR owner, dok 21 §8) -
 * enforced at the application layer (matching `reconciliation_cases`'
 * multiple-optional-FK precedent, COM-003/COM-006), not a database CHECK
 * constraint. `storageRef` is opaque - never resolved against a real
 * object-storage/CDN provider anywhere in this task.
 */
export const questionAssets = pgTable(
  "question_assets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    questionVersionId: uuid("question_version_id").references(() => questionVersions.id),
    stimulusVersionId: uuid("stimulus_version_id").references(() => stimulusVersions.id),
    placement: text("placement").notNull(),
    optionCode: text("option_code"),
    storageRef: text("storage_ref").notNull(),
    mimeType: text("mime_type"),
    checksum: text("checksum"),
    altText: text("alt_text"),
    /** dok 15 §5: "image_purpose (informative|decorative)". */
    imagePurpose: text("image_purpose").notNull().default("informative"),
    /** dok 15 §5: assets "menyimpan ... malware scan state" - a boolean flag is enough for this task's synthetic scope (no real scanner runs). */
    malwareScanClean: boolean("malware_scan_clean").notNull().default(true),
    createdAt: createdAt(),
  },
  (table) => [
    index("question_asset_question_version_idx").on(table.questionVersionId),
    index("question_asset_stimulus_version_idx").on(table.stimulusVersionId),
  ],
);
