// Deployment-time configuration gate - regression tests.
//
// These exist because the previous safety claim ("the app refuses to start
// when misconfigured") was only ever tested on a local `next start` process
// and turned out to be false on Vercel. Every assertion here is about the
// boundary that actually holds on Vercel: the build, via next.config.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DeploymentConfigError,
  assertDeploymentConfig,
  deploymentConfigViolations,
  isDeploymentConfigEnforced,
  rateLimitConfigViolation,
  sanitizeEnvViolations,
} from "./deployment-config.ts";

// Distinctive, obviously fake values: if any of them shows up in an error
// message, the redaction failed.
const FAKE_DB_PASSWORD = "PasswordThatMustNeverAppear42";
const FAKE_HASH_SECRET = "hash-secret-that-must-never-appear-777";

function hosted(appEnv: "production" | "staging", overrides: Record<string, string | undefined> = {}) {
  return {
    VERCEL: "1",
    APP_ENV: appEnv,
    APP_BASE_URL: "https://app.example.com",
    ADMIN_BASE_URL: "https://admin.example.com",
    API_BASE_URL: "https://api.example.com",
    WORKER_CONCURRENCY: "2",
    LOG_LEVEL: "info",
    DATABASE_URL: `postgresql://postgres.exampleref:${FAKE_DB_PASSWORD}@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres`,
    RATE_LIMIT_HASH_SECRET: FAKE_HASH_SECRET,
    ...overrides,
  };
}

function assertNoSecretIn(text: string) {
  expect(text).not.toContain(FAKE_DB_PASSWORD);
  expect(text).not.toContain(FAKE_HASH_SECRET);
  expect(text).not.toMatch(/postgres(ql)?:\/\//);
}

describe("when the gate applies", () => {
  it("does not apply to local development or CI builds", () => {
    // CI's `pnpm run build` has no deployment environment at all; failing it
    // would break every pull request for a reason that has nothing to do with
    // the change.
    expect(isDeploymentConfigEnforced({})).toBe(false);
    expect(isDeploymentConfigEnforced({ APP_ENV: "development" })).toBe(false);
    expect(isDeploymentConfigEnforced({ APP_ENV: "test" })).toBe(false);
    expect(deploymentConfigViolations({})).toEqual([]);
  });

  it("applies to every Vercel build and to any staging/production environment", () => {
    expect(isDeploymentConfigEnforced({ VERCEL: "1" })).toBe(true);
    expect(isDeploymentConfigEnforced({ APP_ENV: "staging" })).toBe(true);
    expect(isDeploymentConfigEnforced({ APP_ENV: "production" })).toBe(true);
  });
});

describe("complete configurations pass", () => {
  it.each(["production", "staging"] as const)("%s", (appEnv) => {
    expect(deploymentConfigViolations(hosted(appEnv))).toEqual([]);
    expect(() => assertDeploymentConfig(hosted(appEnv))).not.toThrow();
  });

  it("Vercel's own system variables are not mistaken for typos of declared ones", () => {
    // parseEnv flags unknown names that are close to declared ones. These are
    // the variables Vercel actually injected into this project's builds
    // (observed during the production bring-up); none may trip it.
    const vercelSystem = {
      CI: "1",
      NX_DAEMON: "false",
      TURBO_CACHE: "remote:rw",
      TURBO_DOWNLOAD_LOCAL_ENABLED: "true",
      TURBO_REMOTE_ONLY: "true",
      TURBO_RUN_SUMMARY: "true",
      VERCEL_ENV: "production",
      VERCEL_TARGET_ENV: "production",
      VERCEL_URL: "example-abc123.vercel.app",
      VERCEL_GIT_PROVIDER: "github",
      VERCEL_GIT_REPO_SLUG: "superlatif-webapp",
      VERCEL_GIT_REPO_OWNER: "superlatiflc",
      VERCEL_GIT_REPO_ID: "123",
      VERCEL_GIT_COMMIT_REF: "main",
      VERCEL_GIT_COMMIT_SHA: "d188813",
      VERCEL_GIT_COMMIT_MESSAGE: "msg",
      VERCEL_GIT_COMMIT_AUTHOR_LOGIN: "someone",
      VERCEL_GIT_COMMIT_AUTHOR_NAME: "Someone",
      VERCEL_GIT_PREVIOUS_SHA: "abc",
      VERCEL_GIT_PULL_REQUEST_ID: "",
      VERCEL_OIDC_TOKEN: "oidc-token-placeholder",
    };
    expect(deploymentConfigViolations(hosted("production", vercelSystem))).toEqual([]);
  });
});

describe("incomplete security configuration is rejected", () => {
  it("missing RATE_LIMIT_HASH_SECRET in production", () => {
    const v = deploymentConfigViolations(hosted("production", { RATE_LIMIT_HASH_SECRET: undefined }));
    expect(v.join("\n")).toMatch(/RATE_LIMIT_HASH_SECRET is missing/);
  });

  it("missing RATE_LIMIT_HASH_SECRET in staging - the exact misconfiguration that shipped", () => {
    const v = deploymentConfigViolations(hosted("staging", { RATE_LIMIT_HASH_SECRET: undefined }));
    expect(v.join("\n")).toMatch(/RATE_LIMIT_HASH_SECRET is missing/);
  });

  it("a hash secret shorter than 16 characters", () => {
    const v = deploymentConfigViolations(hosted("production", { RATE_LIMIT_HASH_SECRET: "tooshort" }));
    expect(v.join("\n")).toMatch(/shorter than 16/);
  });

  it("the limiter switched off in staging or production", () => {
    for (const appEnv of ["staging", "production"] as const) {
      const v = deploymentConfigViolations(hosted(appEnv, { RATE_LIMIT_ENABLED: "false" }));
      expect(v.join("\n")).toMatch(/RATE_LIMIT_ENABLED=false is not permitted/);
    }
  });

  it("a staging/production deployment without DATABASE_URL", () => {
    const v = deploymentConfigViolations(hosted("production", { DATABASE_URL: undefined }));
    expect(v.join("\n")).toMatch(/DATABASE_URL is required/);
  });

  it("a Vercel deployment running as development", () => {
    // What the old staging deployment could have been: publicly hosted but
    // behaving like a laptop, with the hard-coded development rate-limit key.
    const v = deploymentConfigViolations(hosted("production", { APP_ENV: "development" }));
    expect(v.join("\n")).toMatch(/APP_ENV must be "staging" or "production" on a Vercel deployment/);
  });

  it("a missing core variable", () => {
    const v = deploymentConfigViolations(hosted("production", { APP_BASE_URL: undefined }));
    expect(v.join("\n")).toMatch(/APP_BASE_URL is required/);
  });

  it("throws a DeploymentConfigError listing every violation", () => {
    try {
      assertDeploymentConfig(
        hosted("production", { RATE_LIMIT_HASH_SECRET: undefined, DATABASE_URL: undefined }),
      );
      throw new Error("expected a DeploymentConfigError");
    } catch (error) {
      expect(error).toBeInstanceOf(DeploymentConfigError);
      expect((error as DeploymentConfigError).violations.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("no secret value ever appears in the output", () => {
  it("a malformed DATABASE_URL and a short secret are reported without their values", () => {
    // parseEnv would say: DATABASE_URL must be a valid URL, received "<the
    // whole string>" - which here contains a password.
    const env = hosted("production", {
      DATABASE_URL: `not a url postgresql://postgres.exampleref:${FAKE_DB_PASSWORD}@host:6543/postgres`,
      RATE_LIMIT_HASH_SECRET: "short-secret-1",
    });
    try {
      assertDeploymentConfig(env);
      throw new Error("expected a DeploymentConfigError");
    } catch (error) {
      const text = (error as Error).message + "\n" + (error as DeploymentConfigError).violations.join("\n");
      expect(text).toMatch(/DATABASE_URL must be a valid URL/);
      assertNoSecretIn(text);
      expect(text).not.toContain("short-secret-1");
    }
  });

  it("the sanitizer strips parseEnv's `received` tails and secret values wherever they occur", () => {
    const out = sanitizeEnvViolations(
      [
        `DATABASE_URL must be a valid URL, received "postgresql://u:${FAKE_DB_PASSWORD}@h/db"`,
        `LOG_LEVEL must be one of [debug, info], received "verbose"`,
        `something mentioned ${FAKE_HASH_SECRET} in passing`,
      ],
      { RATE_LIMIT_HASH_SECRET: FAKE_HASH_SECRET },
    );
    expect(out[0]).toBe("DATABASE_URL must be a valid URL");
    expect(out[1]).toBe("LOG_LEVEL must be one of [debug, info]");
    expect(out[2]).toBe("something mentioned [redacted] in passing");
    assertNoSecretIn(out.join("\n"));
  });
});

describe("the rule is shared with the request path", () => {
  it("matches what rate-limit.ts enforces per request", () => {
    expect(rateLimitConfigViolation({ APP_ENV: "development" })).toBeNull();
    expect(rateLimitConfigViolation({ APP_ENV: "development", RATE_LIMIT_ENABLED: "false" })).toBeNull();
    expect(rateLimitConfigViolation({ APP_ENV: "production" })).toMatch(/missing/);
    expect(
      rateLimitConfigViolation({ APP_ENV: "production", RATE_LIMIT_HASH_SECRET: FAKE_HASH_SECRET }),
    ).toBeNull();
  });
});

describe("next.config.ts enforces the gate on every build", () => {
  // Behavioural, not structural: importing the config module is exactly what
  // `next build` does, so this proves a misconfigured hosted build fails.
  const ORIGINAL = { ...process.env };
  beforeEach(() => vi.resetModules());
  afterEach(() => {
    process.env = { ...ORIGINAL };
  });

  it("refuses a Vercel production build with no RATE_LIMIT_HASH_SECRET", async () => {
    process.env = { ...ORIGINAL, ...hosted("production", { RATE_LIMIT_HASH_SECRET: undefined }) };
    delete process.env["RATE_LIMIT_HASH_SECRET"];
    // vi.resetModules() gives next.config.ts its own copy of
    // deployment-config.ts, so compare by name rather than class identity.
    await expect(import("../../next.config.ts")).rejects.toMatchObject({
      name: "DeploymentConfigError",
      message: expect.stringContaining("RATE_LIMIT_HASH_SECRET is missing"),
    });
  });

  it("accepts a complete Vercel production build", async () => {
    process.env = { ...ORIGINAL, ...hosted("production") };
    const config = (await import("../../next.config.ts")).default;
    expect(config.poweredByHeader).toBe(false);
  });

  it("does not interfere with a local or CI build", async () => {
    process.env = { ...ORIGINAL };
    delete process.env["VERCEL"];
    delete process.env["APP_ENV"];
    await expect(import("../../next.config.ts")).resolves.toBeDefined();
  });
});
