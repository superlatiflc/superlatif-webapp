// Whether this deployment accepts commerce webhooks, and with which key (M2, ADR-074).
//
// Both required, or the webhook route answers 404 (fail closed):
//   1. FEATURE_COMMERCE_SYNC permits it (production: explicit "true", default
//      off; non-production: on unless "false" - same as every capability).
//   2. A complete configuration: the WordPress bridge client (M1) - whose
//      client ID is the webhook key ID and whose host is the catalogue `site` -
//      plus a dedicated SEJOLI_WEBHOOK_SIGNING_SECRET.
//
// PRODUCTION_WRITES_ENABLED is enforced separately, per request
// (lib/write-guard.ts#commerceWriteBlockReason): a frozen production answers
// 503 so the plugin keeps the event and retries, instead of losing it.

import { isCapabilityEnabled } from "@superlatif/contracts";
import type { CommerceWebhookProvider } from "@superlatif/integrations";
import { commerceWebhookConfigProblems } from "../deployment-config.ts";

type Env = Readonly<Record<string, string | undefined>>;

export interface CommerceWebhookConfig {
  /** The only provider this deployment accepts on the path. */
  readonly provider: CommerceWebhookProvider;
  /** WordPress host the events come from; SKU mappings are keyed by it. */
  readonly site: string;
  /** Expected X-Superlatif-Key-ID: this deployment's bridge client ID. */
  readonly keyId: string;
  readonly secret: string;
}

export function commerceWebhookConfig(env: Env = process.env): CommerceWebhookConfig | null {
  if (!isCapabilityEnabled("FEATURE_COMMERCE_SYNC", env)) return null;
  if (commerceWebhookConfigProblems(env).length > 0) return null;
  return {
    provider: "sejoli_bridge",
    site: new URL((env["WP_BRIDGE_BASE_URL"] ?? "").trim()).host,
    keyId: (env["WP_BRIDGE_CLIENT_ID"] ?? "").trim(),
    secret: env["SEJOLI_WEBHOOK_SIGNING_SECRET"] ?? "",
  };
}
