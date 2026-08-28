// Session domain rules (IDN-001).
//
// 24_AUTH_RBAC_SECURITY_AND_PRIVACY.md §4: "Random opaque session token; only
// hash stored server-side." The raw secret is generated here and handed to a
// caller exactly once (at creation); every later check compares a
// timing-safe hash, never the raw value, and the raw value is never
// persisted anywhere in this module or its callers.
//
// Pure and dependency-free (node:crypto is a Node builtin, not a vendor SDK -
// packages/domain must stay free of the latter, not the former). No I/O: the
// persistence adapter lives in packages/db, which is allowed to depend on
// this package (ADR-042 layering), never the reverse.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** 256 bits of entropy: enough that guessing is infeasible without needing a slow KDF - unlike a user password, this secret is never chosen by a human. */
const SESSION_SECRET_BYTES = 32;

/** Generates a new opaque session secret. Never accepts or reuses a caller-supplied value - that would allow session fixation by construction. */
export function generateSessionSecret(): string {
  return randomBytes(SESSION_SECRET_BYTES).toString("base64url");
}

/** SHA-256 is sufficient here: the input is already high-entropy random data, not a low-entropy human password needing a slow KDF like bcrypt/argon2. */
export function hashSessionSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

/** Timing-safe comparison: an ordinary === on hash strings can leak match-length via response timing. */
export function secretMatchesHash(secret: string, hash: string): boolean {
  const candidateHex = hashSessionSecret(secret);
  const candidate = Buffer.from(candidateHex, "hex");
  const stored = Buffer.from(hash, "hex");
  if (candidate.length !== stored.length) return false;
  return timingSafeEqual(candidate, stored);
}

export interface SessionLifecycleFields {
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
}

export type SessionValidity = "valid" | "expired" | "revoked";

/**
 * Server-authoritative validity check. `now` is injected (CLAUDE.md: "Inject
 * clock... interfaces") so deadline/expiry logic is deterministically
 * testable and never trusts a client-supplied clock.
 */
export function evaluateSessionValidity(session: SessionLifecycleFields, now: Date): SessionValidity {
  if (session.revokedAt !== null) return "revoked";
  if (session.expiresAt.getTime() <= now.getTime()) return "expired";
  return "valid";
}

export function computeSessionExpiry(now: Date, ttlSeconds: number): Date {
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
    throw new RangeError(`ttlSeconds must be a positive finite number, received ${String(ttlSeconds)}`);
  }
  return new Date(now.getTime() + ttlSeconds * 1000);
}
