// Bridge callback orchestration (M1, ADR-072).
//
// WordPress-authenticated student -> one-time code -> THIS -> server-to-server
// exchange -> trusted WordPress subject -> internal user_id -> new session.
//
// Every dependency is injected so each failure class is testable without a
// Next.js runtime, a database, or WordPress; lib/bridge/wiring.ts supplies
// the real ones. The function returns an outcome and never throws for an
// expected failure, so the route cannot accidentally render a stack trace or
// fall through to "signed in".
//
// WHAT IS TRUSTED, AND FROM WHERE:
//   - user identity: ONLY the signature-verified exchange response. Nothing
//     in the callback URL is identity; any `userId`-like parameter is ignored
//     because nothing here reads one.
//   - destination: ONLY the state cookie written before the learner left.
//   - linking: (provider, externalSubject) only. The bridge sends no email or
//     phone, so an email collision can never link or merge accounts.

import { timingSafeEqual } from "node:crypto";
import { WORDPRESS_LOGIN_PROVIDER } from "@superlatif/domain/identity";
import {
  isWellFormedBridgeToken,
  type BridgeClientConfig,
  type BridgeExchangeResult,
} from "@superlatif/integrations";
import type { identity } from "@superlatif/db";
import type { BridgeSignInState } from "./state-cookie.ts";

/** Stable codes, rendered by /signin. None of them says WHY in a way that helps an attacker. */
export type BridgeSignInError = "bridge" | "bridge_unavailable" | "conflict" | "rate_limited";

export type BridgeSignInOutcome =
  | { readonly kind: "signed_in"; readonly returnPath: string }
  | { readonly kind: "failed"; readonly error: BridgeSignInError };

export interface BridgeSignInLogger {
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

export interface BridgeSignInDeps {
  readonly config: BridgeClientConfig;
  readonly takeState: () => Promise<BridgeSignInState | null>;
  readonly readSession: () => Promise<{ readonly sessionId: string; readonly secret: string } | null>;
  readonly setSession: (sessionId: string, secret: string) => Promise<void>;
  readonly enforceClientLimit: () => Promise<void>;
  readonly enforceSubjectLimit: (subject: string) => Promise<void>;
  readonly isRateLimited: (error: unknown) => boolean;
  readonly exchange: (
    config: BridgeClientConfig,
    input: { readonly code: string; readonly state: string },
  ) => Promise<BridgeExchangeResult>;
  readonly login: (input: identity.DeterministicLoginInput) => Promise<identity.DeterministicLoginResult>;
  readonly logger: BridgeSignInLogger;
}

function sameToken(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Only the result kind and a fixed reason label are logged - never the code, state, subject, or secret. */
function logExchangeFailure(
  logger: BridgeSignInLogger,
  result: Exclude<BridgeExchangeResult, { kind: "ok" }>,
) {
  const fields = { kind: result.kind, reason: "reason" in result ? result.reason : "invalid_grant" };
  if (result.kind === "invalid_grant") logger.warn("auth.bridge.exchange_rejected", fields);
  else logger.error("auth.bridge.exchange_failed", fields);
}

export async function completeBridgeSignIn(
  query: { readonly code: string | null; readonly state: string | null },
  deps: BridgeSignInDeps,
): Promise<BridgeSignInOutcome> {
  // Always consumed first, so no path below can leave a reusable state behind.
  const expected = await deps.takeState();
  if (!expected) {
    deps.logger.warn("auth.bridge.callback_rejected", { reason: "state_missing" });
    return { kind: "failed", error: "bridge" };
  }
  if (!isWellFormedBridgeToken(query.state) || !sameToken(query.state, expected.state)) {
    deps.logger.warn("auth.bridge.callback_rejected", { reason: "state_mismatch" });
    return { kind: "failed", error: "bridge" };
  }
  if (!isWellFormedBridgeToken(query.code)) {
    deps.logger.warn("auth.bridge.callback_rejected", { reason: "code_malformed" });
    return { kind: "failed", error: "bridge" };
  }

  try {
    await deps.enforceClientLimit();
  } catch (error) {
    if (deps.isRateLimited(error)) return { kind: "failed", error: "rate_limited" };
    throw error;
  }

  const exchanged = await deps.exchange(deps.config, { code: query.code, state: query.state });
  if (exchanged.kind !== "ok") {
    logExchangeFailure(deps.logger, exchanged);
    return { kind: "failed", error: exchanged.kind === "invalid_grant" ? "bridge" : "bridge_unavailable" };
  }

  try {
    await deps.enforceSubjectLimit(exchanged.subject);
  } catch (error) {
    if (deps.isRateLimited(error)) return { kind: "failed", error: "rate_limited" };
    throw error;
  }

  const result = await deps.login({
    provider: WORDPRESS_LOGIN_PROVIDER,
    externalSubject: exchanged.subject,
    emailNormalized: null,
    phoneE164: null,
    linkReason: "wordpress_bridge_login",
    supersedesSession: await deps.readSession(),
  });

  if (result.kind === "conflict") {
    deps.logger.warn("auth.bridge.identity_conflict", { conflictId: result.conflictId });
    return { kind: "failed", error: "conflict" };
  }

  await deps.setSession(result.sessionId, result.secret);
  deps.logger.info("auth.bridge.signed_in", { userId: result.userId, linkDecision: result.linkDecision });
  return { kind: "signed_in", returnPath: expected.returnPath };
}
