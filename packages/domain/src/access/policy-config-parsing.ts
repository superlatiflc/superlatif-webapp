// Policy config parsing (ENT-002).
//
// `access_policies.config` is `Record<string, unknown>` JSONB at the type
// level, but every row was schema-validated against
// contracts/entitlement-policy.schema.json before it was ever written
// (packages/db/src/access/policy-repository.ts#assertValidPolicyConfig,
// ENT-001). This module turns that trusted-but-untyped JSON back into the
// typed shapes effective-access.ts and attempt-allowance.ts need - a thin,
// pure mapping layer, not a second validation pass.

import type { AttemptAllowanceMode, AttemptResolutionStrategy } from "./attempt-allowance.ts";
import type { AvailabilityOverride, PolicyClaim, TargetRef } from "./effective-access.ts";

function parseDate(value: unknown): Date | null {
  return typeof value === "string" ? new Date(value) : null;
}

function parseTargetRef(value: unknown): TargetRef {
  const record = value as { code?: unknown; version?: unknown };
  return { code: String(record.code), version: typeof record.version === "number" ? record.version : null };
}

function parseAvailabilityOverride(value: unknown): AvailabilityOverride | null {
  if (value === null || value === undefined) return null;
  const record = value as { startsAt?: unknown; endsAt?: unknown };
  return { startsAt: parseDate(record.startsAt), endsAt: parseDate(record.endsAt) };
}

/** Parses `config.claims` into the shape resolveEffectiveAccess consumes. */
export function parsePolicyClaims(config: Record<string, unknown>): PolicyClaim[] {
  const claims = Array.isArray(config["claims"]) ? (config["claims"] as unknown[]) : [];
  return claims.map((entry) => {
    const record = entry as {
      targetType?: unknown;
      targetRef?: unknown;
      actions?: unknown;
      includeDescendants?: unknown;
      availabilityOverride?: unknown;
    };
    return {
      targetType: String(record.targetType),
      targetRef: parseTargetRef(record.targetRef),
      actions: Array.isArray(record.actions) ? record.actions.map(String) : [],
      includeDescendants: record.includeDescendants === true,
      availabilityOverride: parseAvailabilityOverride(record.availabilityOverride),
    };
  });
}

export interface ParsedAttemptAllowanceTemplate {
  readonly mode: AttemptAllowanceMode;
  readonly maxRankedAttempts: number | null;
  readonly maxPracticeAttempts: number;
}

export interface ParsedStacking {
  readonly attemptResolution: AttemptResolutionStrategy;
}

/** Parses `config.attemptAllowance` (mode/maxRankedAttempts/maxPracticeAttempts) - `attemptResolution` lives in `config.stacking`, parsed separately by `parseStacking`, since dok 05 §10 E3A treats them as two different config sections. */
export function parseAttemptAllowanceTemplate(
  config: Record<string, unknown>,
): ParsedAttemptAllowanceTemplate {
  const record = (config["attemptAllowance"] ?? {}) as {
    mode?: unknown;
    maxRankedAttempts?: unknown;
    maxPracticeAttempts?: unknown;
  };
  return {
    mode: record.mode === "per_batch" ? "per_batch" : "inherit_batch",
    maxRankedAttempts: typeof record.maxRankedAttempts === "number" ? record.maxRankedAttempts : null,
    maxPracticeAttempts: typeof record.maxPracticeAttempts === "number" ? record.maxPracticeAttempts : 0,
  };
}

export function parseStacking(config: Record<string, unknown>): ParsedStacking {
  const record = (config["stacking"] ?? {}) as { attemptResolution?: unknown };
  const value = record.attemptResolution;
  const attemptResolution: AttemptResolutionStrategy =
    value === "sum_distinct_sources" || value === "maximum_allowance" ? value : "batch_policy_only";
  return { attemptResolution };
}
