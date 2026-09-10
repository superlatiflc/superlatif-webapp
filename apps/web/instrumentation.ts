// Startup config validation (GOV-003).
//
// Next.js calls register() once, before the server starts handling requests,
// in every runtime (dev, build-time server start, and production) - see
// https://nextjs.org/docs/app/guides/instrumentation.
//
// WHAT THIS CAN AND CANNOT DO - corrected after the production bring-up.
//
// On a long-lived `next start` process (local, or any container host), a
// propagated error is NOT enough - Next.js 16.3.3 logs the instrumentation
// failure but leaves the listener "Ready" - so ./src/lib/register-node.ts
// exits the process explicitly, and that does stop that server.
//
// On Vercel it does NOT stop the deployment. There is no single server: this
// hook runs lazily inside each serverless function instance, after the
// deployment has already been built, promoted, and routed. Exiting one
// instance fails at most that invocation. Observed for real: a deployment
// with RATE_LIMIT_HASH_SECRET missing kept serving all day and failed only
// on the requests that needed the secret.
//
// The deployment-level gate on Vercel is therefore the BUILD - see
// ./src/lib/deployment-config.ts, enforced from ../next.config.ts. A build
// that fails never becomes Ready, and the previous deployment keeps serving.
// This hook stays as a second, runtime line of defence and as the startup log.
//
// Only the edge runtime is skipped: nothing in this repository runs on edge
// yet, and the config this validates targets the Node runtime.

export async function register(): Promise<void> {
  if (process.env["NEXT_RUNTIME"] === "edge") return;
  const { registerNode } = await import("./src/lib/register-node.ts");
  await registerNode();
}
