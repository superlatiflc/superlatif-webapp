// Role-permission matrix (IDN-004).
//
// Transcribed directly from dok 24 §6 "RBAC matrix core". Absence of a
// permission from a role's entry means denied - this table is DEFAULT-DENY:
// a role only has what is explicitly listed here, nothing is inferred.
//
// `exam.blueprint.*` (EXM-001) is a documented EXCEPTION to "transcribed
// directly": dok 24 §6's own table has no dedicated row for blueprint
// authoring/approval, but §7 "High-risk workflows" explicitly names
// "blueprint/scoring publish" as requiring the same reason+preview+audit+
// peer-approval treatment as every other high-risk item in that list. This
// three-tier shape (draft/first_approve/publish) mirrors question.*
// exactly - the closest existing precedent for "author, independent first
// reviewer, second high-risk publish approval" - rather than inventing a
// new shape. Granted to academic_admin (the role CLAUDE.md describes as
// owning academic decisions) and moderator_reviewer for first_approve
// (matching their broad first-approve role across question.* already);
// tutor_writer does NOT get draft.write here - authoring exam
// structure/timing/scoring policy is a different discipline than authoring
// question content.
//
// dok 24 §6: "Permission names final berada di seed/config dan diuji" -
// this matrix IS that seed/config: versioned, reviewed, testable code, not
// a runtime-editable `role_permissions` database table (ADR-049 explains
// why building a live-editable permissions table is out of this task's
// scope - there is no admin UI yet to edit it with, per the founder
// instruction, and dok 21's `permissions`/`role_permissions` tables are
// deferred to whichever task actually needs runtime editing).

import type { CanonicalRole } from "./roles.ts";

export const PERMISSION_CODES = [
  "question.draft.write",
  "question.first_approve",
  "question.ranked_publish",
  "exam.blueprint.draft.write",
  "exam.blueprint.first_approve",
  "exam.blueprint.publish",
  "program.publish",
  "batch.publish",
  "live.occurrence.manage",
  "access.explain",
  "access.manual.change",
  "purchase.raw.read",
  "reconciliation.manage",
  "result.correction.request",
  "result.correction.publish",
  "notification.operational.schedule",
  "notification.marketing.schedule",
  "role.manage",
] as const;

export type PermissionCode = (typeof PERMISSION_CODES)[number];

/**
 * `level: "granted"` is a full, enforceable grant this task's `authorize()`
 * acts on directly. `level: "scoped_nuance"` preserves a matrix cell that
 * dok 24 §6 states in prose the enforcement rule for which belongs to a
 * later task ("Review tertentu", "Operasional terbatas", "Redacted",
 * "Request terbatas") - it is recorded here so the data is faithful to the
 * document, but `authorize()` treats it as NOT a full grant (fail-closed)
 * until the owning task defines the exact narrower rule. This is a
 * deliberate scope boundary, not an omission - see ADR-049.
 */
export interface PermissionGrant {
  readonly level: "granted" | "scoped_nuance";
  /** Second, different approver required beyond ordinary role possession - dok 24 §6/§7 "Second approval" / "Ya/approval" cells. */
  readonly requiresApproval?: boolean;
  /** The actor who authored the object (creator) is structurally excluded, even though their role otherwise grants this permission - dok 24 §6 "Ya bila bukan creator". */
  readonly requiresNonCreator?: boolean;
  /** Free-text record of the exact dok 24 §6 cell text for a "scoped_nuance" grant, for traceability - never read by authorize() logic. */
  readonly note?: string;
}

type Matrix = Record<CanonicalRole, Partial<Record<PermissionCode, PermissionGrant>>>;

export const ROLE_PERMISSION_MATRIX: Matrix = {
  tutor_writer: {
    "question.draft.write": { level: "granted" },
  },
  moderator_reviewer: {
    "question.draft.write": { level: "granted" },
    "question.first_approve": { level: "granted" },
    "exam.blueprint.first_approve": { level: "granted" },
    "program.publish": { level: "scoped_nuance", note: "Review tertentu" },
    "batch.publish": { level: "scoped_nuance", note: "Review" },
    "result.correction.request": { level: "granted" },
    "result.correction.publish": { level: "granted", requiresApproval: true, note: "Approval" },
  },
  academic_admin: {
    "question.draft.write": { level: "granted" },
    "question.first_approve": { level: "granted", requiresNonCreator: true },
    "question.ranked_publish": { level: "granted", requiresApproval: true, note: "Second approval" },
    "exam.blueprint.draft.write": { level: "granted" },
    "exam.blueprint.first_approve": { level: "granted", requiresNonCreator: true },
    "exam.blueprint.publish": { level: "granted", requiresApproval: true, note: "Second approval" },
    "program.publish": { level: "granted" },
    "batch.publish": { level: "granted" },
    "live.occurrence.manage": { level: "granted" },
    "access.explain": { level: "scoped_nuance", note: "Read" },
    "access.manual.change": {
      level: "granted",
      requiresApproval: true,
      note: "Terbatas - narrowed by ENT-004 as 'requires peer approval', see ADR-051",
    },
    "reconciliation.manage": { level: "scoped_nuance", note: "Read" },
    "result.correction.request": { level: "granted" },
    "result.correction.publish": { level: "granted", requiresApproval: true, note: "Approval" },
    "notification.operational.schedule": { level: "granted" },
  },
  operations_admin: {
    "batch.publish": { level: "scoped_nuance", note: "Operasional terbatas" },
    "live.occurrence.manage": { level: "granted" },
    "access.explain": { level: "scoped_nuance", note: "Read" },
    "access.manual.change": {
      level: "granted",
      requiresApproval: true,
      note: "Terbatas - narrowed by ENT-004 as 'requires peer approval', see ADR-051",
    },
    "purchase.raw.read": { level: "scoped_nuance", note: "Redacted" },
    "reconciliation.manage": { level: "granted" },
    "notification.operational.schedule": { level: "granted" },
    "notification.marketing.schedule": { level: "scoped_nuance", note: "Ya sesuai consent" },
  },
  live_class_coordinator: {
    "live.occurrence.manage": { level: "granted" },
    "notification.operational.schedule": { level: "granted", note: "Ya untuk kelas" },
  },
  support: {
    "access.explain": { level: "granted" },
    "purchase.raw.read": { level: "scoped_nuance", note: "Redacted" },
    "reconciliation.manage": { level: "scoped_nuance", note: "Create case" },
    "access.manual.change": { level: "scoped_nuance", note: "Request terbatas" },
  },
  finance_reconciliation: {
    "access.explain": { level: "scoped_nuance", note: "Read" },
    "purchase.raw.read": { level: "granted" },
    "reconciliation.manage": { level: "granted" },
  },
  super_admin: {
    "question.draft.write": { level: "granted" },
    "question.first_approve": { level: "granted" },
    "question.ranked_publish": { level: "granted", requiresApproval: true, note: "Ya/approval" },
    "exam.blueprint.draft.write": { level: "granted" },
    "exam.blueprint.first_approve": { level: "granted" },
    "exam.blueprint.publish": { level: "granted", requiresApproval: true, note: "Ya/approval" },
    "program.publish": { level: "granted" },
    "batch.publish": { level: "granted" },
    "live.occurrence.manage": { level: "granted" },
    "access.explain": { level: "granted" },
    "access.manual.change": { level: "granted" },
    "purchase.raw.read": { level: "granted" },
    "reconciliation.manage": { level: "granted" },
    "result.correction.request": { level: "granted" },
    "result.correction.publish": { level: "granted", requiresApproval: true, note: "Ya/approval" },
    "notification.operational.schedule": { level: "granted" },
    "notification.marketing.schedule": { level: "granted" },
    "role.manage": { level: "granted" },
  },
};

/** A role's grant for a permission, or undefined if the matrix has no entry at all (default deny). */
export function getPermissionGrant(
  role: CanonicalRole,
  permission: PermissionCode,
): PermissionGrant | undefined {
  return ROLE_PERMISSION_MATRIX[role][permission];
}

/** True only for a full, enforceable "granted" cell - a "scoped_nuance" cell is deliberately NOT treated as a full grant (fail-closed; see ADR-049). */
export function hasFullGrant(role: CanonicalRole, permission: PermissionCode): boolean {
  return getPermissionGrant(role, permission)?.level === "granted";
}
