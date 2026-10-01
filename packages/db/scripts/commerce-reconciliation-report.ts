// Commerce reconciliation report CLI (M2 launch prep). READ-ONLY.
//
// Runs every query inside a `SET TRANSACTION READ ONLY` transaction, so even a
// bug in a query cannot write. Prints JSON with Sejoli order IDs, case types,
// counts, and ages - no user ID, email, name, amount, or payload.
// Exit code 0 = OK, 2 = ATTENTION (for cron/alerting), 1 = error.
//
// Run:
//   DATABASE_URL=... node --experimental-transform-types packages/db/scripts/commerce-reconciliation-report.ts --expect-ref=<ref>

import { sql } from "drizzle-orm";
import { createDatabaseClient } from "../src/client.ts";
import { buildReconciliationReport } from "../src/commerce/reconciliation-report.ts";
import { requireTarget } from "./db-target.ts";

const { databaseUrl, ref } = requireTarget();
const handle = createDatabaseClient(databaseUrl, { maxConnections: 1 });
try {
  const report = await handle.db.transaction(async (tx) => {
    await tx.execute(sql`set transaction read only`);
    return buildReconciliationReport(tx, new Date());
  });
  console.log(JSON.stringify({ project: ref, ...report }, null, 2));
  process.exitCode = report.status === "OK" ? 0 : 2;
} finally {
  await handle.close();
}
