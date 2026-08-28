#!/usr/bin/env node

/**
 * Runs the pinned Gitleaks binary against a source tree (GOV-003, BD-08).
 *
 * Scans working-tree files, not git history: history scanning needs a full
 * checkout (CI uses actions/checkout's shallow default) and this repository's
 * history is a single controlled commit chain with no case yet of an
 * introduced-then-removed secret to search for. If that changes, widen this
 * rather than silently trusting a shallow clone's partial history.
 *
 * Usage:
 *   node scripts/scan-secrets.mjs                 # scan the repository
 *   node scripts/scan-secrets.mjs --source <path>  # scan another directory
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { ensureGitleaksInstalled } from "./install-gitleaks.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArguments(argv) {
  const options = { source: root, config: path.join(root, ".gitleaks.toml") };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--source" && argv[index + 1]) {
      options.source = path.resolve(argv[index + 1]);
      index += 1;
    }
  }
  return options;
}

export async function scanForSecrets({ source, config }) {
  const { binaryPath } = await ensureGitleaksInstalled();
  const result = spawnSync(
    binaryPath,
    ["detect", "--no-git", "--source", source, "--config", config, "--redact", "--exit-code", "1"],
    { encoding: "utf8" },
  );
  return { exitCode: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
  const options = parseArguments(process.argv.slice(2));
  scanForSecrets(options).then(({ exitCode, stdout, stderr }) => {
    if (stdout) process.stdout.write(stdout);
    if (stderr) process.stderr.write(stderr);
    process.exitCode = exitCode;
  });
}
