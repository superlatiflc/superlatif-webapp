#!/usr/bin/env node

/**
 * Deterministic digest of the synthetic fixture corpus plus the seeded
 * generator (GOV-002).
 *
 * 27_QA_TESTING_AND_UAT_PLAN.md §2 requires determinism to be evidence-based.
 * A digest printed by a separate process is that evidence: run it twice and the
 * output must be byte-identical, or the harness is not deterministic.
 *
 * Imports the TypeScript harness directly; Node 24 strips types natively, so
 * there is no second implementation of the fixture rules to drift out of sync.
 */

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  digest,
  fixtureCorpusDigest,
  seedFromEnvironment,
  seededRandom,
} from "../packages/testing/src/index.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const corpus = fixtureCorpusDigest(path.join(root, "test", "fixtures", "contracts"));

const seed = seedFromEnvironment(process.env);
const next = seededRandom(seed);
const sample = Array.from({ length: 64 }, () => next());

console.log(
  JSON.stringify(
    {
      fixtureDigest: corpus.digest,
      setCount: corpus.setCount,
      caseCount: corpus.caseCount,
      seed,
      seededSequenceDigest: digest(sample),
      sets: corpus.sets,
    },
    null,
    2,
  ),
);
