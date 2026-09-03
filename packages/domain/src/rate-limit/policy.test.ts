import { describe, expect, it } from "vitest";
import {
  RATE_LIMIT_RULES,
  buildBucketKey,
  decide,
  fingerprint,
  normalizeHandle,
  windowExpiryFor,
  windowStartFor,
} from "./policy.ts";

const SECRET = "test-secret-at-least-16-chars";

describe("rate limit policy", () => {
  it("keeps every security-sensitive scope at batchSize 1", () => {
    // The batching optimisation is only ever acceptable for autosave. If a
    // future change raises batchSize on sign-in or submit, that scope's
    // enforcement silently becomes partly process-local - which is the exact
    // property P0-3 was raised about.
    for (const scope of [
      "signin_client",
      "signin_handle",
      "attempt_start",
      "lease_takeover",
      "attempt_submit",
    ] as const) {
      expect(RATE_LIMIT_RULES[scope].batchSize, `${scope} must consult the shared store every call`).toBe(1);
    }
    expect(RATE_LIMIT_RULES.answer_save.batchSize).toBeGreaterThan(1);
  });

  it("uses the approved thresholds", () => {
    expect(RATE_LIMIT_RULES.signin_client).toMatchObject({ limit: 5, windowSeconds: 900 });
    expect(RATE_LIMIT_RULES.signin_handle).toMatchObject({ limit: 10, windowSeconds: 3600 });
    expect(RATE_LIMIT_RULES.attempt_start).toMatchObject({ limit: 10, windowSeconds: 300 });
    expect(RATE_LIMIT_RULES.lease_takeover).toMatchObject({ limit: 5, windowSeconds: 300 });
    expect(RATE_LIMIT_RULES.attempt_submit).toMatchObject({ limit: 5, windowSeconds: 60 });
    expect(RATE_LIMIT_RULES.answer_save).toMatchObject({ limit: 600, windowSeconds: 60 });
  });

  it("allows exactly `limit` hits and refuses the next one", () => {
    const rule = RATE_LIMIT_RULES.signin_client;
    const now = new Date("2026-01-01T00:00:00.000Z");
    const start = windowStartFor(rule, now);
    expect(decide(rule, rule.limit, start, now).allowed).toBe(true);
    expect(decide(rule, rule.limit + 1, start, now).allowed).toBe(false);
  });

  it("aligns windows so concurrent callers share one bucket", () => {
    const rule = RATE_LIMIT_RULES.attempt_submit; // 60s
    const a = windowStartFor(rule, new Date("2026-01-01T00:00:10.000Z"));
    const b = windowStartFor(rule, new Date("2026-01-01T00:00:59.999Z"));
    const next = windowStartFor(rule, new Date("2026-01-01T00:01:00.000Z"));
    expect(a.toISOString()).toBe(b.toISOString());
    expect(next.getTime()).toBe(a.getTime() + 60_000);
  });

  it("expires a row strictly after its window ends, so an in-flight request never loses its counter", () => {
    const rule = RATE_LIMIT_RULES.attempt_submit;
    const start = windowStartFor(rule, new Date("2026-01-01T00:00:00.000Z"));
    expect(windowExpiryFor(rule, start).getTime()).toBeGreaterThan(
      start.getTime() + rule.windowSeconds * 1000,
    );
  });

  it("reports a retry hint that shrinks as the window drains", () => {
    const rule = RATE_LIMIT_RULES.attempt_submit;
    const start = windowStartFor(rule, new Date("2026-01-01T00:00:00.000Z"));
    const early = decide(rule, 99, start, new Date("2026-01-01T00:00:10.000Z")).retryAfterSeconds;
    const late = decide(rule, 99, start, new Date("2026-01-01T00:00:50.000Z")).retryAfterSeconds;
    expect(early).toBeGreaterThan(late);
    expect(late).toBeGreaterThanOrEqual(1);
  });

  describe("privacy of derived keys", () => {
    it("never lets a raw IP or handle appear in the bucket key", () => {
      const ip = "203.0.113.7";
      const handle = "Siswa-01";
      const ipKey = buildBucketKey("signin_client", fingerprint(SECRET, "signin_client", ip));
      const handleKey = buildBucketKey(
        "signin_handle",
        fingerprint(SECRET, "signin_handle", normalizeHandle(handle)),
      );
      expect(ipKey).not.toContain(ip);
      expect(handleKey).not.toContain("siswa-01");
      expect(handleKey).not.toContain("Siswa-01");
      // Only the scope label plus hex.
      expect(ipKey).toMatch(/^signin_client:[0-9a-f]{32}$/);
      expect(handleKey).toMatch(/^signin_handle:[0-9a-f]{32}$/);
    });

    it("normalizes handles so casing and padding cannot split a bucket", () => {
      const a = fingerprint(SECRET, "signin_handle", normalizeHandle("  SISWA-01 "));
      const b = fingerprint(SECRET, "signin_handle", normalizeHandle("siswa-01"));
      expect(a).toBe(b);
    });

    it("isolates distinct subjects and distinct scopes", () => {
      expect(fingerprint(SECRET, "signin_client", "1.1.1.1")).not.toBe(
        fingerprint(SECRET, "signin_client", "1.1.1.2"),
      );
      // Same value under different scopes must not collide, or a sign-in
      // attempt would consume an autosave budget.
      expect(fingerprint(SECRET, "signin_client", "x")).not.toBe(fingerprint(SECRET, "signin_handle", "x"));
    });

    it("is keyed by the secret, so rotating it resets counters", () => {
      expect(fingerprint(SECRET, "signin_client", "1.1.1.1")).not.toBe(
        fingerprint("another-secret-16chars!", "signin_client", "1.1.1.1"),
      );
    });
  });
});
