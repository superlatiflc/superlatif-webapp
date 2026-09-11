// GET /auth/bridge/start?next=/tryouts - begins WordPress bridge sign-in (M1, ADR-072).
//
// Mints the per-attempt state, stores it (with the sanitized destination) in
// an httpOnly cookie, and sends the browser to the plugin's authorize action
// on WordPress. Nothing here identifies the user and nothing is written to
// the database. 404 whenever student sign-in is not available, so a disabled
// deployment exposes no bridge surface at all.

import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { bridgeAuthorizeUrl, generateBridgeState } from "@superlatif/integrations";
import { studentLoginConfig } from "../../../../lib/bridge/config.ts";
import { sanitizeReturnPath } from "../../../../lib/bridge/return-path.ts";
import { setBridgeStateCookie } from "../../../../lib/bridge/state-cookie.ts";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  const config = studentLoginConfig();
  if (!config) return new Response(null, { status: 404 });

  const state = generateBridgeState();
  await setBridgeStateCookie({
    state,
    returnPath: sanitizeReturnPath(request.nextUrl.searchParams.get("next")),
  });
  redirect(bridgeAuthorizeUrl(config.baseUrl, config.clientId, state).toString());
}
