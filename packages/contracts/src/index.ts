// @superlatif/contracts
//
// Shared API/JSON-Schema contract types derived from contracts/ (Gate 3),
// plus the environment and feature-flag conventions owned by GOV-003.
//
// GOV-001 established the package boundary; behaviour beyond env/flags is
// added by the owning task. Do not add domain semantics, provider behaviour,
// or schema here without the backlog entry that owns it.

export {
  ENV_SPEC,
  PRODUCTION_SENSITIVE_FLAG_NAMES,
  SECRET_ENV_NAMES,
  type EnvField,
  type EnvName,
  type EnvType,
} from "./env-spec.ts";
export {
  CORE_REQUIRED_FOR_STARTUP,
  EnvValidationError,
  loadCoreEnv,
  parseEnv,
  type ParsedEnv,
} from "./env.ts";
export {
  PRODUCTION_SENSITIVE_FLAGS,
  REGISTERED_FLAG_NAMES,
  loadFlags,
  type FeatureFlag,
  type FlagName,
} from "./flags.ts";
