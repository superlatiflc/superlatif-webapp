// Entitlement rebuild/drift comparison (ENT-003).
//
// Pure comparison only - no I/O, no cache read/write. Given a "reported"
// decision (whatever a caller currently trusts - typically an
// EffectiveAccessCache entry) and a "rebuilt" decision (freshly recomputed
// straight from source records via @superlatif/domain/access's own
// resolveEffectiveAccess, bypassing any cache), this module decides ONLY
// whether they agree and, if not, which direction they disagree in.
//
// The direction matters more than the fact of disagreement: dok 05 §16
// invariant 8 ("Unknown SKU atau ambiguous user mapping tidak memberi akses
// luas secara diam-diam") generalizes here as "a stale cached decision must
// never be trusted to grant MORE than a fresh rebuild would" -
// `"cache_over_permissive"` is the dangerous direction a caller must always
// react to (packages/db/src/access/entitlement-rebuild-service.ts's only
// reaction is to invalidate the cache, never to widen anything to match
// it). `"cache_under_permissive"` (the safe direction - a real grant exists
// but the cache hadn't caught up yet) is still reported, since dok 05 §16
// invariant 1 means every allowed decision must be explainable, but it is
// not itself evidence of a bug the same way the permissive direction is.

import type { EffectiveAccessDecision } from "./effective-access.ts";

export type DriftKind =
  "none" | "no_prior_cache" | "cache_over_permissive" | "cache_under_permissive" | "decisive_grants_differ";

export interface DriftReport {
  readonly hasDrift: boolean;
  readonly driftKind: DriftKind;
  readonly cached: EffectiveAccessDecision | null;
  readonly rebuilt: EffectiveAccessDecision;
}

function sameGrantSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((id, index) => id === sortedB[index]);
}

/**
 * Compares a previously-reported decision against a freshly rebuilt one.
 * Never mutates either input, never decides what to DO about drift - that
 * is entirely the caller's responsibility (packages/db/src/access's
 * entitlement-rebuild-service.ts).
 */
export function compareEffectiveAccessDecisions(
  cached: EffectiveAccessDecision | null,
  rebuilt: EffectiveAccessDecision,
): DriftReport {
  if (cached === null) {
    return { hasDrift: false, driftKind: "no_prior_cache", cached, rebuilt };
  }

  if (cached.allowed && !rebuilt.allowed) {
    return { hasDrift: true, driftKind: "cache_over_permissive", cached, rebuilt };
  }
  if (!cached.allowed && rebuilt.allowed) {
    return { hasDrift: true, driftKind: "cache_under_permissive", cached, rebuilt };
  }
  if (cached.allowed && rebuilt.allowed && !sameGrantSet(cached.decisiveGrantIds, rebuilt.decisiveGrantIds)) {
    return { hasDrift: true, driftKind: "decisive_grants_differ", cached, rebuilt };
  }

  return { hasDrift: false, driftKind: "none", cached, rebuilt };
}
