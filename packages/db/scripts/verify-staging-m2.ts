// Read-only evidence for the M2 staging end-to-end test (ADR-074).
//
// For one Sejoli order it prints: the purchase projection (status, whether a
// buyer is bound), every event the app recorded for it and how each was
// applied, the purchase's grants and their status, the buyer's EFFECTIVE
// access to TO-STG-M2, and any reconciliation cases. Writes nothing.
//
// Prints no secret, email, amount, or name; user IDs are shortened.
//
// Run: node packages/db/scripts/verify-staging-m2.ts --order=<Sejoli order ID> [--site=wp-staging.superlatif.id]
// DATABASE_URL must point at STAGING.

import { createInMemoryEffectiveAccessCache } from "@superlatif/domain/access";
import { createDatabaseClient } from "../src/client.ts";
import { getEffectiveAccess } from "../src/access/effective-access-service.ts";
import { listGrantEvents, listGrantsForUser } from "../src/access/grant-repository.ts";
import { examBatchTargetRef } from "../src/exam/batch/index.ts";
import { findPurchaseByExternalOrder, listPurchaseEvents } from "../src/commerce/purchase-repository.ts";
import { listReconciliationCasesForPurchase } from "../src/commerce/reconciliation-repository.ts";

if (process.env["APP_ENV"] === "production") throw new Error("verify-staging-m2 refuses APP_ENV=production");
const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl) throw new Error("DATABASE_URL is required (staging)");

const argument = (name: string) =>
  process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const order = argument("order");
if (!order || !/^[1-9][0-9]{0,19}$/.test(order)) throw new Error("--order=<Sejoli order ID> is required");
const site = argument("site") ?? "wp-staging.superlatif.id";

const short = (id: string | null) => (id ? `${id.slice(0, 8)}…` : null);
const handle = createDatabaseClient(databaseUrl, { maxConnections: 2 });

try {
  const db = handle.db;
  const now = new Date();
  const purchase = await findPurchaseByExternalOrder(db, "sejoli_bridge", site, order);
  if (!purchase) {
    console.log(
      JSON.stringify(
        { order, site, purchase: null, note: "no event for this order has been processed" },
        null,
        2,
      ),
    );
  } else {
    const events = (await listPurchaseEvents(db, purchase.id)).sort(
      (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime(),
    );
    const grants = purchase.userId
      ? (await listGrantsForUser(db, purchase.userId)).filter(
          (g) => g.sourceType === "purchase" && g.sourceId === purchase.id,
        )
      : [];
    const access = purchase.userId
      ? await getEffectiveAccess(
          db,
          createInMemoryEffectiveAccessCache(),
          purchase.userId,
          { targetType: "exam_batch", targetRef: examBatchTargetRef("TO-STG-M2"), action: "start_attempt" },
          now,
        )
      : null;
    const cases = await listReconciliationCasesForPurchase(db, purchase.id);
    const grantHistory = await Promise.all(
      grants.map(async (g) => ({
        id: short(g.id),
        component: g.sourceKey.split(":")[1],
        events: (await listGrantEvents(db, g.id)).map((e) => e.eventType),
      })),
    );
    console.log(
      JSON.stringify(
        {
          order,
          site,
          purchase: {
            status: purchase.status,
            buyerBound: purchase.userId !== null,
            buyer: short(purchase.userId),
            mappedToOffer: purchase.offerId !== null,
            paidAt: purchase.paidAt,
            refundedAt: purchase.refundedAt,
          },
          events: events.map((e) => ({
            status: e.status,
            occurredAt: e.occurredAt,
            outcome: e.transitionOutcome,
          })),
          grants: grantHistory,
          effectiveAccessToM2Batch: access
            ? { allowed: access.allowed, reasonCode: access.reasonCode }
            : null,
          reconciliationCases: cases.map((c) => ({ type: c.caseType, status: c.status })),
        },
        null,
        2,
      ),
    );
  }
} finally {
  await handle.close();
}
