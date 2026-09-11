// WordPress one-time bridge wire protocol, app side (IDN-002, M1, ADR-072).
//
// This is the contract shared with the `superlatif-app-bridge` WordPress
// plugin (wordpress-plugins/superlatif-app-bridge). Both sides must agree byte
// for byte on the signing inputs below. The plugin's tests/vectors.json pins
// them, and BOTH this package's tests and the plugin's PHP tests assert
// against that same file, so the two implementations cannot drift apart
// silently.
//
// TRUST MODEL, stated once:
//  - The browser only ever carries an opaque one-time code and our own state
//    value. Neither says who the user is, and neither is trusted as identity.
//  - Identity comes ONLY from the server-to-server exchange response, whose
//    canonical claims are HMAC-signed with the per-client bridge secret.
//  - The secret is never sent on the wire in either direction: requests and
//    responses carry an HMAC computed with it, never the value itself.
//
// Pure apart from node:crypto; no I/O.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const BRIDGE_PROTOCOL_VERSION = 1;

/** Accepted clock difference between the app and WordPress, both directions. */
export const BRIDGE_MAX_CLOCK_SKEW_SECONDS = 300;

export const BRIDGE_HEADERS = {
  client: "x-superlatif-bridge-client",
  timestamp: "x-superlatif-bridge-timestamp",
  signature: "x-superlatif-bridge-signature",
} as const;

/** REST route, addressed via `?rest_route=` so it works with or without pretty permalinks. */
export const BRIDGE_REST_ROUTE = "/superlatif-bridge/v1/exchange";

/** `admin-post.php` action that issues a code for the logged-in WordPress user. */
export const BRIDGE_AUTHORIZE_ACTION = "superlatif_bridge_authorize";

/** 32 random bytes, base64url without padding - codes and state values alike. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const SIGNATURE_PATTERN = /^[a-f0-9]{64}$/;
const TIMESTAMP_PATTERN = /^[0-9]{1,12}$/;

/** Client IDs double as the audience a code is bound to. */
export const BRIDGE_CLIENT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,63}$/;
export const BRIDGE_ENVIRONMENT_PATTERN = /^[a-z]{1,32}$/;
/** A WordPress user ID: positive decimal integer, no leading zero. */
export const BRIDGE_SUBJECT_PATTERN = /^[1-9][0-9]{0,19}$/;

export function isWellFormedBridgeToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

/** CSRF state for one sign-in attempt; also bound into the code by the plugin. */
export function generateBridgeState(): string {
  return randomBytes(32).toString("base64url");
}

/** What the app signs when calling the exchange endpoint. */
export function requestSigningInput(timestamp: string, body: string): string {
  return `v1\n${timestamp}\n${body}`;
}

/** The identity claims WordPress vouches for. Nothing else is trusted from the response. */
export interface BridgeIdentityClaims {
  readonly version: typeof BRIDGE_PROTOCOL_VERSION;
  readonly subject: string;
  readonly audience: string;
  readonly environment: string;
}

/**
 * What WordPress signs in its response. Canonical fields rather than the raw
 * body, so a WordPress plugin that re-serializes REST responses cannot break
 * verification, and so nothing outside these fields can ride on the signature.
 */
export function responseSigningInput(timestamp: string, claims: BridgeIdentityClaims): string {
  return ["v1", timestamp, String(claims.version), claims.subject, claims.audience, claims.environment].join(
    "\n",
  );
}

export function signBridgeMessage(secret: string, input: string): string {
  return createHmac("sha256", secret).update(input, "utf8").digest("hex");
}

/** Constant-time comparison; anything that is not a well-formed hex digest is simply a mismatch. */
export function bridgeSignatureMatches(secret: string, input: string, provided: unknown): boolean {
  if (typeof provided !== "string" || !SIGNATURE_PATTERN.test(provided)) return false;
  const expected = Buffer.from(signBridgeMessage(secret, input), "hex");
  return timingSafeEqual(expected, Buffer.from(provided, "hex"));
}

export function isBridgeTimestampFresh(timestamp: unknown, now: Date): timestamp is string {
  if (typeof timestamp !== "string" || !TIMESTAMP_PATTERN.test(timestamp)) return false;
  const skew = Math.abs(Math.floor(now.getTime() / 1000) - Number(timestamp));
  return skew <= BRIDGE_MAX_CLOCK_SKEW_SECONDS;
}

/** Strict shape check. Unknown extra keys are ignored: they are not covered by the signature, so nothing reads them. */
export function parseIdentityClaims(value: unknown): BridgeIdentityClaims | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const { version, subject, audience, environment } = record;
  if (version !== BRIDGE_PROTOCOL_VERSION) return null;
  if (typeof subject !== "string" || !BRIDGE_SUBJECT_PATTERN.test(subject)) return null;
  if (typeof audience !== "string" || !BRIDGE_CLIENT_ID_PATTERN.test(audience)) return null;
  if (typeof environment !== "string" || !BRIDGE_ENVIRONMENT_PATTERN.test(environment)) return null;
  return { version, subject, audience, environment };
}
