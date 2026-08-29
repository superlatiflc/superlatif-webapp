// Commerce webhook signature verification and idempotency key derivation
// (COM-002).
//
// dok 23 §8 "Verification" preferred order: "1. HMAC signature over raw
// canonical bytes with timestamp/key ID... Signature secret stored
// separately per environment and rotatable with overlapping key IDs." This
// task models step 1 only (HMAC-SHA256 over the raw body string) - key
// rotation/timestamp replay windows are explicitly out of scope (no live
// Sejoli bridge, no production secret - founder instruction). The secret
// itself is always an injected parameter, never read from environment
// config here - packages/db/src/commerce/commerce-event-service.ts's
// caller supplies it, matching CLAUDE.md "Inject... provider interfaces."
//
// Pure and dependency-free (node:crypto is a Node builtin, not a vendor
// SDK). No I/O.

import { createHmac, timingSafeEqual } from "node:crypto";
import { computeChecksum, type JsonValue } from "../shared/checksum.ts";

export type SignatureOutcome = "verified" | "failed" | "unverified";

/** HMAC-SHA256 hex digest of the raw body string against a shared secret. */
export function computeHmacSignature(rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

/**
 * `secret === null` means no signing key is configured for this
 * provider/environment - a legitimate outcome that must never be confused
 * with "failed" (dok 23 §8 does not say every environment must have a key from day one,
 * and this task never talks to a real Sejoli bridge that would supply
 * one). `"unverified"` is still persisted, never silently dropped - it is
 * NOT the same as "verified"; a caller (commerce-event-service.ts) treats
 * it as quarantine-worthy, same as "failed".
 */
export function verifyWebhookSignature(
  rawBody: string,
  providedSignature: string | null,
  secret: string | null,
): SignatureOutcome {
  if (secret === null) return "unverified";
  if (providedSignature === null) return "failed";
  const expectedHex = computeHmacSignature(rawBody, secret);
  const expected = Buffer.from(expectedHex, "hex");
  let provided: Buffer;
  try {
    provided = Buffer.from(providedSignature, "hex");
  } catch {
    return "failed";
  }
  if (provided.length !== expected.length) return "failed";
  return timingSafeEqual(provided, expected) ? "verified" : "failed";
}

/**
 * dok 22 §16 ingress rule 4: "Derive provider event key or deterministic
 * fallback checksum." A provider-supplied stable event/delivery ID is
 * preferred; when absent, the canonical-JSON checksum of the payload
 * itself stands in - two deliveries with byte-identical canonical content
 * and no ID collapse to the same fallback key, which is exactly the
 * idempotency behavior a real stable ID would have given for free.
 */
export function deriveEventKey(candidateEventId: string | null, canonicalPayload: JsonValue): string {
  if (candidateEventId !== null && candidateEventId.length > 0) return candidateEventId;
  return `fallback:${computeChecksum(canonicalPayload)}`;
}
