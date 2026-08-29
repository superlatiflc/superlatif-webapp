// Program access + enrollment projection service (PRG-001).
//
// Composes ENT-002's effective-access resolver and IDN-004's authorize() -
// this file invents no new access rule of its own (founder instruction:
// "Gunakan ENT-002 effective-access resolver dan IDN-004 authorize(),
// jangan bikin aturan akses baru"). `program_enrollments` rows are a
// presentation-layer PROJECTION synced FROM the resolver's output, never a
// second source of truth for access.

import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { authorize, type AuthorizationDecision } from "@superlatif/domain/authorization";
import type { EffectiveAccessCache } from "@superlatif/domain/access";
import type { Queryable, Schema } from "../db-types.ts";
import { programEnrollments } from "../schema/index.ts";
import { listActiveRoleHoldings } from "../authorization/index.ts";
import { getEffectiveAccess } from "../access/index.ts";
import { listPrograms, programTargetRef, type ProgramRow } from "./program-repository.ts";

/**
 * Every program in the catalogue the user currently has effective access to
 * ("view" on the program target) - cross-product deduplication is
 * inherited for free: `getEffectiveAccess` already collapses multiple
 * decisive grants for the same program into one decision, so calling it
 * once per DISTINCT program (never once per grant) is what makes a program
 * granted by two products appear exactly once here.
 */
export async function listAccessibleProgramsForUser(
  db: Queryable<Schema>,
  cache: EffectiveAccessCache,
  userId: string,
  now: Date,
): Promise<ProgramRow[]> {
  const catalogue = await listPrograms(db);
  const accessible: ProgramRow[] = [];
  for (const program of catalogue) {
    const decision = await getEffectiveAccess(
      db,
      cache,
      userId,
      { targetType: "program", targetRef: programTargetRef(program.code), action: "view" },
      now,
    );
    if (decision.allowed) accessible.push(program);
  }
  return accessible;
}

/**
 * `authorize()`-gated single-program access check - object-level, per dok
 * 24 §5 ("UUID does not replace authorization"). Used both defensively
 * inside `buildHomeViewModel` and directly for the "required negative
 * test: unauthorized access" - requesting a program NOT in the user's
 * accessible set is refused with `ENTITLEMENT_DENIED`, the same reason
 * code IDN-004/ENT-002 already established, not a new one.
 */
export async function assertProgramAccess(
  db: Queryable<Schema>,
  cache: EffectiveAccessCache,
  userId: string,
  programCode: string,
  now: Date,
): Promise<AuthorizationDecision> {
  const roles = await listActiveRoleHoldings(db, userId);
  const decision = await getEffectiveAccess(
    db,
    cache,
    userId,
    { targetType: "program", targetRef: programTargetRef(programCode), action: "view" },
    now,
  );
  return authorize({
    actor: { userId, roles },
    action: { type: "view_program" },
    object: { requiresEntitlement: true },
    entitlement: { hasEffectiveAccess: decision.allowed },
  });
}

export interface EnrollmentRow {
  readonly id: string;
  readonly userId: string;
  readonly programId: string;
  readonly isPrimary: boolean;
  readonly enrolledAt: Date;
  readonly lastActivityAt: Date | null;
}

const ENROLLMENT_COLUMNS = {
  id: programEnrollments.id,
  userId: programEnrollments.userId,
  programId: programEnrollments.programId,
  isPrimary: programEnrollments.isPrimary,
  enrolledAt: programEnrollments.enrolledAt,
  lastActivityAt: programEnrollments.lastActivityAt,
};

/**
 * Ensures an enrollment row exists for every program the user currently
 * has effective access to (idempotent - `onConflictDoNothing` on the
 * unique index, never overwrites an existing row's `isPrimary`/activity
 * state). Returns every CURRENT enrollment for accessible programs -
 * enrollments for programs the user no longer has access to are left in
 * place (history), never deleted, but excluded from this result.
 */
export async function syncProgramEnrollments(
  db: Queryable<Schema>,
  cache: EffectiveAccessCache,
  userId: string,
  now: Date,
): Promise<EnrollmentRow[]> {
  const accessiblePrograms = await listAccessibleProgramsForUser(db, cache, userId, now);

  for (const program of accessiblePrograms) {
    await db
      .insert(programEnrollments)
      .values({ userId, programId: program.id })
      .onConflictDoNothing({ target: [programEnrollments.userId, programEnrollments.programId] });
  }

  if (accessiblePrograms.length === 0) return [];
  const rows = await db
    .select(ENROLLMENT_COLUMNS)
    .from(programEnrollments)
    .where(eq(programEnrollments.userId, userId));
  const accessibleIds = new Set(accessiblePrograms.map((program) => program.id));
  return rows.filter((row) => accessibleIds.has(row.programId));
}

export class ProgramNotEnrolledError extends Error {
  constructor(userId: string, programId: string) {
    super(`User ${userId} has no enrollment for program ${programId} - cannot set it as primary`);
    this.name = "ProgramNotEnrolledError";
  }
}

/**
 * Sets a student's manual primary-program choice - "pilihan program utama
 * manual menang" (dok 09 §8.1, locked). The one deliberate mutable-state
 * exception in this task: at most one enrollment per user has
 * `isPrimary = true`, enforced here inside a transaction, not by an
 * append-only event log - this is a live preference, not an audit-critical
 * fact. Refuses to set a program the user has no (accessible) enrollment
 * for as primary.
 */
export async function setPrimaryProgram(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  userId: string,
  programId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [target] = await tx
      .select({ id: programEnrollments.id })
      .from(programEnrollments)
      .where(and(eq(programEnrollments.userId, userId), eq(programEnrollments.programId, programId)))
      .limit(1);
    if (!target) throw new ProgramNotEnrolledError(userId, programId);

    await tx
      .update(programEnrollments)
      .set({ isPrimary: false })
      .where(and(eq(programEnrollments.userId, userId), eq(programEnrollments.isPrimary, true)));
    await tx.update(programEnrollments).set({ isPrimary: true }).where(eq(programEnrollments.id, target.id));
  });
}
