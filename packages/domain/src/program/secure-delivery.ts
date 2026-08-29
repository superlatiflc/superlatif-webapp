// Secure, time-bound asset delivery reference primitives (LRN-001).
//
// Mirrors packages/domain/src/identity/session.ts's session-secret design
// exactly - random opaque token, only its hash persisted, timing-safe
// comparison, injected clock - but as its OWN, separately-generated credential
// class. Deliberately NOT reusing session.ts's functions: a delivery
// reference and a session secret authorize different things over different
// lifetimes (dok 24 §4 "Idle and absolute expiry differentiated" already
// treats distinct credential classes as independently rotatable/revocable),
// so a bug in one generator must never be able to affect the other.
//
// Pure and dependency-free (node:crypto is a Node builtin, not a vendor SDK -
// packages/domain must stay free of the latter, not the former). No I/O: the
// persistence adapter lives in packages/db/src/program/delivery-service.ts.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** 256 bits of entropy - same reasoning as session.ts: never a human-chosen value, so no slow KDF is needed. */
const DELIVERY_TOKEN_BYTES = 32;

/** Generates a new opaque delivery token. Never accepts or reuses a caller-supplied value. */
export function generateDeliveryToken(): string {
  return randomBytes(DELIVERY_TOKEN_BYTES).toString("base64url");
}

/** SHA-256: the input is already high-entropy random data, not a low-entropy human password. */
export function hashDeliveryToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Timing-safe comparison - an ordinary === on hash strings can leak match-length via response timing. */
export function deliveryTokenMatchesHash(token: string, hash: string): boolean {
  const candidateHex = hashDeliveryToken(token);
  const candidate = Buffer.from(candidateHex, "hex");
  const stored = Buffer.from(hash, "hex");
  if (candidate.length !== stored.length) return false;
  return timingSafeEqual(candidate, stored);
}

/**
 * A delivery reference's expiry is capped at BOTH a short fixed TTL and the
 * underlying effective-access decision's `effectiveTo` (ENT-002) - whichever
 * comes first. This is what makes "assets use authorized time-bound
 * delivery" actually track the grant: a reference issued one minute before
 * the student's access itself expires cannot outlive that access, even
 * though the TTL alone would allow it to.
 */
export function computeDeliveryExpiry(now: Date, ttlSeconds: number, accessExpiresAt: Date | null): Date {
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
    throw new RangeError(`ttlSeconds must be a positive finite number, received ${String(ttlSeconds)}`);
  }
  const ttlExpiry = new Date(now.getTime() + ttlSeconds * 1000);
  if (accessExpiresAt === null) return ttlExpiry;
  return accessExpiresAt.getTime() < ttlExpiry.getTime() ? accessExpiresAt : ttlExpiry;
}

export type DeliveryReferenceValidity = "valid" | "expired";

/** Server-authoritative TTL check only - NOT a substitute for re-checking effective access at redemption (dok 14 §14: "Access mengikuti grant saat playback, bukan hanya saat link dibuat"). See delivery-service.ts#resolveAssetDelivery for the full two-check sequence. */
export function evaluateDeliveryReferenceValidity(expiresAt: Date, now: Date): DeliveryReferenceValidity {
  return now.getTime() >= expiresAt.getTime() ? "expired" : "valid";
}
