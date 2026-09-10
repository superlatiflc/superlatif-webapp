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
  const { sanitizeEnvViolations } = await import("./deployment-config.ts");

  const logger = createLogger();

  try {
    loadCoreEnv();
  } catch (error) {
    if (error instanceof EnvValidationError) {
      // parseEnv's messages echo raw values ("received ..."), which for a
      // malformed DATABASE_URL would be a connection string with its
      // password. Log only the sanitized form.
      logger.fatal("startup.config_invalid", {
        violations: sanitizeEnvViolations(error.violations, process.env),
      });
    } else {
      logger.fatal("startup.config_check_failed_unexpectedly", { error });
    }
    process.exit(1);
  }

  // P0-3: an enabled-but-unconfigured limiter, or a limiter switched off in
  // staging/production, must not serve unprotected. Only the message is
  // logged - never the secret, and never its length.
  //
  // process.exit below stops a long-lived `next start` server. It does NOT
  // stop a Vercel deployment (see ../../instrumentation.ts): there, the same
  // rules are enforced at build time by ./deployment-config.ts, which is what
  // actually keeps a misconfigured deployment from going live.
  try {
    const { assertRateLimitConfigured } = await import("./rate-limit.ts");
    assertRateLimitConfigured();
  } catch (error) {
    logger.fatal("startup.rate_limit_misconfigured", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    process.exit(1);
  }

  logger.info("startup.config_validated", { requiredFieldCount: CORE_REQUIRED_FOR_STARTUP.length });
}
