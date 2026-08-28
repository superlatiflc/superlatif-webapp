// Structured logger (GOV-004).
//
// 20_TECHNICAL_ARCHITECTURE.md §17: "Logs: structured, redacted, correlation
// IDs." Emits newline-delimited JSON. Chooses no vendor/exporter - that
// decision belongs to OD-03; `sink` exists precisely so a later task can
// point this at a real exporter without changing call sites.

import { tryGetCorrelationId } from "./correlation.ts";
import { redact } from "./redaction.ts";

export type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace";

/** Matches the LOG_LEVEL enum in packages/contracts/src/env-spec.ts. */
const LEVEL_RANK: Record<LogLevel, number> = { fatal: 0, error: 1, warn: 2, info: 3, debug: 4, trace: 5 };

export type LogFields = Record<string, unknown>;

export interface LogRecord {
  readonly level: LogLevel;
  readonly message: string;
  readonly timestamp: string;
  readonly correlationId: string | undefined;
  readonly fields: unknown;
}

export type LogSink = (record: LogRecord) => void;

/** Default sink: redacted newline-delimited JSON to stdout, errors to stderr. */
export const consoleSink: LogSink = (record) => {
  const line = JSON.stringify(record);
  // console.error/console.warn are allowed by eslint.config.mjs; console.log
  // needs an explicit exception because this module is the designated sink.
  if (LEVEL_RANK[record.level] <= LEVEL_RANK.error) {
    console.error(line);
  } else {
    // eslint-disable-next-line no-console -- this module is the log sink itself
    console.log(line);
  }
};

export interface Logger {
  fatal(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  debug(message: string, fields?: LogFields): void;
  trace(message: string, fields?: LogFields): void;
}

export interface CreateLoggerOptions {
  readonly minLevel?: LogLevel;
  readonly sink?: LogSink;
  /** Injectable for deterministic tests; defaults to the real wall clock. */
  readonly now?: () => Date;
}

export function createLogger(options: CreateLoggerOptions = {}): Logger {
  const minLevel = options.minLevel ?? "info";
  const sink = options.sink ?? consoleSink;
  const now = options.now ?? (() => new Date());
  const minRank = LEVEL_RANK[minLevel];

  const log = (level: LogLevel, message: string, fields?: LogFields): void => {
    if (LEVEL_RANK[level] > minRank) return;
    sink({
      level,
      message,
      timestamp: now().toISOString(),
      correlationId: tryGetCorrelationId(),
      fields: fields !== undefined ? redact(fields) : undefined,
    });
  };

  return {
    fatal: (message, fields) => log("fatal", message, fields),
    error: (message, fields) => log("error", message, fields),
    warn: (message, fields) => log("warn", message, fields),
    info: (message, fields) => log("info", message, fields),
    debug: (message, fields) => log("debug", message, fields),
    trace: (message, fields) => log("trace", message, fields),
  };
}
