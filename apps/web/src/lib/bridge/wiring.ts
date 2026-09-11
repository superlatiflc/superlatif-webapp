// Production dependencies for completeBridgeSignIn (ADR-072). Server-only.
//
// The only file that binds the bridge flow to real cookies, the real
// database, the real rate limiter, and the real WordPress exchange. Kept
// separate from sign-in.ts so the orchestration stays testable without any
// of them.

import { identity } from "@superlatif/db";
import { exchangeBridgeCode, type BridgeClientConfig } from "@superlatif/integrations";
import { createLogger } from "@superlatif/observability";
import { getDb } from "../db.ts";
import {
  RateLimitedError,
  enforceBridgeSignInRateLimit,
  enforceBridgeSubjectRateLimit,
} from "../rate-limit.ts";
import { SESSION_TTL_SECONDS, readSessionCookie, setSessionCookie } from "../session.ts";
import type { BridgeSignInDeps } from "./sign-in.ts";
import { takeBridgeStateCookie } from "./state-cookie.ts";

export function bridgeSignInDeps(config: BridgeClientConfig): BridgeSignInDeps {
  const logger = createLogger();
  return {
    config,
    takeState: takeBridgeStateCookie,
    readSession: readSessionCookie,
    setSession: setSessionCookie,
    enforceClientLimit: () => enforceBridgeSignInRateLimit(),
    enforceSubjectLimit: (subject) => enforceBridgeSubjectRateLimit(subject),
    isRateLimited: (error) => error instanceof RateLimitedError,
    exchange: (clientConfig, input) => exchangeBridgeCode(clientConfig, input),
    login: (input) =>
      identity.performDeterministicLogin(getDb(), input, {
        now: () => new Date(),
        sessionTtlSeconds: SESSION_TTL_SECONDS,
        logger,
      }),
    logger,
  };
}
