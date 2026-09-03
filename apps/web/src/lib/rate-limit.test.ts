// Config-boundary tests for the rate limiter (P0-3).
//
// The audit's finding was not "the limiter is wrong" - there was no limiter.
// It was that RATE_LIMIT_ENABLED was declared, defaulted to true, and then
// read by nothing, so an operator reading configuration would believe they
// were protected. These tests exist to make that specific failure impossible
// to reintroduce: they assert the flag is actually consumed, and that the
// unsafe combinations refuse to start rather than serving unprotected.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  headers: async () => new Map<string, string>() as unknown as Headers,
}));

const ORIGINAL = { ...process.env };

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...ORIGINAL };
});

async function loadModule() {
  return import("./rate-limit.ts");
}

describe("assertRateLimitConfigured", () => {
  it("accepts production when enabled with a sufficient secret", async () => {
    process.env["APP_ENV"] = "production";
    process.env["RATE_LIMIT_ENABLED"] = "true";
    process.env["RATE_LIMIT_HASH_SECRET"] = "a-sufficiently-long-secret";
    const { assertRateLimitConfigured } = await loadModule();
    expect(() => assertRateLimitConfigured()).not.toThrow();
  });

  it("REFUSES to start when enabled in production without a hash secret", async () => {
    // The core fail-safe. The alternatives - skipping protection silently, or
    // hashing with a constant - both leave the operator believing they are
    // protected. Neither is acceptable, so the process must die.
    process.env["APP_ENV"] = "production";
    process.env["RATE_LIMIT_ENABLED"] = "true";
    delete process.env["RATE_LIMIT_HASH_SECRET"];
    const { assertRateLimitConfigured, RateLimitMisconfiguredError } = await loadModule();
    expect(() => assertRateLimitConfigured()).toThrow(RateLimitMisconfiguredError);
  });

  it("REFUSES a secret that is present but too short", async () => {
    process.env["APP_ENV"] = "staging";
    process.env["RATE_LIMIT_ENABLED"] = "true";
    process.env["RATE_LIMIT_HASH_SECRET"] = "tooshort";
    const { assertRateLimitConfigured, RateLimitMisconfiguredError } = await loadModule();
    expect(() => assertRateLimitConfigured()).toThrow(RateLimitMisconfiguredError);
  });

  it("REFUSES to start when the limiter is switched off in staging or production", async () => {
    for (const appEnv of ["staging", "production"]) {
      vi.resetModules();
      process.env["APP_ENV"] = appEnv;
      process.env["RATE_LIMIT_ENABLED"] = "false";
      process.env["RATE_LIMIT_HASH_SECRET"] = "a-sufficiently-long-secret";
      const { assertRateLimitConfigured, RateLimitMisconfiguredError } = await loadModule();
      expect(() => assertRateLimitConfigured(), `${appEnv} must not permit RATE_LIMIT_ENABLED=false`).toThrow(
        RateLimitMisconfiguredError,
      );
    }
  });

  it("permits an explicit opt-out only in a controlled local/test environment", async () => {
    process.env["APP_ENV"] = "development";
    process.env["RATE_LIMIT_ENABLED"] = "false";
    delete process.env["RATE_LIMIT_HASH_SECRET"];
    const { assertRateLimitConfigured } = await loadModule();
    expect(() => assertRateLimitConfigured()).not.toThrow();
  });

  it("treats an ABSENT flag as ON, matching ENV_SPEC's own default", async () => {
    // An unset variable is the likeliest production misconfiguration. It must
    // not be the one that silently removes protection.
    process.env["APP_ENV"] = "production";
    delete process.env["RATE_LIMIT_ENABLED"];
    delete process.env["RATE_LIMIT_HASH_SECRET"];
    const { assertRateLimitConfigured, RateLimitMisconfiguredError } = await loadModule();
    expect(() => assertRateLimitConfigured()).toThrow(RateLimitMisconfiguredError);
  });

  it("treats an empty-string flag as ON, not as false", async () => {
    process.env["APP_ENV"] = "production";
    process.env["RATE_LIMIT_ENABLED"] = "";
    delete process.env["RATE_LIMIT_HASH_SECRET"];
    const { assertRateLimitConfigured, RateLimitMisconfiguredError } = await loadModule();
    expect(() => assertRateLimitConfigured()).toThrow(RateLimitMisconfiguredError);
  });
});

describe("RATE_LIMIT_ENABLED is genuinely consumed at runtime", () => {
  it("short-circuits every enforcement helper when explicitly disabled locally", async () => {
    // Proves the flag reaches real code: with no database configured at all,
    // these would throw if the flag were being ignored.
    process.env["APP_ENV"] = "test";
    process.env["RATE_LIMIT_ENABLED"] = "false";
    const mod = await loadModule();
    await expect(mod.enforceSignInRateLimit("siswa-01")).resolves.toBeUndefined();
    await expect(mod.enforceAttemptStartRateLimit("user-1")).resolves.toBeUndefined();
    await expect(mod.enforceLeaseTakeoverRateLimit("user-1")).resolves.toBeUndefined();
    await expect(mod.enforceSubmitRateLimit("attempt-1")).resolves.toBeUndefined();
    await expect(mod.enforceAnswerSaveRateLimit("attempt-1")).resolves.toBeUndefined();
  });

  it("does NOT short-circuit when enabled - the flag changes observable behaviour", async () => {
    // A flag-consumption test has to distinguish "read the flag" from
    // "resolved without doing anything", and both paths resolve because the
    // limiter fails open. So assert on a difference the flag actually causes:
    // with the limiter ON in staging and no hash secret, sign-in refuses (it
    // reached requireHashSecret to derive its fingerprints). With it OFF, the
    // identical call is a no-op. Only a helper that genuinely reads
    // RATE_LIMIT_ENABLED can produce both outcomes.
    //
    // Sign-in is the right probe here precisely because it is the only scope
    // that HASHES a caller-supplied value; the attempt scopes key on opaque
    // server-side UUIDs and legitimately need no secret.
    process.env["APP_ENV"] = "staging";
    process.env["RATE_LIMIT_ENABLED"] = "true";
    delete process.env["RATE_LIMIT_HASH_SECRET"];
    const enabled = await loadModule();
    await expect(enabled.enforceSignInRateLimit("siswa-01")).rejects.toThrow(
      enabled.RateLimitMisconfiguredError,
    );

    vi.resetModules();
    process.env["RATE_LIMIT_ENABLED"] = "false";
    process.env["APP_ENV"] = "test";
    const disabled = await loadModule();
    await expect(disabled.enforceSignInRateLimit("siswa-01")).resolves.toBeUndefined();
  });
});

describe("RateLimitedError", () => {
  it("carries no counter value, bucket key, or network identifier", async () => {
    process.env["APP_ENV"] = "test";
    const { RateLimitedError } = await loadModule();
    const error = new RateLimitedError({
      allowed: false,
      scope: "signin_client",
      retryAfterSeconds: 42,
    });
    const serialized = JSON.stringify({ ...error, message: error.message });
    expect(serialized).not.toMatch(/[0-9a-f]{32}/); // no fingerprint
    expect(error.message).toBe("rate_limited");
    expect(error.retryAfterSeconds).toBe(42);
  });
});
