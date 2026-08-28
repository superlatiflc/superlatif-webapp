// Seeded randomness for deterministic test suites
// (27_QA_TESTING_AND_UAT_PLAN.md §2 "Deterministic").
//
// SCOPE WARNING: this generator exists so a test suite produces repeatable
// output. It must never be used to derive presented question or option order.
// ADR-016 requires the server to generate and persist the presented order and
// explicitly forbids depending on a reconstructable algorithm.

/** Matches TEST_FIXTURE_SEED in .env.example so local and CI runs agree. */
export const DEFAULT_TEST_SEED = "superlatif-synthetic-v1";

/** FNV-1a: turns a seed string into a 32-bit state. */
function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Deterministic [0, 1) generator. Two generators built from the same seed
 * produce identical sequences; different seeds produce different sequences.
 */
export function seededRandom(seed: string = DEFAULT_TEST_SEED): () => number {
  if (seed.length === 0) {
    throw new TypeError("A test seed must not be empty");
  }
  let state = hashSeed(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Reads the seed from an environment map, falling back to the shared default. */
export function seedFromEnvironment(environment: Record<string, string | undefined>): string {
  const seed = environment["TEST_FIXTURE_SEED"];
  return seed !== undefined && seed.length > 0 ? seed : DEFAULT_TEST_SEED;
}
