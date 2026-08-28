// Object-level checks: ownership, role scope, entitlement (IDN-004).
//
// dok 24 §5 "Student: Object-level checks on every program/resource/batch/
// attempt/result request. UUID does not replace authorization." Three
// independent pure checks, composed by authorize.ts - never merged into one
// function, so each is separately testable and each failure mode gets its
// own reason code, matching the founder instruction's exact three-part
// requirement: "mengecek kepemilikan user, entitlement, dan scope role."

export interface RoleScopeAssignment {
  readonly scopeType: string;
  readonly scopeRef: string;
}

/**
 * An actor-owned object (attempt, result, session, ...) is only accessible
 * to the user it belongs to, by construction - "UUID does not replace
 * authorization." There is no bypass in this function; a legitimate staff
 * override (support reading a student's data via `access.explain`) is a
 * SEPARATE grant checked by authorize.ts's permission path, never a
 * relaxation of ownership itself.
 */
export function isOwner(ownerUserId: string, actorUserId: string): boolean {
  return ownerUserId === actorUserId;
}

/**
 * dok 21 §3: "Object-scope tambahan diterapkan service layer dan assignment
 * table bila diperlukan." An assignment list of zero entries means the
 * role holder's grant is unscoped (applies everywhere the permission
 * matrix allows - e.g. super_admin). A non-empty list means the grant
 * applies ONLY to the listed (scopeType, scopeRef) pairs - a tutor
 * assigned to `program-2` cannot act on `program-7` even though their role
 * grants the permission in general.
 */
export function isWithinAssignedScope(
  assignments: readonly RoleScopeAssignment[],
  objectScopeType: string,
  objectScopeRef: string,
): boolean {
  if (assignments.length === 0) return true;
  return assignments.some(
    (assignment) => assignment.scopeType === objectScopeType && assignment.scopeRef === objectScopeRef,
  );
}

/**
 * Entitlement is a SEPARATE axis from ownership/role - a program/resource/
 * batch is not "owned" by one student, so its access decision is
 * effective-access, not identity. `hasEffectiveAccess` is precomputed by
 * the caller (composing @superlatif/domain/access's deriveGrantStatus over
 * real grant rows) - this module stays a pure boolean pass-through so the
 * authorization domain never has to depend on I/O or reimplement ENT-001's
 * grant resolution.
 */
export function isEntitled(hasEffectiveAccess: boolean): boolean {
  return hasEffectiveAccess;
}

/**
 * dok 24 §6 footnote / CLAUDE.md "creator, first approver, and second
 * approver must be different where required... evaluated by actor ID."
 * The one check that exists independent of role/scope: an actor can never
 * be the maker AND the (first) checker of the same object, even when their
 * role would otherwise grant the approval permission.
 */
export function violatesMakerChecker(creatorUserId: string, actorUserId: string): boolean {
  return creatorUserId === actorUserId;
}
