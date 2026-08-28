// Canonical serialization and digests.
//
// 27_QA_TESTING_AND_UAT_PLAN.md §2 requires evidence-based determinism, and
// test/fixtures/contracts/README.md requires comparing semantic objects rather
// than generated identifiers. Canonical form makes "same meaning" observable:
// object key order stops being a source of false difference.

import { createHash } from "node:crypto";

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/** Recursively sorts object keys. Array order is meaningful and preserved. */
export function canonicalize(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry));
  }
  if (value !== null && typeof value === "object") {
    const sorted: { [key: string]: JsonValue } = {};
    for (const key of Object.keys(value).sort()) {
      const entry = value[key];
      if (entry !== undefined) sorted[key] = canonicalize(entry);
    }
    return sorted;
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new TypeError("Canonical JSON cannot represent a non-finite number");
  }
  return value;
}

/** Stable string form of a value. Identical meaning yields an identical string. */
export function canonicalStringify(value: JsonValue): string {
  return JSON.stringify(canonicalize(value));
}

/** Stable SHA-256 of a value, used to prove a suite is repeatable. */
export function digest(value: JsonValue): string {
  return createHash("sha256").update(canonicalStringify(value)).digest("hex");
}
