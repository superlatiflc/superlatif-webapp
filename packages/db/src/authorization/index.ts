export {
  RoleAssignmentAuditRequiredError,
  assignRole,
  findRoleByCode,
  listActiveRoleHoldings,
  reinstateRoleAssignment,
  revokeRoleAssignment,
  seedCanonicalRoles,
  type AssignRoleInput,
  type RevokeRoleAssignmentInput,
  type RoleRow,
  type UserRoleRow,
} from "./role-repository.ts";
