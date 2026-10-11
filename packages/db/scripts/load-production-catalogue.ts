// Production catalogue loader CLI (M2 launch prep, ADR-074).
//
// DRY RUN BY DEFAULT: validates the spec and prints, per Sejoli product, what
// would happen (create / exists / conflict / blocked). Nothing is written.
//
// Writing requires ALL of:
//   --apply
//   --expect-ref=<ref>        DATABASE_URL must point at exactly this project
//   --confirm=APPLY-<ref>     typed confirmation naming the same project
// and a clean plan (no conflict, no blocked product). Every product is then
// written in one transaction, or nothing is.
//
// It creates catalogue records only (policy, product, offer, SKU mapping):
// no grant, no purchase, no user. See packages/db/src/commerce/catalogue-loader.ts.
//
// Run (dry run):
//   DATABASE_URL=... node --experimental-transform-types packages/db/scripts/load-production-catalogue.ts \
//     --file=catalogue.json --expect-ref=<ref>

import { readFileSync } from "node:fs";
import { createDatabaseClient } from "../src/client.ts";
import { applyCatalogue, parseCatalogueSpec, planCatalogue } from "../src/commerce/catalogue-loader.ts";
import { argument, flag, requireTarget } from "./db-target.ts";

const file = argument("file");
if (!file) throw new Error("--file=<catalogue.json> is required");
const parsed = parseCatalogueSpec(JSON.parse(readFileSync(file, "utf8")));
if (!parsed.ok) {
  console.error(JSON.stringify({ valid: false, errors: parsed.errors }, null, 2));
  process.exit(1);
}

const { databaseUrl, ref } = requireTarget();
const apply = flag("apply");
if (apply && argument("confirm") !== `APPLY-${ref}`) {
  throw new Error(`--apply also needs --confirm=APPLY-${ref}`);
}

const handle = createDatabaseClient(databaseUrl, { maxConnections: 2 });
try {
  const now = new Date();
  const plan = await planCatalogue(handle.db, parsed.spec, now);
  console.log(
    JSON.stringify(
      { project: ref, site: parsed.spec.site, mode: apply ? "apply" : "dry-run", plan },
      null,
      2,
    ),
  );
  if (!apply) {
    console.log(
      plan.applicable
        ? "Dry run OK: re-run with --apply and --confirm to write."
        : "Plan NOT applicable: fix the items above first.",
    );
  } else {
    const applied = await applyCatalogue(handle.db, parsed.spec, now);
    console.log(JSON.stringify({ applied }, null, 2));
  }
} finally {
  await handle.close();
}
