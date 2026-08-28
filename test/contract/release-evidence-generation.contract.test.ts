import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { afterEach, describe, expect, it } from "vitest";

const REPOSITORY_ROOT = path.join(import.meta.dirname, "..", "..");
const GENERATOR = path.join(REPOSITORY_ROOT, "scripts", "generate-release-evidence.mjs");
const OUTPUT_DIR = path.join(REPOSITORY_ROOT, "release-evidence");

function currentCommitSha(): string {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPOSITORY_ROOT, encoding: "utf8" }).trim();
}

afterEach(() => {
  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
});

/**
 * These fixtures must not depend on the ambient environment the test SUITE
 * itself happens to run in. An earlier version asserted releaseId matched
 * /^local-/ with the comment "no GITHUB_RUN_ID in this environment" - true
 * on a developer machine, false the moment this suite runs inside GitHub
 * Actions (where GITHUB_RUN_ID/NUMBER are always set), which is exactly
 * where pnpm run test:contract runs in CI. Fixed by explicitly controlling
 * the child process environment for both branches instead of relying on
 * whatever happened to be ambient.
 */
function runGenerator(envOverrides: Record<string, string | undefined>) {
  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  const env = { ...process.env, ...envOverrides };
  for (const [key, value] of Object.entries(envOverrides)) {
    if (value === undefined) delete env[key];
  }
  const stdout = execFileSync(process.execPath, [GENERATOR], { cwd: REPOSITORY_ROOT, encoding: "utf8", env });
  const result = JSON.parse(stdout);
  const files = fs.readdirSync(OUTPUT_DIR);
  const manifest = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, files[0] as string), "utf8"));
  return { result, manifest };
}

describe("scripts/generate-release-evidence.mjs", () => {
  it("produces a manifest keyed by the real commit SHA, with no forbidden content (local branch, forced)", () => {
    const { result, manifest } = runGenerator({
      GITHUB_RUN_ID: undefined,
      GITHUB_RUN_NUMBER: undefined,
      CI: undefined,
    });
    expect(result.status).toBe("PASS");

    expect(manifest.schemaVersion).toBe("1.0");
    expect(manifest.commitSha).toBe(currentCommitSha());
    expect(manifest.releaseId).toMatch(/^local-/);
    expect(manifest.checks.gitleaksClean).toBe(true);
    expect(Object.keys(manifest.checks)).toHaveLength(11);

    // The generator's own key rename (checks reference outcomes, not the
    // literal "secrets:scan" script name) must hold in the real output too,
    // not only in the unit-level fixture.
    expect(Object.keys(manifest.checks).some((key: string) => key.toLowerCase().includes("secret"))).toBe(
      false,
    );
  });

  it("derives releaseId from GITHUB_RUN_ID/NUMBER when present, matching the CI environment (forced)", () => {
    const { manifest } = runGenerator({ GITHUB_RUN_ID: "999888777", GITHUB_RUN_NUMBER: "42", CI: "true" });
    expect(manifest.releaseId).toBe("gh-999888777.42");
    expect(manifest.environment).toBe("ci");
  });
});
