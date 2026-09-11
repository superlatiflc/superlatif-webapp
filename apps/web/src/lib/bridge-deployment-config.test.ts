// Build-time gate for FEATURE_STUDENT_LOGIN (M1, ADR-072): turning production
// sign-in on without a complete, safe bridge configuration fails the build.

import { describe, expect, it } from "vitest";
import {
  DeploymentConfigError,
  assertDeploymentConfig,
  deploymentConfigViolations,
  studentLoginConfigViolations,
} from "./deployment-config.ts";

const FAKE_BRIDGE_SECRET = "bridge-secret-that-must-never-appear-in-logs";

function hosted(overrides: Record<string, string | undefined> = {}) {
  return {
    VERCEL: "1",
    APP_ENV: "production",
    APP_BASE_URL: "https://app.example.com",
    ADMIN_BASE_URL: "https://admin.example.com",
    API_BASE_URL: "https://api.example.com",
    WORKER_CONCURRENCY: "2",
    LOG_LEVEL: "info",
    DATABASE_URL: "postgresql://user:pw@db.example.com:5432/postgres",
    RATE_LIMIT_HASH_SECRET: "rate-limit-hash-secret-000000",
    ...overrides,
  };
}

const COMPLETE_BRIDGE = {
  WP_BRIDGE_BASE_URL: "https://superlatif.id",
  WP_BRIDGE_CLIENT_ID: "superlatif-web-production",
  WP_BRIDGE_CLIENT_SECRET: FAKE_BRIDGE_SECRET,
};

describe("FEATURE_STUDENT_LOGIN build gate", () => {
  it("production default (flag unset): no bridge requirement, build passes", () => {
    expect(deploymentConfigViolations(hosted())).toEqual([]);
  });

  it("flag explicitly false: no bridge requirement", () => {
    expect(deploymentConfigViolations(hosted({ FEATURE_STUDENT_LOGIN: "false" }))).toEqual([]);
  });

  it("flag true without any WP_BRIDGE_* value: refuses, naming each missing variable", () => {
    const violations = studentLoginConfigViolations(hosted({ FEATURE_STUDENT_LOGIN: "true" }));
    expect(violations).toHaveLength(3);
    expect(violations.join("\n")).toMatch(/WP_BRIDGE_BASE_URL/);
    expect(violations.join("\n")).toMatch(/WP_BRIDGE_CLIENT_ID/);
    expect(violations.join("\n")).toMatch(/WP_BRIDGE_CLIENT_SECRET/);
    expect(() => assertDeploymentConfig(hosted({ FEATURE_STUDENT_LOGIN: "true" }))).toThrow(
      DeploymentConfigError,
    );
  });

  it("flag true with a complete https configuration: build passes", () => {
    expect(deploymentConfigViolations(hosted({ FEATURE_STUDENT_LOGIN: "true", ...COMPLETE_BRIDGE }))).toEqual(
      [],
    );
  });

  it("refuses a clear-text bridge URL on a hosted deployment", () => {
    const violations = studentLoginConfigViolations(
      hosted({
        FEATURE_STUDENT_LOGIN: "true",
        ...COMPLETE_BRIDGE,
        WP_BRIDGE_BASE_URL: "http://superlatif.id",
      }),
    );
    expect(violations.join("\n")).toMatch(/must use https/);
  });

  it("refuses credentials embedded in the bridge URL, without echoing them", () => {
    const violations = deploymentConfigViolations(
      hosted({
        FEATURE_STUDENT_LOGIN: "true",
        ...COMPLETE_BRIDGE,
        WP_BRIDGE_BASE_URL: `https://admin:${FAKE_BRIDGE_SECRET}@superlatif.id`,
      }),
    );
    expect(violations.join("\n")).toMatch(/must not embed credentials/);
    expect(violations.join("\n")).not.toContain(FAKE_BRIDGE_SECRET);
  });

  it("refuses a short secret and never prints it", () => {
    const shortSecret = "short-bridge-secret-123";
    const violations = deploymentConfigViolations(
      hosted({ FEATURE_STUDENT_LOGIN: "true", ...COMPLETE_BRIDGE, WP_BRIDGE_CLIENT_SECRET: shortSecret }),
    );
    expect(violations.join("\n")).toMatch(/WP_BRIDGE_CLIENT_SECRET/);
    expect(violations.join("\n")).not.toContain(shortSecret);
  });

  it("refuses an invalid client id", () => {
    const violations = studentLoginConfigViolations(
      hosted({ FEATURE_STUDENT_LOGIN: "true", ...COMPLETE_BRIDGE, WP_BRIDGE_CLIENT_ID: "Bad Client!" }),
    );
    expect(violations.join("\n")).toMatch(/WP_BRIDGE_CLIENT_ID/);
  });

  it("does not apply to local development or CI builds", () => {
    expect(deploymentConfigViolations({ FEATURE_STUDENT_LOGIN: "true" })).toEqual([]);
  });
});
