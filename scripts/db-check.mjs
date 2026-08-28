#!/usr/bin/env node

/**
 * Migration drift guard (IDN-001, replacing the GOV-001 placeholder).
 *
 * The GOV-001 version of this script reported NOT_APPLICABLE while no
 * implementation schema existed, and refused to become a permanent no-op by
 * design: the moment schema/migration files appeared, it started failing
 * with instructions to replace it with a real check. That moment is now.
 *
 * Real check: snapshot packages/db/drizzle/ on disk, run `drizzle-kit
 * generate` (verified to need no live database connection - it only
 * compares packages/db/src/schema against the committed migrations
 * snapshot), then snapshot again. Any difference means the schema changed
 * and `pnpm run db:generate` was not run (and its output committed) -
 * exactly the drift this guard exists to catch.
 *
 * Deliberately compares disk content before/after, not `git status`: git
 * status would also flag a migration that is merely staged-but-not-yet-
 * committed as "drift" during normal local development, which is not the
 * condition this check is for. CI always runs against a clean, fully
 * committed checkout, so disk state and commit state agree there anyway.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(root, "packages", "db", "drizzle");

function snapshotDirectory(directory) {
  if (!fs.existsSync(directory)) return {};
  const files = {};
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
        continue;
      }
      const relative = path.relative(directory, absolute);
      files[relative] = createHash("sha256").update(fs.readFileSync(absolute)).digest("hex");
    }
  };
  walk(directory);
  return files;
}

function diffSnapshots(before, after) {
  const changed = [];
  const beforeKeys = new Set(Object.keys(before));
  const afterKeys = new Set(Object.keys(after));
  for (const key of afterKeys) {
    if (!beforeKeys.has(key)) changed.push(`added: ${key}`);
    else if (before[key] !== after[key]) changed.push(`modified: ${key}`);
  }
  for (const key of beforeKeys) {
    if (!afterKeys.has(key)) changed.push(`removed: ${key}`);
  }
  return changed;
}

const before = snapshotDirectory(migrationsDir);

let generateOutput;
try {
  generateOutput = execFileSync(
    "pnpm",
    ["--filter", "@superlatif/db", "exec", "drizzle-kit", "generate", "--config", "drizzle.config.ts"],
    { cwd: root, encoding: "utf8" },
  );
} catch (error) {
  console.error(
    JSON.stringify(
      {
        status: "FAIL",
        reason: "drizzle-kit generate failed to run.",
        detail: String(error.stdout ?? error.message ?? error),
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

const after = snapshotDirectory(migrationsDir);
const changes = diffSnapshots(before, after);

if (changes.length > 0) {
  console.error(
    JSON.stringify(
      {
        status: "FAIL",
        reason:
          "packages/db/src/schema and packages/db/drizzle have drifted apart. " +
          "Run `pnpm run db:generate` and commit the result.",
        changes,
        generateOutput: generateOutput.trim(),
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "PASS",
      reason: "Generated migrations match the current schema; nothing to commit.",
    },
    null,
    2,
  ),
);
