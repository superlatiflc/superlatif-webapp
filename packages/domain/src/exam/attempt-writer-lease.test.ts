import { describe, expect, it } from "vitest";
import { computeWriterLeaseExpiry, deriveWriterLeaseState } from "./attempt-writer-lease.ts";

const now = new Date("2026-09-01T00:00:00Z");

describe("deriveWriterLeaseState", () => {
  it("is 'expired' when no active lease row exists at all", () => {
    expect(deriveWriterLeaseState(null, null, now)).toBe("expired");
  });

  it("is 'expired' once the active lease's TTL has passed, even if the requesting token matches (disconnect + resume)", () => {
    const lease = { tokenHash: "hash-a", expiresAt: new Date(now.getTime() - 1) };
    expect(deriveWriterLeaseState(lease, "hash-a", now)).toBe("expired");
  });

  it("is 'held_here' when the requesting token matches the active, unexpired lease", () => {
    const lease = { tokenHash: "hash-a", expiresAt: new Date(now.getTime() + 60_000) };
    expect(deriveWriterLeaseState(lease, "hash-a", now)).toBe("held_here");
  });

  it("is 'held_elsewhere' when a different active lease exists and the requester presents no/mismatched token", () => {
    const lease = { tokenHash: "hash-a", expiresAt: new Date(now.getTime() + 60_000) };
    expect(deriveWriterLeaseState(lease, null, now)).toBe("held_elsewhere");
    expect(deriveWriterLeaseState(lease, "hash-b", now)).toBe("held_elsewhere");
  });

  it("boundary: exactly at expiresAt is already expired (inclusive), matching this codebase's other window boundary conventions", () => {
    const lease = { tokenHash: "hash-a", expiresAt: now };
    expect(deriveWriterLeaseState(lease, "hash-a", now)).toBe("expired");
  });
});

describe("computeWriterLeaseExpiry", () => {
  it("adds the TTL in seconds to now", () => {
    expect(computeWriterLeaseExpiry(now, 120).toISOString()).toBe("2026-09-01T00:02:00.000Z");
  });

  it("rejects a non-positive TTL", () => {
    expect(() => computeWriterLeaseExpiry(now, 0)).toThrow(RangeError);
    expect(() => computeWriterLeaseExpiry(now, -5)).toThrow(RangeError);
  });
});
