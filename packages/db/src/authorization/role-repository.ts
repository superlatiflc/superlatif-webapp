// RBAC persistence adapter (IDN-004).
//
// Mirrors ENT-001's grant-repository.ts shape deliberately: user_roles rows
// are immutable after insert (no status column), revocation is an
// append-only role_assignment_events row, and status is DERIVED via
// @superlatif/domain/authorization's isRoleAssignmentActive, never stored.
//
// "Privileged mutations include actor, reason, and correlation ID"
// (IDN-004 acceptance): assignRole/revokeRoleAssignment require these as
// non-optional parameters AND validate them non-empty at runtime - there is
// no code path in this module that writes a role change without a full
// audit trail. This is the DB-layer half of "admin melewati audit trail"
// being structurally refused; authorize.ts's AUDIT_FIELDS_REQUIRED gate is
// the domain-layer half.

import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  CANONICAL_ROLES,
  isRoleAssignmentActive,
  type CanonicalRole,
  type RoleAssignmentEvent,
  type RoleHolding,
  type RoleScopeAssignment,
} from "@superlatif/domain/authorization";
import type { Queryable, Schema } from "../db-types.ts";
import { roleAssignmentEvents, roleAssignmentScopes, roles, userRoles } from "../schema/index.ts";

export interface RoleRow {
  readonly id: string;
  readonly code: CanonicalRole;
  readonly name: string;
}

const CANONICAL_ROLE_NAMES: Record<CanonicalRole, string> = {
  super_admin: "Super Admin",
  operations_admin: "Operations Admin",
  academic_admin: "Academic Admin",
  tutor_writer: "Tutor/Question Writer",
  moderator_reviewer: "Moderator/Reviewer",
  live_class_coordinator: "Live-Class Coordinator",
  support: "Customer Support",
  finance_reconciliation: "Finance/Reconciliation",
};

/** Idempotent: inserts any of the eight canonical roles not already present. Never edits an existing row - dok 02 §5.3's role codes are a fixed, reviewed vocabulary, not admin-editable data. */
export async function seedCanonicalRoles(db: Queryable<Schema>): Promise<void> {
  for (const code of CANONICAL_ROLES) {
    const existing = await findRoleByCode(db, code);
    if (existing) continue;
    await db
      .insert(roles)
      .values({ code, name: CANONICAL_ROLE_NAMES[code] })
      .onConflictDoNothing({ target: roles.code });
  }
}

export async function findRoleByCode(db: Queryable<Schema>, code: CanonicalRole): Promise<RoleRow | null> {
  const [row] = await db
    .select({ id: roles.id, code: roles.code, name: roles.name })
    .from(roles)
    .where(eq(roles.code, code))
    .limit(1);
  return row ? { id: row.id, code: row.code as CanonicalRole, name: row.name } : null;
}

export class RoleAssignmentAuditRequiredError extends Error {
  constructor(action: "assign" | "revoke" | "reinstate") {
    super(
      `A reason and correlation ID are required to ${action} a role assignment (dok 24 §7 high-risk workflow)`,
    );
    this.name = "RoleAssignmentAuditRequiredError";
  }
}

export interface AssignRoleInput {
  readonly userId: string;
  readonly role: CanonicalRole;
  readonly scopes?: readonly RoleScopeAssignment[];
  readonly grantedByUserId: string;
  readonly grantedReason: string;
}

export interface UserRoleRow {
  readonly id: string;
  readonly userId: string;
  readonly roleId: string;
  readonly grantedByUserId: string;
  readonly grantedReason: string;
  readonly createdAt: Date;
}

/**
 * Grants a role to a user, idempotently: replaying the same (userId, role)
 * pair returns the EXISTING row rather than erroring (matches ENT-001's
 * issueGrant idempotency), never creating a second assignment. Refuses to
 * write without `grantedByUserId`/`grantedReason` - both are required
 * TypeScript parameters, and this function also rejects an empty string at
 * runtime so a caller cannot bypass the audit trail by passing `""`.
 */
export async function assignRole(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  input: AssignRoleInput,
): Promise<UserRoleRow> {
  if (!input.grantedByUserId || !input.grantedReason) {
    throw new RoleAssignmentAuditRequiredError("assign");
  }

  return db.transaction(async (tx) => {
    const role = await findRoleByCode(tx, input.role);
    if (!role)
      throw new Error(`assignRole: role ${input.role} is not seeded - call seedCanonicalRoles first`);

    const [existing] = await tx
      .select()
      .from(userRoles)
      .where(and(eq(userRoles.userId, input.userId), eq(userRoles.roleId, role.id)))
      .limit(1);
    if (existing) return existing;

    const [row] = await tx
      .insert(userRoles)
      .values({
        userId: input.userId,
        roleId: role.id,
        grantedByUserId: input.grantedByUserId,
        grantedReason: input.grantedReason,
      })
      .onConflictDoNothing({ target: [userRoles.userId, userRoles.roleId] })
      .returning();

    const finalRow =
      row ??
      (await tx
        .select()
        .from(userRoles)
        .where(and(eq(userRoles.userId, input.userId), eq(userRoles.roleId, role.id)))
        .limit(1)
        .then((rows) => rows[0]));
    if (!finalRow) throw new Error("assignRole: insert returned no row and none was found");

    if (input.scopes && input.scopes.length > 0) {
      await tx.insert(roleAssignmentScopes).values(
        input.scopes.map((scope) => ({
          userRoleId: finalRow.id,
          scopeType: scope.scopeType,
          scopeRef: scope.scopeRef,
        })),
      );
    }

    return finalRow;
  });
}

export interface RevokeRoleAssignmentInput {
  readonly userRoleId: string;
  readonly actorUserId: string;
  readonly reason: string;
  readonly correlationId: string;
  readonly occurredAt: Date;
}

async function recordRoleAssignmentEvent(
  db: Queryable<Schema>,
  eventType: "revoked" | "reinstated",
  input: RevokeRoleAssignmentInput,
): Promise<void> {
  if (!input.reason || !input.correlationId) {
    throw new RoleAssignmentAuditRequiredError(eventType === "revoked" ? "revoke" : "reinstate");
  }
  await db.insert(roleAssignmentEvents).values({
    userRoleId: input.userRoleId,
    eventType,
    actorUserId: input.actorUserId,
    reason: input.reason,
    correlationId: input.correlationId,
    occurredAt: input.occurredAt,
  });
}

export async function revokeRoleAssignment(
  db: Queryable<Schema>,
  input: RevokeRoleAssignmentInput,
): Promise<void> {
  await recordRoleAssignmentEvent(db, "revoked", input);
}

export async function reinstateRoleAssignment(
  db: Queryable<Schema>,
  input: RevokeRoleAssignmentInput,
): Promise<void> {
  await recordRoleAssignmentEvent(db, "reinstated", input);
}

async function listRoleAssignmentEvents(
  db: Queryable<Schema>,
  userRoleId: string,
): Promise<RoleAssignmentEvent[]> {
  const rows = await db
    .select({ eventType: roleAssignmentEvents.eventType, occurredAt: roleAssignmentEvents.occurredAt })
    .from(roleAssignmentEvents)
    .where(eq(roleAssignmentEvents.userRoleId, userRoleId));
  return rows.map((row) => ({ eventType: row.eventType, occurredAt: row.occurredAt }));
}

async function listRoleAssignmentScopes(
  db: Queryable<Schema>,
  userRoleId: string,
): Promise<RoleScopeAssignment[]> {
  const rows = await db
    .select({ scopeType: roleAssignmentScopes.scopeType, scopeRef: roleAssignmentScopes.scopeRef })
    .from(roleAssignmentScopes)
    .where(eq(roleAssignmentScopes.userRoleId, userRoleId));
  return rows;
}

/**
 * Composes user_roles + role_assignment_scopes + role_assignment_events
 * into the `RoleHolding[]` shape @superlatif/domain/authorization's
 * `authorize()` consumes directly - the one place this package turns
 * persisted rows into the pure decision function's input. Revoked
 * assignments are filtered out entirely, never surfaced as a holding with
 * zero permissions (there is a real difference between "no role" and "a
 * role that grants nothing here" that this filtering preserves).
 */
export async function listActiveRoleHoldings(db: Queryable<Schema>, userId: string): Promise<RoleHolding[]> {
  const assignments = await db
    .select({ id: userRoles.id, roleCode: roles.code })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, userId));

  const holdings: RoleHolding[] = [];
  for (const assignment of assignments) {
    const events = await listRoleAssignmentEvents(db, assignment.id);
    if (!isRoleAssignmentActive(events)) continue;
    const scopes = await listRoleAssignmentScopes(db, assignment.id);
    holdings.push({ role: assignment.roleCode as CanonicalRole, scopes });
  }
  return holdings;
}
