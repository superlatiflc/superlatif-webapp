#!/usr/bin/env node

/**
 * Migration drift guard (GOV-001, founder decision of 2026-08-28).
 *
 * P0 has no implementation schema and no migrations, so a real drift check has
 * nothing to compare. This script is therefore allowed to report
 * NOT_APPLICABLE - but only while that stays true.
 *
 * The moment an implementation schema or migration appears while the real
 * migration tooling (BD-05: drizzle generate + reviewed SQL migrate) is still
 * unconfigured, this exits non-zero. That makes a permanent no-op impossible:
 * the first P1 task that adds a schema fails CI until db:generate/db:migrate
 * are wired for real.
 *
 * contracts/drizzle-schema.ts is deliberately NOT a trigger. It is a Gate 3
 * contract artifact (21_ERD_AND_DATA_DICTIONARY.md), not implementation schema.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const IGNORED_DIRECTORIES = new Set([".git", "node_modules", "dist", "build", ".next", "coverage"]);
/** Gate 3 contract artifacts that must never be mistaken for implementation schema. */
const CONTRACT_ARTIFACTS = new Set([path.join("contracts", "drizzle-schema.ts")]);

function walk(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (IGNORED_DIRECTORIES.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute, files);
    else files.push(absolute);
  }
  return files;
}

function findTriggers() {
  const triggers = [];
  for (const absolute of walk(root)) {
    const rel = path.relative(root, absolute);
    if (CONTRACT_ARTIFACTS.has(rel)) continue;

    const base = path.basename(rel);
    const segments = rel.split(path.sep);

    if (/^drizzle\.config\.(ts|js|mjs|cjs|json)$/.test(base)) {
      triggers.push({ file: rel, reason: "migration tool configuration" });
      continue;
    }
    if (
      base.endsWith(".sql") &&
      segments.some((segment) => segment === "migrations" || segment === "drizzle")
    ) {
      triggers.push({ file: rel, reason: "SQL migration file" });
      continue;
    }
    if (segments[0] === "packages" && segments[1] === "db" && segments[2] === "src") {
      if (rel !== path.join("packages", "db", "src", "index.ts")) {
        triggers.push({ file: rel, reason: "implementation schema source" });
      }
    }
  }
  return triggers;
}

function migrationToolingConfigured() {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const generate = manifest.scripts?.["db:generate"] ?? "";
  const migrate = manifest.scripts?.["db:migrate"] ?? "";
  const isStub = (script) => script.includes("not-configured.mjs");
  return !isStub(generate) && !isStub(migrate) && generate !== "" && migrate !== "";
}

const triggers = findTriggers();
const configured = migrationToolingConfigured();

if (triggers.length === 0 && !configured) {
  console.log(
    JSON.stringify(
      {
        status: "NOT_APPLICABLE",
        reason:
          "No implementation schema or migration exists yet; BD-05 is locked at P1. This status is only valid while both remain absent.",
        triggersFound: 0,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const detail = configured
  ? "Migration tooling is now configured, so db:check must be replaced by the real generated-migration drift check (27_QA_TESTING_AND_UAT_PLAN.md §8)."
  : "Implementation schema or migration files appeared while db:generate/db:migrate are still unconfigured stubs.";

console.error(
  JSON.stringify(
    {
      status: "FAIL",
      reason: detail,
      migrationToolingConfigured: configured,
      triggersFound: triggers.length,
      triggers: triggers.slice(0, 25),
      requiredAction: [
        "Lock BD-05 (drizzle generate + reviewed SQL migrate; push local disposable only).",
        "Replace this guard with a real drift check: generated migration must match the schema.",
        "Prove the migration applies to an empty database and to the previous-version schema.",
      ],
    },
    null,
    2,
  ),
);

process.exit(1);
