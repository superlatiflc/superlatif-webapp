// Deterministic entitlement rebuild and drift detection (ENT-003).
//
// dok 05 §16 invariant 1 ("Setiap effective access dapat dijelaskan oleh
// minimal satu grant aktif") and invariant 8 ("Unknown SKU atau ambiguous
// user mapping tidak memberi akses luas secara diam-diam") together shape
// this module's one hard rule: rebuild only ever REPORTS what source
// records actually support - it never grants, never widens, and its only
// "repair" action for cache drift is invalidation (force a fresh
// recompute), reusing ENT-002's own `EffectiveAccessCache.invalidateUser`
// exactly as `issueGrantAndInvalidate`/`recordGrantEventAndInvalidate`
// already do. No new grant-mutation path exists anywhere in this file.
//
// Two independent drift checks, because they detect two different classes
// of problem:
//
//   1. Cache-vs-rebuild drift (`detectEffectiveAccessDrift`) - is a cached
//      decision still consistent with what a fresh recomputation from
//      access_grants/grant_events/access_policies would say right now?
//      Self-healing: the only correction needed is invalidating the stale
//      entry, which this function does automatically - there is no human
//      decision to make, so no reconciliation case is raised for this kind.
//
//   2. Purchase-vs-grant drift (`detectPurchaseGrantDrift`) - does every
//      currently-`paid` purchase have at least one supporting grant at all
//      (dok 05 §14's Reconciliation Queue "Paid order tanpa grant"; dok 25
//      §12 "Paid active product expected to grant access unless exception
//      documented")? This is NOT self-healing - a missing grant could be a
//      real bug or a legitimately-documented exception, so this function
//      only ever raises a COM-006 `reconciliation_cases` row (case type
//      "paid_purchase_no_grant", reusing `createReconciliationCase`
//      unchanged) for a human to investigate and resolve via COM-006's own
//      `resolveReconciliationCase` - the exact same audit-trail mechanism
//      COM-006 already built, not a second one.

import {
  compareEffectiveAccessDecisions,
  effectiveAccessCacheKey,
  resolveEffectiveAccess,
  type DriftReport,
  type EffectiveAccessCache,
  type EffectiveAccessDecision,
  type EffectiveAccessOptions,
  type EffectiveAccessQuery,
} from "@superlatif/domain/access";
import type { Queryable, Schema } from "../db-types.ts";
import { listResolvableGrantsForUser } from "./effective-access-service.ts";
import { listGrantsForUser } from "./grant-repository.ts";
import {
  createReconciliationCase,
  listPurchasesForUser,
  listReconciliationCasesForPurchase,
  type ReconciliationCaseRow,
} from "../commerce/index.ts";

/**
 * Rebuilds one effective-access decision straight from source records,
 * bypassing the cache entirely - `listResolvableGrantsForUser` +
 * `resolveEffectiveAccess` are ENT-002's own, unmodified functions; this is
 * exactly what `getEffectiveAccess` does on a cache miss, exposed under its
 * own name so a caller can request it explicitly rather than incidentally.
 * Deterministic given deterministic input ordering - see
 * `grant-repository.ts#listGrantsForUser`'s explicit `ORDER BY`.
 */
export async function rebuildEffectiveAccess(
  db: Queryable<Schema>,
  userId: string,
  query: EffectiveAccessQuery,
  now: Date,
  options?: EffectiveAccessOptions,
): Promise<EffectiveAccessDecision> {
  const grants = await listResolvableGrantsForUser(db, userId, now);
  return resolveEffectiveAccess(grants, query, options);
}

/**
 * Compares whatever is currently cached against a fresh rebuild. On any
 * drift, invalidates the cache - the ONLY corrective action taken, and it
 * can only ever make the NEXT read more accurate, never wider (invalidation
 * removes a cached answer; it does not install a new one).
 */
export async function detectEffectiveAccessDrift(
  db: Queryable<Schema>,
  cache: EffectiveAccessCache,
  userId: string,
  query: EffectiveAccessQuery,
  now: Date,
  options?: EffectiveAccessOptions,
): Promise<DriftReport> {
  const key = effectiveAccessCacheKey(query);
  const cached = cache.get(userId, key, now) ?? null;
  const rebuilt = await rebuildEffectiveAccess(db, userId, query, now, options);
  const report = compareEffectiveAccessDecisions(cached, rebuilt);
  if (report.hasDrift) {
    cache.invalidateUser(userId);
  }
  return report;
}

export interface PaidPurchaseNoGrantDrift {
  readonly purchaseId: string;
  readonly externalOrderId: string;
  readonly reconciliationCaseId: string;
}

/**
 * For every currently-`paid` purchase this user has, checks whether at
 * least one grant with `sourceType === "purchase" && sourceId ===
 * purchase.id` exists at all. A purchase missing one gets a
 * `paid_purchase_no_grant` reconciliation case (COM-006's table, unchanged)
 * - idempotent: an already-open case for the same purchase is never
 * duplicated. Ordered input (`listPurchasesForUser`) makes repeated calls
 * report drift in the same order every time.
 */
export async function detectPurchaseGrantDrift(
  db: Queryable<Schema>,
  userId: string,
  now: Date,
): Promise<readonly PaidPurchaseNoGrantDrift[]> {
  const purchases = await listPurchasesForUser(db, userId);
  const paidPurchases = purchases.filter((purchase) => purchase.status === "paid");
  if (paidPurchases.length === 0) return [];

  const grants = await listGrantsForUser(db, userId);
  const grantedPurchaseIds = new Set(
    grants.filter((grant) => grant.sourceType === "purchase").map((grant) => grant.sourceId),
  );

  const drifts: PaidPurchaseNoGrantDrift[] = [];
  for (const purchase of paidPurchases) {
    if (grantedPurchaseIds.has(purchase.id)) continue;

    const existingCases = await listReconciliationCasesForPurchase(db, purchase.id);
    const alreadyOpen: ReconciliationCaseRow | undefined = existingCases.find(
      (existing) =>
        existing.caseType === "paid_purchase_no_grant" &&
        existing.status !== "resolved" &&
        existing.status !== "ignored_with_reason",
    );
    if (alreadyOpen) {
      drifts.push({
        purchaseId: purchase.id,
        externalOrderId: purchase.externalOrderId,
        reconciliationCaseId: alreadyOpen.id,
      });
      continue;
    }

    const record = await createReconciliationCase(db, {
      caseType: "paid_purchase_no_grant",
      relatedUserId: userId,
      relatedPurchaseId: purchase.id,
      evidence: {
        externalOrderId: purchase.externalOrderId,
        offerId: purchase.offerId,
        paidAt: purchase.paidAt?.toISOString() ?? null,
        detectedAt: now.toISOString(),
      },
    });
    drifts.push({
      purchaseId: purchase.id,
      externalOrderId: purchase.externalOrderId,
      reconciliationCaseId: record.id,
    });
  }
  return drifts;
}
