// Node-only startup validation, split out of instrumentation.ts (GOV-003).
//
// Turbopack statically scans instrumentation.ts for both the Node and Edge
// runtime bundles it may build, and warns on any Node-only API it finds in
// the file - including process.exit() - even when a runtime guard makes that
// branch unreachable on Edge. Next.js's own recommendation is to move
// Node-only logic into a file that is only ever imported when the Node
// runtime guard already passed, so the Edge bundle never parses this file at
// all. See https://nextjs.org/docs/app/guides/instrumentation.
//
// GOV-004 wires the structured logger here: startup is exactly the kind of
// boundary dok 20 §17's "critical dashboards" expects to observe, and a
// silent successful startup is as much a gap as a silent failure. The
// logger is created at the default "info" level rather than reading
// LOG_LEVEL from process.env directly: LOG_LEVEL itself is only trustworthy
// after loadCoreEnv() has validated it, and this is a fatal/info-only call
// site where the level threshold does not otherwise matter yet.

export async function registerNode(): Promise<void> {
  const { CORE_REQUIRED_FOR_STARTUP, EnvValidationError, loadCoreEnv } =
    await import("@superlatif/contracts");
  const { createLogger } = await import("@superlatif/observability");

  const logger = createLogger();

  try {
    loadCoreEnv();
  } catch (error) {
    if (error instanceof EnvValidationError) {
      logger.fatal("startup.config_invalid", { violations: error.violations });
    } else {
      logger.fatal("startup.config_check_failed_unexpectedly", { error });
    }
    process.exit(1);
  }

  logger.info("startup.config_validated", { requiredFieldCount: CORE_REQUIRED_FOR_STARTUP.length });
}
