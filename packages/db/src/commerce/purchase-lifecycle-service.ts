// Purchase lifecycle orchestration: normalized commerce events -> purchase
// snapshot -> access grants, with outbox delivery (COM-003).
//
// dok 23 §11's "Paid" sequence ("resolve identity and mapping; upsert
// purchase snapshot; create source grant tree; project access; resolve
// checkout intent; notify") is implemented here minus checkout-intent
// resolution (no checkout flow exists yet - COM series scope not reached)
// and minus real notification delivery (commerce_outbox records the
// obligation; nothing sends anything in this task).
//
// Two independent idempotency layers, matching COM-002's own "checked
// before the transaction opens" discipline:
//   1. `purchase_events.normalizedEventId` is unique - re-processing the
//      exact same normalized event returns its already-recorded outcome,
//      no second purchase row, no re-issued grant, no duplicate
//      reconciliation case.
//   2. `access_grants`' own (userId, sourceType, sourceKey) uniqueness
//      (ENT-001, unchanged) - `sourceType = "purchase"`, `sourceId =
//      purchase.id` (shared by every grant this purchase ever issues, so
//      refund/cancel can find and revoke exactly this purchase's grants
//      without touching any other source), `sourceKey =
//      "${purchase.id}:${componentCode}"` (one grant per product
//      component, replay-safe).
//
// Grant creation is NEVER retried automatically across a paid/failed
// boundary that regresses - @superlatif/domain/commerce#resolvePurchaseTransition
// decides that before this module ever touches a grant.

import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  InvalidValidityConfigError,
  computeValidityWindow,
  type EffectiveAccessCache,
  type ValidityConfig,
} from "@superlatif/domain/access";
import { resolvePurchaseTransition, type PurchaseState } from "@superlatif/domain/commerce";
import type { Schema } from "../db-types.ts";
import {
  issueGrantAndInvalidate,
  recordGrantEventAndInvalidate,
} from "../access/effective-access-service.ts";
import { listGrantsForUser } from "../access/grant-repository.ts";
import { findPolicyById } from "../access/policy-repository.ts";
import { findExternalIdentity } from "../identity/repository.ts";
import { findOfferById } from "./offer-repository.ts";
import { listProductComponents } from "./product-repository.ts";
import {
  findNormalizedCommerceEventById,
  type NormalizedCommerceEventRow,
} from "./commerce-event-repository.ts";
import { createOutboxEntry } from "./commerce-outbox-repository.ts";
import {
  createPurchase,
  createPurchaseEvent,
  findPurchaseByExternalOrder,
  findPurchaseEventByNormalizedEventId,
  updatePurchaseStatus,
  type PurchaseRow,
  type PurchaseTransitionOutcomeLabel,
} from "./purchase-repository.ts";
import { createReconciliationCase, type ReconciliationCaseType } from "./reconciliation-repository.ts";
import { resolveOfferForSku } from "./sku-mapping-repository.ts";

export type PurchaseLifecycleOutcome =
  | {
      readonly kind: "processed";
      readonly purchaseId: string;
      readonly transitionOutcome: PurchaseTransitionOutcomeLabel;
      readonly grantsIssued: readonly string[];
      readonly grantsRevoked: readonly string[];
    }
  /** Replay of a normalized event this function already processed - nothing new was written. */
  | { readonly kind: "already_processed"; readonly purchaseId: string; readonly purchaseEventId: string }
  | {
      readonly kind: "unresolved_identity";
      readonly purchaseId: string;
      readonly reconciliationCaseId: string;
    }
  | { readonly kind: "unresolved_sku"; readonly purchaseId: string; readonly reconciliationCaseId: string };

async function raiseReconciliation(
  tx: Parameters<typeof createReconciliationCase>[0],
  caseType: ReconciliationCaseType,
  purchase: Pick<PurchaseRow, "id" | "userId">,
  normalizedEventId: string,
  evidence: Record<string, unknown>,
): Promise<string> {
  const record = await createReconciliationCase(tx, {
    caseType,
    relatedUserId: purchase.userId,
    relatedPurchaseId: purchase.id,
    relatedNormalizedEventId: normalizedEventId,
    evidence,
  });
  await createOutboxEntry(tx, {
    purchaseId: purchase.id,
    eventType: "reconciliation_required",
    payload: { reconciliationCaseId: record.id, caseType },
  });
  return record.id;
}

export interface StatusEffects {
  readonly grantsIssued: string[];
  readonly grantsRevoked: string[];
}

/**
 * Applies the grant-side effect of a purchase reaching `status`, if any.
 * `pending`/`failed`/`expired` have none - the purchase projection update
 * (already done by the caller) is the whole effect for those.
 *
 * Exported (COM-006) so `reconciliation-repair-service.ts` can call the
 * EXACT SAME grant-issuance/revocation code a normal webhook-driven
 * transition uses, once a repair has resolved the underlying blocker
 * (SKU mapping added, identity linked) - "repair yang menyentuh grants
 * harus reuse ENT-001/ENT-002 functions, jangan bikin write path baru"
 * applied literally: no second implementation of this logic exists.
 */
export async function applyPurchaseStatusEffects(
  tx: Parameters<typeof issueGrantAndInvalidate>[0],
  cache: EffectiveAccessCache,
  purchase: PurchaseRow,
  status: PurchaseState,
  now: Date,
  normalizedEventId: string,
): Promise<StatusEffects> {
  const effects: StatusEffects = { grantsIssued: [], grantsRevoked: [] };

  if (status === "paid") {
    if (!purchase.userId) {
      await raiseReconciliation(tx, "unresolved_identity", purchase, normalizedEventId, {
        externalSkuId: purchase.externalSkuId,
      });
      return effects;
    }
    if (!purchase.offerId) {
      await raiseReconciliation(tx, "unknown_sku", purchase, normalizedEventId, {
        externalSkuId: purchase.externalSkuId,
      });
      return effects;
    }

    const offer = await findOfferById(tx, purchase.offerId);
    if (!offer) throw new Error(`applyPurchaseStatusEffects: offer ${purchase.offerId} not found`);
    const components = await listProductComponents(tx, offer.productVersionId);

    for (const component of components) {
      const policy = await findPolicyById(tx, component.accessPolicyId);
      if (!policy) continue; // defensive - the FK guarantees this in practice

      let window;
      try {
        window = computeValidityWindow(policy.config["validity"] as ValidityConfig, { issuedAt: now });
      } catch (error) {
        if (error instanceof InvalidValidityConfigError) {
          await raiseReconciliation(tx, "policy_validity_unresolvable", purchase, normalizedEventId, {
            componentCode: component.componentCode,
            message: error.message,
          });
          continue;
        }
        throw error;
      }

      const grant = await issueGrantAndInvalidate(tx, cache, {
        userId: purchase.userId,
        sourceType: "purchase",
        sourceId: purchase.id,
        sourceKey: `${purchase.id}:${component.componentCode}`,
        accessPolicyId: component.accessPolicyId,
        validFrom: window.validFrom,
        validTo: window.validTo,
      });
      effects.grantsIssued.push(grant.id);
    }

    if (effects.grantsIssued.length > 0) {
      await createOutboxEntry(tx, {
        purchaseId: purchase.id,
        eventType: "grant_issued",
        payload: { grantIds: effects.grantsIssued },
      });
    }
    return effects;
  }

  if (status === "refunded_full" || status === "cancelled") {
    if (!purchase.userId) return effects; // nothing was ever granted without a resolved user
    const grants = await listGrantsForUser(tx, purchase.userId);
    const owned = grants.filter((g) => g.sourceType === "purchase" && g.sourceId === purchase.id);
    for (const g of owned) {
      await recordGrantEventAndInvalidate(tx, cache, purchase.userId, {
        grantId: g.id,
        eventType: "revoked",
        occurredAt: now,
        reason: status === "cancelled" ? "purchase_cancelled" : "purchase_refunded_full",
        actor: { sourceType: "purchase", sourceId: purchase.id },
      });
      effects.grantsRevoked.push(g.id);
    }
    if (effects.grantsRevoked.length > 0) {
      await createOutboxEntry(tx, {
        purchaseId: purchase.id,
        eventType: "grant_revoked",
        payload: { grantIds: effects.grantsRevoked, reason: status },
      });
    }
    return effects;
  }

  if (status === "chargeback") {
    // dok 22 §18: "chargeback membuat review/suspension event ... tidak
    // otomatis menuduh siswa melakukan kecurangan" - suspend, never revoke
    // outright, and always pair it with a human-reviewed case.
    if (!purchase.userId) return effects;
    const grants = await listGrantsForUser(tx, purchase.userId);
    const owned = grants.filter((g) => g.sourceType === "purchase" && g.sourceId === purchase.id);
    for (const g of owned) {
      await recordGrantEventAndInvalidate(tx, cache, purchase.userId, {
        grantId: g.id,
        eventType: "suspended",
        occurredAt: now,
        reason: "purchase_chargeback_review",
        actor: { sourceType: "purchase", sourceId: purchase.id },
      });
      effects.grantsRevoked.push(g.id);
    }
    await raiseReconciliation(tx, "chargeback_review", purchase, normalizedEventId, {
      suspendedGrantIds: effects.grantsRevoked,
    });
    return effects;
  }

  if (status === "refunded_partial") {
    // dok 22 §18: only auto-actionable "jika provider memberi nominal/
    // line-item semantics yang dapat diverifikasi" - this task has no
    // line-item granularity (one purchase = one offer), so it can never
    // verify that. No automatic revocation; always a reviewed case.
    await raiseReconciliation(tx, "unverifiable_partial_refund", purchase, normalizedEventId, {
      amountMinor: purchase.amountMinor,
      currency: purchase.currency,
    });
    return effects;
  }

  // pending, failed, expired: no grant-side effect.
  return effects;
}

/**
 * Processes exactly one normalized commerce event into the purchase
 * lifecycle. Synchronous and transactional end to end - see this module's
 * doc and commerce-outbox-repository.ts's doc for why (no queue
 * infrastructure exists yet).
 */
export async function processPurchaseLifecycleEvent(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  cache: EffectiveAccessCache,
  normalizedEventId: string,
  now: Date,
): Promise<PurchaseLifecycleOutcome> {
  const normalizedEvent: NormalizedCommerceEventRow | null = await findNormalizedCommerceEventById(
    db,
    normalizedEventId,
  );
  if (!normalizedEvent) {
    throw new Error(`processPurchaseLifecycleEvent: normalized event ${normalizedEventId} not found`);
  }

  const alreadyProcessed = await findPurchaseEventByNormalizedEventId(db, normalizedEventId);
  if (alreadyProcessed) {
    return {
      kind: "already_processed",
      purchaseId: alreadyProcessed.purchaseId,
      purchaseEventId: alreadyProcessed.id,
    };
  }

  return db.transaction(async (tx) => {
    const incomingStatus = normalizedEvent.orderStatus as PurchaseState;
    const existing = await findPurchaseByExternalOrder(
      tx,
      normalizedEvent.provider,
      normalizedEvent.site,
      normalizedEvent.externalOrderId,
    );

    if (!existing) {
      const identity = await findExternalIdentity(
        tx,
        normalizedEvent.provider,
        normalizedEvent.externalUserId,
      );
      const mapping = await resolveOfferForSku(
        tx,
        normalizedEvent.provider,
        normalizedEvent.site,
        normalizedEvent.externalSkuId,
        normalizedEvent.occurredAt,
      );

      const purchase = await createPurchase(tx, {
        provider: normalizedEvent.provider,
        site: normalizedEvent.site,
        externalOrderId: normalizedEvent.externalOrderId,
        userId: identity?.userId ?? null,
        offerId: mapping?.offerId ?? null,
        externalSkuId: normalizedEvent.externalSkuId,
        status: incomingStatus,
        currency: normalizedEvent.currency,
        amountMinor: normalizedEvent.amountMinor,
        orderedAt: normalizedEvent.occurredAt,
        lastEventOccurredAt: normalizedEvent.occurredAt,
        paidAt: incomingStatus === "paid" ? normalizedEvent.occurredAt : null,
      });
      await createPurchaseEvent(tx, {
        purchaseId: purchase.id,
        normalizedEventId,
        status: incomingStatus,
        occurredAt: normalizedEvent.occurredAt,
        transitionOutcome: "applied",
      });

      if (!identity) {
        const caseId = await raiseReconciliation(tx, "unresolved_identity", purchase, normalizedEventId, {
          externalUserId: normalizedEvent.externalUserId,
        });
        return { kind: "unresolved_identity", purchaseId: purchase.id, reconciliationCaseId: caseId };
      }
      if (!mapping) {
        const caseId = await raiseReconciliation(tx, "unknown_sku", purchase, normalizedEventId, {
          externalSkuId: normalizedEvent.externalSkuId,
        });
        return { kind: "unresolved_sku", purchaseId: purchase.id, reconciliationCaseId: caseId };
      }

      const effects = await applyPurchaseStatusEffects(
        tx,
        cache,
        purchase,
        incomingStatus,
        now,
        normalizedEventId,
      );
      return {
        kind: "processed",
        purchaseId: purchase.id,
        transitionOutcome: "applied",
        grantsIssued: effects.grantsIssued,
        grantsRevoked: effects.grantsRevoked,
      };
    }

    const transition = resolvePurchaseTransition({
      currentStatus: existing.status as PurchaseState,
      currentOccurredAt: existing.lastEventOccurredAt,
      incomingStatus,
      incomingOccurredAt: normalizedEvent.occurredAt,
    });

    const transitionOutcome: PurchaseTransitionOutcomeLabel =
      transition.kind === "apply"
        ? "applied"
        : transition.kind === "duplicate"
          ? "ignored_duplicate"
          : "ignored_out_of_order";

    await createPurchaseEvent(tx, {
      purchaseId: existing.id,
      normalizedEventId,
      status: incomingStatus,
      occurredAt: normalizedEvent.occurredAt,
      transitionOutcome,
    });

    if (transition.kind === "stale" || transition.kind === "illegal_regression") {
      await raiseReconciliation(tx, "ambiguous_transition", existing, normalizedEventId, {
        currentStatus: existing.status,
        incomingStatus,
        reason: transition.reason,
      });
      return {
        kind: "processed",
        purchaseId: existing.id,
        transitionOutcome,
        grantsIssued: [],
        grantsRevoked: [],
      };
    }

    if (transition.kind === "duplicate") {
      await updatePurchaseStatus(tx, existing.id, {
        status: existing.status as PurchaseState,
        lastEventOccurredAt: normalizedEvent.occurredAt,
      });
      return {
        kind: "processed",
        purchaseId: existing.id,
        transitionOutcome,
        grantsIssued: [],
        grantsRevoked: [],
      };
    }

    // transition.kind === "apply". paidAt/refundedAt are only included when
    // THIS transition sets them - exactOptionalPropertyTypes means an
    // explicit `undefined` is not the same as "key absent" (leave
    // unchanged), so the milestone keys are spread in conditionally rather
    // than always present with a possibly-undefined value.
    await updatePurchaseStatus(tx, existing.id, {
      status: transition.newStatus,
      lastEventOccurredAt: normalizedEvent.occurredAt,
      ...(transition.newStatus === "paid" ? { paidAt: normalizedEvent.occurredAt } : {}),
      ...(transition.newStatus === "refunded_full" || transition.newStatus === "refunded_partial"
        ? { refundedAt: normalizedEvent.occurredAt }
        : {}),
    });

    const effects = await applyPurchaseStatusEffects(
      tx,
      cache,
      existing,
      transition.newStatus,
      now,
      normalizedEventId,
    );
    return {
      kind: "processed",
      purchaseId: existing.id,
      transitionOutcome,
      grantsIssued: effects.grantsIssued,
      grantsRevoked: effects.grantsRevoked,
    };
  });
}
