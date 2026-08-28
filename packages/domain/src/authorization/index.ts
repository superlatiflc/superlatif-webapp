export { CANONICAL_ROLES, isCanonicalRole, type CanonicalRole } from "./roles.ts";

export {
  isRoleAssignmentActive,
  type RoleAssignmentEvent,
  type RoleAssignmentEventType,
} from "./assignment-status.ts";

export {
  PERMISSION_CODES,
  ROLE_PERMISSION_MATRIX,
  getPermissionGrant,
  hasFullGrant,
  type PermissionCode,
  type PermissionGrant,
} from "./permissions.ts";

export { HIGH_RISK_ACTION_TYPES, isHighRiskActionType, type HighRiskActionType } from "./high-risk.ts";

export {
  isEntitled,
  isOwner,
  isWithinAssignedScope,
  violatesMakerChecker,
  type RoleScopeAssignment,
} from "./object-scope.ts";

export {
  authorize,
  type AuthorizationAction,
  type AuthorizationActor,
  type AuthorizationAudit,
  type AuthorizationDecision,
  type AuthorizationObject,
  type AuthorizationReasonCode,
  type AuthorizeRequest,
  type RoleHolding,
} from "./authorize.ts";
