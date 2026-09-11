// GET /auth/bridge/callback?code=...&state=... - WordPress sends the browser here (M1, ADR-072).
//
// The contract's `POST /auth/bridge/exchange` (contracts/openapi.yaml) is the
// JSON form of the same exchange for a future API client. The browser flow
// lands here as a top-level redirect, so the web implementation is this GET,
// with `returnPath` carried server-side in the state cookie instead of being
// accepted from the request. Same semantics; see ADR-072.
//
// DELIBERATELY NOT write-guarded by PRODUCTION_WRITES_ENABLED: it performs
// only identity/session writes, gated instead by FEATURE_STUDENT_LOGIN. It
// imports nothing from the exam, attempt, commerce, or entitlement code, and
// a structural test keeps it that way.

import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { studentLoginConfig } from "../../../../lib/bridge/config.ts";
import { completeBridgeSignIn } from "../../../../lib/bridge/sign-in.ts";
import { bridgeSignInDeps } from "../../../../lib/bridge/wiring.ts";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  const config = studentLoginConfig();
  if (!config) return new Response(null, { status: 404 });

  const params = request.nextUrl.searchParams;
  const outcome = await completeBridgeSignIn(
    { code: params.get("code"), state: params.get("state") },
    bridgeSignInDeps(config),
  );
  if (outcome.kind === "failed") redirect(`/signin?error=${outcome.error}`);
  redirect(outcome.returnPath);
}
