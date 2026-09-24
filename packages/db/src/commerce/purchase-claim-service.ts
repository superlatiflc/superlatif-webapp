// Automatic claim of purchases made before the buyer's first sign-in (M2, ADR-074).
//
// A Sejoli order can reach the app before its buyer has ever signed in: the
// webhook then records the purchase with no user and an "unresolved_identity"
// reconciliation case (purchase-lifecycle-service.ts, unchanged behaviour).
// Once that buyer signs in through the WordPress bridge, their app user owns
// the `wordpress` identity for the very subject the order named (OD-02
// outcome (a): Sejoli `orders.user_id` == WordPress `users.ID`). This module
// connects the two - nothing more.
//
// WHY THIS IS SAFE WITHOUT A HUMAN:
//  - The link it relies on was created by the sign-in bridge, whose subject
//    comes only from an HMAC-signed server-to-server exchange (ADR-072).
//  - The purchase side comes only from signature-verified webhook events.
//  - It binds a purchase only when EVERY event for that order names that one
//    subject (bindUnboundPurchaseToBuyer). Anything else stays open for a
//    human.
//  - It never looks at email, name, or phone.
//
// Grants go through bindUnboundPurchaseToBuyer -> applyPurchaseStatusEffects,
// the same code a live "paid" event uses; there is no second grant path.
//
// Called from the student landing page with the signed-in user's own ID, so
// a user can only ever claim purchases naming a subject THEY own.

import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { EffectiveAccessCache } from "@superlatif/domain/access";
import { commerceProvidersForIdentityProvider } from "@superlatif/domain/identity";
import type { Schema } from "../db-types.ts";
import { listExternalIdentitiesForUser } from "../identity/repository.ts";
import { bindUnboundPurchaseToBuyer, type BindBuyerOutcome } from "./purchase-lifecycle-service.ts";
import { listUnboundPurchaseIdsForBuyer } from "./purchase-repository.ts";

export interface ClaimPurchasesOutcome {
  /** Every purchase this call looked at, with what happened to it. Empty is the common case. */
  readonly results: readonly BindBuyerOutcome[];
  readonly grantsIssued: readonly string[];
}

/**
 * Binds every still-unowned purchase whose buyer subject belongs to `userId`.
 * Idempotent and cheap when there is nothing to claim (one indexed lookup of
 * the user's identities plus one query per commerce provider).
 */
export async function claimPurchasesForUser(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  cache: EffectiveAccessCache,
  userId: string,
  now: Date,
): Promise<ClaimPurchasesOutcome> {
  const results: BindBuyerOutcome[] = [];
  const grantsIssued: string[] = [];

  for (const identity of await listExternalIdentitiesForUser(db, userId)) {
    for (const commerceProvider of commerceProvidersForIdentityProvider(identity.provider)) {
      const purchaseIds = await listUnboundPurchaseIdsForBuyer(
        db,
        commerceProvider,
        identity.externalSubject,
      );
      for (const purchaseId of purchaseIds) {
        // One transaction per purchase: one bad order never blocks the rest.
        const outcome = await db.transaction((tx) =>
          bindUnboundPurchaseToBuyer(tx, cache, purchaseId, identity.externalSubject, userId, now),
        );
        results.push(outcome);
        if (outcome.kind === "bound") grantsIssued.push(...outcome.grantsIssued);
      }
    }
  }
  return { results, grantsIssued };
}
