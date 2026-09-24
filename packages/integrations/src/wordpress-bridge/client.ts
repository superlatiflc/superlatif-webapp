// Server-to-server exchange of a one-time bridge code (IDN-002, M1, ADR-072).
//
// The only function in the app that learns WHO a WordPress user is. It returns
// a closed result union rather than throwing, so the caller must decide what
// the learner sees for every failure class - and so no failure path can
// accidentally fall through to "signed in".
//
// NOT RETRIED, deliberately. The exchange consumes the code on the WordPress
// side before it answers. Retrying after a timeout would, at best, get
// `invalid_grant` for a code the first attempt already burned; at worst it
// hides a real outage behind a confusing error. The learner restarts the flow
// instead, which mints a fresh code. (IDN-002's "retried" acceptance
// criterion applies to the idempotent commerce bridge calls, not to a
// single-use credential.)

import {
  BRIDGE_HEADERS,
  BRIDGE_REST_ROUTE,
  BRIDGE_AUTHORIZE_ACTION,
  BRIDGE_AUTHORIZE_QUERY_VALUE,
  BRIDGE_AUTHORIZE_QUERY_VAR,
  bridgeSignatureMatches,
  isBridgeTimestampFresh,
  parseIdentityClaims,
  requestSigningInput,
  responseSigningInput,
  signBridgeMessage,
} from "./protocol.ts";

export interface BridgeClientConfig {
  /** WordPress site root, e.g. https://superlatif.id */
  readonly baseUrl: string;
  /** Also the audience every code for this app is bound to. */
  readonly clientId: string;
  readonly clientSecret: string;
  /** This deployment's APP_ENV; WordPress must have issued the code for the same environment. */
  readonly environment: string;
}

/**
 * `invalid_grant` is the only outcome a learner can fix by trying again: the
 * code was unknown, expired, already used, or bound to a different state.
 * WordPress deliberately does not say which, and neither does this result.
 */
export type BridgeExchangeResult =
  | { readonly kind: "ok"; readonly subject: string }
  | { readonly kind: "invalid_grant" }
  | {
      readonly kind: "misconfigured";
      readonly reason:
        | "client_rejected"
        | "request_rejected"
        | "not_found"
        | "redirected"
        | "signature"
        | "audience"
        | "environment";
    }
  | { readonly kind: "unavailable"; readonly reason: "timeout" | "network" | "server_error" }
  | {
      readonly kind: "invalid_response";
      readonly reason: "malformed" | "stale" | "too_large" | "unexpected_status";
    };

export interface BridgeExchangeDeps {
  readonly fetch?: typeof fetch;
  readonly now?: () => Date;
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 5_000;
/** The legitimate response is ~150 bytes; anything near this is not our plugin. */
const MAX_RESPONSE_BYTES = 8_192;

function siteRoot(baseUrl: string): URL {
  const url = new URL(baseUrl);
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  url.search = "";
  url.hash = "";
  return url;
}

export function bridgeExchangeUrl(baseUrl: string): URL {
  const url = siteRoot(baseUrl);
  url.searchParams.set("rest_route", BRIDGE_REST_ROUTE);
  return url;
}

/**
 * Where the browser is sent to obtain a code. Carries no identity - only
 * which app is asking, and the state to echo.
 *
 * A front-end URL, not `/wp-admin/admin-post.php` (ADR-073): membership
 * plugins guard `/wp-admin/*` on `admin_init`, which runs before the
 * plugin's own handler, so the admin entry point never reached it.
 */
export function bridgeAuthorizeUrl(baseUrl: string, clientId: string, state: string): URL {
  const url = siteRoot(baseUrl);
  url.searchParams.set(BRIDGE_AUTHORIZE_QUERY_VAR, BRIDGE_AUTHORIZE_QUERY_VALUE);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("state", state);
  return url;
}

/**
 * The pre-ADR-073 admin-post entry point. The plugin still serves it, so a
 * rollback to an older app build keeps working; nothing in the app calls this.
 */
export function legacyBridgeAuthorizeUrl(baseUrl: string, clientId: string, state: string): URL {
  const url = siteRoot(baseUrl);
  url.pathname += "wp-admin/admin-post.php";
  url.searchParams.set("action", BRIDGE_AUTHORIZE_ACTION);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("state", state);
  return url;
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

async function readCapped(response: Response): Promise<string | null> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    return null;
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function errorCode(body: unknown): unknown {
  return typeof body === "object" && body !== null ? (body as Record<string, unknown>)["code"] : undefined;
}

export async function exchangeBridgeCode(
  config: BridgeClientConfig,
  input: { readonly code: string; readonly state: string },
  deps: BridgeExchangeDeps = {},
): Promise<BridgeExchangeResult> {
  const fetchImpl = deps.fetch ?? fetch;
  const now = deps.now ?? (() => new Date());
  const body = JSON.stringify({ code: input.code, state: input.state, environment: config.environment });
  const timestamp = String(Math.floor(now().getTime() / 1000));

  let response: Response;
  try {
    response = await fetchImpl(bridgeExchangeUrl(config.baseUrl), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        [BRIDGE_HEADERS.client]: config.clientId,
        [BRIDGE_HEADERS.timestamp]: timestamp,
        [BRIDGE_HEADERS.signature]: signBridgeMessage(
          config.clientSecret,
          requestSigningInput(timestamp, body),
        ),
      },
      body,
      // A redirect here means we are not talking to the endpoint we
      // configured (http->https bounce, login wall, moved site). Following it
      // would send the signed request somewhere unreviewed.
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(deps.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch (error) {
    return { kind: "unavailable", reason: isTimeout(error) ? "timeout" : "network" };
  }

  const { status } = response;
  if (response.type === "opaqueredirect" || (status >= 300 && status < 400)) {
    return { kind: "misconfigured", reason: "redirected" };
  }
  if (status === 401 || status === 403) return { kind: "misconfigured", reason: "client_rejected" };
  if (status === 404) return { kind: "misconfigured", reason: "not_found" };
  if (status === 429 || status >= 500) return { kind: "unavailable", reason: "server_error" };

  let text: string | null;
  try {
    text = await readCapped(response);
  } catch (error) {
    return { kind: "unavailable", reason: isTimeout(error) ? "timeout" : "network" };
  }
  if (text === null) return { kind: "invalid_response", reason: "too_large" };

  if (status === 400) {
    return errorCode(parseJson(text)) === "invalid_grant"
      ? { kind: "invalid_grant" }
      : { kind: "misconfigured", reason: "request_rejected" };
  }
  if (status !== 200) return { kind: "invalid_response", reason: "unexpected_status" };

  const claims = parseIdentityClaims(parseJson(text));
  if (!claims) return { kind: "invalid_response", reason: "malformed" };

  const signedAt = response.headers.get(BRIDGE_HEADERS.timestamp);
  if (!isBridgeTimestampFresh(signedAt, now())) return { kind: "invalid_response", reason: "stale" };
  const signature = response.headers.get(BRIDGE_HEADERS.signature);
  if (!bridgeSignatureMatches(config.clientSecret, responseSigningInput(signedAt, claims), signature)) {
    return { kind: "misconfigured", reason: "signature" };
  }
  // Both are covered by the signature, so a mismatch is not tampering in
  // transit - it is WordPress vouching for a different app or environment.
  // That is exactly the cross-environment redemption the binding exists to
  // stop, and it must never become a session.
  if (claims.audience !== config.clientId) return { kind: "misconfigured", reason: "audience" };
  if (claims.environment !== config.environment) return { kind: "misconfigured", reason: "environment" };

  return { kind: "ok", subject: claims.subject };
}
