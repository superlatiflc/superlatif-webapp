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

const LEGACY_SESSION_COOKIE = "slf_session";
/**
 * Matches IDN-001's own session TTL expectation; the authoritative expiry is the `expiresAt` column, this only bounds the cookie itself.
 * NOT yet reconciled with ENV_SPEC's SESSION_TTL_SECONDS default or dok 24 §4's idle/absolute model - see ADR-072 "Session TTL".
 */
export const SESSION_TTL_SECONDS = 60 * 60 * 8;

/** Mirrors IDN-001's generated secret (base64url); anything else cannot be a session we issued. */
const SECRET_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

function isSecureContext(): boolean {
  return process.env["NODE_ENV"] === "production";
}

/**
 * `__Host-` whenever the cookie is Secure (every Vercel deployment, ADR-072).
 * The prefix is enforced by the BROWSER, not by us: it refuses a `__Host-`
 * cookie unless it is Secure, has Path=/, and carries no Domain attribute.
 * So no other host - a sibling subdomain such as akademi.superlatif.id
 * included - can ever plant or overwrite the session cookie, which is what
 * keeps the fixation defence intact against cookie tossing. Plain-http local
 * development cannot satisfy Secure in every browser, so it keeps the
 * unprefixed name.
 */
export function sessionCookieName(): string {
  return isSecureContext() ? "__Host-slf_session" : LEGACY_SESSION_COOKIE;
}

/** Exported for the cookie-attribute tests. No `domain` - that absence is the point (host-only cookie). */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isSecureContext(),
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

function encode(sessionId: string, secret: string): string {
  return `${sessionId}.${secret}`;
}

/** Exported for tests. A malformed value is "no session" - never an exception, never a database query. */
export function decodeSessionCookie(
  raw: string,
): { readonly sessionId: string; readonly secret: string } | null {
  const separator = raw.indexOf(".");
  if (separator <= 0 || separator === raw.length - 1) return null;
  const sessionId = raw.slice(0, separator);
  const secret = raw.slice(separator + 1);
  if (!identity.isWellFormedSessionId(sessionId) || !SECRET_PATTERN.test(secret)) return null;
  return { sessionId, secret };
}

export async function setSessionCookie(sessionId: string, secret: string): Promise<void> {
  const store = await cookies();
  store.set(sessionCookieName(), encode(sessionId, secret), sessionCookieOptions());
}

/**
 * Expires the cookie with the SAME attributes it was set with: a browser
 * ignores a `__Host-` Set-Cookie that lacks Secure/Path=/, so a bare delete
 * could silently fail to clear it. The pre-hardening unprefixed name is
 * cleared too, so no stale credential lingers after sign-out.
 */
export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  const expired = { ...sessionCookieOptions(), maxAge: 0 };
  store.set(sessionCookieName(), "", expired);
  if (sessionCookieName() !== LEGACY_SESSION_COOKIE) store.set(LEGACY_SESSION_COOKIE, "", expired);
}

/** The raw (sessionId, secret) pair, for a sign-out that needs to revoke the server-side row too. */
export async function readSessionCookie(): Promise<{
  readonly sessionId: string;
  readonly secret: string;
} | null> {
  const store = await cookies();
  const raw = store.get(sessionCookieName())?.value;
  return raw ? decodeSessionCookie(raw) : null;
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
