// Rate-limit wiring for apps/web (P0-3).
//
// Turns the RATE_LIMIT_ENABLED contract - which the production readiness
// audit found was declared, defaulted to true, and then never consumed by
// anything - into real enforcement, and derives the bucket keys the shared
// Postgres counter is addressed by.
//
// This module deliberately owns only three things: (1) is the limiter on,
// (2) what is this caller's key, (3) what does a refusal look like. The
// decision itself lives in @superlatif/domain/rate-limit and the atomic
// counter in @superlatif/db - neither of which knows anything about Next.js.

import { headers } from "next/headers";
import { rateLimit as store } from "@superlatif/db";
import {
  buildBucketKey,
  buildOpaqueBucketKey,
  fingerprint,
  normalizeHandle,
  type RateLimitDecision,
  type RateLimitScope,
} from "@superlatif/domain/rate-limit";
import { getDb } from "./db.ts";

/**
 * Thrown when a caller exceeds a limit. Carries NO counter value, bucket key,
 * network identifier, or store detail - the whole point is that a throttled
 * caller learns only "too fast, try again", never anything about how the
 * limiter is keyed or how close other callers are to a threshold.
 */
export class RateLimitedError extends Error {
  readonly scope: RateLimitScope;
  readonly retryAfterSeconds: number;
  constructor(decision: RateLimitDecision) {
    super("rate_limited");
    this.name = "RateLimitedError";
    this.scope = decision.scope;
    this.retryAfterSeconds = decision.retryAfterSeconds;
  }
}

/** Raised at startup, not per-request: enabled-but-unconfigured must never serve. */
export class RateLimitMisconfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitMisconfiguredError";
  }
}

function isEnabled(): boolean {
  // Mirrors ENV_SPEC's own default. Absent means ON: an unset variable is the
  // most likely production misconfiguration, and it must not be the one that
  // silently removes protection.
  const raw = process.env["RATE_LIMIT_ENABLED"];
  if (raw === undefined || raw === "") return true;
  return raw !== "false";
}

function isControlledNonProductionEnv(): boolean {
  const appEnv = process.env["APP_ENV"];
  return appEnv !== "production" && appEnv !== "staging";
}

/**
 * Resolves the HMAC key, or refuses to run.
 *
 * The fail-safe direction matters and is the reason this throws rather than
 * degrading: if the limiter is enabled in staging/production but has no
 * secret, the only alternatives are (a) skip protection silently or (b) hash
 * with a constant. Both leave an operator believing they are protected when
 * they are not - the exact failure mode P0-3 documented for the flag itself.
 * Disabling the limiter outright is allowed, but only as an explicit choice
 * in a controlled local/test environment.
 */
function requireHashSecret(): string {
  const secret = process.env["RATE_LIMIT_HASH_SECRET"];
  if (secret && secret.length >= 16) return secret;
  if (isControlledNonProductionEnv()) {
    // Local/test only: a fixed development key keeps tests deterministic and
    // never protects anything real. Never reachable when APP_ENV is
    // staging/production because of the throw below.
    return "dev-only-rate-limit-hash-secret";
  }
  throw new RateLimitMisconfiguredError(
    "RATE_LIMIT_ENABLED is on but RATE_LIMIT_HASH_SECRET is missing or shorter than 16 characters",
  );
}

/**
 * Startup assertion, called from instrumentation. Fails the process rather
 * than letting a staging/production deployment come up unprotected.
 */
export function assertRateLimitConfigured(): void {
  if (!isEnabled()) {
    if (!isControlledNonProductionEnv()) {
      throw new RateLimitMisconfiguredError(
        "RATE_LIMIT_ENABLED=false is not permitted when APP_ENV is staging or production",
      );
    }
    return;
  }
  requireHashSecret();
}

/**
 * Derives a stable, non-identifying key for the calling network client.
 *
 * HEADER TRUST, AUDITED (Vercel): `x-forwarded-for` is client-settable at the
 * origin and must never be trusted leftmost-first on its own. Vercel's proxy
 * sets `x-vercel-forwarded-for` and normalizes `x-forwarded-for`, and of the
 * headers reaching a Server Action the Vercel-originated ones are the only
 * ones an external caller cannot forge. Precedence below is therefore
 * Vercel-first, with `x-forwarded-for`'s FIRST entry as a last resort.
 *
 * LIMITATION, STATED PLAINLY: on a non-Vercel host, or if a request somehow
 * reaches the app without passing the platform proxy, `x-forwarded-for` is
 * spoofable and an attacker can rotate this key at will. That weakens the
 * per-network sign-in bucket to "best effort" - which is exactly why sign-in
 * ALSO carries an independent per-handle bucket that no header can influence.
 * Neither bucket alone is sufficient; both must pass.
 */
async function clientFingerprint(scope: RateLimitScope): Promise<string> {
  const h = await headers();
  const vercel = h.get("x-vercel-forwarded-for");
  const real = h.get("x-real-ip");
  const forwarded = h.get("x-forwarded-for");
  const raw =
    vercel?.trim() ||
    real?.trim() ||
    forwarded?.split(",")[0]?.trim() ||
    // No usable signal: collapse to one shared bucket rather than inventing a
    // unique key per request, which would disable the limit entirely.
    "unknown-client";
  return fingerprint(requireHashSecret(), scope, raw.toLowerCase());
}

async function enforce(scope: RateLimitScope, bucketKey: string, now: Date): Promise<void> {
  // getDb() is resolved inside the fail-open boundary on purpose. It throws
  // when DATABASE_URL is absent, and that throw would otherwise escape the
  // limiter and take down the action it was meant to protect - turning a
  // configuration problem into "no student can submit". consumeRateLimit
  // already fails open on store errors; this closes the same gap one layer
  // up, so the limiter can never be the reason an exam action fails.
  let db: ReturnType<typeof getDb>;
  try {
    db = getDb();
  } catch {
    return;
  }
  const decision = await store.consumeRateLimit({ db, scope, bucketKey, now });
  if (!decision.allowed) throw new RateLimitedError(decision);
}

/**
 * Sign-in must pass BOTH buckets. Ordered network-first so a spray across
 * many handles from one source is stopped before any handle lookup happens,
 * and so a throttled caller never reaches the user-creating code path.
 *
 * The handle is normalized and then HMACed - the raw handle is never stored,
 * so this table cannot become a list of attempted usernames.
 */
export async function enforceSignInRateLimit(handle: string, now = new Date()): Promise<void> {
  if (!isEnabled()) return;
  const secret = requireHashSecret();

  await enforce(
    "signin_client",
    buildBucketKey("signin_client", await clientFingerprint("signin_client")),
    now,
  );
  await enforce(
    "signin_handle",
    buildBucketKey("signin_handle", fingerprint(secret, "signin_handle", normalizeHandle(handle))),
    now,
  );
}

/** User-keyed: a learner's own reload/resume budget, independent of network. */
export async function enforceAttemptStartRateLimit(userId: string, now = new Date()): Promise<void> {
  if (!isEnabled()) return;
  await enforce("attempt_start", buildOpaqueBucketKey("attempt_start", userId), now);
}

/**
 * Keyed by USER, matching the lease ownership model: `takeoverWriterLease`
 * authorizes against the attempt's owner, so the actor is the meaningful
 * subject - a learner thrashing takeover across several of their own attempts
 * is the behaviour worth damping.
 */
export async function enforceLeaseTakeoverRateLimit(userId: string, now = new Date()): Promise<void> {
  if (!isEnabled()) return;
  await enforce("lease_takeover", buildOpaqueBucketKey("lease_takeover", userId), now);
}

/** Attempt-keyed: submission uniqueness is per attempt, so the budget is too. */
export async function enforceSubmitRateLimit(attemptId: string, now = new Date()): Promise<void> {
  if (!isEnabled()) return;
  await enforce("attempt_submit", buildOpaqueBucketKey("attempt_submit", attemptId), now);
}

/**
 * Autosave. Attempt-keyed and batched (see service.ts) so a normal exam makes
 * only a handful of limiter writes in total rather than one per save.
 */
export async function enforceAnswerSaveRateLimit(attemptId: string, now = new Date()): Promise<void> {
  if (!isEnabled()) return;
  await enforce("answer_save", buildOpaqueBucketKey("answer_save", attemptId), now);
}
