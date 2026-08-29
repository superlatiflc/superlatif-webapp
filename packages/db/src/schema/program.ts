// Program identity and enrollment schema (PRG-001, fifth migration after
// IDN-001/ENT-001/COM-001/IDN-004/ENT-004).
//
// 21_ERD_AND_DATA_DICTIONARY.md §6 "Programs and content" describes
// programs, program_versions, tracks, roadmap_stages, modules, resources,
// resource_placements, assets, program_enrollments, onboarding_responses,
// resource_progress, progress_events, progress_projections. This task
// implements only `programs` (stable identity, no versioned curriculum yet)
// and `program_enrollments` (primary-program tracking) - "Buat
// representasi program/track secukupnya untuk acceptance PRG-001" (founder
// instruction). Versioned program_versions/tracks/roadmap_stages/modules/
// resources are PRG-002's explicit scope ("Implement versioned curriculum,
// tracks, modules, and release rules") - building them now would be
// schema for curriculum-publishing behaviour this task does not own. See
// ADR-052.
//
// `programs.code` is the bare code used inside the `program:` prefix
// convention @superlatif/domain/access's entitlement claims already use
// (e.g. targetRef.code = "program:aks-2026") - this table's identity is
// deliberately the same vocabulary ENT-001/COM-001 test fixtures already
// established, not a new one.
//
// `program_enrollments` is explicitly NOT an authorization source (dok 21
// §6: "Enrollment bukan authorization source") - it is a presentation-layer
// projection, kept in sync FROM @superlatif/db/access's effective-access
// resolver (packages/db/src/program/enrollment-service.ts), never the other
// way around. Its `isPrimary` flag is genuinely mutable operational
// preference state (the one deliberate exception to this codebase's
// append-only pattern in this task - see ADR-052), the same class of field
// as IDN-001's `user_sessions.lastSeenAt`.

import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./identity.ts";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/** Stable program identity - "Program adalah yang dialami siswa" (dok 05 §1). No version/status workflow yet; PRG-002 owns publishing a versioned curriculum on top of this identity. */
export const programs = pgTable(
  "programs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("programs_code_uq").on(table.code)],
);

/**
 * Presentation-layer projection of "this user can currently see this
 * program on their Program Saya / home." Rows are upserted from the
 * effective-access resolver's output (never created directly from a grant
 * or a client request) and never granted access themselves. `isPrimary` is
 * mutable: at most one row per user may have it true, enforced by the
 * service layer (packages/db/src/program/enrollment-service.ts#setPrimaryProgram)
 * inside a transaction, not by a database constraint (a partial unique
 * index on `(user_id) WHERE is_primary` would work too, but the check
 * needs to read the program's own eligibility - kept in application code
 * for that reason).
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
