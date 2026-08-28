// Attempt allowance resolution (ENT-002).
//
// dok 05 §8.4/§10 E3A: "Hak attempt dipisahkan dari visibilitas konten" -
// ENT-005's own requirement. This is why `resolveAttemptAllowance` is a
// SEPARATE function from `resolveEffectiveAccess` (effective-access.ts),
// never merged into one result object: a caller can determine "can this
// student see the batch" and "how many ranked attempts do they have" as two
// independent questions, and could in principle answer one without the
// other.
//
// Default MVP per dok 05 §8.4: `batch_policy_only` - the product/grant adds
// no allowance at all, and the batch is the sole owner of the limit. This
// resolver never invents a number when `ownedByBatch` is true; the caller
// (once EXM-series batches exist) is expected to read the actual limit from
// the batch's own attempt policy.

export type AttemptAllowanceMode = "inherit_batch" | "per_batch";
export type AttemptResolutionStrategy = "sum_distinct_sources" | "maximum_allowance" | "batch_policy_only";

export interface AttemptAllowanceClaim {
  /** sourceType+sourceId or an equivalent stable identifier - the E3A dedupeKey's "source" component. Claims already scoped to one target/action by the caller need only dedupe by source. */
  readonly source: string;
  readonly mode: AttemptAllowanceMode;
  readonly maxRankedAttempts: number | null;
  readonly maxPracticeAttempts: number;
  readonly attemptResolution: AttemptResolutionStrategy;
}

export interface AttemptAllowanceResult {
  /** True when the batch's own attempt policy is the sole authority - no product/grant number applies at all (dok 05 §8.4 default MVP, or every claim declared inherit_batch/batch_policy_only). */
  readonly ownedByBatch: boolean;
  /** Null means either "no numeric cap contributed" or (when ownedByBatch) "ask the batch" - never a fabricated number. */
  readonly maxRankedAttempts: number | null;
  readonly maxPracticeAttempts: number;
  readonly contributingSources: readonly string[];
}

const OWNED_BY_BATCH_RESULT: AttemptAllowanceResult = {
  ownedByBatch: true,
  maxRankedAttempts: null,
  maxPracticeAttempts: 0,
  contributingSources: [],
};

/**
 * Combines attempt-allowance claims from every decisive grant supporting a
 * batch, per the `attemptResolution` strategy (dok 05 §10 E3A). If ANY
 * contributing claim says `batch_policy_only`, the batch owns the entire
 * limit - a product cannot partially override it. Distinct-source dedup
 * happens here (a claim's own `source` field), matching E3A's
 * dedupeKey discipline at the attempt-allowance layer.
 */
export function resolveAttemptAllowance(claims: readonly AttemptAllowanceClaim[]): AttemptAllowanceResult {
  if (claims.length === 0) return OWNED_BY_BATCH_RESULT;
  if (claims.every((claim) => claim.mode === "inherit_batch")) return OWNED_BY_BATCH_RESULT;
  if (claims.some((claim) => claim.attemptResolution === "batch_policy_only")) return OWNED_BY_BATCH_RESULT;

  const bySource = new Map<string, AttemptAllowanceClaim>();
  for (const claim of claims) {
    if (!bySource.has(claim.source)) bySource.set(claim.source, claim);
  }
  const distinct = [...bySource.values()];

  // MVP simplification, documented: assumes a uniform attemptResolution
  // strategy across every distinct decisive source for one batch - a
  // per-source-varying strategy is not something dok 05 defines a
  // combination rule for, and is left unhandled here rather than guessed.
  const resolution = distinct[0]!.attemptResolution;

  const rankedValues = distinct
    .map((claim) => claim.maxRankedAttempts)
    .filter((value): value is number => value !== null);
  const practiceValues = distinct.map((claim) => claim.maxPracticeAttempts);

  const maxRankedAttempts =
    rankedValues.length === 0
      ? null
      : resolution === "sum_distinct_sources"
        ? rankedValues.reduce((sum, value) => sum + value, 0)
        : Math.max(...rankedValues);

  const maxPracticeAttempts =
    resolution === "sum_distinct_sources"
      ? practiceValues.reduce((sum, value) => sum + value, 0)
      : Math.max(0, ...practiceValues);

  return {
    ownedByBatch: false,
    maxRankedAttempts,
    maxPracticeAttempts,
    contributingSources: distinct.map((claim) => claim.source),
  };
}
