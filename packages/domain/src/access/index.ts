export {
  InvalidValidityConfigError,
  computeValidityWindow,
  resolveActivatedWindow,
  type ValidityConfig,
  type ValidityContext,
  type ValidityMode,
  type ValidityWindow,
} from "./policy-validity.ts";

export {
  deriveGrantStatus,
  isOwnedBy,
  type DerivedGrantStatus,
  type GrantEvent,
  type GrantEventType,
  type GrantFacts,
  type GrantOwnership,
  type GrantStatus,
} from "./grant-status.ts";

export { dedupeClaims, distinctTargets, type DedupableClaim, type DistinctTarget } from "./dedupe.ts";

export { computeChecksum, type JsonValue } from "./policy-checksum.ts";

export {
  resolveEffectiveAccess,
  type AvailabilityOverride,
  type EffectiveAccessDecision,
  type EffectiveAccessDiagnosticEntry,
  type EffectiveAccessOptions,
  type EffectiveAccessQuery,
  type EffectiveAccessReasonCode,
  type PolicyClaim,
  type ResolvableGrant,
  type TargetRef,
} from "./effective-access.ts";

export {
  resolveAttemptAllowance,
  type AttemptAllowanceClaim,
  type AttemptAllowanceMode,
  type AttemptAllowanceResult,
  type AttemptResolutionStrategy,
} from "./attempt-allowance.ts";

export {
  createInMemoryEffectiveAccessCache,
  effectiveAccessCacheKey,
  type EffectiveAccessCache,
  type InMemoryEffectiveAccessCacheOptions,
} from "./effective-access-cache.ts";

export {
  parseAttemptAllowanceTemplate,
  parsePolicyClaims,
  parseStacking,
  type ParsedAttemptAllowanceTemplate,
  type ParsedStacking,
} from "./policy-config-parsing.ts";

export {
  deriveManualChangeStatus,
  type ManualChangeDecisionFacts,
  type ManualChangeDecisionOutcome,
  type ManualChangeStatus,
  type ManualChangeType,
} from "./manual-change.ts";

export { compareEffectiveAccessDecisions, type DriftKind, type DriftReport } from "./entitlement-drift.ts";
