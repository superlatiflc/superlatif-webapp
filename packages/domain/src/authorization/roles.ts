// Canonical role vocabulary (IDN-004).
//
// dok 02 §5.3 / dok 21 §3 / dok 24 §6: exactly eight canonical, permission-
// based staff role codes - "bukan jabatan organisasi yang harus diisi
// delapan orang berbeda." A user may hold several. `CLAUDE.md`'s own
// canonical-vocabulary list is identical to this set; nothing here invents
// a synonym.
//
// The founder instruction for this task names a simpler, human-facing set
// ("student, admin, tutor, moderator, owner/founder"). No canonical
// document defines "student" or "owner/founder" as an RBAC role - dok 02
// §5.3 draws a line between "Pengguna" (student, a market segment, not a
// permission bundle) and its own "Pengguna operasional" section (the eight
// roles below). This module's mapping, recorded once here rather than
// reinvented at each call site:
//
//   - "student" -> NOT a role assignment at all. Every user_roles-less
//     actor is a student by construction; their authorization runs through
//     ownership + entitlement (object-scope.ts), never through this list.
//   - "admin"    -> a generic term covering the admin-side roles below,
//     concretely represented in this task's tests by `operations_admin`
//     (dok 24 §6's matrix gives it the broadest generic-admin surface:
//     purchase.raw.read, reconciliation.manage, notification scheduling).
//   - "tutor"    -> `tutor_writer`.
//   - "moderator"-> `moderator_reviewer`.
//   - "owner/founder" -> `super_admin`, the one role dok 24 §6's matrix
//     grants near-universal "Ya"/"Ya/approval" to. No document defines a
//     role above super_admin.
//
// See ADR-049 for the full reasoning.

export const CANONICAL_ROLES = [
  "super_admin",
  "operations_admin",
  "academic_admin",
  "tutor_writer",
  "moderator_reviewer",
  "live_class_coordinator",
  "support",
  "finance_reconciliation",
] as const;

export type CanonicalRole = (typeof CANONICAL_ROLES)[number];

export function isCanonicalRole(value: string): value is CanonicalRole {
  return (CANONICAL_ROLES as readonly string[]).includes(value);
}
