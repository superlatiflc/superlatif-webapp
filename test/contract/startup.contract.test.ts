import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

const REPOSITORY_ROOT = path.join(import.meta.dirname, "..", "..");
const WORKER_ENTRY = path.join(REPOSITORY_ROOT, "apps", "worker", "src", "index.ts");

const VALID_CORE_ENV = {
  APP_ENV: "development",
  APP_BASE_URL: "http://localhost:3000",
  ADMIN_BASE_URL: "http://localhost:3001",
  API_BASE_URL: "http://localhost:4000",
  WORKER_CONCURRENCY: "2",
  LOG_LEVEL: "info",
};

/**
 * "Missing required config fails startup", proven against the real worker
 * entry point in a real child process - not only against the parser in
 * isolation. Uses an empty environment (PATH only) so this cannot pass by
 * accident from variables this developer machine or CI runner happens to
 * already have set.
 */
describe("worker startup fails closed on missing required config", () => {
  it("exits non-zero and reports every missing field, leaking no value", () => {
    const result = spawnSync(process.execPath, [WORKER_ENTRY], {
      env: { PATH: process.env["PATH"] ?? "" },
      encoding: "utf8",
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/APP_ENV is required/);
    expect(result.stderr).toMatch(/LOG_LEVEL is required/);
  });

  it("starts cleanly once the required fields are present", () => {
    const result = spawnSync(process.execPath, [WORKER_ENTRY], {
      env: { PATH: process.env["PATH"] ?? "", ...VALID_CORE_ENV },
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });

  it("is not fooled by an unrelated ambient variable sharing a common prefix", () => {
    // Regression: this repository's own shell (and this test's own process
    // environment) may already carry variables like API_TIMEOUT_MS that are
    // not ours. Startup must not fail because of them.
    const result = spawnSync(process.execPath, [WORKER_ENTRY], {
      env: { PATH: process.env["PATH"] ?? "", ...VALID_CORE_ENV, API_TIMEOUT_MS: "900000" },
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
  });
});

describe("no client bundle contains a Superlatif secret-tagged variable", () => {
  it("scans the built web client bundle for secret variable names", async () => {
    const fs = await import("node:fs");
    const { SECRET_ENV_NAMES } = await import("../../packages/contracts/src/env-spec.ts");

    const staticDirectory = path.join(REPOSITORY_ROOT, "apps", "web", ".next", "static");
    if (!fs.existsSync(staticDirectory)) {
      throw new Error(
        'apps/web/.next/static does not exist. This check requires a build (run "pnpm build" first); ' +
          "a check that silently skips is not evidence, per 27_QA_TESTING_AND_UAT_PLAN.md §2.",
      );
    }

    const jsFiles: string[] = [];
    const walk = (directory: string) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(absolute);
        else if (entry.name.endsWith(".js")) jsFiles.push(absolute);
      }
    };
    walk(staticDirectory);
    expect(jsFiles.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const file of jsFiles) {
      const contents = fs.readFileSync(file, "utf8");
      for (const name of SECRET_ENV_NAMES) {
        if (contents.includes(name))
          offenders.push(`${name} found in ${path.relative(REPOSITORY_ROOT, file)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no source file reads a secret-tagged variable through NEXT_PUBLIC_", async () => {
    const { SECRET_ENV_NAMES } = await import("../../packages/contracts/src/env-spec.ts");
    for (const name of SECRET_ENV_NAMES) {
      expect(name.startsWith("NEXT_PUBLIC_"), name).toBe(false);
    }
  });
});

describe("Gitleaks is pinned and finds nothing in this repository", () => {
  it("pins a specific version and a full SHA-256 digest per platform, not a floating tag", async () => {
    const { GITLEAKS_ASSETS, GITLEAKS_VERSION } = await import("../../scripts/gitleaks-pin.mjs");
    expect(GITLEAKS_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(GITLEAKS_VERSION).not.toBe("latest");
    for (const [platform, asset] of Object.entries(GITLEAKS_ASSETS)) {
      expect(asset.sha256, platform).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("scans this repository's working tree clean", () => {
    // Gitleaks logs to stderr and reserves stdout for its (here, empty)
    // report; execFileSync only captures stdout, so this needs spawnSync to
    // see both streams.
    const result = spawnSync(process.execPath, [path.join(REPOSITORY_ROOT, "scripts", "scan-secrets.mjs")], {
      encoding: "utf8",
    });
    expect(result.status, `combined output:\n${result.stdout}${result.stderr}`).toBe(0);
    expect(`${result.stdout}${result.stderr}`).toMatch(/no leaks found/);
  }, 60_000);
});
