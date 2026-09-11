// FEATURE_STUDENT_LOGIN availability and its relationship to the write freeze (M1, ADR-072).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isProductionWriteAllowed, resetRuntimeFlagsForTests } from "@superlatif/contracts";
import { examWriteBlockReason, examWritesPermitted } from "../write-guard.ts";
import { isStudentLoginAvailable, studentLoginConfig, wordpressLostPasswordUrl } from "./config.ts";

const ORIGINAL = { ...process.env };
const BRIDGE_SECRET = "bridge-secret-for-config-tests-0000000000";

function baseEnv(appEnv: string, extra: Record<string, string> = {}): void {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("WP_BRIDGE_") || key.startsWith("FEATURE_") || key === "PRODUCTION_WRITES_ENABLED") {
      delete process.env[key];
    }
  }
  Object.assign(process.env, {
    APP_ENV: appEnv,
    APP_BASE_URL: "https://app.example.com",
    ADMIN_BASE_URL: "https://admin.example.com",
    API_BASE_URL: "https://api.example.com",
    WORKER_CONCURRENCY: "2",
    LOG_LEVEL: "info",
    ...extra,
  });
}

const BRIDGE = {
  WP_BRIDGE_BASE_URL: "https://wp.example",
  WP_BRIDGE_CLIENT_ID: "superlatif-web-production",
  WP_BRIDGE_CLIENT_SECRET: BRIDGE_SECRET,
};

beforeEach(() => resetRuntimeFlagsForTests());
afterEach(() => {
  process.env = { ...ORIGINAL };
  resetRuntimeFlagsForTests();
});

describe("production", () => {
  it("is OFF by default, even with a complete bridge configuration", () => {
    baseEnv("production", BRIDGE);
    expect(studentLoginConfig()).toBeNull();
    expect(isStudentLoginAvailable()).toBe(false);
  });

  it("is off when explicitly false", () => {
    baseEnv("production", { ...BRIDGE, FEATURE_STUDENT_LOGIN: "false" });
    expect(studentLoginConfig()).toBeNull();
  });

  it("is on only when explicitly true AND configured, bound to this environment", () => {
    baseEnv("production", { ...BRIDGE, FEATURE_STUDENT_LOGIN: "true" });
    expect(studentLoginConfig()).toEqual({
      baseUrl: "https://wp.example",
      clientId: "superlatif-web-production",
      clientSecret: BRIDGE_SECRET,
      environment: "production",
    });
  });

  it("fails closed when enabled but the bridge is not configured", () => {
    baseEnv("production", { FEATURE_STUDENT_LOGIN: "true" });
    expect(studentLoginConfig()).toBeNull();
  });

  it("fails closed for a clear-text bridge URL", () => {
    baseEnv("production", {
      ...BRIDGE,
      FEATURE_STUDENT_LOGIN: "true",
      WP_BRIDGE_BASE_URL: "http://wp.example",
    });
    expect(studentLoginConfig()).toBeNull();
  });
});

describe("non-production (same semantics as every other capability flag)", () => {
  it("staging: available when configured and not explicitly disabled", () => {
    baseEnv("staging", { ...BRIDGE, WP_BRIDGE_CLIENT_ID: "superlatif-web-staging" });
    expect(studentLoginConfig()?.environment).toBe("staging");
  });

  it("staging: explicitly false rehearses production's disabled state", () => {
    baseEnv("staging", { ...BRIDGE, FEATURE_STUDENT_LOGIN: "false" });
    expect(studentLoginConfig()).toBeNull();
  });

  it("staging: unavailable without bridge configuration (today's Preview)", () => {
    baseEnv("staging");
    expect(studentLoginConfig()).toBeNull();
  });
});

describe("the write freeze is NOT weakened", () => {
  it("sign-in enabled + PRODUCTION_WRITES_ENABLED unset: exam writes stay blocked", () => {
    baseEnv("production", { ...BRIDGE, FEATURE_STUDENT_LOGIN: "true", FEATURE_EXAM_ENGINE: "true" });
    expect(isStudentLoginAvailable()).toBe(true);
    expect(isProductionWriteAllowed()).toBe(false);
    expect(examWriteBlockReason()).toBe("writes_disabled");
    expect(examWritesPermitted()).toBe(false);
  });

  it("sign-in enabled + PRODUCTION_WRITES_ENABLED=false: exam writes stay blocked", () => {
    baseEnv("production", { ...BRIDGE, FEATURE_STUDENT_LOGIN: "true", PRODUCTION_WRITES_ENABLED: "false" });
    expect(isStudentLoginAvailable()).toBe(true);
    expect(examWritesPermitted()).toBe(false);
  });

  it("enabling production writes does not enable sign-in (the flags are independent)", () => {
    baseEnv("production", { ...BRIDGE, PRODUCTION_WRITES_ENABLED: "true" });
    expect(isStudentLoginAvailable()).toBe(false);
  });
});

describe("recovery link", () => {
  it("points at WordPress's own lost-password flow", () => {
    baseEnv("production", { ...BRIDGE, FEATURE_STUDENT_LOGIN: "true" });
    expect(wordpressLostPasswordUrl()).toBe("https://wp.example/wp-login.php?action=lostpassword");
  });

  it("is absent when sign-in is unavailable", () => {
    baseEnv("production", BRIDGE);
    expect(wordpressLostPasswordUrl()).toBeNull();
  });
});
