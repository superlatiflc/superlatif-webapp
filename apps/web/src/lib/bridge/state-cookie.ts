// Per-attempt sign-in state (ADR-072): CSRF protection for the bridge callback.
//
// Without it, an attacker could send a victim a callback link carrying the
// ATTACKER's code and silently sign the victim into the attacker's account
// (login CSRF / session swapping). The state value is minted here, stored
// only in this httpOnly cookie, sent to WordPress, bound into the code by
// the plugin, and must come back identical on the callback - which only the
// browser that started the flow can do.
//
// Single use: taking the state always clears the cookie, whatever happens
// next, so a callback can never be replayed against the same state.

import { cookies } from "next/headers";
import { isWellFormedBridgeToken } from "@superlatif/integrations";
import { sanitizeReturnPath } from "./return-path.ts";

/** Long enough to sign in to WordPress (including a forgotten-password detour), short enough to be worthless later. */
const STATE_TTL_SECONDS = 10 * 60;

function isSecureContext(): boolean {
  return process.env["NODE_ENV"] === "production";
}

/** Same `__Host-` reasoning as the session cookie (lib/session.ts). */
export function bridgeStateCookieName(): string {
  return isSecureContext() ? "__Host-slf_bridge_state" : "slf_bridge_state";
}

function options(maxAge: number) {
  return { httpOnly: true, sameSite: "lax" as const, secure: isSecureContext(), path: "/", maxAge };
}

export interface BridgeSignInState {
  readonly state: string;
  readonly returnPath: string;
}

export function encodeBridgeState(value: BridgeSignInState): string {
  return `${value.state}.${Buffer.from(value.returnPath, "utf8").toString("base64url")}`;
}

export function decodeBridgeState(raw: string): BridgeSignInState | null {
  const separator = raw.indexOf(".");
  if (separator <= 0) return null;
  const state = raw.slice(0, separator);
  if (!isWellFormedBridgeToken(state)) return null;
  const returnPath = Buffer.from(raw.slice(separator + 1), "base64url").toString("utf8");
  return { state, returnPath: sanitizeReturnPath(returnPath) };
}

export async function setBridgeStateCookie(value: BridgeSignInState): Promise<void> {
  const store = await cookies();
  store.set(bridgeStateCookieName(), encodeBridgeState(value), options(STATE_TTL_SECONDS));
}

/** Reads and clears in one step. */
export async function takeBridgeStateCookie(): Promise<BridgeSignInState | null> {
  const store = await cookies();
  const raw = store.get(bridgeStateCookieName())?.value;
  store.set(bridgeStateCookieName(), "", options(0));
  return raw ? decodeBridgeState(raw) : null;
}
