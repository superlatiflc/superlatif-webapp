export {
  createIdentityConflict,
  createUser,
  findExternalIdentity,
  findSessionById,
  findUsersByContact,
  insertSession,
  linkExternalIdentity,
  revokeSession,
  touchSessionLastSeen,
  type CreatedSession,
  type Queryable,
  type Schema,
  type SessionRow,
} from "./repository.ts";

export {
  performDeterministicLogin,
  revokeSessionById,
  validateSession,
  type AuditLogger,
  type DeterministicLoginDeps,
  type DeterministicLoginInput,
  type DeterministicLoginResult,
  type SessionValidationOutcome,
  type ValidateSessionResult,
} from "./service.ts";
