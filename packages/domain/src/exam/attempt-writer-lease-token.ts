// Writer-lease bearer token primitives (ATM-001).
//
// Mirrors packages/domain/src/program/secure-delivery.ts's own design
// exactly (random opaque token, only its hash persisted, timing-safe
// comparison) but as its OWN, separately-generated credential class - that
// module's own doc explains why: "a bug in one generator must never be
// able to affect the other." A writer lease token authorizes something
// entirely different (exclusive write access to one attempt) over a much
// shorter lifetime than a delivery reference, so it gets its own module
// rather than reusing generateDeliveryToken/hashDeliveryToken directly.
//
// Pure and dependency-free (node:crypto is a Node builtin, not a vendor
// SDK). No I/O.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** 256 bits of entropy - same reasoning as every other bearer-token generator in this codebase: never a human-chosen value, so no slow KDF is needed. contracts/openapi.yaml's own `leaseToken` schema requires `minLength: 32`; base64url-encoding 32 random bytes always produces at least that. */
const WRITER_LEASE_TOKEN_BYTES = 32;

/** Generates a new opaque writer-lease token. Never accepts or reuses a caller-supplied value. */
export function generateWriterLeaseToken(): string {
  return randomBytes(WRITER_LEASE_TOKEN_BYTES).toString("base64url");
}

/** SHA-256: the input is already high-entropy random data, not a low-entropy human password. */
export function hashWriterLeaseToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Timing-safe comparison - an ordinary === on hash strings can leak match-length via response timing. */
export function writerLeaseTokenMatchesHash(token: string, hash: string): boolean {
  const candidateHex = hashWriterLeaseToken(token);
  const candidate = Buffer.from(candidateHex, "hex");
  const stored = Buffer.from(hash, "hex");
  if (candidate.length !== stored.length) return false;
  return timingSafeEqual(candidate, stored);
}
