// Grant/claim deduplication (ENT-001).
//
// 05_PRODUCT_CATALOG_AND_ENTITLEMENT.md §10 E2 "Satu resource di UI": if two
// grants point at the same resource, show it once - support can still see
// every source. §10 E3A pins the dedupe key to exactly four fields: source,
// target, action, policy_version.
//
// Scope: this proves the DEDUPE KEY design is sound at the unit level. The
// full effective-access projection that consumes it - caching, explanation
// trace, attempt-allowance-vs-content-visibility separation - is ENT-002's
// job (dok 21 §5 "effective_access": "Source of truth remains
// grants/claims/policy").

export interface DedupableClaim {
  readonly source: string;
  readonly target: string;
  readonly action: string;
  readonly policyVersion: number;
}

function dedupeKey(claim: DedupableClaim): string {
  return `${claim.source} ${claim.target} ${claim.action} ${claim.policyVersion}`;
}

/**
 * Removes exact duplicates by (source, target, action, policyVersion),
 * preserving first-seen order. Two DIFFERENT sources granting the SAME
 * (target, action) are NOT deduplicated by this function - collapsing them
 * to one row is the resolver's job (ENT-002); this only removes identical
 * repeats of the same claim (e.g. from a duplicate webhook replay).
 */
export function dedupeClaims<T extends DedupableClaim>(claims: readonly T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const claim of claims) {
    const key = dedupeKey(claim);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(claim);
  }
  return result;
}

/**
 * Distinct (target, action) pairs across every claim regardless of source -
 * "does the student see this resource card twice." Multiple sources
 * collapse to one entry; use the returned `sources` list to recover which
 * grants support a given target for support tooling.
 */
export interface DistinctTarget {
  readonly target: string;
  readonly action: string;
  readonly sources: readonly string[];
}

export function distinctTargets(claims: readonly DedupableClaim[]): DistinctTarget[] {
  const byTargetAction = new Map<string, { target: string; action: string; sources: string[] }>();
  for (const claim of claims) {
    const key = `${claim.target} ${claim.action}`;
    const existing = byTargetAction.get(key);
    if (existing) {
      if (!existing.sources.includes(claim.source)) existing.sources.push(claim.source);
      continue;
    }
    byTargetAction.set(key, { target: claim.target, action: claim.action, sources: [claim.source] });
  }
  return [...byTargetAction.values()];
}
