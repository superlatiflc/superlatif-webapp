#!/usr/bin/env node

/**
 * Generates a release evidence manifest (GOV-004, BD-06).
 *
 * ADR-042/044 lock the two-tier evidence location: a GitHub Actions artifact
 * for CI evidence (this script's output, uploaded by ci.yml), plus a
 * separate private repository `superlatif-ops-evidence` (founder +
 * engineering lead only) as the restricted operational record, keyed by
 * release ID and commit SHA. This script produces the CI-artifact half only:
 * it never creates, clones, or pushes to that private repository - that is
 * an operator action outside this codebase's authority.
 *
 * P0 has no real release/deploy pipeline, so `releaseId` is derived from the
 * CI run identity (or a local timestamp outside CI) rather than a fabricated
 * production release scheme. Most of 27_QA_TESTING_AND_UAT_PLAN.md §16's
 * evidence bundle (security/accessibility/load/soak/migration reports) does
 * not exist yet at P0 - this script does not invent placeholder content for
 * those fields. Only what genuinely exists is recorded.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  createReleaseEvidenceManifest,
  serializeReleaseEvidenceManifest,
} from "../packages/observability/src/release-evidence.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function commitSha() {
  if (process.env["GITHUB_SHA"]) return process.env["GITHUB_SHA"];
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
}

function releaseId() {
  const runId = process.env["GITHUB_RUN_ID"];
  const runNumber = process.env["GITHUB_RUN_NUMBER"];
  if (runId && runNumber) return `gh-${runId}.${runNumber}`;
  return `local-${new Date().toISOString().replace(/[:.]/g, "-")}`;
}

function environment() {
  if (process.env["CI"] === "true") return "ci";
  return process.env["APP_ENV"] ?? "local";
}

/**
 * What actually ran in this pipeline before this step, per ci.yml's fixed
 * step order. Nothing here is re-executed. Keys describe the OUTCOME, not
 * the internal script name: a script literally named "secrets:scan" would
 * otherwise be rejected by this manifest's own forbidden-content check,
 * because it contains the substring "secret" - an early version of this
 * script hit exactly that.
 */
const CI_CHECKS_THAT_PRECEDE_THIS_STEP = {
  "format:check": "formattingClean",
  lint: "lintAndBoundariesClean",
  typecheck: "typesClean",
  build: "buildSucceeded",
  "secrets:scan": "gitleaksClean",
  "test:unit": "unitTestsPassed",
  "test:contract": "contractTestsPassed",
  "contracts:validate": "contractArtifactsValid",
  "check:determinism": "fixtureDeterminismVerified",
  "db:check": "migrationGuardPassed",
  "validate:starter": "starterBundleValid",
};

const manifest = createReleaseEvidenceManifest({
  releaseId: releaseId(),
  commitSha: commitSha(),
  environment: environment(),
  checks: Object.fromEntries(Object.values(CI_CHECKS_THAT_PRECEDE_THIS_STEP).map((name) => [name, true])),
  notes:
    "P0 foundation evidence. Records that the listed checks passed earlier in this same pipeline run; " +
    "does not re-execute them. Security/accessibility/load/soak/migration reports do not exist yet - " +
    "Gate A-D in planning/release-gates.json remain open regardless of this manifest. The restricted " +
    "operational record (superlatif-ops-evidence, BD-06) is populated by an operator, not this script.",
});

const outDir = path.join(root, ".release-evidence");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `release-evidence-${manifest.releaseId}.json`);
fs.writeFileSync(outFile, serializeReleaseEvidenceManifest(manifest));

console.log(
  JSON.stringify(
    {
      status: "PASS",
      file: path.relative(root, outFile),
      releaseId: manifest.releaseId,
      commitSha: manifest.commitSha,
    },
    null,
    2,
  ),
);
