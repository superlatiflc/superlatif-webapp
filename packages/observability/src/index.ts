// @superlatif/observability
//
// Structured logging, redaction, correlation IDs, and the release-evidence
// manifest (GOV-004). Server/worker only: redaction.ts reads a contract file
// via node:fs, which a bundler cannot resolve for a browser target - do not
// import this package from a "use client" component.
//
// No observability vendor/exporter is chosen here; that decision belongs to
// OD-03. `LogSink` exists so a later task can point this at a real exporter
// without changing any call site.

export {
  CORRELATION_HEADER,
  attachCorrelationHeader,
  attachCorrelationToJob,
  correlationIdFromHeaders,
  getCorrelationId,
  newCorrelationId,
  tryGetCorrelationId,
  withCorrelationId,
  withJobCorrelationId,
  type CorrelatedJob,
} from "./correlation.ts";

export { REDACTED, isSensitiveKey, isSensitiveValue, redact } from "./redaction.ts";

export {
  consoleSink,
  createLogger,
  type CreateLoggerOptions,
  type LogFields,
  type LogLevel,
  type LogRecord,
  type Logger,
  type LogSink,
} from "./logger.ts";

export {
  ReleaseEvidenceRejectedError,
  createReleaseEvidenceManifest,
  serializeReleaseEvidenceManifest,
  type EvidenceClock,
  type ReleaseEvidenceInput,
  type ReleaseEvidenceManifest,
} from "./release-evidence.ts";
