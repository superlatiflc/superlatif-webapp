// Bridge log lines keep the shared logger's record shape, with no file-system dependency (ADR-072).

import { describe, expect, it } from "vitest";
import { createBridgeLogger } from "./log.ts";

describe("createBridgeLogger", () => {
  it("writes one JSON line per call in the shared {level, message, timestamp, fields} shape", () => {
    const lines: Array<[string, string]> = [];
    const logger = createBridgeLogger(
      (level, line) => lines.push([level, line]),
      () => new Date("2026-09-11T00:00:00.000Z"),
    );
    logger.info("auth.bridge.signed_in", { linkDecision: "link_existing" });
    logger.warn("auth.bridge.callback_rejected", { reason: "state_missing" });
    logger.error("auth.bridge.exchange_failed");

    expect(lines.map(([level]) => level)).toEqual(["info", "warn", "error"]);
    expect(JSON.parse(lines[0]?.[1] ?? "")).toEqual({
      level: "info",
      message: "auth.bridge.signed_in",
      timestamp: "2026-09-11T00:00:00.000Z",
      fields: { linkDecision: "link_existing" },
    });
    expect(JSON.parse(lines[2]?.[1] ?? "")).toMatchObject({ level: "error", fields: {} });
  });
});
