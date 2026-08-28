// Fail-closed environment parser (GOV-003).
//
// CLAUDE.md: "Parse/validate all external input at the boundary." An
// environment variable is external input the moment a process reads it.
// Missing a required variable, or an invalid value for a declared one, throws
// a single EnvValidationError listing every violation - not just the first -
// so a misconfigured deployment fails once with a complete report instead of
// failing, being partially fixed, and failing again.

import { ENV_SPEC, type EnvField, type EnvName } from "./env-spec.ts";

export class EnvValidationError extends Error {
  readonly violations: readonly string[];

  constructor(violations: readonly string[]) {
    super(`Environment configuration is invalid:\n${violations.map((line) => `  - ${line}`).join("\n")}`);
    this.name = "EnvValidationError";
    this.violations = violations;
  }
}

type ScalarFor<T extends EnvField["type"]> = T extends "boolean" ? boolean : T extends "integer" ? number : string;

/**
 * "optional-no-default" fields resolve to `Scalar | undefined`: nothing
 * consumes them yet, so there is no honest default to invent, and the type
 * makes every future reader handle the absent case explicitly rather than
 * assuming a value exists.
 */
export type ParsedEnv = {
  readonly [K in EnvName]: (typeof ENV_SPEC)[K] extends { requirement: "optional-no-default" }
    ? ScalarFor<(typeof ENV_SPEC)[K]["type"]> | undefined
    : ScalarFor<(typeof ENV_SPEC)[K]["type"]>;
};

function parseValue(name: string, field: EnvField, raw: string, violations: string[]): unknown {
  switch (field.type) {
    case "boolean": {
      if (raw === "true") return true;
      if (raw === "false") return false;
      violations.push(`${name} must be exactly "true" or "false", received ${JSON.stringify(raw)}`);
      return undefined;
    }
    case "integer": {
      if (!/^-?\d+$/.test(raw)) {
        violations.push(`${name} must be an integer, received ${JSON.stringify(raw)}`);
        return undefined;
      }
      const value = Number.parseInt(raw, 10);
      if (!Number.isSafeInteger(value)) {
        violations.push(`${name} is not a safe integer: ${JSON.stringify(raw)}`);
        return undefined;
      }
      return value;
    }
    case "enum": {
      const allowed = field.enumValues ?? [];
      if (!allowed.includes(raw)) {
        violations.push(`${name} must be one of [${allowed.join(", ")}], received ${JSON.stringify(raw)}`);
        return undefined;
      }
      return raw;
    }
    case "url": {
      try {
        new URL(raw);
      } catch {
        violations.push(`${name} must be a valid URL, received ${JSON.stringify(raw)}`);
        return undefined;
      }
      return raw;
    }
    case "string": {
      if (field.minLength !== undefined && raw.length < field.minLength) {
        // The value itself is never included in the message: this path runs
        // on secrets, and a validation error must not become a leak.
        violations.push(`${name} must be at least ${field.minLength} characters`);
        return undefined;
      }
      return raw;
    }
  }
}

/**
 * Levenshtein edit distance between two short identifiers. Used instead of a
 * prefix list: an early version of this check flagged any unset variable
 * starting with a generic prefix like "API_" or "LOG_" as a typo, which
 * false-positived on a completely unrelated host-injected variable
 * (API_TIMEOUT_MS, observed in this repository's own CI-adjacent shell) that
 * merely happens to share a common English prefix. Edit distance only
 * flags names that are almost certainly a misspelling of one we declared.
 */
function editDistance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        (current[j - 1] ?? Number.POSITIVE_INFINITY) + 1,
        (previous[j] ?? Number.POSITIVE_INFINITY) + 1,
        (previous[j - 1] ?? Number.POSITIVE_INFINITY) + substitutionCost,
      );
    }
    for (let j = 0; j <= b.length; j += 1) previous[j] = current[j] ?? previous[j] ?? 0;
  }
  return previous[b.length] ?? Math.max(a.length, b.length);
}

const TYPO_DISTANCE_THRESHOLD = 2;

function findTypos(source: Readonly<Record<string, string | undefined>>): string[] {
  const known = Object.keys(ENV_SPEC);
  const knownSet = new Set(known);
  const typos: string[] = [];
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined || value === "" || knownSet.has(key)) continue;
    let closest: { name: string; distance: number } | undefined;
    for (const name of known) {
      if (Math.abs(name.length - key.length) > TYPO_DISTANCE_THRESHOLD) continue;
      const distance = editDistance(key, name);
      if (closest === undefined || distance < closest.distance) closest = { name, distance };
    }
    if (closest !== undefined && closest.distance <= TYPO_DISTANCE_THRESHOLD) {
      typos.push(`${key} is not declared in ENV_SPEC; did you mean ${closest.name}?`);
    }
  }
  return typos;
}

/**
 * Parses and validates process.env-shaped input against ENV_SPEC.
 * Throws EnvValidationError listing every violation. Never returns a partial
 * or best-effort result: a caller either has a fully valid ParsedEnv, or the
 * process does not start.
 */
export function parseEnv(source: Readonly<Record<string, string | undefined>>): ParsedEnv {
  const violations: string[] = [...findTypos(source)];
  const result = {} as Record<string, unknown>;

  for (const name of Object.keys(ENV_SPEC) as EnvName[]) {
    const field = ENV_SPEC[name];
    const raw = source[name];

    if (raw === undefined || raw === "") {
      if (field.requirement === "required") {
        violations.push(`${name} is required (${field.description})`);
        continue;
      }
      if (field.requirement === "optional-default") {
        result[name] = parseValue(name, field, field.defaultValue, violations);
        continue;
      }
      // optional-no-default: legitimately absent at this phase (no code
      // consumes it yet; none of these fields are boolean-typed today).
      result[name] = undefined;
      continue;
    }

    result[name] = parseValue(name, field, raw, violations);
  }

  if (violations.length > 0) {
    throw new EnvValidationError(violations);
  }

  // Safe: every branch above either pushed a violation (caught by the guard
  // just above) or assigned a value of the type ParsedEnv promises.
  return result as ParsedEnv;
}

/**
 * The subset of ParsedEnv that apps/web and apps/worker actually read today.
 * Deliberately narrower than the full contract: marking DATABASE_URL,
 * SESSION_SIGNING_SECRET, etc. "required" before any code connects to them
 * would invent a requirement P0 cannot honestly enforce. Each backlog task
 * that wires a real boundary (IDN-001 for sessions, the P1 schema task for
 * the database, ...) extends this set when it starts consuming that
 * variable - see ENV_SPEC's per-field comments for which task that is.
 */
export const CORE_REQUIRED_FOR_STARTUP: readonly EnvName[] = [
  "APP_ENV",
  "APP_BASE_URL",
  "ADMIN_BASE_URL",
  "API_BASE_URL",
  "WORKER_CONCURRENCY",
  "LOG_LEVEL",
];

/** Validates process.env and returns only the variables real code reads today. */
export function loadCoreEnv(
  source: Readonly<Record<string, string | undefined>> = process.env,
): Pick<ParsedEnv, (typeof CORE_REQUIRED_FOR_STARTUP)[number]> {
  const parsed = parseEnv(source);
  const core = {} as Record<string, unknown>;
  for (const name of CORE_REQUIRED_FOR_STARTUP) core[name] = parsed[name];
  return core as Pick<ParsedEnv, (typeof CORE_REQUIRED_FOR_STARTUP)[number]>;
}
