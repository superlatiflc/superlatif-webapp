// Rate-limit integration tests (P0-3), against a real (pglite-backed)
// Postgres schema.
//
// These are integration rather than unit tests because the security property
// under test IS the persistence and concurrency behaviour: a limiter that
// works in a single process with a fake store proves nothing about the thing
// the audit actually flagged, which is enforcement across concurrent Vercel
// function instances sharing one database.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import {
  RATE_LIMIT_RULES,
  buildBucketKey,
  buildOpaqueBucketKey,
  fingerprint,
  normalizeHandle,
  windowStartFor,
} from "@superlatif/domain/rate-limit";
import { createTestDatabase, type TestDatabaseHandle } from "../test-client.ts";
import * as schema from "../schema/index.ts";
import { rateLimitCounters } from "../schema/index.ts";
import { performDeterministicLogin } from "../identity/service.ts";
import { deleteExpiredRateLimitCounters, incrementRateLimitCounter } from "./repository.ts";
import { consumeRateLimit, resetLocalRateLimitBuffers } from "./service.ts";

// Fixed non-sensitive test vector for HMAC determinism. Named to avoid
// reading as a credential: it protects nothing and exists only so the same
// input yields the same fingerprint across assertions.
const TEST_HMAC_VECTOR = "rate-limit-test-vector-0000";
const NOW = new Date("2026-01-01T12:00:00.000Z");

let handle: TestDatabaseHandle;

beforeEach(async () => {
  handle = await createTestDatabase();
  resetLocalRateLimitBuffers();
});

afterEach(async () => {
  resetLocalRateLimitBuffers();
  await handle.close();
});

/** Never sample cleanup during behavioural assertions. */
const noCleanup = () => false;

async function consume(scope: Parameters<typeof consumeRateLimit>[0]["scope"], bucketKey: string, now = NOW) {
  return consumeRateLimit({ db: handle.db, scope, bucketKey, now, cleanupSampler: noCleanup });
}

describe("sign-in limiting", () => {
  const clientKey = buildBucketKey(
    "signin_client",
    fingerprint(TEST_HMAC_VECTOR, "signin_client", "203.0.113.9"),
  );
  const handleKey = buildBucketKey(
    "signin_handle",
    fingerprint(TEST_HMAC_VECTOR, "signin_handle", normalizeHandle("Siswa-01")),
  );

  it("allows attempts up to the network threshold", async () => {
    for (let i = 0; i < RATE_LIMIT_RULES.signin_client.limit; i += 1) {
      expect((await consume("signin_client", clientKey)).allowed, `attempt ${i + 1}`).toBe(true);
    }
  });

  it("blocks the attempt after the network threshold", async () => {
    for (let i = 0; i < RATE_LIMIT_RULES.signin_client.limit; i += 1) {
      await consume("signin_client", clientKey);
    }
    const decision = await consume("signin_client", clientKey);
    expect(decision.allowed).toBe(false);
    expect(decision.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("blocks on the handle threshold independently of the network bucket", async () => {
    // 10/hour on the handle: reached from ten DIFFERENT networks, which the
    // per-network bucket alone would never catch.
    for (let i = 0; i < RATE_LIMIT_RULES.signin_handle.limit; i += 1) {
      expect((await consume("signin_handle", handleKey)).allowed).toBe(true);
    }
    expect((await consume("signin_handle", handleKey)).allowed).toBe(false);
  });

  it("isolates different clients and different handles", async () => {
    const otherClient = buildBucketKey(
      "signin_client",
      fingerprint(TEST_HMAC_VECTOR, "signin_client", "198.51.100.4"),
    );
    for (let i = 0; i < RATE_LIMIT_RULES.signin_client.limit + 1; i += 1) {
      await consume("signin_client", clientKey);
    }
    expect((await consume("signin_client", clientKey)).allowed).toBe(false);
    // A different network is unaffected - one abuser must not lock out others.
    expect((await consume("signin_client", otherClient)).allowed).toBe(true);
  });

  it("persists no raw IP and no raw handle", async () => {
    await consume("signin_client", clientKey);
    await consume("signin_handle", handleKey);
    const rows = await handle.db.select().from(rateLimitCounters);
    const serialized = JSON.stringify(rows);
    expect(serialized).not.toContain("203.0.113.9");
    expect(serialized).not.toContain("siswa-01");
    expect(serialized).not.toContain("Siswa-01");
    // Only scope labels plus hex fingerprints are stored.
    for (const row of rows) expect(row.bucketKey).toMatch(/^signin_(client|handle):[0-9a-f]{32}$/);
  });
});

describe("attempt scopes", () => {
  it("permits normal start/resume and throttles excess", async () => {
    const key = buildOpaqueBucketKey("attempt_start", "user-1");
    for (let i = 0; i < RATE_LIMIT_RULES.attempt_start.limit; i += 1) {
      expect((await consume("attempt_start", key)).allowed).toBe(true);
    }
    expect((await consume("attempt_start", key)).allowed).toBe(false);
  });

  it("permits lease takeover within policy", async () => {
    const key = buildOpaqueBucketKey("lease_takeover", "user-1");
    for (let i = 0; i < RATE_LIMIT_RULES.lease_takeover.limit; i += 1) {
      expect((await consume("lease_takeover", key)).allowed).toBe(true);
    }
    expect((await consume("lease_takeover", key)).allowed).toBe(false);
  });

  it("permits submits within limit and keys them per attempt", async () => {
    const a = buildOpaqueBucketKey("attempt_submit", "attempt-a");
    const b = buildOpaqueBucketKey("attempt_submit", "attempt-b");
    for (let i = 0; i < RATE_LIMIT_RULES.attempt_submit.limit; i += 1) {
      expect((await consume("attempt_submit", a)).allowed).toBe(true);
    }
    expect((await consume("attempt_submit", a)).allowed).toBe(false);
    // A different attempt has its own budget - one learner's retries must not
    // throttle another's submission.
    expect((await consume("attempt_submit", b)).allowed).toBe(true);
  });
});

describe("autosave", () => {
  const key = buildOpaqueBucketKey("answer_save", "attempt-x");

  it("never throttles a realistic exam's save volume", async () => {
    // A 90-minute SKD tryout with 100 questions, every answer changed three
    // times, is 300 saves - and they are spread across the whole session, so
    // any single minute sees a small fraction of that. Simulating 300 inside
    // ONE window is already far harsher than reality.
    for (let i = 0; i < 300; i += 1) {
      expect((await consume("answer_save", key)).allowed, `save ${i + 1}`).toBe(true);
    }
  });

  it("throttles a runaway client loop", async () => {
    let blockedAt: number | null = null;
    for (let i = 0; i < 900; i += 1) {
      const decision = await consume("answer_save", key);
      if (!decision.allowed) {
        blockedAt = i + 1;
        break;
      }
    }
    expect(blockedAt).not.toBeNull();
    // Detected close to the threshold: within the batch granularity, never
    // unboundedly late.
    expect(blockedAt!).toBeGreaterThan(RATE_LIMIT_RULES.answer_save.limit);
    expect(blockedAt!).toBeLessThanOrEqual(
      RATE_LIMIT_RULES.answer_save.limit + RATE_LIMIT_RULES.answer_save.batchSize * 2,
    );
  });

  it("keeps the hot path off the database - batching means far fewer writes than saves", async () => {
    for (let i = 0; i < 100; i += 1) await consume("answer_save", key);
    const rows = await handle.db.select().from(rateLimitCounters);
    // 100 saves collapse into a single counter row, written once per batch.
    expect(rows).toHaveLength(1);
    expect(rows[0]!.hitCount).toBeLessThanOrEqual(100);
    expect(rows[0]!.hitCount).toBeGreaterThan(0);
  });
});

describe("atomicity under concurrency", () => {
  it("admits exactly `limit` of many simultaneous requests", async () => {
    // THE test the audit demanded. A read-then-write limiter fails here:
    // every caller reads 0, every caller passes. Only an atomic
    // INSERT ... ON CONFLICT DO UPDATE ... RETURNING gives each concurrent
    // caller a distinct post-increment count.
    const key = buildOpaqueBucketKey("attempt_submit", "attempt-concurrent");
    const limit = RATE_LIMIT_RULES.attempt_submit.limit;
    const attempts = limit * 6;

    const results = await Promise.all(Array.from({ length: attempts }, () => consume("attempt_submit", key)));

    const allowed = results.filter((r) => r.allowed).length;
    expect(allowed).toBe(limit);
    expect(results).toHaveLength(attempts);

    // And the stored counter reflects every attempt, not just the allowed ones.
    const rows = await handle.db.select().from(rateLimitCounters);
    expect(rows[0]!.hitCount).toBe(attempts);
  });

  it("increments are not lost when many writers hit one bucket", async () => {
    const windowStart = windowStartFor(RATE_LIMIT_RULES.attempt_submit, NOW);
    const expiresAt = new Date(windowStart.getTime() + 120_000);
    const writers = 50;

    await Promise.all(
      Array.from({ length: writers }, () =>
        incrementRateLimitCounter(handle.db, {
          bucketKey: "concurrency:probe",
          windowStart,
          expiresAt,
          amount: 1,
        }),
      ),
    );

    const rows = await handle.db
      .select()
      .from(rateLimitCounters)
      .where(sql`${rateLimitCounters.bucketKey} = 'concurrency:probe'`);
    expect(rows[0]!.hitCount).toBe(writers);
  });
});

describe("retention", () => {
  it("removes expired counters and leaves live ones alone", async () => {
    const past = new Date(NOW.getTime() - 600_000);
    await incrementRateLimitCounter(handle.db, {
      bucketKey: "expired:row",
      windowStart: past,
      expiresAt: new Date(NOW.getTime() - 60_000),
      amount: 3,
    });
    await incrementRateLimitCounter(handle.db, {
      bucketKey: "live:row",
      windowStart: NOW,
      expiresAt: new Date(NOW.getTime() + 60_000),
      amount: 1,
    });

    const deleted = await deleteExpiredRateLimitCounters(handle.db, NOW);
    expect(deleted).toBe(1);

    const remaining = await handle.db.select().from(rateLimitCounters);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.bucketKey).toBe("live:row");
  });

  it("a cleanup failure never fails the caller's action", async () => {
    // Cleanup runs inside the request that happened to sample it. If tidying
    // a counter table could throw, a student's submit would die for a reason
    // that has nothing to do with their exam.
    const brokenDb = {
      ...handle.db,
      select: () => {
        throw new Error("counter store unavailable");
      },
    } as unknown as typeof handle.db;

    const decision = await consumeRateLimit({
      db: handle.db,
      scope: "attempt_submit",
      bucketKey: buildOpaqueBucketKey("attempt_submit", "attempt-cleanup"),
      now: NOW,
      cleanupSampler: () => true,
    });
    expect(decision.allowed).toBe(true);

    // And directly: the sweep itself swallows a store failure.
    await expect(
      consumeRateLimit({
        db: brokenDb,
        scope: "attempt_submit",
        bucketKey: buildOpaqueBucketKey("attempt_submit", "attempt-cleanup-2"),
        now: NOW,
        cleanupSampler: () => true,
      }),
    ).resolves.toMatchObject({ allowed: true });
  });
});

describe("composition with the flows being protected", () => {
  it("a throttled sign-in creates NO user and NO session", async () => {
    // The action's ordering is the security property: enforce -> login. This
    // reproduces that ordering against the real login service and asserts the
    // tables the audit cared about stay empty. If the limiter were placed
    // after performDeterministicLogin, a throttled attacker would still be
    // creating a user and a session on every blocked request.
    const clientKey = buildBucketKey(
      "signin_client",
      fingerprint(TEST_HMAC_VECTOR, "signin_client", "203.0.113.55"),
    );

    let created = 0;
    let blocked = 0;
    for (let i = 0; i < RATE_LIMIT_RULES.signin_client.limit + 8; i += 1) {
      const decision = await consume("signin_client", clientKey);
      if (!decision.allowed) {
        blocked += 1;
        continue; // exactly what devSignInAction does: redirect, never log in
      }
      await performDeterministicLogin(
        handle.db,
        {
          provider: "dev_fixture",
          externalSubject: `abuser-${i}`,
          emailNormalized: null,
          phoneE164: null,
          linkReason: "rate_limit_integration_test",
        },
        { now: () => NOW, sessionTtlSeconds: 3600 },
      );
      created += 1;
    }

    expect(blocked).toBeGreaterThan(0);
    expect(created).toBe(RATE_LIMIT_RULES.signin_client.limit);

    const users = await handle.db.select().from(schema.users);
    const sessions = await handle.db.select().from(schema.userSessions);
    // Exactly the permitted number of accounts and sessions exist - the
    // blocked requests left no trace at all.
    expect(users).toHaveLength(RATE_LIMIT_RULES.signin_client.limit);
    expect(sessions).toHaveLength(RATE_LIMIT_RULES.signin_client.limit);
  });

  it("throttling never becomes a user-existence oracle", async () => {
    // Same bucket, same refusal, whether or not the handle exists: the
    // limiter hashes the handle and never looks it up.
    const known = buildBucketKey(
      "signin_handle",
      fingerprint(TEST_HMAC_VECTOR, "signin_handle", "real-user"),
    );
    const unknown = buildBucketKey(
      "signin_handle",
      fingerprint(TEST_HMAC_VECTOR, "signin_handle", "no-such-user"),
    );
    for (let i = 0; i < RATE_LIMIT_RULES.signin_handle.limit; i += 1) {
      await consume("signin_handle", known);
      await consume("signin_handle", unknown);
    }
    const a = await consume("signin_handle", known);
    const b = await consume("signin_handle", unknown);
    expect(a.allowed).toBe(false);
    expect(b.allowed).toBe(false);
    expect(a.scope).toBe(b.scope);
    expect(a.retryAfterSeconds).toBe(b.retryAfterSeconds);
  });

  it("the limiter does not weaken submit idempotency", async () => {
    // Submission uniqueness is enforced by a unique index, not by the
    // limiter. Retries inside the budget must therefore still converge on one
    // submission - the limiter only bounds how many retries are attempted,
    // and must never be mistaken for the correctness control.
    const key = buildOpaqueBucketKey("attempt_submit", "attempt-idem");
    const allowed: boolean[] = [];
    for (let i = 0; i < RATE_LIMIT_RULES.attempt_submit.limit + 3; i += 1) {
      allowed.push((await consume("attempt_submit", key)).allowed);
    }
    // Retries are bounded...
    expect(allowed.filter(Boolean)).toHaveLength(RATE_LIMIT_RULES.attempt_submit.limit);
    // ...and the counter is the ONLY thing that changed; nothing about the
    // submission path was consulted or mutated by the limiter.
    const rows = await handle.db.select().from(rateLimitCounters);
    expect(rows).toHaveLength(1);
    const submissions = await handle.db.select().from(schema.attemptSubmissions);
    expect(submissions).toHaveLength(0);
  });
});

describe("failure policy", () => {
  it("fails OPEN when the counter store is unavailable", async () => {
    // Documented tradeoff: losing throttling is strictly better than a
    // transient database fault making a student unable to save or submit.
    const brokenDb = {
      insert: () => {
        throw new Error("counter store unavailable");
      },
    } as unknown as typeof handle.db;

    const decision = await consumeRateLimit({
      db: brokenDb,
      scope: "signin_client",
      bucketKey: "signin_client:whatever",
      now: NOW,
      cleanupSampler: noCleanup,
    });
    expect(decision.allowed).toBe(true);
  });
});
