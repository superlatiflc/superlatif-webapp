#!/usr/bin/env node

/**
 * Proves the seeded suite produces repeatable output (GOV-002 acceptance).
 *
 * Runs the fixture digest in two independent processes and compares them byte
 * for byte. Two in-process calls could share cached state and hide a real
 * source of nondeterminism, so separate processes are the point.
 */

import { execFileSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const digestScript = path.join(root, "scripts", "fixture-digest.mjs");

const run = () => execFileSync(process.execPath, [digestScript], { encoding: "utf8" });

const first = run();
const second = run();

if (first !== second) {
  console.error(
    JSON.stringify(
      {
        status: "FAIL",
        reason: "Two runs of the fixture digest produced different output; the suite is not deterministic.",
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

const parsed = JSON.parse(first);
console.log(
  JSON.stringify(
    {
      status: "PASS",
      runs: 2,
      identical: true,
      fixtureDigest: parsed.fixtureDigest,
      seededSequenceDigest: parsed.seededSequenceDigest,
      seed: parsed.seed,
      setCount: parsed.setCount,
      caseCount: parsed.caseCount,
    },
    null,
    2,
  ),
);
