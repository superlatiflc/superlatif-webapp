// POST /api/v1/integrations/commerce/{provider}/events (M2, ADR-074; dok 22 §16).
//
// Server-to-server only: the WordPress bridge plugin delivers signed Sejoli
// order events here. All decisions live in lib/commerce/webhook.ts; this file
// only reads the request (with a hard body-size cap) and writes the response.
//
// Answers 404 when FEATURE_COMMERCE_SYNC is off or the webhook is not fully
// configured - the production default - so the endpoint does not exist there.

import type { NextRequest } from "next/server";
import { COMMERCE_WEBHOOK_MAX_BODY_BYTES } from "@superlatif/integrations";
import { commerceWebhookConfig } from "../../../../../../../lib/commerce/config.ts";
import { handleCommerceWebhook } from "../../../../../../../lib/commerce/webhook.ts";
import { commerceWebhookDeps } from "../../../../../../../lib/commerce/wiring.ts";
import { readBodyWithLimit } from "../../../../../../../lib/commerce/read-body.ts";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> },
): Promise<Response> {
  const { provider } = await context.params;
  const config = commerceWebhookConfig();
  if (!config) return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });

  const body = await readBodyWithLimit(request, COMMERCE_WEBHOOK_MAX_BODY_BYTES);
  const outcome = await handleCommerceWebhook(
    { provider, header: (name) => request.headers.get(name), body },
    commerceWebhookDeps(config),
  );
  return new Response(outcome.body === null ? null : JSON.stringify(outcome.body), {
    status: outcome.status,
    headers: {
      ...outcome.headers,
      ...(outcome.body === null ? {} : { "content-type": "application/json" }),
    },
  });
}
