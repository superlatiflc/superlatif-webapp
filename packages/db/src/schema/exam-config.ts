// Exam family, blueprint, scoring policy, and form schema (EXM-001).
//
// dok 21 §9 "Exam configuration" names these exact table groups; this file
// follows that ERD's identity/version SPLIT literally rather than dok 16
// §3's own looser concept table (which folds "scoring" into "Blueprint
// version" prose) - four identity/version pairs total: exam_blueprints,
// scoring_policies, exam_forms all mirror questions/question_versions' own
// split (QST-001); exam_families is a single stable-code table.
//
// `exam_blueprint_versions.config` holds the FULL document defined by
// contracts/exam-blueprint.schema.json - a pre-existing, reviewed Gate 3
// contract discovered only AFTER this table's first draft was already
// built with its own scattered structure/presentation/resultPolicy
// columns; those columns were removed and folded into this one JSONB
// column, validated by AJV at every write
// (exam-blueprint-schema-validator.ts), the exact same
// "validate-the-whole-document-not-the-column-type" discipline
// access_policies.config (ENT-001) already established for
// entitlement-policy.schema.json. `activationScope`/`title` stay real,
// queryable columns in addition to also appearing inside `config` -
// access_policies keeps the same intentional duplication for its own
// `code`/`version`/`title` fields.
//
// `exam_form_items.questionVersionId` is THE pin dok 16 §3 means by "Exam
// form | Susunan immutable question versions" - a straight FK into
// QST-001's own `question_versions.id`. This is NOT a second question
// model: EXM-001 owns zero question content tables. The publication
// validator (@superlatif/domain/exam's assertExamFormComposable) additionally
// requires every referenced question_version to already be PUBLISHED (locked,
// per QST-001's own isQuestionVersionLocked) before a form can lock - an
// exam form can never pin a still-editable draft question.
//
// `recordStatus` (ENT-001) is reused unchanged for
// blueprint/scoring-policy/form version status, the same "versioned
// artifact workflow vocabulary is not domain-specific" reuse QST-001
// already established for stimulus_versions. This is a SEPARATE concern
// from `config.approval.status` (the contract's own academic/technical/
// regulatory sign-off tracking, validated as ordinary document content) -
// the same split access_policies.status/config already models.

import { integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { activationScope, recordStatus } from "./enums.ts";
import { users } from "./identity.ts";
import { questionVersions } from "./questions.ts";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/** dok 21 §9: "Stable code, name, activation state." A simple line-level lifecycle, mirroring questions.status/stimuli.status's own two-tier split (QST-001) - the versioned regulatory/structural content lives on exam_blueprint_versions, not here. */
export const examFamilies = pgTable(
  "exam_families",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: text("code").notNull(),
    title: text("title").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("exam_family_code_uq").on(table.code)],
);

export const examBlueprints = pgTable(
  "exam_blueprints",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: text("code").notNull(),
    examFamilyId: uuid("exam_family_id")
      .notNull()
      .references(() => examFamilies.id),
    status: text("status").notNull().default("active"),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("exam_blueprint_code_uq").on(table.code)],
);

/**
 * `config` holds the FULL contracts/exam-blueprint.schema.json document
 * (schemaVersion, code, version, examFamily, activationScope, title,
 * sections, timing, navigation, presentation, scoringPolicyRef,
 * resultPolicy, approval, ...) - see module doc.  `activationScope`
 * defaults to `draft_only`; nothing in this task's own service layer can
 * move it to `production` (see enums.ts's own doc on the enum, and
 * @superlatif/domain/exam's assertActivationScopeNotProduction).
 */
export const examBlueprintVersions = pgTable(
  "exam_blueprint_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    blueprintId: uuid("blueprint_id")
      .notNull()
      .references(() => examBlueprints.id),
    version: integer("version").notNull(),
    status: recordStatus("status").notNull().default("draft"),
    activationScope: activationScope("activation_scope").notNull().default("draft_only"),
    title: text("title").notNull(),
    config: jsonb("config").$type<Record<string, unknown>>().notNull(),
    checksum: text("checksum").notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("exam_blueprint_version_blueprint_version_uq").on(table.blueprintId, table.version),
  ],
);

export const scoringPolicies = pgTable(
  "scoring_policies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: text("code").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("scoring_policy_code_uq").on(table.code)],
);

/**
 * dok 21 §9: "Scorer registry/config, thresholds/categories,
 * interpretation, engine compatibility, fixtures/checksum" - consolidated
 * into one `policyConfig` JSONB blob (mirrors question_versions.classification's
 * own "one config blob" choice, QST-001). dok 17 §17 "Prohibited
 * implementation" forbids hardcoding a passing grade in UI/core code, not
 * storing a number as DATA in a specific, versioned, non-production row -
 * every fixture/test value in this task is a clearly synthetic smoke-test
 * number (dok 17 §4's own fixture style), never a real 2026 regulatory
 * threshold.
 */
export const scoringPolicyVersions = pgTable(
  "scoring_policy_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    scoringPolicyId: uuid("scoring_policy_id")
      .notNull()
      .references(() => scoringPolicies.id),
    version: integer("version").notNull(),
    status: recordStatus("status").notNull().default("draft"),
    policyConfig: jsonb("policy_config").$type<Record<string, unknown>>().notNull(),
    checksum: text("checksum").notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("scoring_policy_version_policy_version_uq").on(table.scoringPolicyId, table.version),
  ],
);

export const examForms = pgTable(
  "exam_forms",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: text("code").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("exam_form_code_uq").on(table.code)],
);

/** dok 21 §9: "version links blueprint/scoring, composition, status, locked/checksum" - pins BOTH a blueprint version and a scoring policy version, so an exam form's full grading behavior is snapshotted, not just its question list. */
export const examFormVersions = pgTable(
  "exam_form_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    examFormId: uuid("exam_form_id")
      .notNull()
      .references(() => examForms.id),
    version: integer("version").notNull(),
    status: recordStatus("status").notNull().default("draft"),
    blueprintVersionId: uuid("blueprint_version_id")
      .notNull()
      .references(() => examBlueprintVersions.id),
    scoringPolicyVersionId: uuid("scoring_policy_version_id")
      .notNull()
      .references(() => scoringPolicyVersions.id),
    checksum: text("checksum").notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("exam_form_version_form_version_uq").on(table.examFormId, table.version)],
);

/**
 * dok 21 §9: "Form version + section + question version + order/pool/group
 * metadata." `questionVersionId` is the pin - see module doc. Two unique
 * constraints: a question version cannot appear twice in the same form
 * version, and a (section, order) slot cannot be double-booked.
 */
export const examFormItems = pgTable(
  "exam_form_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    examFormVersionId: uuid("exam_form_version_id")
      .notNull()
      .references(() => examFormVersions.id),
    sectionCode: text("section_code").notNull(),
    order: integer("order").notNull(),
    questionVersionId: uuid("question_version_id")
      .notNull()
      .references(() => questionVersions.id),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("exam_form_item_version_question_uq").on(table.examFormVersionId, table.questionVersionId),
    uniqueIndex("exam_form_item_version_section_order_uq").on(
      table.examFormVersionId,
      table.sectionCode,
      table.order,
    ),
  ],
);
