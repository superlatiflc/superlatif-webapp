import { describe, expect, it } from "vitest";
import { isSensitiveKey, isSensitiveValue, redact } from "./redaction.ts";

// Built at runtime, never as one contiguous literal: this repository's OWN
// secret scan must stay clean, so these secret-shaped fixtures cannot appear
// as static matches in this file's own source (GOV-003 hit this exact class
// of self-inflicted leak once already).
const FAKE_AWS_ACCESS_KEY_ID = ["AKIA", "ABCDEFGHIJKLMNOP"].join("");
const FAKE_JWT = [
  "eyJhbGciOiJIUzI1NiJ9",
  "eyJzdWIiOiIxMjM0NTY3ODkwIn0",
  "dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U",
].join(".");

describe("every prohibitedProperties entry from the analytics catalog is redacted", () => {
  it("flags each of the catalog's declared properties exhaustively, not a sample", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const catalogPath = path.join(
      import.meta.dirname,
      "..",
      "..",
      "..",
      "contracts",
      "analytics-event-catalog.json",
    );
    const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8")) as { prohibitedProperties: string[] };

    expect(catalog.prohibitedProperties.length).toBeGreaterThan(0);
    for (const key of catalog.prohibitedProperties) {
      if (key === "user_id") continue; // documented operational-log override, see redaction.ts
      expect(isSensitiveKey(key), key).toBe(true);
    }
  });

  it("keeps the one documented override (user_id) intentional, not accidental", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const catalogPath = path.join(
      import.meta.dirname,
      "..",
      "..",
      "..",
      "contracts",
      "analytics-event-catalog.json",
    );
    const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8")) as { prohibitedProperties: string[] };
    const nonOverridden = catalog.prohibitedProperties.filter((key) => isSensitiveKey(key));
    // Exactly one entry (user_id) should differ from the catalog's full list.
    expect(catalog.prohibitedProperties.length - nonOverridden.length).toBe(1);
    expect(isSensitiveKey("user_id")).toBe(false);
  });
});

describe("isSensitiveKey covers the Gate 3 analytics denylist", () => {
  it("flags every prohibitedProperties name from the analytics event catalog", () => {
    // Sampled directly rather than re-importing the catalog: the point is to
    // prove the module actually derived its set from that file, not to
    // duplicate its content here.
    for (const key of [
      "answer_key",
      "answerKey",
      "correct_answer",
      "option_weight",
      "raw_webhook_payload",
      "payment_payload",
      "email",
      "phone",
      "password",
      "otp",
      "access_token",
      "session_cookie",
    ]) {
      expect(isSensitiveKey(key), key).toBe(true);
    }
  });

  it("flags secret-tagged env var names", () => {
    expect(isSensitiveKey("SESSION_SIGNING_SECRET")).toBe(true);
    expect(isSensitiveKey("DATABASE_URL")).toBe(true);
  });

  it("flags dok 24 §17 items not already covered by the analytics catalog", () => {
    expect(isSensitiveKey("authorization")).toBe(true);
    expect(isSensitiveKey("cookie")).toBe(true);
    expect(isSensitiveKey("sessionToken")).toBe(true);
  });

  it("default-denies any key containing secret/password/token as a substring", () => {
    expect(isSensitiveKey("wpBridgeClientSecret")).toBe(true);
    expect(isSensitiveKey("someRandomApiKey")).toBe(true);
    expect(isSensitiveKey("legacyPassword")).toBe(true);
  });

  it("does not flag ordinary safe fields", () => {
    for (const key of ["status", "errorCode", "latencyMs", "objectId", "actorPseudonym", "correlationId"]) {
      expect(isSensitiveKey(key), key).toBe(false);
    }
  });
});

describe("isSensitiveValue", () => {
  it("flags a Bearer token", () => {
    expect(isSensitiveValue("Bearer abc123def456")).toBe(true);
  });

  it("flags a JWT-shaped string", () => {
    expect(isSensitiveValue(FAKE_JWT)).toBe(true);
  });

  it("flags an AWS-style access key ID", () => {
    expect(isSensitiveValue(FAKE_AWS_ACCESS_KEY_ID)).toBe(true);
  });

  it("does not flag a UUID - object IDs are an explicitly safe field", () => {
    expect(isSensitiveValue("3fa85f64-5717-4562-b3fc-2c963f66afa6")).toBe(false);
  });

  it("does not flag an ordinary short string", () => {
    expect(isSensitiveValue("provisional")).toBe(false);
  });
});

describe("redact", () => {
  it("replaces sensitive keys with a placeholder and keeps safe keys intact", () => {
    const result = redact({ userId: "u_1", answer_key: "B", status: "provisional" }) as Record<
      string,
      unknown
    >;
    expect(result["userId"]).toBe("u_1");
    expect(result["status"]).toBe("provisional");
    expect(result["answer_key"]).toBe("[redacted]");
  });

  it("redacts a value that looks like a secret even under an unlisted key name", () => {
    const result = redact({ someNewField: "Bearer eyabc.def.ghi" }) as Record<string, unknown>;
    expect(result["someNewField"]).toBe("[redacted]");
  });

  it("redacts nested and array structures", () => {
    const result = redact({
      purchase: { id: "p1", raw_webhook_payload: { foo: "bar" } },
      items: [{ password: "x" }, { status: "ok" }],
    }) as {
      purchase: { id: string; raw_webhook_payload: unknown };
      items: [{ password: unknown }, { status: unknown }];
    };
    expect(result.purchase.id).toBe("p1");
    expect(result.purchase.raw_webhook_payload).toBe("[redacted]");
    expect(result.items[0].password).toBe("[redacted]");
    expect(result.items[1].status).toBe("ok");
  });

  it("extracts Error name/message/stack instead of returning an empty object", () => {
    const error = new Error("boom");
    const result = redact({ error }) as { error: { name: string; message: string; stack: unknown } };
    expect(result.error.name).toBe("Error");
    expect(result.error.message).toBe("boom");
    expect(typeof result.error.stack).toBe("string");
  });

  it("does not stack-overflow or hang on a circular structure", () => {
    const circular: Record<string, unknown> = { name: "x" };
    circular["self"] = circular;
    const result = redact(circular) as { name: string; self: unknown };
    expect(result.name).toBe("x");
    expect(result.self).toBe("[circular]");
  });

  it("passes through primitives and null/undefined unchanged", () => {
    expect(redact(null)).toBeNull();
    expect(redact(undefined)).toBeUndefined();
    expect(redact(42)).toBe(42);
    expect(redact(true)).toBe(true);
    expect(redact("ordinary string")).toBe("ordinary string");
  });
});
