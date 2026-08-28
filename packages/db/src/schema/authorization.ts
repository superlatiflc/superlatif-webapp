// RBAC schema (IDN-004, third migration after ENT-001/COM-001).
//
// 21_ERD_AND_DATA_DICTIONARY.md §3 "roles, permissions, user_roles,
// role_permissions": "RBAC base. Seed role kanonik: super_admin,
// operations_admin, academic_admin, tutor_writer, moderator_reviewer,
// live_class_coordinator, support, dan finance_reconciliation. Object-scope
// tambahan diterapkan service layer dan assignment table bila diperlukan."
//
// This task builds `roles` and `user_roles` matching
// contracts/drizzle-schema.ts's shape (plus grantedByUserId/grantedReason,
// the same "strengthen the audit trail, don't redefine the semantic"
// pattern ENT-001/COM-001 already used), adds `role_assignment_scopes` as
// the SEPARATE "assignment table" the ERD prose describes for object-scope
// narrowing (zero rows = unscoped), and `role_assignment_events` as the
// append-only revoke/reinstate log - the exact same immutable-row +
// append-only-event shape as ENT-001's access_grants/grant_events.
//
// `permissions`/`role_permissions` are deliberately NOT built as database
// tables here - the permission matrix is versioned, reviewed, tested code
// (@superlatif/domain/authorization's ROLE_PERMISSION_MATRIX), not a
// runtime-editable table with no admin UI to edit it (this task's own
// founder instruction: "Jangan bangun UI admin dulu"). See ADR-049.

import { index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./identity.ts";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const roleAssignmentEventType = pgEnum("role_assignment_event_type", ["revoked", "reinstated"]);

/** The eight canonical role codes (dok 02 §5.3 / dok 21 §3 / dok 24 §6, CLAUDE.md). Seeded once, never edited at runtime by this task. */
export const roles = pgTable(
  "roles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("roles_code_uq").on(table.code)],
);

/**
 * A role grant to a user. Immutable once created - "revoking" a role is a
 * `role_assignment_events` row, never an update or delete of this row (same
 * discipline as ENT-001's access_grants). `grantedByUserId`/`grantedReason`
 * are non-nullable: dok 24 §7 marks "role/permission change" as a
 * high-risk workflow requiring reason + audit, and `assignRole`
 * (role-repository.ts) refuses to write a row missing either - there is no
 * code path that creates a role assignment without them.
 */
export const userRoles = pgTable(
  "user_roles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id),
    grantedByUserId: uuid("granted_by_user_id")
      .notNull()
      .references(() => users.id),
    grantedReason: text("granted_reason").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("user_role_uq").on(table.userId, table.roleId),
    index("user_role_user_idx").on(table.userId),
  ],
);

/**
 * Object-scope narrowing for one role assignment (dok 21 §3's "assignment
 * table bila diperlukan"). Zero rows for a given `userRoleId` means that
 * assignment is UNSCOPED - it applies wherever the permission matrix
 * allows (e.g. super_admin). One or more rows restrict the assignment to
 * exactly those (scopeType, scopeRef) pairs - a tutor_writer assignment
 * scoped to `program-2` grants nothing on `program-9`.
 */
export const roleAssignmentScopes = pgTable(
  "role_assignment_scopes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userRoleId: uuid("user_role_id")
      .notNull()
      .references(() => userRoles.id),
    scopeType: text("scope_type").notNull(),
    scopeRef: text("scope_ref").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("role_assignment_scope_uq").on(table.userRoleId, table.scopeType, table.scopeRef),
    index("role_assignment_scope_user_role_idx").on(table.userRoleId),
  ],
);

/**
 * Append-only administrative event log for a role assignment - the ONLY
 * way an assignment's effective status changes after creation (same shape
 * as ENT-001's grant_events). `reason` is required at the application
 * layer (role-repository.ts's `RoleAssignmentAuditRequiredError`) for every
 * event this table accepts - there is no "silent revoke."
 */
export const roleAssignmentEvents = pgTable(
  "role_assignment_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userRoleId: uuid("user_role_id")
      .notNull()
      .references(() => userRoles.id),
    eventType: roleAssignmentEventType("event_type").notNull(),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id),
    reason: text("reason").notNull(),
    correlationId: text("correlation_id").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("role_assignment_event_user_role_idx").on(table.userRoleId),
    index("role_assignment_event_type_idx").on(table.userRoleId, table.eventType),
  ],
);
