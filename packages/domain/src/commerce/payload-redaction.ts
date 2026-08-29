// Raw commerce payload redaction (COM-002).
//
// dok 23 §7: "Raw provider payload is minimized/redacted. Secret/payment
// credential never sent." That is an upstream-bridge promise, not something
// this ingestion boundary can trust blindly - CLAUDE.md "Parse/validate all
// external input at the boundary" and dok 24 §17 "Never log ... raw
// authorization header; full webhook payload without controlled secure
// store" both apply here too. This is defense-in-depth: strip any
// key whose NAME suggests a credential/secret before the envelope is ever
// persisted, regardless of what the sender claims it already did.
//
// Pure, no I/O.

import type { JsonValue } from "../shared/checksum.ts";

const SENSITIVE_KEY_PATTERN =
  /password|secret|token|card|cvv|account[_-]?number|api[_-]?key|authorization|private[_-]?key/i;

export const REDACTED_PLACEHOLDER = "[REDACTED]";

/** Recursively replaces the VALUE of any object key matching a credential-shaped name with a fixed placeholder. Array/object structure and every non-sensitive value are preserved untouched. */
export function redactRawPayload(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map((entry) => redactRawPayload(entry));
  if (value !== null && typeof value === "object") {
    const result: { [key: string]: JsonValue } = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED_PLACEHOLDER : redactRawPayload(entry);
    }
    return result;
  }
  return value;
}
