import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensureGitleaksInstalled } from "../../scripts/install-gitleaks.mjs";

const REPOSITORY_ROOT = path.join(import.meta.dirname, "..", "..");

// Built at runtime, never as one contiguous literal, anywhere in this file:
// this repository's OWN secret scan must stay clean, so an AWS-style access
// key ID this suite plants into a disposable fixture repo cannot appear as a
// static match in this file's own source. Concatenation breaks the
// contiguous byte sequence Gitleaks' regex looks for.
const FAKE_AWS_ACCESS_KEY_ID = ["AKIA", "ABCDEFGHIJKLMNOP"].join("");

const temporaryDirectories: string[] = [];

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    fs.rmSync(temporaryDirectories.pop() as string, { recursive: true, force: true });
  }
});

function createIsolatedGitRepo(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "superlatif-gitleaks-"));
  temporaryDirectories.push(directory);
  execFileSync("git", ["init", "--quiet", "--initial-branch=main"], { cwd: directory });
  execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: directory });
  execFileSync("git", ["config", "user.name", "Superlatif Contract Test"], { cwd: directory });
  return directory;
}

function commitFile(repo: string, name: string, contents: string): void {
  fs.writeFileSync(path.join(repo, name), contents);
  execFileSync("git", ["add", name], { cwd: repo });
  execFileSync("git", ["commit", "--quiet", "-m", `add ${name}`], { cwd: repo });
}

/**
 * "commit uji berisi secret palsu harus terdeteksi (di direktori/branch
 * sementara)": a fake secret is committed into an isolated, disposable git
 * repository - never into this repository's own history - and Gitleaks must
 * catch it when scanning that history.
 */
describe("a test commit containing a fake secret is detected", () => {
  it("scans an isolated repo's git history and finds the planted secret", async () => {
    const { binaryPath } = await ensureGitleaksInstalled();
    const repo = createIsolatedGitRepo();

    commitFile(repo, "README.md", "# fixture repo\n");
    commitFile(repo, "config.env", `AWS_ACCESS_KEY_ID=${FAKE_AWS_ACCESS_KEY_ID}\n`);

    const result = spawnSync(binaryPath, ["detect", "--source", repo, "--redact", "--exit-code", "1"], {
      encoding: "utf8",
    });

    expect(result.status, `combined output:\n${result.stdout}${result.stderr}`).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toMatch(/leaks found/);
  }, 60_000);

  it("does not flag the same isolated repo before the secret is committed", async () => {
    const { binaryPath } = await ensureGitleaksInstalled();
    const repo = createIsolatedGitRepo();
    commitFile(repo, "README.md", "# fixture repo\n");

    const result = spawnSync(binaryPath, ["detect", "--source", repo, "--redact", "--exit-code", "1"], {
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
  }, 60_000);

  it("never wrote the planted secret into this repository's own tree", () => {
    // The fixture directories are created under os.tmpdir(), never under
    // REPOSITORY_ROOT, and are removed in afterEach. This assertion is the
    // machine-checked version of that claim rather than a comment asserting it.
    const result = spawnSync("git", ["grep", "-l", FAKE_AWS_ACCESS_KEY_ID], {
      cwd: REPOSITORY_ROOT,
      encoding: "utf8",
    });
    expect(result.status).not.toBe(0);
    expect(result.stdout.trim()).toBe("");
  });
});
