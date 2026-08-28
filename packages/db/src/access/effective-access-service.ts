// Effective-access service (ENT-002): composes ENT-001's persisted
// grants/events/policies into @superlatif/domain/access's pure resolver,
// with an in-process cache wrapper.
//
// This is the ONLY place cache invalidation happens: `issueGrantAndInvalidate`
// and `recordGrantEventAndInvalidate` wrap ENT-001's own `issueGrant`/
// `recordGrantEvent` unchanged, then call `cache.invalidateUser` -
// "Cache invalidation follows grant mutations" (ENT-002 acceptance)
// without modifying ENT-001's already-shipped, already-tested functions or
// their public API.

import {
  deriveGrantStatus,
  parseAttemptAllowanceTemplate,
  parsePolicyClaims,
  parseStacking,
  resolveAttemptAllowance,
  resolveEffectiveAccess,
  effectiveAccessCacheKey,
  type AttemptAllowanceClaim,
  type AttemptAllowanceResult,
  type EffectiveAccessCache,
  type EffectiveAccessDecision,
  type EffectiveAccessOptions,
  type EffectiveAccessQuery,
  type GrantEvent,
  type ResolvableGrant,
  type ValidityConfig,
} from "@superlatif/domain/access";
import type { Queryable, Schema } from "../db-types.ts";
import { findPolicyById } from "./policy-repository.ts";
import {
  issueGrant,
  listGrantEvents,
  listGrantsForUser,
  recordGrantEvent,
  type GrantEventRow,
  type GrantRow,
  type IssueGrantInput,
  type RecordGrantEventInput,
} from "./grant-repository.ts";

function toGrantEvents(rows: readonly GrantEventRow[]): GrantEvent[] {
  return rows.map((row) => ({ eventType: row.eventType, occurredAt: row.occurredAt }));
}

interface ResolvableGrantWithConfig {
  readonly resolvable: ResolvableGrant;
  readonly policyConfig: Record<string, unknown>;
}

/**
 * Fetches every grant a user holds, joins each to its policy config, and
 * derives its current status (ENT-001's deriveGrantStatus). Kept internal:
 * callers that need attempt-allowance data too (`getAttemptAllowance`) get
 * the raw config back alongside the parsed claims, so they never re-fetch a
 * policy row this function already read.
 */
async function listResolvableGrantsWithConfig(
  db: Queryable<Schema>,
  userId: string,
  now: Date,
): Promise<ResolvableGrantWithConfig[]> {
  const grants = await listGrantsForUser(db, userId);
  const result: ResolvableGrantWithConfig[] = [];

  for (const grant of grants) {
    const policy = await findPolicyById(db, grant.accessPolicyId);
    // Should be impossible under the FK, but stays defensive: a missing
    // policy for one grant does not abort resolution for every other grant
    // the user holds.
    if (!policy) continue;
    const events = toGrantEvents(await listGrantEvents(db, grant.id));
    const derived = deriveGrantStatus(
      {
        validityConfig: policy.config["validity"] as ValidityConfig,
        issuedAt: grant.createdAt,
        validFrom: grant.validFrom,
        validTo: grant.validTo,
      },
      events,
      now,
    );
    result.push({
      resolvable: { grantId: grant.id, derived, claims: parsePolicyClaims(policy.config) },
      policyConfig: policy.config,
    });
  }

  return result;
}

/** Public accessor for the `ResolvableGrant[]` shape alone - what @superlatif/domain/access's resolveEffectiveAccess consumes directly. */
export async function listResolvableGrantsForUser(
  db: Queryable<Schema>,
  userId: string,
  now: Date,
): Promise<ResolvableGrant[]> {
  return (await listResolvableGrantsWithConfig(db, userId, now)).map((entry) => entry.resolvable);
}

/**
 * Resolves effective access for one query, checking the cache first. A
 * cache hit skips every DB read entirely; a miss resolves fresh and stores
 * the result before returning it.
 */
export async function getEffectiveAccess(
  db: Queryable<Schema>,
  cache: EffectiveAccessCache,
  userId: string,
  query: EffectiveAccessQuery,
  now: Date,
  options?: EffectiveAccessOptions,
): Promise<EffectiveAccessDecision> {
  const key = effectiveAccessCacheKey(query);
  const cached = cache.get(userId, key, now);
  if (cached) return cached;

  const grants = await listResolvableGrantsForUser(db, userId, now);
  const decision = resolveEffectiveAccess(grants, query, options);
  cache.set(userId, key, decision, now);
  return decision;
}

/**
 * Resolves attempt allowance for a batch target from a user's decisive
 * grants - deliberately a separate call from `getEffectiveAccess`, never
 * merged into one response (ENT-005: "Attempt allowance dinilai terpisah
 * dari content visibility"). Not cached: attempt counts are meant to be
 * read fresh once EXM-series batches exist, and this MVP-scope function has
 * no per-batch state of its own to make caching meaningful yet.
 */
export async function getAttemptAllowance(
  db: Queryable<Schema>,
  userId: string,
  query: EffectiveAccessQuery,
  now: Date,
  options?: EffectiveAccessOptions,
): Promise<AttemptAllowanceResult> {
  const entries = await listResolvableGrantsWithConfig(db, userId, now);
  const decision = resolveEffectiveAccess(
    entries.map((entry) => entry.resolvable),
    query,
    options,
  );

  const claims: AttemptAllowanceClaim[] = [];
  for (const grantId of decision.decisiveGrantIds) {
    const entry = entries.find((candidate) => candidate.resolvable.grantId === grantId);
    if (!entry) continue;
    const template = parseAttemptAllowanceTemplate(entry.policyConfig);
    const stacking = parseStacking(entry.policyConfig);
    claims.push({
      source: grantId,
      mode: template.mode,
      maxRankedAttempts: template.maxRankedAttempts,
      maxPracticeAttempts: template.maxPracticeAttempts,
      attemptResolution: stacking.attemptResolution,
    });
  }

  return resolveAttemptAllowance(claims);
}

/** Wraps ENT-001's issueGrant, then invalidates this user's cached effective-access decisions. */
export async function issueGrantAndInvalidate(
  db: Parameters<typeof issueGrant>[0],
  cache: EffectiveAccessCache,
  input: IssueGrantInput,
): Promise<GrantRow> {
  const row = await issueGrant(db, input);
  cache.invalidateUser(input.userId);
  return row;
}

/** Wraps ENT-001's recordGrantEvent, then invalidates the cache for the grant's owning user. */
export async function recordGrantEventAndInvalidate(
  db: Parameters<typeof recordGrantEvent>[0],
  cache: EffectiveAccessCache,
  userId: string,
  input: RecordGrantEventInput,
): Promise<void> {
  await recordGrantEvent(db, input);
  cache.invalidateUser(userId);
}
