// Rate-limit enforcement service (P0-3).

import {
  RATE_LIMIT_RULES,
  decide,
  windowExpiryFor,
  windowStartFor,
  type RateLimitDecision,
  type RateLimitScope,
} from "@superlatif/domain/rate-limit";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as Schema from "../schema/index.ts";
import { deleteExpiredRateLimitCounters, incrementRateLimitCounter } from "./repository.ts";

type Db = PgDatabase<PgQueryResultHKT, typeof Schema>;

/**
 * Per-process buffer for high-volume scopes ONLY (currently just autosave).
 *
 * READ THIS BEFORE CHANGING: this is an optimisation, never the authority.
 * Postgres holds the real count; this only decides HOW OFTEN a process
 * reconciles with it. Setting any security-sensitive rule's batchSize above 1
 * would make that scope's enforcement partly process-local, which is exactly
 * what the audit rejected - so sign-in, start, takeover, and submit all use
 * batchSize 1 and consult the shared counter on every single call.
 *
 * The bounded cost of batching autosave: with B = batchSize and M concurrent
 * function instances, up to M*(B-1) extra saves can be admitted before the
 * shared counter notices. At B=25 that is tens of requests against a 600/min
 * budget - irrelevant for a guard whose only job is catching a runaway loop.
 */
interface LocalBucket {
  pending: number;
  blocked: boolean;
}
const localBuckets = new Map<string, LocalBucket>();

/** Exposed for tests: a process-local buffer must not leak between cases. */
export function resetLocalRateLimitBuffers(): void {
  localBuckets.clear();
}

export interface ConsumeRateLimitOptions {
  readonly db: Db;
  readonly scope: RateLimitScope;
  readonly bucketKey: string;
  readonly now: Date;
  /** Injected for tests; defaults to a 1-in-100 sweep. */
  readonly cleanupSampler?: () => boolean;
}

/**
 * Records one hit against `bucketKey` and decides whether it is allowed.
 *
 * FAILURE POLICY - fail OPEN, deliberately. If the counter store errors, the
 * caller is allowed through. This limiter is abuse protection only: every
 * correctness invariant (submission uniqueness, CAS, writer lease, session
 * validity) is enforced elsewhere and is unaffected by the limiter being
 * unavailable. Failing closed would convert a transient database blip into a
 * student being unable to save or submit an exam in progress, which is a far
 * worse outcome than briefly losing throttling. The tradeoff is recorded here
 * rather than hidden: an attacker who can reliably break the counter store
 * can also break the application it protects.
 */
export async function consumeRateLimit(options: ConsumeRateLimitOptions): Promise<RateLimitDecision> {
  const rule = RATE_LIMIT_RULES[options.scope];
  const windowStart = windowStartFor(rule, options.now);
  const expiresAt = windowExpiryFor(rule, windowStart);

  try {
    if (rule.batchSize <= 1) {
      const total = await incrementRateLimitCounter(options.db, {
        bucketKey: options.bucketKey,
        windowStart,
        expiresAt,
        amount: 1,
      });
      await maybeCleanup(options, windowStart);
      return decide(rule, total, windowStart, options.now);
    }

    const cacheKey = `${options.bucketKey}@${windowStart.getTime()}`;
    let bucket = localBuckets.get(cacheKey);
    if (!bucket) {
      bucket = { pending: 0, blocked: false };
      localBuckets.set(cacheKey, bucket);
      // A new window makes every older buffer dead weight. Cheap to drop.
      for (const key of localBuckets.keys()) {
        if (key.startsWith(`${options.bucketKey}@`) && key !== cacheKey) localBuckets.delete(key);
      }
    }

    if (bucket.blocked) return decide(rule, rule.limit + 1, windowStart, options.now);

    bucket.pending += 1;
    if (bucket.pending < rule.batchSize) {
      return decide(rule, 0, windowStart, options.now);
    }

    const flushed = bucket.pending;
    bucket.pending = 0;
    const total = await incrementRateLimitCounter(options.db, {
      bucketKey: options.bucketKey,
      windowStart,
      expiresAt,
      amount: flushed,
    });
    if (total > rule.limit) bucket.blocked = true;
    await maybeCleanup(options, windowStart);
    return decide(rule, total, windowStart, options.now);
  } catch {
    // See FAILURE POLICY above. Intentionally swallowed: the caller must not
    // learn about store internals, and an exam action must not die here.
    return { allowed: true, scope: options.scope, retryAfterSeconds: 0 };
  }
}

/**
 * Opportunistic retention. No scheduler exists in this deployment, so expired
 * rows are reclaimed by a small fraction of writes instead. Deliberately NOT
 * on every request (that would double the limiter's cost) and deliberately
 * bounded (500 rows) so no single learner action pays for a large sweep.
 *
 * Swallows its own errors: failing to tidy a counter table must never fail
 * the student action that happened to trigger the sweep.
 */
async function maybeCleanup(options: ConsumeRateLimitOptions, now: Date): Promise<void> {
  const sample = options.cleanupSampler ?? (() => Math.random() < 0.01);
  if (!sample()) return;
  try {
    await deleteExpiredRateLimitCounters(options.db, now);
  } catch {
    // Intentionally ignored - see doc comment.
  }
}
