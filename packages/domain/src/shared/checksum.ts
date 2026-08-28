// Canonical-JSON checksum (ENT-001, promoted to shared for COM-001).
//
// ADR-014 "Version rules; history never mutates": a published/locked
// versioned artifact's content must never silently change. The checksum is
// what makes that auditable - a stored document whose checksum no longer
// matches its own content is unambiguous evidence of tampering or a bug,
// not something a database constraint alone can catch. Used by
// packages/domain/src/access (entitlement policies, ENT-001) and
// packages/domain/src/commerce (product versions and offers, COM-001) -
// promoted here instead of staying private to access/ once a second domain
// area needed the exact same "version-not-mutate" discipline.
//
// Deliberately not imported from @superlatif/testing's canonical.ts: db may
// depend on domain (ADR-042 layering), never on testing, so this is a small,
// independent implementation of the same "sort keys, then hash" idea rather
// than a cross-layer dependency for one function.

import { createHash } from "node:crypto";

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

function canonicalize(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map((entry) => canonicalize(entry));
  if (value !== null && typeof value === "object") {
    const sorted: { [key: string]: JsonValue } = {};
    for (const key of Object.keys(value).sort()) {
      const entry = value[key];
      if (entry !== undefined) sorted[key] = canonicalize(entry);
    }
    return sorted;
  }
  return value;
}

/** SHA-256 hex digest of a value's canonical (key-sorted) JSON form. Order-of-keys-independent. */
export function computeChecksum(value: JsonValue): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}
