"use server";

import { redirect } from "next/navigation";
import { identity } from "@superlatif/db";
import { getDb } from "../../lib/db.ts";
import {
  clearSessionCookie,
  readSessionCookie,
  setSessionCookie,
  SESSION_TTL_SECONDS,
} from "../../lib/session.ts";
import { DevLoginDisabledError, isDevLoginEnabled } from "../../lib/dev-login.ts";
import { RateLimitedError, enforceSignInRateLimit } from "../../lib/rate-limit.ts";

// Sign-in for the production tryout slice.
//
// Reuses IDN-001's `performDeterministicLogin` EXACTLY as its own module
// doc anticipates: "`provider`/`externalSubject`/contact fields are
// supplied by the caller (a test fixture today; the real bridge adapter
// once IDN-002/OD-02 close) - this function has no knowledge of WordPress/
// Sejoli specifically." Nothing about provider behaviour is fabricated
// here; the session that results is a REAL one (hashed secret, expiry,
// revocation - see schema/identity.ts), which is what makes every
// downstream attempt/result/review ownership check meaningful.
//
// GATED, because OD-02 (WordPress one-time bridge and safe account
// linking) is still an open hard gate in CLAUDE.md: this entry point
// refuses outright when `APP_ENV` is "production". It is a
// staging/development identity seam, not the production login - the real
// bridge replaces the `performDeterministicLogin` call below without
// touching the session/cookie machinery around it.
//
// A "use server" module may export ONLY async Server Actions, so the gate
// predicate and its error live in ../../lib/dev-login.ts rather than here.

const DEV_LOGIN_PROVIDER = "dev_fixture";

// P0-2, sign-in: no PRODUCTION_WRITES_ENABLED guard is added here, and the
// reason is that this path CANNOT run in production at all - isDevLoginEnabled()
// refuses whenever APP_ENV=production, before any row is touched. Guarding an
// unreachable path would be theatre.
//
// The decision this leaves to OD-02's real bridge, recorded here so it is not
// rediscovered: session creation for an EXISTING account is best treated as an
// operational write and left available during a freeze, because letting people
// sign in to READ their results costs nothing and locking everyone out during
// an incident is its own outage; ACCOUNT creation is a business write and
// should be guarded. Today's seam conflates the two (it creates a user on
// first sight of a handle), which is one more reason not to pretend it is
// production-shaped.
export async function devSignInAction(formData: FormData): Promise<void> {
  if (!isDevLoginEnabled()) throw new DevLoginDisabledError();

  const rawHandle = formData.get("handle");
  const handle = typeof rawHandle === "string" ? rawHandle.trim().toLowerCase() : "";
  if (handle.length === 0 || handle.length > 64) {
    redirect("/signin?error=handle");
  }

  // P0-3. Placed HERE deliberately: after shape validation (so a malformed
  // request cannot consume another caller's budget) but BEFORE
  // performDeterministicLogin, which is what creates the user row and the
  // session row. A throttled sign-in must leave no trace in either table.
  //
  // The refusal is identical whether or not the handle belongs to a real
  // account - `enforceSignInRateLimit` never looks the handle up, it only
  // hashes it - so throttling cannot be used as a user-existence oracle.
  try {
    await enforceSignInRateLimit(handle);
  } catch (error) {
    if (error instanceof RateLimitedError) redirect("/signin?error=rate_limited");
    throw error;
  }

  const result = await identity.performDeterministicLogin(
    getDb(),
    {
      provider: DEV_LOGIN_PROVIDER,
      externalSubject: handle,
      // No email/phone is supplied: those are the contact fields
      // evaluateIdentityLink would use for a CONFLICT decision, and this
      // staging seam deliberately keeps every handle a clean, independent
      // (provider, externalSubject) link rather than exercising the
      // merge/conflict path that IDN-003 owns.
      emailNormalized: null,
      phoneE164: null,
      linkReason: "deterministic_dev_signin",
    },
    { now: () => new Date(), sessionTtlSeconds: SESSION_TTL_SECONDS },
  );

  if (result.kind === "conflict") {
    redirect("/signin?error=conflict");
  }

  await setSessionCookie(result.sessionId, result.secret);
  redirect("/tryouts");
}

/**
 * P0-2: INTENTIONALLY NOT GUARDED by PRODUCTION_WRITES_ENABLED.
 *
 * Session revocation is a containment write, not a business write. dok 30 §9
 * lists containment as the incident commander's job, and a write freeze that
 * also disabled sign-out would remove the ability to revoke a session during
 * the security incident most likely to have caused the freeze. The write it
 * performs is strictly reductive - it revokes access, it never grants any -
 * so allowing it cannot deepen a data-integrity incident.
 */
export async function signOutAction(): Promise<void> {
  const parsed = await readSessionCookie();
  if (parsed) {
    // Revoke the server-side row too, not just the cookie - a cookie-only
    // sign-out would leave a still-valid session usable by anyone who had
    // captured the credential.
    await identity.revokeSessionById(getDb(), parsed.sessionId, new Date());
  }
  await clearSessionCookie();
  redirect("/signin");
}
