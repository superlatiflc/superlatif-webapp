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
