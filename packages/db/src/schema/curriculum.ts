// Versioned curriculum schema (PRG-002, sixth migration after
// IDN-001/ENT-001/COM-001/IDN-004/ENT-004/PRG-001).
//
// 21_ERD_AND_DATA_DICTIONARY.md §6 "Programs and content":
//   Program -> Program version -> Track -> Roadmap stage -> Module
//   -> Resource placement -> Resource version
//
// Table shapes are transcribed from contracts/drizzle-schema.ts (the Gate 3
// reviewed contract), the same "reference, not import" discipline
// enums.ts/access.ts already established. Two deliberate scope reductions
// from that contract, both because "Jangan integrasi object storage/CDN/
// provider file nyata dulu" (founder instruction) and "Jangan bangun full
// LMS player dulu":
//
//   - resourceVersions has no primaryAssetId - there is no `assets` table in
//     this task. A resource's `body` JSONB carries whatever
//     metadata/reference a resource type needs (e.g. an external video
//     provider's opaque ID) without this repository ever touching real
//     object storage.
//   - modules gains an independent `status` (recordStatus) column NOT
//     present in the Gate 3 draft. The draft's tracks/roadmapStages/modules
//     have no status of their own - only the whole program_version does.
//     The founder instruction explicitly requires an "archived module
//     hidden" test, which needs a per-module archive action independent of
//     archiving the entire program version (dok 14 §5's lifecycle applies to
//     "content" broadly, not only to resources - modules are content too).
//     This reuses the existing `record_status` enum value set rather than
//     inventing a new one ("No new unauthorized state vocabulary" -
//     CLAUDE.md Definition of done). See ADR-053.
//
// Immutability is enforced at the SERVICE layer
// (curriculum-repository.ts's *_LOCKED guards), not by a checksum column
// like access_policies/resources - unlike a policy, a program version's
// content is a relational TREE (tracks/stages/modules/placements as
// separate rows), not one JSON document, so "does the stored content still
// match its checksum" does not apply the same way. `lockedAt` plus a
// status-based write guard is the mechanism instead.

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
import { recordStatus } from "./enums.ts";
import { users } from "./identity.ts";
import { programs } from "./program.ts";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/**
 * An immutable published curriculum version of a program. `status` follows
 * the same draft -> published -> archived one-way narrowing every other
 * versioned artifact in this codebase uses (access_policies, resource
 * versions below) - draft is mutable (tracks/stages/modules/placements can
 * be attached), published locks the whole tree (see
 * curriculum-repository.ts#publishProgramVersion), archived retires it
 * without deleting history (dok 14 §2 invariant 2: "perubahan historis
 * dapat ditelusuri").
 */
export const programVersions = pgTable(
  "program_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    status: recordStatus("status").notNull().default("draft"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("program_version_uq").on(table.programId, table.version)],
);

/** Jalur besar seperti SKD, TPA-TBI (dok 14 §3). Owned by a program version - never shared across versions, so a new version always gets its own track rows. */
export const tracks = pgTable(
  "tracks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    programVersionId: uuid("program_version_id")
      .notNull()
      .references(() => programVersions.id),
    code: text("code").notNull(),
    title: text("title").notNull(),
    position: integer("position").notNull(),
    /** @see ../../../../packages/domain/src/program/release-rule.ts ReleaseRule - a track-level release gate (dok 14 §6 MVP rules), evaluated the same way a placement's is. */
    releaseConfig: jsonb("release_config").$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => [uniqueIndex("track_program_version_code_uq").on(table.programVersionId, table.code)],
);

export const roadmapStages = pgTable(
  "roadmap_stages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    trackId: uuid("track_id")
      .notNull()
      .references(() => tracks.id),
    code: text("code").notNull(),
    title: text("title").notNull(),
    position: integer("position").notNull(),
    completionConfig: jsonb("completion_config").$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => [uniqueIndex("roadmap_stage_track_code_uq").on(table.trackId, table.code)],
);

/**
 * `status` is this table's deliberate addition beyond the Gate 3 draft - see
 * the module doc. Default "published": a module comes into existence only
 * once its parent program version is already published (the draft-guard in
 * curriculum-repository.ts forbids creating one under a draft version), so
 * there is no separate module-level draft/review workflow to model here.
 * The one transition this task supports is published -> archived
 * (curriculum-repository.ts#archiveModule), one-way, matching the
 * revoke/expire class of state change used elsewhere in this codebase.
 */
export const modules = pgTable(
  "modules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    stageId: uuid("stage_id")
      .notNull()
      .references(() => roadmapStages.id),
    code: text("code").notNull(),
    title: text("title").notNull(),
    position: integer("position").notNull(),
    status: recordStatus("status").notNull().default("published"),
    releaseConfig: jsonb("release_config").$type<Record<string, unknown>>().notNull().default({}),
    completionConfig: jsonb("completion_config").$type<Record<string, unknown>>().notNull().default({}),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("module_stage_code_uq").on(table.stageId, table.code)],
);

/** Stable reusable identity - "Resource menyimpan konten reusable" (dok 14 §3). One resource can be placed in many modules, even across different programs/versions, without copying content (dok 14 §19 acceptance scenario 1). */
export const resources = pgTable(
  "resources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: text("code").notNull(),
    type: text("type").notNull(),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("resources_code_uq").on(table.code)],
);

/**
 * A typed, immutable version of a resource's content metadata. No
 * primaryAssetId - see the module doc; `body` carries whatever a resource
 * type needs as opaque JSON (dok 14 §4's minimum-content table), validated
 * only for JSON-shape, not against a real provider.
 */
export const resourceVersions = pgTable(
  "resource_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => resources.id),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    status: recordStatus("status").notNull().default("draft"),
    body: jsonb("body").$type<Record<string, unknown>>().notNull(),
    completionPolicy: jsonb("completion_policy").$type<Record<string, unknown>>().notNull().default({}),
    accessibilityMetadata: jsonb("accessibility_metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("resource_versions_uq").on(table.resourceId, table.version)],
);

/**
 * Module + resource version + local order/label + required/release/
 * prerequisite (dok 21 §6). `releasedResourceVersionId` must reference a
 * PUBLISHED resource version - curriculum-repository.ts#createResourcePlacement
 * enforces this at the application layer (see access.ts's precedent: a
 * database FK alone cannot express "must be this specific status").
 */
export const resourcePlacements = pgTable(
  "resource_placements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    moduleId: uuid("module_id")
      .notNull()
      .references(() => modules.id),
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => resources.id),
    releasedResourceVersionId: uuid("released_resource_version_id")
      .notNull()
      .references(() => resourceVersions.id),
    position: integer("position").notNull(),
    required: boolean("required").notNull().default(true),
    releaseConfig: jsonb("release_config").$type<Record<string, unknown>>().notNull().default({}),
    prerequisitePlacementIds: jsonb("prerequisite_placement_ids").$type<string[]>().notNull().default([]),
  },
  (table) => [index("resource_placement_module_idx").on(table.moduleId)],
);

/**
 * Presentation-layer projection of "this user can currently see this
 * program on their Program Saya / home" (PRG-001). Rows are upserted from
 * the effective-access resolver's output, never created directly from a
 * grant or a client request, and never grant access themselves (dok 21 §6:
 * "Enrollment bukan authorization source").
 *
 * `pinnedProgramVersionId` is PRG-002's addition - dok 14 §7: "enrollment
 * aktif tidak dipindah diam-diam" when a new program version publishes. It
 * is set AT MOST ONCE per enrollment, by
 * program/enrollment-service.ts#syncProgramEnrollments, the first time a
 * published version exists for that program while the enrollment's pin is
 * still null. Once non-null, no code in this task ever changes it again -
 * that immutability (not a database constraint, since "pin once" is a
 * behavioural rule about WHEN a write happens, not a value it can reject) is
 * what makes an existing learner's curriculum view stable across a later
 * program_version publish. Migrating a pin to a newer version on purpose
 * (dok 14 §7's admin "migrate with mapping" workflow) is out of this task's
 * scope - see ADR-053.
 *
 * `isPrimary` remains the one deliberate mutable-state exception from
 * PRG-001 (a live preference, not an audit-critical fact) - see the
 * enrollment-service.ts module doc.
 */
export const programEnrollments = pgTable(
  "program_enrollments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id),
    isPrimary: boolean("is_primary").notNull().default(false),
    pinnedProgramVersionId: uuid("pinned_program_version_id").references(() => programVersions.id),
    enrolledAt: timestamp("enrolled_at", { withTimezone: true }).notNull().defaultNow(),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("program_enrollment_user_program_uq").on(table.userId, table.programId),
    index("program_enrollment_user_idx").on(table.userId),
  ],
);
