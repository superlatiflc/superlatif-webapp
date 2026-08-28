// @superlatif/testing
//
// Deterministic test harness: injected clock, seeded randomness, canonical
// comparison, and the synthetic fixture loader required by
// test/fixtures/contracts/README.md.
//
// Owning backlog task: GOV-002. Provider fakes and domain factories arrive with
// the tasks that own those boundaries; nothing here may encode provider or
// regulatory behaviour.

export { DEFAULT_TEST_INSTANT, fixedClock, manualClock, type Clock, type ManualClock } from "./clock.ts";
export { DEFAULT_TEST_SEED, seededRandom, seedFromEnvironment } from "./random.ts";
export { canonicalize, canonicalStringify, digest, type JsonValue } from "./canonical.ts";
export {
  FixtureRejectedError,
  assertNonProductionEnvironment,
  fixtureCorpusDigest,
  fixtureField,
  loadAllFixtureSets,
  loadFixtureSet,
  parseFixtureSet,
  type FixtureSet,
} from "./fixtures.ts";
