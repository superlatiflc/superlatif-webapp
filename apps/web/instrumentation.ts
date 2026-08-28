// Startup config validation (GOV-003).
//
// Next.js calls register() once, before the server starts handling requests,
// in every runtime (dev, build-time server start, and production) - see
// https://nextjs.org/docs/app/guides/instrumentation.
//
// Verified locally (`next start` with no environment set) that letting the
// validation error simply propagate is NOT enough: Next.js 16.3.3 logs the
// instrumentation failure as an unhandled rejection but leaves the HTTP
// listener open and "Ready" - a misconfigured deployment would keep
// accepting connections. That is not "fails to start", so the Node-only
// failure path (./src/lib/register-node.ts) exits the process explicitly
// rather than trusting the framework's default handling.
//
// Only the edge runtime is skipped: nothing in this repository runs on edge
// yet, and the config this validates targets the Node runtime.

export async function register(): Promise<void> {
  if (process.env["NEXT_RUNTIME"] === "edge") return;
  const { registerNode } = await import("./src/lib/register-node.ts");
  await registerNode();
}
