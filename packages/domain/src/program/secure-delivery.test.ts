import { describe, expect, it } from "vitest";
import {
  computeDeliveryExpiry,
  deliveryTokenMatchesHash,
  evaluateDeliveryReferenceValidity,
  generateDeliveryToken,
  hashDeliveryToken,
} from "./secure-delivery.ts";

const NOW = new Date("2026-08-29T00:00:00.000Z");

describe("generateDeliveryToken / hashDeliveryToken / deliveryTokenMatchesHash", () => {
  it("generates a high-entropy, non-repeating token", () => {
    const a = generateDeliveryToken();
    const b = generateDeliveryToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(30);
  });

  it("a token matches its own hash", () => {
    const token = generateDeliveryToken();
    expect(deliveryTokenMatchesHash(token, hashDeliveryToken(token))).toBe(true);
  });

  it("required negative test: a tampered/wrong token does not match another token's hash", () => {
    const token = generateDeliveryToken();
    const other = generateDeliveryToken();
    expect(deliveryTokenMatchesHash(other, hashDeliveryToken(token))).toBe(false);
  });

  it("the hash never contains the raw token as a substring (no raw asset URL/token leak via the stored value)", () => {
    const token = generateDeliveryToken();
    const hash = hashDeliveryToken(token);
    expect(hash).not.toContain(token);
  });
});

describe("computeDeliveryExpiry", () => {
  it("uses the TTL when the access decision is open-ended", () => {
    const expiry = computeDeliveryExpiry(NOW, 300, null);
    expect(expiry.getTime()).toBe(NOW.getTime() + 300_000);
  });

  it("caps at the access decision's effectiveTo when it is sooner than the TTL", () => {
    const accessExpiresAt = new Date(NOW.getTime() + 60_000); // 60s away, sooner than a 300s TTL
    const expiry = computeDeliveryExpiry(NOW, 300, accessExpiresAt);
    expect(expiry.getTime()).toBe(accessExpiresAt.getTime());
  });

  it("uses the TTL when it is sooner than the access decision's effectiveTo", () => {
    const accessExpiresAt = new Date(NOW.getTime() + 3_600_000); // 1h away, later than a 300s TTL
    const expiry = computeDeliveryExpiry(NOW, 300, accessExpiresAt);
    expect(expiry.getTime()).toBe(NOW.getTime() + 300_000);
  });

  it("rejects a non-positive TTL", () => {
    expect(() => computeDeliveryExpiry(NOW, 0, null)).toThrow(RangeError);
    expect(() => computeDeliveryExpiry(NOW, -10, null)).toThrow(RangeError);
  });
});

describe("evaluateDeliveryReferenceValidity", () => {
  it("required test: is valid before expiry", () => {
    const expiresAt = new Date(NOW.getTime() + 1000);
    expect(evaluateDeliveryReferenceValidity(expiresAt, NOW)).toBe("valid");
  });

  it("required negative test: expired signed reference is expired at or after its expiry instant", () => {
    const expiresAt = new Date(NOW.getTime() - 1);
    expect(evaluateDeliveryReferenceValidity(expiresAt, NOW)).toBe("expired");
    expect(evaluateDeliveryReferenceValidity(NOW, NOW)).toBe("expired");
  });
});
