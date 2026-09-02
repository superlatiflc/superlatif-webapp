import { redirect } from "next/navigation";
import { getSessionUserId } from "../lib/session.ts";
import { resolveRootDestination } from "../lib/root-redirect.ts";

// Root route. Was the GOV-001 Phase P0 placeholder - superseded now that
// real session-cookie auth (lib/session.ts) and a canonical dashboard
// (/home) both exist. A pure server-side redirect: the session is resolved
// with the same `getSessionUserId()` every other production route already
// uses (no new auth mechanism), and `redirect()` is called before any JSX
// is returned, so nothing ever renders here - no placeholder flash, no
// client-side auth branch for a visitor to observe mid-decision.
export default async function RootPage(): Promise<never> {
  const userId = await getSessionUserId();
  redirect(resolveRootDestination(userId));
}
