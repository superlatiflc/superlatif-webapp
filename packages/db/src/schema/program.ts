// Program identity schema (PRG-001, fifth migration after
// IDN-001/ENT-001/COM-001/IDN-004/ENT-004).
//
// 21_ERD_AND_DATA_DICTIONARY.md §6 "Programs and content" describes
// programs, program_versions, tracks, roadmap_stages, modules, resources,
// resource_placements, assets, program_enrollments, onboarding_responses,
// resource_progress, progress_events, progress_projections. This file
// originally implemented `programs` (stable identity) AND
// `program_enrollments` together (PRG-001's "Buat representasi
// program/track secukupnya" scope). PRG-002 ("Implement versioned
// curriculum, tracks, modules, and release rules") moved
// `program_enrollments` into curriculum.ts alongside `program_versions`,
// purely to avoid a circular module import: PRG-002 added a
// `pinnedProgramVersionId` column to `program_enrollments`, which needs
// `programVersions` - and `programVersions` already needs `programs` from
// THIS file. Defining both tables that need each other's neighbour in the
// same file (curriculum.ts) sidesteps the cycle entirely rather than
// relying on lazy-reference module semantics working across two files. See
// ADR-053.
//
// `programs.code` is the bare code used inside the `program:` prefix
// convention @superlatif/domain/access's entitlement claims already use
// (e.g. targetRef.code = "program:aks-2026") - this table's identity is
// deliberately the same vocabulary ENT-001/COM-001 test fixtures already
// established, not a new one.

import { pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/** Stable program identity - "Program adalah yang dialami siswa" (dok 05 §1). Versioned curriculum content is attached via curriculum.ts's `program_versions` and its descendants. */
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
