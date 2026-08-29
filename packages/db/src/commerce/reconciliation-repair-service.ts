// Commerce reconciliation repair (COM-006).
//
// dok 30 §10.1 "Paid order but no access" playbook, taken literally:
// "Create/assign case; replay known event only through idempotent command"
// and "fix mapping/adapter, replay affected event range by provider key,
// rebuild access." This module IS that "idempotent command" - it never
// re-runs commerce-event-service.ts's ingestCommerceEvent or
// purchase-lifecycle-service.ts's processPurchaseLifecycleEvent (both are
// already permanently consumed for a given normalizedEventId, by design -
// COM-002/COM-003's own idempotency layers), and it never re-implements
// grant issuance/revocation - every grant mutation below calls
// purchase-lifecycle-service.ts's exported `applyPurchaseStatusEffects`
// (which itself calls ENT-001/ENT-002's issueGrantAndInvalidate/
// recordGrantEventAndInvalidate, unchanged) or those wrapper functions
// directly. This module's own job is narrow: decide whether the ORIGINAL
// blocker (unresolved SKU/identity, an ambiguous transition, a chargeback
// awaiting review) can now be cleared, and if so, drive the existing
// machinery through it exactly once.
//
// Authorization reuses IDN-004's existing permission matrix as-is - no
// change to permissions.ts. `reconciliation.manage` already carries
// `level: "granted"` for operations_admin/finance_reconciliation/
// super_admin and `level: "scoped_nuance"` (not a full grant, so
// authorize() denies with ROLE_DENIED) for academic_admin/support. This
// task did not need to add or widen a single permission cell.

import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { authorize } from "@superlatif/domain/authorization";
import type { EffectiveAccessCache } from "@superlatif/domain/access";
import type { PurchaseState } from "@superlatif/domain/commerce";
import type { Schema } from "../db-types.ts";
import { listActiveRoleHoldings } from "../authorization/index.ts";
import { recordGrantEventAndInvalidate } from "../access/effective-access-service.ts";
import { findExternalIdentity } from "../identity/repository.ts";
import { resolveOfferForSku } from "./sku-mapping-repository.ts";
import { findNormalizedCommerceEventById } from "./commerce-event-repository.ts";
import { applyPurchaseStatusEffects } from "./purchase-lifecycle-service.ts";
import { findPurchaseById, updatePurchaseStatus, type PurchaseRow } from "./purchase-repository.ts";
import {
  assignReconciliationCase,
  findReconciliationCaseById,
  isTerminalReconciliationStatus,
  resolveReconciliationCase,
  type ReconciliationCaseRow,
} from "./reconciliation-repository.ts";

export class ReconciliationRepairReasonRequiredError extends Error {
  constructor() {
    super("A reason is required to repair a reconciliation case");
    this.name = "ReconciliationRepairReasonRequiredError";
  }
}

export class ReconciliationRepairNotAuthorizedError extends Error {
  constructor(reasonCode: string) {
    super(`Actor is not authorized to repair reconciliation cases (${reasonCode})`);
    this.name = "ReconciliationRepairNotAuthorizedError";
  }
}

export class ReconciliationCaseNotFoundError extends Error {
  constructor(caseId: string) {
    super(`Reconciliation case ${caseId} not found`);
    this.name = "ReconciliationCaseNotFoundError";
  }
}

/** ambiguous_transition and chargeback_review require an explicit human call - repair can never guess which way to resolve an ambiguity. */
export class ReconciliationRepairDecisionRequiredError extends Error {
  constructor(caseId: string, caseType: string) {
    super(`Case ${caseId} (${caseType}) requires an explicit decision ("apply" or "reject") to repair`);
    this.name = "ReconciliationRepairDecisionRequiredError";
  }
}

export interface RepairReconciliationCaseInput {
  readonly caseId: string;
  readonly actorUserId: string;
  readonly reason: string;
  /** Required only for ambiguous_transition/chargeback_review - "apply" forces the pending transition/chargeback through, "reject" resolves the case with no purchase/grant mutation. */
  readonly decision?: "apply" | "reject";
}

export type RepairOutcome =
  | {
      readonly kind: "repaired";
      readonly caseId: string;
      readonly grantsIssued: readonly string[];
      readonly grantsRevoked: readonly string[];
      readonly grantsReinstated: readonly string[];
    }
  /** ambiguous_transition/chargeback_review explicitly rejected - case resolved as "ignored_with_reason", nothing touched. */
  | { readonly kind: "rejected"; readonly caseId: string }
  /** The underlying blocker is still present (SKU still unmapped, identity still unlinked) - case stays open, nothing mutated. */
  | { readonly kind: "still_blocked"; readonly caseId: string; readonly reason: string }
  /** Idempotent replay: this case was already resolved by an earlier repair call - returned as-is, nothing re-touched. */
  | { readonly kind: "already_resolved"; readonly caseId: string; readonly resolvedAt: Date }
  | { readonly kind: "unsupported_case_type"; readonly caseId: string; readonly caseType: string };

const NO_EFFECTS = { grantsIssued: [] as string[], grantsRevoked: [] as string[] };

async function repairUnknownSku(
  tx: PgDatabase<PgQueryResultHKT, Schema>,
  cache: EffectiveAccessCache,
  kase: ReconciliationCaseRow,
  purchase: PurchaseRow,
  now: Date,
): Promise<RepairOutcome> {
  const mapping = await resolveOfferForSku(
    tx,
    purchase.provider,
    purchase.site,
    purchase.externalSkuId,
    purchase.orderedAt,
  );
  if (!mapping) {
    return { kind: "still_blocked", caseId: kase.id, reason: "SKU still unmapped" };
  }
  await updatePurchaseStatus(tx, purchase.id, {
    status: purchase.status as PurchaseState,
    lastEventOccurredAt: purchase.lastEventOccurredAt,
    offerId: mapping.offerId,
  });
  const updated: PurchaseRow = { ...purchase, offerId: mapping.offerId };
  const effects =
    purchase.status === "paid"
      ? await applyPurchaseStatusEffects(tx, cache, updated, "paid", now, kase.relatedNormalizedEventId ?? "")
      : NO_EFFECTS;
  return {
    kind: "repaired",
    caseId: kase.id,
    grantsIssued: effects.grantsIssued,
    grantsRevoked: effects.grantsRevoked,
    grantsReinstated: [],
  };
}

async function repairUnresolvedIdentity(
  tx: PgDatabase<PgQueryResultHKT, Schema>,
  cache: EffectiveAccessCache,
  kase: ReconciliationCaseRow,
  purchase: PurchaseRow,
  now: Date,
): Promise<RepairOutcome> {
  if (!kase.relatedNormalizedEventId) {
    return {
      kind: "still_blocked",
      caseId: kase.id,
      reason: "case has no related normalized event to re-resolve identity from",
    };
  }
  const normalizedEvent = await findNormalizedCommerceEventById(tx, kase.relatedNormalizedEventId);
  if (!normalizedEvent) {
    return { kind: "still_blocked", caseId: kase.id, reason: "related normalized event no longer found" };
  }
  const identity = await findExternalIdentity(tx, normalizedEvent.provider, normalizedEvent.externalUserId);
  if (!identity) {
    return { kind: "still_blocked", caseId: kase.id, reason: "identity still unresolved" };
  }
  await updatePurchaseStatus(tx, purchase.id, {
    status: purchase.status as PurchaseState,
    lastEventOccurredAt: purchase.lastEventOccurredAt,
    userId: identity.userId,
  });
  const updated: PurchaseRow = { ...purchase, userId: identity.userId };
  const effects =
    purchase.status === "paid" && updated.offerId
      ? await applyPurchaseStatusEffects(tx, cache, updated, "paid", now, kase.relatedNormalizedEventId)
      : NO_EFFECTS;
  return {
    kind: "repaired",
    caseId: kase.id,
    grantsIssued: effects.grantsIssued,
    grantsRevoked: effects.grantsRevoked,
    grantsReinstated: [],
  };
}

async function repairAmbiguousTransition(
  tx: PgDatabase<PgQueryResultHKT, Schema>,
  cache: EffectiveAccessCache,
  kase: ReconciliationCaseRow,
  purchase: PurchaseRow,
  input: RepairReconciliationCaseInput,
  now: Date,
): Promise<RepairOutcome> {
  if (input.decision === undefined)
    throw new ReconciliationRepairDecisionRequiredError(kase.id, kase.caseType);
  if (input.decision === "reject") {
    return { kind: "rejected", caseId: kase.id };
  }

  const incomingStatus = kase.evidence["incomingStatus"] as PurchaseState | undefined;
  if (!incomingStatus) {
    return {
      kind: "still_blocked",
      caseId: kase.id,
      reason: "case evidence is missing the pending target status",
    };
  }
  await updatePurchaseStatus(tx, purchase.id, {
    status: incomingStatus,
    lastEventOccurredAt: now,
    ...(incomingStatus === "paid" ? { paidAt: now } : {}),
    ...(incomingStatus === "refunded_full" || incomingStatus === "refunded_partial"
      ? { refundedAt: now }
      : {}),
  });
  const updated: PurchaseRow = { ...purchase, status: incomingStatus };
  const effects = await applyPurchaseStatusEffects(
    tx,
    cache,
    updated,
    incomingStatus,
    now,
    kase.relatedNormalizedEventId ?? "",
  );
  return {
    kind: "repaired",
    caseId: kase.id,
    grantsIssued: effects.grantsIssued,
    grantsRevoked: effects.grantsRevoked,
    grantsReinstated: [],
  };
}

async function repairChargebackReview(
  tx: PgDatabase<PgQueryResultHKT, Schema>,
  cache: EffectiveAccessCache,
  kase: ReconciliationCaseRow,
  input: RepairReconciliationCaseInput,
  now: Date,
): Promise<RepairOutcome> {
  if (input.decision === undefined)
    throw new ReconciliationRepairDecisionRequiredError(kase.id, kase.caseType);
  if (!kase.relatedUserId || !kase.relatedPurchaseId) {
    return { kind: "still_blocked", caseId: kase.id, reason: "case is missing the related user/purchase" };
  }
  const suspendedGrantIds = (kase.evidence["suspendedGrantIds"] as string[] | undefined) ?? [];

  if (input.decision === "reject") {
    return { kind: "rejected", caseId: kase.id };
  }

  const affected: string[] = [];
  for (const grantId of suspendedGrantIds) {
    await recordGrantEventAndInvalidate(tx, cache, kase.relatedUserId, {
      grantId,
      eventType: "revoked",
      occurredAt: now,
      reason: "chargeback_confirmed",
      actor: { sourceType: "purchase", sourceId: kase.relatedPurchaseId },
    });
    affected.push(grantId);
  }
  return {
    kind: "repaired",
    caseId: kase.id,
    grantsIssued: [],
    grantsRevoked: affected,
    grantsReinstated: [],
  };
}

/**
 * Repairs one reconciliation case, or reports why it cannot be repaired
 * yet. Idempotent: a case already in a terminal status ("resolved" /
 * "ignored_with_reason") returns `already_resolved` without touching
 * anything - calling this twice on the same case never issues/revokes a
 * grant twice.
 */
export async function repairReconciliationCase(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  cache: EffectiveAccessCache,
  input: RepairReconciliationCaseInput,
  now: Date,
): Promise<RepairOutcome> {
  if (!input.reason) throw new ReconciliationRepairReasonRequiredError();

  const roles = await listActiveRoleHoldings(db, input.actorUserId);
  const decision = authorize({
    actor: { userId: input.actorUserId, roles },
    action: { type: "reconciliation_repair", permission: "reconciliation.manage" },
  });
  if (!decision.allowed) throw new ReconciliationRepairNotAuthorizedError(decision.reasonCode);

  const kase = await findReconciliationCaseById(db, input.caseId);
  if (!kase) throw new ReconciliationCaseNotFoundError(input.caseId);
  if (isTerminalReconciliationStatus(kase.status)) {
    return { kind: "already_resolved", caseId: kase.id, resolvedAt: kase.resolvedAt ?? now };
  }

  return db.transaction(async (tx) => {
    let outcome: RepairOutcome;

    switch (kase.caseType) {
      case "unknown_sku":
      case "unresolved_identity": {
        if (!kase.relatedPurchaseId) {
          outcome = { kind: "still_blocked", caseId: kase.id, reason: "case has no related purchase" };
          break;
        }
        const purchase = await findPurchaseById(tx, kase.relatedPurchaseId);
        if (!purchase) {
          outcome = { kind: "still_blocked", caseId: kase.id, reason: "related purchase no longer found" };
          break;
        }
        outcome =
          kase.caseType === "unknown_sku"
            ? await repairUnknownSku(tx, cache, kase, purchase, now)
            : await repairUnresolvedIdentity(tx, cache, kase, purchase, now);
        break;
      }
      case "ambiguous_transition": {
        if (!kase.relatedPurchaseId) {
          outcome = { kind: "still_blocked", caseId: kase.id, reason: "case has no related purchase" };
          break;
        }
        const purchase = await findPurchaseById(tx, kase.relatedPurchaseId);
        if (!purchase) {
          outcome = { kind: "still_blocked", caseId: kase.id, reason: "related purchase no longer found" };
          break;
        }
        outcome = await repairAmbiguousTransition(tx, cache, kase, purchase, input, now);
        break;
      }
      case "chargeback_review":
        outcome = await repairChargebackReview(tx, cache, kase, input, now);
        break;
      default:
        outcome = { kind: "unsupported_case_type", caseId: kase.id, caseType: kase.caseType };
    }

    // Only a genuine outcome (repaired/rejected) resolves the case - a
    // "still_blocked"/"unsupported_case_type" outcome leaves it exactly as
    // it was (no silent mutation of case status without a real resolution).
    if (outcome.kind === "repaired") {
      await resolveReconciliationCase(tx, kase.id, "resolved", input.actorUserId, input.reason, now);
    } else if (outcome.kind === "rejected") {
      await resolveReconciliationCase(
        tx,
        kase.id,
        "ignored_with_reason",
        input.actorUserId,
        input.reason,
        now,
      );
    }

    return outcome;
  });
}

export async function assignReconciliationCaseToOperator(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  actorUserId: string,
  caseId: string,
  assignedToUserId: string,
): Promise<ReconciliationCaseRow> {
  const roles = await listActiveRoleHoldings(db, actorUserId);
  const decision = authorize({
    actor: { userId: actorUserId, roles },
    action: { type: "reconciliation_assign", permission: "reconciliation.manage" },
  });
  if (!decision.allowed) throw new ReconciliationRepairNotAuthorizedError(decision.reasonCode);

  return assignReconciliationCase(db, caseId, assignedToUserId);
}
