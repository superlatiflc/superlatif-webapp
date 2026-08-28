import { describe, expect, it } from "vitest";
import { withCorrelationId } from "./correlation.ts";
import { type LogRecord, createLogger } from "./logger.ts";

function loggerWithCapture(overrides: Parameters<typeof createLogger>[0] = {}) {
  const records: LogRecord[] = [];
  const logger = createLogger({ ...overrides, sink: (record) => records.push(record) });
  return { logger, records };
}

describe("level filtering", () => {
  it("drops records below the configured minimum level", () => {
    const { logger, records } = loggerWithCapture({ minLevel: "warn" });
    logger.info("should be dropped");
    logger.debug("should be dropped");
    logger.warn("should be kept");
    logger.error("should be kept");
    expect(records.map((r) => r.message)).toEqual(["should be kept", "should be kept"]);
  });

  it("defaults to info level", () => {
    const { logger, records } = loggerWithCapture();
    logger.debug("dropped by default");
    logger.info("kept by default");
    expect(records).toHaveLength(1);
    expect(records[0]?.message).toBe("kept by default");
  });
});

describe("every record carries a timestamp and the ambient correlation ID", () => {
  it("attaches the correlation ID established by withCorrelationId", () => {
    const { logger, records } = loggerWithCapture();
    withCorrelationId("corr-abc", () => logger.info("inside scope"));
    logger.info("outside scope");

    expect(records[0]?.correlationId).toBe("corr-abc");
    expect(records[1]?.correlationId).toBeUndefined();
    for (const record of records) {
      expect(() => new Date(record.timestamp).toISOString()).not.toThrow();
    }
  });

  it("uses an injected clock when provided, for deterministic tests", () => {
    const { logger, records } = loggerWithCapture({ now: () => new Date("2026-01-01T00:00:00.000Z") });
    logger.info("fixed time");
    expect(records[0]?.timestamp).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("logger fields are redacted before reaching the sink", () => {
  it("never lets a secret-tagged field reach the sink unredacted", () => {
    const { logger, records } = loggerWithCapture();
    logger.error("startup failed", { SESSION_SIGNING_SECRET: "super-secret-value-do-not-log" });
    const fields = records[0]?.fields as Record<string, unknown>;
    expect(fields["SESSION_SIGNING_SECRET"]).toBe("[redacted]");
    expect(JSON.stringify(records[0])).not.toContain("super-secret-value-do-not-log");
  });

  it("is undefined, not an empty object, when no fields are passed", () => {
    const { logger, records } = loggerWithCapture();
    logger.info("no fields here");
    expect(records[0]?.fields).toBeUndefined();
  });
});
