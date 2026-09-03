// Atomic rate-limit counter persistence (P0-3).

import { and, lt, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as Schema from "../schema/index.ts";
import { rateLimitCounters } from "../schema/index.ts";

type Db = PgDatabase<PgQueryResultHKT, typeof Schema>;

/**
 * Increments a bucket by `amount` and returns the count AFTER the increment,
 * in ONE statement.
 *
 * This single-statement shape is the whole concurrency argument. The naive
 * read-then-write version ("SELECT count; if count < limit then UPDATE")
 * lets N concurrent callers all read the same pre-limit value and all pass -
 * precisely the race the approved concurrency test must disprove. Here the
 * conflicting writers serialize on the primary-key row lock, and each gets a
 * distinct post-increment value back, so exactly `limit` callers can observe
 * a value <= limit no matter how many arrive at once.
 *
 * `hit_count` is incremented from the EXCLUDED row's perspective using the
 * stored value, never a value the caller read earlier.
 */
export async function incrementRateLimitCounter(
  db: Db,
  input: {
    readonly bucketKey: string;
    readonly windowStart: Date;
    readonly expiresAt: Date;
    readonly amount: number;
  },
): Promise<number> {
  const rows = await db
    .insert(rateLimitCounters)
    .values({
      bucketKey: input.bucketKey,
      windowStart: input.windowStart,
      hitCount: input.amount,
      expiresAt: input.expiresAt,
    })
    .onConflictDoUpdate({
      target: [rateLimitCounters.bucketKey, rateLimitCounters.windowStart],
      set: { hitCount: sql`${rateLimitCounters.hitCount} + ${input.amount}` },
    })
    .returning({ hitCount: rateLimitCounters.hitCount });

  return rows[0]?.hitCount ?? input.amount;
}

/**
 * Reclaims expired rows. Called opportunistically (see service.ts), never on
 * a schedule - no scheduler exists in this deployment (P1-1 of the audit).
 * Bounded by `limit` so a single unlucky request never pays for a huge sweep.
 */
export async function deleteExpiredRateLimitCounters(db: Db, now: Date, limit = 500): Promise<number> {
  const doomed = await db
    .select({ bucketKey: rateLimitCounters.bucketKey, windowStart: rateLimitCounters.windowStart })
    .from(rateLimitCounters)
    .where(lt(rateLimitCounters.expiresAt, now))
    .limit(limit);

  if (doomed.length === 0) return 0;

  for (const row of doomed) {
    await db
      .delete(rateLimitCounters)
      .where(
        and(
          sql`${rateLimitCounters.bucketKey} = ${row.bucketKey}`,
          sql`${rateLimitCounters.windowStart} = ${row.windowStart}`,
        ),
      );
  }
  return doomed.length;
}
