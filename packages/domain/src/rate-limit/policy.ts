// Rate-limit policy: pure decisions, no I/O (P0-3).
//
// These are ABUSE limits, not product limits. They exist to stop credential
// stuffing, runaway client loops, and write amplification - not to shape how
// often a learner is "allowed" to study. Every threshold is therefore set
// far above realistic human behaviour and deliberately below what automation
// needs to be effective. If a real learner ever hits one of these, the
// threshold is wrong, not the learner.
//
// Idempotency, the writer lease, CAS on answer revision, and the unique
// index on attempt_submissions remain the authoritative correctness controls.
// Nothing here may be relied on for correctness: a limiter that is disabled
// or failing must never turn a duplicate submit into two submissions.

import { createHmac } from "node:crypto";

export type RateLimitScope =
  "signin_client" | "signin_handle" | "attempt_start" | "lease_takeover" | "attempt_submit" | "answer_save";

export interface RateLimitRule {
  readonly scope: RateLimitScope;
  /** Maximum hits permitted inside one window. */
  readonly limit: number;
  readonly windowSeconds: number;
  /**
   * How many hits a caller may buffer locally before it must reconcile with
   * the shared store. 1 means "every call consults Postgres" and is the
   * default for everything security-sensitive. Only the autosave rule raises
   * it, to keep the hottest exam path off the database - see
   * `answer_save` below.
   */
  readonly batchSize: number;
}

const MINUTE = 60;

/**
 * Approved thresholds. Sign-in requires BOTH of its rules to pass.
 */
export const RATE_LIMIT_RULES: Readonly<Record<RateLimitScope, RateLimitRule>> = {
  // Credential-stuffing / mass-account-creation guard. The narrower of the
  // two sign-in buckets: one network source, 5 tries per 15 minutes.
  signin_client: { scope: "signin_client", limit: 5, windowSeconds: 15 * MINUTE, batchSize: 1 },
  // Distributed guessing against ONE account from many sources.
  signin_handle: { scope: "signin_handle", limit: 10, windowSeconds: 60 * MINUTE, batchSize: 1 },
  // Start/resume is idempotent and a learner legitimately reloads, resumes
  // after a dropped connection, and re-enters from the batch page. 10 per 5
  // minutes leaves that untouched while bounding eligibility-check cost.
  attempt_start: { scope: "attempt_start", limit: 10, windowSeconds: 5 * MINUTE, batchSize: 1 },
  // Takeover is already an explicit, deliberate action (dok 16 §7). Frequent
  // takeovers mean two devices are fighting, which is exactly what we damp.
  lease_takeover: { scope: "lease_takeover", limit: 5, windowSeconds: 5 * MINUTE, batchSize: 1 },
  // Submission is idempotent by unique index; this only bounds the cost of
  // the inline scoring drain that follows a submit.
  attempt_submit: { scope: "attempt_submit", limit: 5, windowSeconds: MINUTE, batchSize: 1 },
  // Autosave. 600/minute is ~10 per second: far beyond any human answering
  // multiple-choice questions, so this catches only a runaway client loop.
  //
  // batchSize 25 keeps the hottest path off the database: a process counts
  // locally and only reconciles with Postgres every 25 saves. A real exam
  // (a few hundred saves across ~90 minutes) therefore performs a handful of
  // limiter writes in total instead of one per keystroke, while a runaway
  // loop still trips the shared counter within 25 requests. The cost of the
  // optimisation is bounded over-admission - see `docs` in service.ts.
  answer_save: { scope: "answer_save", limit: 600, windowSeconds: MINUTE, batchSize: 25 },
};

/**
 * Start of the fixed window containing `now`. Fixed windows admit up to ~2x
 * the limit across a boundary; accepted for this first version (a sliding
 * window would need one row per request).
 */
export function windowStartFor(rule: RateLimitRule, now: Date): Date {
  const windowMs = rule.windowSeconds * 1000;
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
}

export function windowExpiryFor(rule: RateLimitRule, windowStart: Date): Date {
  // One extra window of slack so a row is never reclaimed while still
  // authoritative for an in-flight request.
  return new Date(windowStart.getTime() + rule.windowSeconds * 2000);
}

/**
 * HMACs an identifying value so the store holds a salted fingerprint rather
 * than a raw IP or login handle. Truncated to 32 hex chars: still far beyond
 * collision risk at these volumes, and shorter keys keep the index small.
 *
 * The secret is dedicated (RATE_LIMIT_HASH_SECRET) rather than borrowed from
 * session/auth config, so rotating it only resets counters and can never
 * invalidate sessions or signed assets.
 */
export function fingerprint(secret: string, scope: RateLimitScope, value: string): string {
  return createHmac("sha256", secret).update(`${scope}:${value}`).digest("hex").slice(0, 32);
}

/** Normalizes a login handle so casing/whitespace cannot split a bucket. */
export function normalizeHandle(handle: string): string {
  return handle.trim().toLowerCase();
}

export function buildBucketKey(scope: RateLimitScope, subjectFingerprint: string): string {
  return `${scope}:${subjectFingerprint}`;
}

/**
 * Bucket key for a subject that is already a non-identifying server-side id
 * (a user id, an attempt id). These are not hashed: they are not client
 * secrets, they are already opaque UUIDs, and leaving them readable keeps
 * operational debugging possible without exposing anything a database reader
 * could not already see in the attempts table.
 */
export function buildOpaqueBucketKey(scope: RateLimitScope, subjectId: string): string {
  return `${scope}:${subjectId}`;
}

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly scope: RateLimitScope;
  /** Seconds until the current window rolls over. Safe to surface. */
  readonly retryAfterSeconds: number;
}

export function decide(
  rule: RateLimitRule,
  countAfterIncrement: number,
  windowStart: Date,
  now: Date,
): RateLimitDecision {
  const windowEndMs = windowStart.getTime() + rule.windowSeconds * 1000;
  const retryAfterSeconds = Math.max(1, Math.ceil((windowEndMs - now.getTime()) / 1000));
  return { allowed: countAfterIncrement <= rule.limit, scope: rule.scope, retryAfterSeconds };
}
