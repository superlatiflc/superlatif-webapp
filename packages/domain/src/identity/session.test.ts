import { describe, expect, it } from "vitest";
import {
  computeSessionExpiry,
  evaluateSessionValidity,
  generateSessionSecret,
  hashSessionSecret,
  secretMatchesHash,
} from "./session.ts";

describe("generateSessionSecret", () => {
  it("produces distinct, high-entropy secrets", () => {
    const secrets = new Set(Array.from({ length: 50 }, () => generateSessionSecret()));
    expect(secrets.size).toBe(50);
  });

  it("never returns an empty or trivially short value", () => {
    expect(generateSessionSecret().length).toBeGreaterThan(30);
  });
});

describe("hashSessionSecret / secretMatchesHash", () => {
  it("is deterministic: the same secret always hashes the same way", () => {
    const secret = generateSessionSecret();
    expect(hashSessionSecret(secret)).toBe(hashSessionSecret(secret));
  });

  it("matches the correct secret against its own hash", () => {
    const secret = generateSessionSecret();
    expect(secretMatchesHash(secret, hashSessionSecret(secret))).toBe(true);
  });

  it("rejects a wrong secret against an unrelated hash", () => {
    const hash = hashSessionSecret(generateSessionSecret());
    expect(secretMatchesHash(generateSessionSecret(), hash)).toBe(false);
  });

  it("never stores or returns the raw secret from the hash function", () => {
    const secret = "raw-secret-value-should-not-appear-in-output";
    expect(hashSessionSecret(secret)).not.toContain(secret);
  });

  it("rejects a hash of different length without throwing", () => {
    expect(secretMatchesHash(generateSessionSecret(), "ab")).toBe(false);
  });
});

describe("evaluateSessionValidity - server-authoritative, clock injected", () => {
  const now = new Date("2026-06-01T12:00:00.000Z");

  it("is valid when not expired and not revoked", () => {
    const session = { expiresAt: new Date("2026-06-01T13:00:00.000Z"), revokedAt: null };
    expect(evaluateSessionValidity(session, now)).toBe("valid");
  });

  it("is expired once the deadline has passed - server time, not client-supplied", () => {
    const session = { expiresAt: new Date("2026-06-01T11:59:59.000Z"), revokedAt: null };
    expect(evaluateSessionValidity(session, now)).toBe("expired");
  });

  it("is expired exactly at the deadline (inclusive boundary)", () => {
    const session = { expiresAt: now, revokedAt: null };
    expect(evaluateSessionValidity(session, now)).toBe("expired");
  });

  it("is revoked even if it has not yet expired - revocation always wins", () => {
    const session = {
      expiresAt: new Date("2026-06-01T13:00:00.000Z"),
      revokedAt: new Date("2026-06-01T11:00:00.000Z"),
    };
    expect(evaluateSessionValidity(session, now)).toBe("revoked");
  });

  it("is revoked, not expired, when both conditions hold", () => {
    const session = {
      expiresAt: new Date("2026-01-01T00:00:00.000Z"),
      revokedAt: new Date("2026-01-02T00:00:00.000Z"),
    };
    expect(evaluateSessionValidity(session, now)).toBe("revoked");
  });
});

describe("computeSessionExpiry", () => {
  it("adds the TTL in seconds to the given instant", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    expect(computeSessionExpiry(now, 3600).toISOString()).toBe("2026-01-01T01:00:00.000Z");
  });

  it("rejects a zero or negative TTL", () => {
    const now = new Date();
    expect(() => computeSessionExpiry(now, 0)).toThrow(RangeError);
    expect(() => computeSessionExpiry(now, -1)).toThrow(RangeError);
  });

  it("rejects a non-finite TTL", () => {
    expect(() => computeSessionExpiry(new Date(), Number.NaN)).toThrow(RangeError);
    expect(() => computeSessionExpiry(new Date(), Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});
