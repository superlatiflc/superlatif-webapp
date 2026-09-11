// Whether production student sign-in is offered, and with which bridge client (M1, ADR-072).
//
// Two independent conditions, both required:
//   1. FEATURE_STUDENT_LOGIN permits it (production: explicit "true"; the
//      declared default is false. Non-production: on unless set to "false",
//      the same semantics as every other capability flag).
//   2. The bridge client configuration is complete and valid.
// Missing either one means the bridge routes answer 404 and /signin never
// shows the button - fail closed, and never a half-working flow.
//
// DELIBERATELY NOT consulted: PRODUCTION_WRITES_ENABLED. Sign-in performs
// only identity/session writes; the exam/business write freeze stays exactly
// as strict as it was (lib/write-guard.ts is untouched). See ADR-072.

import { isCapabilityEnabled } from "@superlatif/contracts";
import { BRIDGE_ENVIRONMENT_PATTERN, type BridgeClientConfig } from "@superlatif/integrations";
import { bridgeClientConfigProblems } from "../deployment-config.ts";

type Env = Readonly<Record<string, string | undefined>>;

export function studentLoginConfig(env: Env = process.env): BridgeClientConfig | null {
  if (!isCapabilityEnabled("FEATURE_STUDENT_LOGIN", env)) return null;
  if (bridgeClientConfigProblems(env).length > 0) return null;
  const environment = env["APP_ENV"] ?? "development";
  if (!BRIDGE_ENVIRONMENT_PATTERN.test(environment)) return null;
  return {
    baseUrl: (env["WP_BRIDGE_BASE_URL"] ?? "").trim(),
    clientId: (env["WP_BRIDGE_CLIENT_ID"] ?? "").trim(),
    clientSecret: env["WP_BRIDGE_CLIENT_SECRET"] ?? "",
    environment,
  };
}

export function isStudentLoginAvailable(env: Env = process.env): boolean {
  return studentLoginConfig(env) !== null;
}

/** Non-secret link for the page copy: WordPress's own password recovery is the M1 recovery path. */
export function wordpressLostPasswordUrl(env: Env = process.env): string | null {
  const config = studentLoginConfig(env);
  if (!config) return null;
  const url = new URL(config.baseUrl);
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  url.pathname += "wp-login.php";
  url.search = "?action=lostpassword";
  return url.toString();
}
