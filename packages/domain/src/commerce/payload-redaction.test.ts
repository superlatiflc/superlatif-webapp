import { describe, expect, it } from "vitest";
import { REDACTED_PLACEHOLDER, redactRawPayload } from "./payload-redaction.ts";

describe("redactRawPayload", () => {
  it("redacts credential-shaped keys at the top level", () => {
    const result = redactRawPayload({ password: "hunter2", orderId: "o1" });
    expect(result).toEqual({ password: REDACTED_PLACEHOLDER, orderId: "o1" });
  });

  it("redacts credential-shaped keys nested inside objects and arrays", () => {
    const result = redactRawPayload({
      order: { externalId: "o1", customer: { apiKey: "sk_live_secret", name: "Budi" } },
      items: [{ cardNumber: "4111111111111111", sku: "SKU-1" }],
    });
    expect(result).toEqual({
      order: { externalId: "o1", customer: { apiKey: REDACTED_PLACEHOLDER, name: "Budi" } },
      items: [{ cardNumber: REDACTED_PLACEHOLDER, sku: "SKU-1" }],
    });
  });

  it("leaves non-sensitive values, including nested structure, completely untouched", () => {
    const payload = { order: { externalId: "o1", status: "completed", amount: 199000 } };
    expect(redactRawPayload(payload)).toEqual(payload);
  });

  it("matches common credential-key spellings (token, secret, authorization, account_number, cvv)", () => {
    const result = redactRawPayload({
      token: "t",
      client_secret: "s",
      Authorization: "Bearer x",
      account_number: "123",
      cvv: "000",
    });
    expect(result).toEqual({
      token: REDACTED_PLACEHOLDER,
      client_secret: REDACTED_PLACEHOLDER,
      Authorization: REDACTED_PLACEHOLDER,
      account_number: REDACTED_PLACEHOLDER,
      cvv: REDACTED_PLACEHOLDER,
    });
  });
});
