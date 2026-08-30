import { describe, expect, it } from "vitest";
import {
  assertWriterLeaseValidForWrite,
  computeWriterLeaseExpiry,
  deriveWriterLeaseState,
  WriterLeaseRequiredError,
  WriterLeaseRevokedError,
} from "./attempt-writer-lease.ts";

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

describe("assertWriterLeaseValidForWrite - fail-closed multi-device lease conflict gate (ATM-002)", () => {
  it("allows the write when the presented token matches the active, unexpired lease", () => {
    const lease = { tokenHash: "hash-a", expiresAt: new Date(now.getTime() + 60_000) };
    expect(() => assertWriterLeaseValidForWrite(lease, "hash-a", now)).not.toThrow();
  });

  it("refuses with WRITER_LEASE_REQUIRED when no token is presented at all", () => {
    const lease = { tokenHash: "hash-a", expiresAt: new Date(now.getTime() + 60_000) };
    expect(() => assertWriterLeaseValidForWrite(lease, null, now)).toThrow(WriterLeaseRequiredError);
  });

  it("two-device lease conflict: refuses device A's write with WRITER_LEASE_REVOKED once device B's takeover has replaced the active lease", () => {
    // Device A's token no longer matches the active lease (device B's).
    const activeLeaseAfterTakeover = { tokenHash: "hash-b", expiresAt: new Date(now.getTime() + 60_000) };
    try {
      assertWriterLeaseValidForWrite(activeLeaseAfterTakeover, "hash-a", now);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(WriterLeaseRevokedError);
      expect((error as WriterLeaseRevokedError).observedState).toBe("held_elsewhere");
    }
  });

  it("refuses with WRITER_LEASE_REVOKED when the presented token's lease has expired (not renewed in time)", () => {
    const expiredLease = { tokenHash: "hash-a", expiresAt: new Date(now.getTime() - 1) };
    try {
      assertWriterLeaseValidForWrite(expiredLease, "hash-a", now);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(WriterLeaseRevokedError);
      expect((error as WriterLeaseRevokedError).observedState).toBe("expired");
    }
  });

  it("refuses with WRITER_LEASE_REVOKED when no lease is active at all but a token was presented", () => {
    expect(() => assertWriterLeaseValidForWrite(null, "hash-a", now)).toThrow(WriterLeaseRevokedError);
  });
});
