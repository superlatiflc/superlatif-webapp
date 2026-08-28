// External SKU -> offer mapping resolution (COM-001).
//
// dok 05 §11.1: "Gunakan many-to-one mapping dari external SKU ke internal
// offer," supporting legacy and new Sejoli IDs, several prices/campaigns for
// the same product, upgrade SKUs, and recovery from a duplicate catalogue
// entry - and "Mapping harus berversi." This module is the pure resolution
// rule: given every mapping row that has ever existed for one external SKU,
// which one applies at a given instant. The actual webhook/checkout call
// site that USES this at runtime is explicitly COM-002/COM-003 scope, not
// built here (task boundary: "jangan bangun checkout/live Sejoli bridge
// dulu").
//
// Mapping rows are immutable once created (packages/db/src/commerce -
// createSkuMapping never updates a row); a "remap" is a new row with a new
// mappingVersion, which is what makes "SKU-to-capability mapping is
// versioned" (COM-001 acceptance) durably auditable rather than a single
// mutable pointer.

export type SkuMappingStatus = "active" | "inactive";

export interface SkuMappingCandidate {
  readonly offerId: string;
  readonly mappingVersion: number;
  /** Inclusive lower bound. */
  readonly validFrom: Date;
  /** Exclusive upper bound; null means still open. */
  readonly validTo: Date | null;
  /** Break ties between mappings simultaneously valid at the same instant - dok 05 §11.1's "duplicate catalogue entry" recovery path. */
  readonly priority: number;
  readonly status: SkuMappingStatus;
}

/**
 * Resolves which mapping applies at `at`. Candidates are filtered to
 * `status === "active"` and `validFrom <= at < validTo` (or open-ended),
 * then the highest `priority` wins; a tie is broken by the highest
 * `mappingVersion` (the most recently authored row) so resolution is
 * deterministic even when two rows were deliberately given equal priority.
 * Returns null rather than guessing - an external SKU with no mapping valid
 * "right now" must fall through to reconciliation (dok 05 §14 "Unknown
 * SKU"), never to a default offer.
 */
export function resolveSkuMapping(
  candidates: readonly SkuMappingCandidate[],
  at: Date,
): SkuMappingCandidate | null {
  const eligible = candidates.filter(
    (candidate) =>
      candidate.status === "active" &&
      candidate.validFrom.getTime() <= at.getTime() &&
      (candidate.validTo === null || at.getTime() < candidate.validTo.getTime()),
  );
  if (eligible.length === 0) return null;

  return eligible.reduce((best, candidate) => {
    if (candidate.priority !== best.priority) return candidate.priority > best.priority ? candidate : best;
    return candidate.mappingVersion > best.mappingVersion ? candidate : best;
  });
}
