// Rate-limit counters (P0-3 of the production readiness audit).
//
// WHY A TABLE AT ALL: the limiter decision must hold across concurrent
// Vercel function instances, and this deployment has no distributed store -
// REDIS_URL is declared in ENV_SPEC but never consumed, no Redis client is
// installed, and the only cache (createInMemoryEffectiveAccessCache) is
// per-process. A per-process counter would let N instances each admit the
// full budget, so Postgres - already the transactional source of truth -
// holds the authoritative count.
//
// PRIVACY: this table stores NO raw client identifier and no student-facing
// data. `bucket_key` is an opaque string whose identifying portion is an
// HMAC of the normalized IP or login handle, keyed by RATE_LIMIT_HASH_SECRET
// (see packages/domain/src/rate-limit/policy.ts). It is therefore not a
// behavioural log: it holds a salted fingerprint, a window, and a count,
// all of which expire within minutes.
//
// NOT AN AUDIT TABLE: rows are deleted opportunistically once expired. We do
// not want historical rate-limit analytics here, and keeping any longer
// would turn a privacy-minimal counter into a retained access log.

import { index, integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

export const rateLimitCounters = pgTable(
  "rate_limit_counters",
  {
    /** Opaque `<scope>:<subject-kind>:<hmac>` - never a raw IP or handle. */
    bucketKey: text("bucket_key").notNull(),
    /** Start of the fixed window this row counts; part of the key so a new window is a new row. */
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    hitCount: integer("hit_count").notNull().default(0),
    /** When this row may be reclaimed. Indexed so opportunistic cleanup is a cheap ranged delete. */
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    // The composite PRIMARY KEY is the concurrency control, not just an
    // identifier: it is what makes `INSERT ... ON CONFLICT (bucket_key,
    // window_start) DO UPDATE SET hit_count = hit_count + n RETURNING`
    // a single atomic statement. Two simultaneous requests cannot both
    // read a stale count and both pass - the second serializes behind the
    // first's row lock and sees the incremented value.
    primaryKey({ columns: [table.bucketKey, table.windowStart] }),
    index("rate_limit_counters_expires_at_idx").on(table.expiresAt),
  ],
);
