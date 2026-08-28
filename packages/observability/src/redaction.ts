// Redaction rules for PII and secrets (GOV-004).
//
// Denylist keys are DERIVED, not hand-typed twice: from
// contracts/analytics-event-catalog.json's prohibitedProperties (the Gate 3
// contract's own list) and from @superlatif/contracts' SECRET_ENV_NAMES.
// 24_AUTH_RBAC_SECURITY_AND_PRIVACY.md §17 items not already covered by
// either source are added explicitly below, with a comment saying so.
//
// Loaded via node:fs, not a static JSON import: this keeps the module
// unbundleable into a client component by construction (a bundler cannot
// resolve `node:fs` for a browser target and fails the build), which matters
// because nothing else in this package enforces "server-only" today.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SECRET_ENV_NAMES } from "@superlatif/contracts";

const here = path.dirname(fileURLToPath(import.meta.url));
// packages/observability/src -> repository root is three levels up.
const ANALYTICS_CATALOG_PATH = path.join(here, "..", "..", "..", "contracts", "analytics-event-catalog.json");

interface AnalyticsCatalog {
  readonly prohibitedProperties: readonly string[];
}

function loadProhibitedAnalyticsProperties(): readonly string[] {
  const raw = fs.readFileSync(ANALYTICS_CATALOG_PATH, "utf8");
  const catalog = JSON.parse(raw) as AnalyticsCatalog;
  if (!Array.isArray(catalog.prohibitedProperties) || catalog.prohibitedProperties.length === 0) {
    throw new Error(`${ANALYTICS_CATALOG_PATH} does not declare a non-empty prohibitedProperties array`);
  }
  return catalog.prohibitedProperties;
}

/**
 * dok 24 §17 "Never log" items not already covered by
 * analytics-event-catalog.json's prohibitedProperties or an env secret name.
 */
const EXTRA_DENYLIST_KEYS: readonly string[] = [
  "sessionToken",
  "leaseToken",
  "authorization",
  "cookie",
  "setCookie",
  "signedUrl",
  "privateUrl",
];

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, "");
}

/**
 * Fields the analytics catalog prohibits (for pseudonymous, possibly
 * third-party-bound product analytics - ADR-025) that dok 24 §17 explicitly
 * permits in operational/audit logs instead. Today that is exactly one
 * field: `user_id`/`userId` is an "object ID" per dok 24 §17's own safe-field
 * list, and audit logging genuinely needs to reference which user performed
 * or was subject to an action (dok 24 §14). Nothing else in the analytics
 * denylist has this conflict - PII like email/phone stays denied everywhere.
 */
const OPERATIONAL_LOG_OVERRIDES: ReadonlySet<string> = new Set(["userid"].map(normalizeKey));

const DENYLIST_KEYS: ReadonlySet<string> = new Set(
  [...loadProhibitedAnalyticsProperties(), ...SECRET_ENV_NAMES, ...EXTRA_DENYLIST_KEYS]
    .map(normalizeKey)
    .filter((key) => !OPERATIONAL_LOG_OVERRIDES.has(key)),
);

/**
 * Substrings that redact a key by themselves - the default-deny net for a
 * field nobody explicitly listed yet. Errs toward over-redaction: a false
 * positive here costs a missing log field, a false negative costs a leak.
 */
const DENYLIST_SUBSTRINGS: readonly string[] = ["secret", "password", "token", "apikey", "privatekey"];

export function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key);
  if (DENYLIST_KEYS.has(normalized)) return true;
  return DENYLIST_SUBSTRINGS.some((substring) => normalized.includes(substring));
}

/**
 * Value-shape patterns worth catching regardless of key name: a Bearer
 * token, a JWT, or an AWS-style access key ID pasted into an unexpected
 * field. This is a narrow secondary layer, not a general secret scanner -
 * free-text messages that happen to embed a credential are not caught here;
 * that is Gitleaks' job (GOV-003) on source, not this runtime redactor on
 * log payloads.
 */
const SENSITIVE_VALUE_PATTERNS: readonly RegExp[] = [
  /^Bearer\s+\S+/i,
  /^[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/, // JWT-shaped
  /^AKIA[0-9A-Z]{16}$/, // AWS-style access key ID
];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isSensitiveValue(value: unknown): boolean {
  if (typeof value !== "string") return false;
  // Object IDs are an explicitly safe field per dok 24 §17; without this
  // exclusion a UUID's high character variety could otherwise be mistaken
  // for a token by an overly broad pattern.
  if (UUID_PATTERN.test(value)) return false;
  return SENSITIVE_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

export const REDACTED = "[redacted]";

const MAX_DEPTH = 8;

/** Redacts a value for logging: sensitive fields become REDACTED, everything else passes through. */
export function redact(value: unknown): unknown {
  return redactInternal(value, 0, new WeakSet());
}

function redactInternal(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (depth > MAX_DEPTH) return "[max-depth-exceeded]";
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();

  if (value instanceof Error) {
    if (seen.has(value)) return "[circular]";
    seen.add(value);
    const record: Record<string, unknown> = { name: value.name, message: value.message, stack: value.stack };
    if (value.cause !== undefined) record["cause"] = redactInternal(value.cause, depth + 1, seen);
    return record;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactInternal(entry, depth + 1, seen));
  }

  if (typeof value === "object") {
    if (seen.has(value)) return "[circular]";
    seen.add(value);
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveKey(key)) {
        output[key] = REDACTED;
        continue;
      }
      output[key] = isSensitiveValue(entry) ? REDACTED : redactInternal(entry, depth + 1, seen);
    }
    return output;
  }

  return isSensitiveValue(value) ? REDACTED : value;
}
