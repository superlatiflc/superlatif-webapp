// Production dependencies for the commerce webhook and the landing-page claim (ADR-074). Server-only.
//
// The only file that binds the webhook to the real database, clock, and rate
// limiter, so lib/commerce/webhook.ts stays testable without any of them.

import { randomUUID } from "node:crypto";
import { commerce } from "@superlatif/db";
import { getDb, getEffectiveAccessCache } from "../db.ts";
import { RateLimitedError, enforceUnverifiedCommerceWebhookRateLimit } from "../rate-limit.ts";
import { createBridgeLogger } from "../bridge/log.ts";
import { commerceWriteBlockReason } from "../write-guard.ts";
import type { CommerceWebhookConfig } from "./config.ts";
import type { CommerceWebhookDeps } from "./webhook.ts";

export function commerceWebhookDeps(config: CommerceWebhookConfig | null): CommerceWebhookDeps {
  return {
    config,
    writesBlocked: () => commerceWriteBlockReason() !== null,
    now: () => new Date(),
    newRequestId: () => randomUUID(),
    receive: (input) => commerce.receiveCommerceEvent(getDb(), getEffectiveAccessCache(), input, new Date()),
    limitUnverified: () => enforceUnverifiedCommerceWebhookRateLimit(),
    isRateLimited: (error) => error instanceof RateLimitedError,
    // Not @superlatif/observability: see ../bridge/log.ts for why.
    logger: createBridgeLogger(),
  };
}
