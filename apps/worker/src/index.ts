// @superlatif/worker — background worker entry point.
//
// Startup config validation (GOV-003) plus structured startup logging
// (GOV-004): loadCoreEnv() is validated immediately, and either outcome is
// logged - a silent successful startup is as much an observability gap as a
// silent failure (20_TECHNICAL_ARCHITECTURE.md §17 "critical dashboards").
//
// Job runners, the transactional outbox consumer, scoring, and provider
// adapters are added by their owning backlog tasks (P1 onward). This file
// intentionally starts no work beyond validation and the startup log line.

import { CORE_REQUIRED_FOR_STARTUP, EnvValidationError, loadCoreEnv } from "@superlatif/contracts";
import { createLogger } from "@superlatif/observability";

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

export {};
