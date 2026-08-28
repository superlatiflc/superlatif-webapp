// Synthetic fixture loader.
//
// Implements the five mandatory harness behaviours in
// test/fixtures/contracts/README.md. A fixture that does not declare itself
// synthetic and production-ineligible is refused: the loader fails closed so a
// production-shaped payload can never quietly enter a build-verification run.

import fs from "node:fs";
import path from "node:path";
import { digest, type JsonValue } from "./canonical.ts";

/** Thrown when a fixture violates a mandatory harness rule. */
export class FixtureRejectedError extends Error {
  readonly fixturePath: string;

  constructor(fixturePath: string, reason: string) {
    super(`Fixture rejected (${fixturePath}): ${reason}`);
    this.name = "FixtureRejectedError";
    this.fixturePath = fixturePath;
  }
}

export interface FixtureSet {
  readonly schemaVersion: string;
  readonly fixtureSet: string;
  readonly evidenceClass: "synthetic";
  readonly productionEligible: false;
  readonly cases: readonly JsonValue[];
}

/**
 * Fixture sets carry extra set-specific keys (clock, policy, providerNotice,
 * templateVersions, regulatoryClaim). They are intentionally untyped here:
 * their meaning belongs to the task that consumes the set, not to the loader.
 */
export function fixtureField(set: FixtureSet, key: string): JsonValue | undefined {
  return (set as unknown as Record<string, JsonValue | undefined>)[key];
}

/**
 * Harness rule 5: a fixture must never become production configuration through
 * an environment flag alone. Loading synthetic fixtures under a production-like
 * environment is refused outright rather than warned about.
 */
export function assertNonProductionEnvironment(
  environment: Record<string, string | undefined> = process.env,
): void {
  const appEnvironment = environment["APP_ENV"];
  if (appEnvironment === "production") {
    throw new Error("Synthetic fixtures must not be loaded while APP_ENV=production");
  }
  if (environment["PRODUCTION_WRITES_ENABLED"] === "true") {
    throw new Error("Synthetic fixtures must not be loaded while PRODUCTION_WRITES_ENABLED=true");
  }
  if (environment["SKD_PRODUCTION_ACTIVATION"] === "true") {
    throw new Error("Synthetic fixtures must not be loaded while SKD_PRODUCTION_ACTIVATION=true");
  }
}

/** Harness rules 1 and 3: reject non-synthetic or production-eligible fixtures. */
export function parseFixtureSet(fixturePath: string, raw: string): FixtureSet {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new FixtureRejectedError(fixturePath, `invalid JSON: ${(error as Error).message}`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new FixtureRejectedError(fixturePath, "expected a JSON object at the root");
  }

  const candidate = parsed as Record<string, unknown>;
  if (candidate["evidenceClass"] !== "synthetic") {
    throw new FixtureRejectedError(
      fixturePath,
      `evidenceClass must be "synthetic", received ${JSON.stringify(candidate["evidenceClass"])}`,
    );
  }
  if (candidate["productionEligible"] !== false) {
    throw new FixtureRejectedError(
      fixturePath,
      `productionEligible must be false, received ${JSON.stringify(candidate["productionEligible"])}`,
    );
  }
  if (typeof candidate["schemaVersion"] !== "string") {
    throw new FixtureRejectedError(fixturePath, "schemaVersion must be a string");
  }
  if (typeof candidate["fixtureSet"] !== "string") {
    throw new FixtureRejectedError(fixturePath, "fixtureSet must be a string");
  }
  if (!Array.isArray(candidate["cases"]) || candidate["cases"].length === 0) {
    throw new FixtureRejectedError(fixturePath, "cases must be a non-empty array");
  }

  return candidate as unknown as FixtureSet;
}

/** Loads and validates one fixture file. */
export function loadFixtureSet(fixturePath: string): FixtureSet {
  assertNonProductionEnvironment();
  return parseFixtureSet(fixturePath, fs.readFileSync(fixturePath, "utf8"));
}

/** Loads every fixture set in a directory, sorted so iteration order is stable. */
export function loadAllFixtureSets(directory: string): Map<string, FixtureSet> {
  assertNonProductionEnvironment();
  const files = fs
    .readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .sort();
  const sets = new Map<string, FixtureSet>();
  for (const name of files) {
    sets.set(name, loadFixtureSet(path.join(directory, name)));
  }
  return sets;
}

/**
 * Stable digest across every fixture set. Two runs of the same commit must
 * produce the same value; that is the observable form of
 * "Seeded suite produces repeatable output".
 */
export function fixtureCorpusDigest(directory: string): {
  digest: string;
  setCount: number;
  caseCount: number;
  sets: { name: string; fixtureSet: string; caseCount: number; digest: string }[];
} {
  const sets = loadAllFixtureSets(directory);
  const perSet = [...sets.entries()].map(([name, set]) => ({
    name,
    fixtureSet: set.fixtureSet,
    caseCount: set.cases.length,
    digest: digest(set as unknown as JsonValue),
  }));
  return {
    digest: digest(perSet as unknown as JsonValue),
    setCount: perSet.length,
    caseCount: perSet.reduce((total, entry) => total + entry.caseCount, 0),
    sets: perSet,
  };
}
