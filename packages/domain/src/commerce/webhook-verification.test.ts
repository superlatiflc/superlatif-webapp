import { describe, expect, it } from "vitest";
import { computeHmacSignature, deriveEventKey, verifyWebhookSignature } from "./webhook-verification.ts";

const SECRET = "synthetic-test-secret-do-not-use-in-production";
const BODY = JSON.stringify({ eventId: "evt_1", type: "purchase.status_changed" });

describe("verifyWebhookSignature", () => {
  it("required test: a correctly signed body is verified", () => {
    const signature = computeHmacSignature(BODY, SECRET);
    expect(verifyWebhookSignature(BODY, signature, SECRET)).toBe("verified");
  });

  it("required negative test: an incorrect signature fails", () => {
    const wrongSignature = computeHmacSignature(BODY, "a-different-secret");
    expect(verifyWebhookSignature(BODY, wrongSignature, SECRET)).toBe("failed");
  });

  it("a tampered body fails against the original signature", () => {
    const signature = computeHmacSignature(BODY, SECRET);
    const tamperedBody = JSON.stringify({ eventId: "evt_1", type: "purchase.status_changed", extra: true });
    expect(verifyWebhookSignature(tamperedBody, signature, SECRET)).toBe("failed");
  });

  it("a missing signature with a configured secret fails, not unverified", () => {
    expect(verifyWebhookSignature(BODY, null, SECRET)).toBe("failed");
  });

  it("a malformed (non-hex) signature fails cleanly, never throws", () => {
    expect(verifyWebhookSignature(BODY, "not-valid-hex!!", SECRET)).toBe("failed");
  });

  it("no configured secret is 'unverified', distinct from 'failed'", () => {
    expect(verifyWebhookSignature(BODY, "anything", null)).toBe("unverified");
    expect(verifyWebhookSignature(BODY, null, null)).toBe("unverified");
  });
});

describe("deriveEventKey", () => {
  it("prefers a provider-supplied stable event ID", () => {
    expect(deriveEventKey("evt_stable_123", { a: 1 })).toBe("evt_stable_123");
  });

  it("falls back to a deterministic checksum when no ID is supplied", () => {
    const key = deriveEventKey(null, { order: { externalId: "o1" } });
    expect(key.startsWith("fallback:")).toBe(true);
  });

  it("required test: duplicate/idempotency - the same fallback-keyed payload always derives the same key", () => {
    const a = deriveEventKey(null, { order: { externalId: "o1" }, amount: 100 });
    const b = deriveEventKey(null, { amount: 100, order: { externalId: "o1" } }); // different key order, same content
    expect(a).toBe(b);
  });

  it("an empty-string candidate ID is treated as absent", () => {
    const key = deriveEventKey("", { x: 1 });
    expect(key.startsWith("fallback:")).toBe(true);
  });
});
