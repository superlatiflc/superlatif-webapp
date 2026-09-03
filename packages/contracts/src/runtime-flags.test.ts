// P0-2: the flag registry must be a real runtime control, not documentation.
//
// The audit's finding was specifically that loadFlags() had no caller outside
// its own test file, so these tests are written to fail if that ever becomes
// true again: they assert on observable enforcement behaviour, not on the
// registry's shape (flags.test.ts already owns that).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CapabilityDisabledError,
  ProductionWritesDisabledError,
  assertCapabilityEnabled,
  assertProductionWritesEnabled,
  isCapabilityEnabled,
  isProductionRuntime,
  isProductionWriteAllowed,
  resetRuntimeFlagsForTests,
} from "./runtime-flags.ts";

const ORIGINAL = { ...process.env };

/** The minimum a process needs before parseEnv will validate at all. */
function baseEnv(appEnv: string): void {
  process.env["APP_ENV"] = appEnv;
  process.env["APP_BASE_URL"] = "https://app.example.com";
  process.env["ADMIN_BASE_URL"] = "https://admin.example.com";
  process.env["API_BASE_URL"] = "https://api.example.com";
  process.env["WORKER_CONCURRENCY"] = "2";
  process.env["LOG_LEVEL"] = "info";
}

beforeEach(() => {
  resetRuntimeFlagsForTests();
});

afterEach(() => {
  process.env = { ...ORIGINAL };
  resetRuntimeFlagsForTests();
});

describe("PRODUCTION_WRITES_ENABLED as a runtime kill switch", () => {
  it("blocks production writes when the flag is off", () => {
    baseEnv("production");
    process.env["PRODUCTION_WRITES_ENABLED"] = "false";
    expect(isProductionRuntime()).toBe(true);
    expect(isProductionWriteAllowed()).toBe(false);
    expect(() => assertProductionWritesEnabled("start_attempt")).toThrow(ProductionWritesDisabledError);
  });

  it("permits production writes when the flag is explicitly on", () => {
    baseEnv("production");
    process.env["PRODUCTION_WRITES_ENABLED"] = "true";
    expect(isProductionWriteAllowed()).toBe(true);
    expect(() => assertProductionWritesEnabled("start_attempt")).not.toThrow();
  });

  it("defaults production to BLOCKED when the flag is absent", () => {
    // The contract already declares defaultValue "false" and this pins that
    // a production deployment is born locked: writes open only after the
    // explicit go/no-go in dok 30 §13, never by forgetting to set a variable.
    baseEnv("production");
    delete process.env["PRODUCTION_WRITES_ENABLED"];
    expect(isProductionWriteAllowed()).toBe(false);
  });

  it("does not block non-production environments that set no flags", () => {
    // Guards against the regression that would have shipped if the switch
    // were enforced everywhere: the default is false and neither development
    // nor staging sets it, so every developer machine would have frozen.
    for (const appEnv of ["development", "staging", "test"]) {
      resetRuntimeFlagsForTests();
      process.env = { ...ORIGINAL };
      baseEnv(appEnv);
      delete process.env["PRODUCTION_WRITES_ENABLED"];
      expect(isProductionWriteAllowed(), `${appEnv} must keep working`).toBe(true);
      expect(isProductionRuntime()).toBe(false);
    }
  });

  it("carries a safe operation label and no configuration detail", () => {
    baseEnv("production");
    process.env["PRODUCTION_WRITES_ENABLED"] = "false";
    try {
      assertProductionWritesEnabled("save_answer");
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ProductionWritesDisabledError);
      const message = (error as Error).message;
      expect(message).toContain("save_answer");
      // No env var names, values, connection strings, or secrets.
      expect(message).not.toMatch(/DATABASE_URL|SECRET|postgres|true|false/i);
    }
  });
});

describe("capability flags", () => {
  it("uses the declared default in production, so a production-sensitive flag is off", () => {
    baseEnv("production");
    delete process.env["FEATURE_EXAM_ENGINE"];
    expect(isCapabilityEnabled("FEATURE_EXAM_ENGINE")).toBe(false);
    expect(() => assertCapabilityEnabled("FEATURE_EXAM_ENGINE")).toThrow(CapabilityDisabledError);
  });

  it("honours an explicit enable in production", () => {
    baseEnv("production");
    process.env["FEATURE_EXAM_ENGINE"] = "true";
    expect(isCapabilityEnabled("FEATURE_EXAM_ENGINE")).toBe(true);
  });

  it("treats an absent flag as enabled outside production, so development keeps working", () => {
    baseEnv("development");
    delete process.env["FEATURE_EXAM_ENGINE"];
    expect(isCapabilityEnabled("FEATURE_EXAM_ENGINE")).toBe(true);
  });

  it("honours an explicit disable outside production, so staging can rehearse it", () => {
    baseEnv("staging");
    expect(isCapabilityEnabled("FEATURE_EXAM_ENGINE", { FEATURE_EXAM_ENGINE: "false" })).toBe(false);
  });
});

describe("client input cannot influence the decision", () => {
  it("ignores anything that looks like caller-supplied overrides", () => {
    baseEnv("production");
    process.env["PRODUCTION_WRITES_ENABLED"] = "false";
    // Whatever a request might carry, the answer comes from the process's own
    // validated environment. There is no parameter on
    // isProductionWriteAllowed() for a caller to pass at all - this asserts
    // the shape stays that way.
    expect(isProductionWriteAllowed.length).toBe(0);
    expect(isProductionWriteAllowed()).toBe(false);

    // And a hostile "source" cannot re-enable the master switch, because the
    // switch never consults a caller-provided source.
    expect(isProductionWriteAllowed()).toBe(false);
  });

  it("capability lookup reads the flag name from the registry, not free-form input", () => {
    baseEnv("production");
    // FlagName is a closed union; an unregistered name is a compile error.
    // At runtime an unknown key would surface as a missing flag rather than
    // silently enabling anything.
    // @ts-expect-error - not a registered flag name
    expect(() => isCapabilityEnabled("NOT_A_REAL_FLAG")).toThrow();
  });
});

describe("configuration failure", () => {
  it("throws rather than assuming writes are permitted when env is invalid", () => {
    // A process that cannot determine whether writes are allowed must not
    // answer "allowed". parseEnv throws; nothing here swallows it.
    process.env = { ...ORIGINAL };
    resetRuntimeFlagsForTests();
    baseEnv("production");
    process.env["APP_ENV"] = "not-a-valid-environment";
    expect(() => isProductionWriteAllowed()).toThrow();
  });
});
