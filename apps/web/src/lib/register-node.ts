// Node-only startup validation, split out of instrumentation.ts (GOV-003).
//
// Turbopack statically scans instrumentation.ts for both the Node and Edge
// runtime bundles it may build, and warns on any Node-only API it finds in
// the file - including process.exit() - even when a runtime guard makes that
// branch unreachable on Edge. Next.js's own recommendation is to move
// Node-only logic into a file that is only ever imported when the Node
// runtime guard already passed, so the Edge bundle never parses this file at
// all. See https://nextjs.org/docs/app/guides/instrumentation.

export async function registerNode(): Promise<void> {
  const { loadCoreEnv, EnvValidationError } = await import("@superlatif/contracts");
  try {
    loadCoreEnv();
  } catch (error) {
    if (error instanceof EnvValidationError) {
      console.error(error.message);
    } else {
      console.error("Startup configuration check failed unexpectedly:", error);
    }
    process.exit(1);
  }
}
