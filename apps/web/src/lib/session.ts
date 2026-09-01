// Real server-side session resolution for production routes.
//
// This is the cookie wiring `packages/db`'s IDN-001 session service has
// been waiting for: `user_sessions` already stores only a HASH of the
// session secret, already carries `expiresAt`/`revokedAt`, and
// `validateSession` already returns the distinct outcomes. Nothing about
// authentication is invented here - this module only carries the
// (sessionId, secret) pair in an httpOnly cookie and hands it to that
// existing function.
//
// This deliberately REPLACES, for production routes, the `?userId=` dev
// seam `/home` still uses (ADR-052) and the `slf_preview_session` demo
// cookie `/preview/*` uses. Neither of those is an authorization control;
// this one is: `requireUserId()` below is what makes every downstream
// `attempt.userId !== userId` ownership check in @superlatif/db actually
// mean something.
//
// The cookie stores `sessionId.secret`. The secret is a bearer credential,
// so: httpOnly (never readable by page JS), sameSite=lax (a cross-site
// POST cannot ride it), secure in production, and path=/ . The server-side
// half is a hash, so a database leak does not yield usable session
// credentials - that property comes from IDN-001's schema, not this file.
//
// `validateSession` returns WHY a session is invalid; this module
// deliberately collapses every failure into the same `null`, per that
// function's own module doc ("an HTTP layer built on top of this must map
// every non-valid outcome to the same generic 401 - echoing WHICH reason
// ... is an oracle").

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { identity } from "@superlatif/db";
import { getDb } from "./db.ts";

const SESSION_COOKIE = "slf_session";
/** Matches IDN-001's own session TTL expectation; the authoritative expiry is the `expiresAt` column, this only bounds the cookie itself. */
export const SESSION_TTL_SECONDS = 60 * 60 * 8;

function encode(sessionId: string, secret: string): string {
  return `${sessionId}.${secret}`;
}

function decode(raw: string): { readonly sessionId: string; readonly secret: string } | null {
  const separator = raw.indexOf(".");
  if (separator <= 0 || separator === raw.length - 1) return null;
  return { sessionId: raw.slice(0, separator), secret: raw.slice(separator + 1) };
}

export async function setSessionCookie(sessionId: string, secret: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, encode(sessionId, secret), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env["NODE_ENV"] === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** The raw (sessionId, secret) pair, for a sign-out that needs to revoke the server-side row too. */
export async function readSessionCookie(): Promise<{
  readonly sessionId: string;
  readonly secret: string;
} | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  return raw ? decode(raw) : null;
}

/** null for anonymous, an expired session, a revoked session, or a tampered secret - indistinguishable by design (see module doc). */
export async function getSessionUserId(): Promise<string | null> {
  const parsed = await readSessionCookie();
  if (!parsed) return null;
  const outcome = await identity.validateSession(getDb(), parsed.sessionId, parsed.secret, new Date());
  return outcome.outcome === "valid" ? (outcome.userId ?? null) : null;
}

export class UnauthenticatedError extends Error {
  constructor() {
    super("No valid session");
    this.name = "UnauthenticatedError";
  }
}

/**
 * Every production route/action that touches attempt data calls this
 * FIRST. Throwing (rather than returning null) is deliberate: a caller
 * cannot accidentally continue with `userId = undefined` and end up
 * querying with a falsy owner.
 */
export async function requireUserId(): Promise<string> {
  const userId = await getSessionUserId();
  if (!userId) throw new UnauthenticatedError();
  return userId;
}

/**
 * Page variant: an anonymous visitor is sent to sign-in rather than shown
 * an error. Server Actions keep using the throwing `requireUserId` - an
 * action has no page to redirect from and must fail loudly.
 */
export async function requireUserIdOrRedirect(): Promise<string> {
  const userId = await getSessionUserId();
  if (!userId) redirect("/signin");
  return userId;
}
