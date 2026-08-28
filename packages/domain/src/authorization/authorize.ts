// Central authorization decision (IDN-004).
//
// Composes roles.ts/permissions.ts/high-risk.ts/object-scope.ts into one
// pure function. "Object-level access harus bisa mengecek kepemilikan
// user, entitlement, dan scope role" (founder instruction) - all three
// checks run, each with its own reason code, never collapsed into a single
// opaque boolean. No I/O: `actor.roles` and `entitlement.hasEffectiveAccess`
// are pre-resolved by the caller (packages/db/src/authorization,
// composing @superlatif/domain/access's deriveGrantStatus for the
// entitlement input) - this module never queries a database itself.
//
// Test-case IDs referenced throughout authorize.test.ts map onto
// test/fixtures/contracts/privacy-rbac.cases.json's SEC-SYN-001..006.

import { isHighRiskActionType, type HighRiskActionType } from "./high-risk.ts";
import {
  violatesMakerChecker,
  isEntitled,
  isOwner,
  isWithinAssignedScope,
  type RoleScopeAssignment,
} from "./object-scope.ts";
import { hasFullGrant, getPermissionGrant, type PermissionCode } from "./permissions.ts";
import type { CanonicalRole } from "./roles.ts";

export interface RoleHolding {
  readonly role: CanonicalRole;
  /** Empty = this role holding is unscoped (applies wherever the permission matrix allows). Non-empty = restricted to these (scopeType, scopeRef) pairs only. */
  readonly scopes: readonly RoleScopeAssignment[];
}

export interface AuthorizationActor {
  readonly userId: string;
  /** Empty array = a plain student - no RBAC role at all. Authorization for a student runs entirely through ownership/entitlement, never through the permission matrix. */
  readonly roles: readonly RoleHolding[];
}

export interface AuthorizationObject {
  /** Set for actor-owned objects (attempt, result, session, ...). */
  readonly ownerUserId?: string;
  /** Set for shared/catalogue objects (program, resource, batch, ...) whose access is entitlement-gated, not owned. */
  readonly requiresEntitlement?: boolean;
  readonly scopeType?: string;
  readonly scopeRef?: string;
  /** Set when the action is an approval/review of something someone authored - triggers the maker-checker check unconditionally, independent of role. */
  readonly creatorUserId?: string;
}

export interface AuthorizationAction {
  readonly type: string;
  /** RBAC permission this action requires, if any. A plain student self-service read (e.g. "read my own attempt") has none. */
  readonly permission?: PermissionCode;
  /** dok 24 §7 high-risk workflow this action belongs to, if any - gates on non-empty audit.reason/correlationId regardless of role. */
  readonly highRiskType?: HighRiskActionType;
}

export interface AuthorizationAudit {
  readonly reason?: string;
  readonly correlationId?: string;
}

export interface AuthorizeRequest {
  readonly actor: AuthorizationActor;
  readonly action: AuthorizationAction;
  readonly object?: AuthorizationObject;
  readonly entitlement?: { readonly hasEffectiveAccess: boolean };
  readonly audit?: AuthorizationAudit;
}

export type AuthorizationReasonCode =
  | "MAKER_CHECKER_VIOLATION"
  | "AUDIT_FIELDS_REQUIRED"
  | "ROLE_DENIED"
  | "OBJECT_SCOPE_DENIED"
  | "ENTITLEMENT_DENIED"
  | "ASSIGNED_SCOPE"
  | "GRANTED";

export interface AuthorizationDecision {
  readonly allowed: boolean;
  readonly reasonCode: AuthorizationReasonCode;
  /** True when the winning grant is marked "Second approval"/"Ya/approval" in dok 24 §6 - informational only; the two-person approval workflow itself is a later task's scope. */
  readonly requiresApproval?: boolean;
}

function deny(reasonCode: AuthorizationReasonCode): AuthorizationDecision {
  return { allowed: false, reasonCode };
}

type PermissionResolution =
  | { readonly kind: "not_applicable" }
  | { readonly kind: "denied_no_role" }
  | { readonly kind: "denied_scope" }
  | { readonly kind: "granted"; readonly scoped: boolean; readonly requiresApproval: boolean };

function resolvePermission(request: AuthorizeRequest): PermissionResolution {
  const { actor, action, object } = request;
  if (action.permission === undefined) return { kind: "not_applicable" };

  let sawPermissionAtAll = false;

  for (const holding of actor.roles) {
    if (!hasFullGrant(holding.role, action.permission)) continue;
    sawPermissionAtAll = true;

    const inScope =
      object?.scopeType === undefined || object?.scopeRef === undefined
        ? true
        : isWithinAssignedScope(holding.scopes, object.scopeType, object.scopeRef);
    if (!inScope) continue;

    const grant = getPermissionGrant(holding.role, action.permission);
    return {
      kind: "granted",
      scoped: holding.scopes.length > 0,
      requiresApproval: grant?.requiresApproval === true,
    };
  }

  return sawPermissionAtAll ? { kind: "denied_scope" } : { kind: "denied_no_role" };
}

export function authorize(request: AuthorizeRequest): AuthorizationDecision {
  const { actor, action, object, entitlement, audit } = request;

  // 1. Maker-checker is absolute and role-independent (dok 02 §5.3 /
  // CLAUDE.md: "penulis tidak boleh menyetujui soal sendiri... evaluated by
  // actor ID"), so it runs before anything else can grant an override.
  if (object?.creatorUserId !== undefined && violatesMakerChecker(object.creatorUserId, actor.userId)) {
    return deny("MAKER_CHECKER_VIOLATION");
  }

  // 2. A high-risk action (dok 24 §7) cannot be authorized at all without
  // its audit trail already present - "admin melewati audit trail" is
  // refused here, structurally, not merely logged after the fact.
  if (action.highRiskType !== undefined && isHighRiskActionType(action.highRiskType)) {
    if (!actor.userId || !audit?.reason || !audit?.correlationId) {
      return deny("AUDIT_FIELDS_REQUIRED");
    }
  }

  // 3. Resolve the permission grant, if this action needs one at all - a
  // plain student self-service action has no `action.permission` and skips
  // straight to the ownership/entitlement checks below.
  const permission = resolvePermission(request);
  if (permission.kind === "denied_no_role") return deny("ROLE_DENIED");
  if (permission.kind === "denied_scope") return deny("OBJECT_SCOPE_DENIED");
  const permissionGranted = permission.kind === "granted";

  // 4. Ownership - a role-based grant can stand in for ownership (a
  // support agent's `access.explain` reading another user's data), but
  // absent one, mismatched ownership denies outright; "UUID does not
  // replace authorization."
  if (object?.ownerUserId !== undefined && !isOwner(object.ownerUserId, actor.userId) && !permissionGranted) {
    return deny("OBJECT_SCOPE_DENIED");
  }

  // 5. Entitlement - a separate axis from ownership/role, for shared
  // catalogue objects (program/resource/batch) rather than actor-owned
  // ones.
  if (object?.requiresEntitlement === true && !isEntitled(entitlement?.hasEffectiveAccess ?? false)) {
    return deny("ENTITLEMENT_DENIED");
  }

  return {
    allowed: true,
    reasonCode: permission.kind === "granted" && permission.scoped ? "ASSIGNED_SCOPE" : "GRANTED",
    ...(permission.kind === "granted" && permission.requiresApproval ? { requiresApproval: true } : {}),
  };
}
