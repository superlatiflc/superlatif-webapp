// COM-004: refund, cancellation, expiry, and source-isolated revocation.
//
// No new schema and no new production code path - COM-003 already filters
// every refund/cancel/chargeback revocation to `sourceType === "purchase"
// && sourceId === purchase.id` (purchase-lifecycle-service.ts), and
// ENT-001's own recordGrantEvent already enforces a reason for every
// revoked/suspended/cancelled/reinstated event
// (GrantEventReasonRequiredError). This file's job is to PROVE those
// existing mechanisms hold under the harder multi-source scenarios COM-004
// names, not to add a mechanism.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SEJOLI_BRIDGE_STATUS_MAP_V1,
  computeHmacSignature,
  type CommerceEventEnvelope,
} from "@superlatif/domain/commerce";
import { createInMemoryEffectiveAccessCache, type EffectiveAccessCache } from "@superlatif/domain/access";
import { createUser, linkExternalIdentity } from "../identity/repository.ts";
import { createPolicyDraft, publishPolicyVersion } from "../access/policy-repository.ts";
import { findGrantById, listGrantEvents } from "../access/grant-repository.ts";
import { getEffectiveAccess, issueGrantAndInvalidate } from "../access/effective-access-service.ts";
import { createTestDatabase, type TestDatabaseHandle } from "../test-client.ts";
import { createProduct, createProductVersionDraft, publishProductVersion } from "./product-repository.ts";
import { createOfferDraft, publishOffer } from "./offer-repository.ts";
import { createSkuMapping } from "./sku-mapping-repository.ts";
import { ingestCommerceEvent } from "./commerce-event-service.ts";
import { findPurchaseByExternalOrder } from "./purchase-repository.ts";
import { processPurchaseLifecycleEvent } from "./purchase-lifecycle-service.ts";

const NOW = new Date("2026-08-29T00:00:00.000Z");
const LATER = new Date("2026-08-29T01:00:00.000Z");
const EVEN_LATER = new Date("2026-08-29T02:00:00.000Z");
const SECRET = "synthetic-test-webhook-secret-do-not-use-in-production";
const TARGET_REF = "program:aks-2026";

function lifetimePolicyConfig(code: string) {
  return {
    schemaVersion: 2,
    code,
    version: 1,
    title: code,
    validity: { mode: "lifetime", timezone: "Asia/Jakarta" },
    claims: [
      { targetType: "program", targetRef: { code: TARGET_REF }, actions: ["view"], includeDescendants: true },
    ],
    attemptAllowance: {
      mode: "inherit_batch",
      maxRankedAttempts: null,
      maxPracticeAttempts: 0,
      rankingRuleSource: "batch",
    },
    postExpiry: { mode: "read_only_history" },
    stacking: {
      mode: "additive",
      expiryResolution: "latest_supporting_grant",
      attemptResolution: "batch_policy_only",
    },
    lifecycle: {
      refundAction: "revoke_source_grant",
      expiryAction: "expire_source_grant",
      manualChangeRequiresReason: true,
      retainAttemptHistory: true,
      retainResultHistory: true,
      retainRankingSnapshot: true,
    },
  };
}

/** entitlement-policy.schema.json's `code` pattern is `^[A-Z0-9_]+$`. */
function codeFor(prefix: string, sourceId: string): string {
  return `${prefix}_${sourceId.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
}

let handle: TestDatabaseHandle;
let cache: EffectiveAccessCache;

beforeEach(async () => {
  handle = await createTestDatabase();
  cache = createInMemoryEffectiveAccessCache();
});

afterEach(async () => {
  await handle.close();
});

/** Publishes an offer that grants `TARGET_REF` through one component, and maps `skuId` to it. */
async function setupOfferGrantingTarget(skuId: string): Promise<{ offerId: string; policyId: string }> {
  const policyCode = codeFor("POLICY", skuId);
  const policy = await createPolicyDraft(handle.db, {
    code: policyCode,
    version: 1,
    title: "policy",
    config: lifetimePolicyConfig(policyCode),
  });
  await publishPolicyVersion(handle.db, policy.id, NOW);

  const product = await createProduct(handle.db, {
    code: codeFor("PROD", skuId),
    name: "Kelas Akselerasi",
    type: "full_program_bundle",
  });
  const { version } = await createProductVersionDraft(handle.db, {
    productId: product.id,
    version: 1,
    benefitsSummary: {},
    termsVersion: "terms-2026-08",
    components: [
      {
        componentCode: "program",
        accessPolicyId: policy.id,
        targetType: "program",
        targetRef: TARGET_REF,
        includeDescendants: true,
      },
    ],
  });
  await publishProductVersion(handle.db, version.id, NOW);

  const offer = await createOfferDraft(handle.db, {
    productVersionId: version.id,
    code: codeFor("OFFER", skuId),
    version: 1,
    title: "Kelas Akselerasi 2026",
    currentAmountMinor: 199_000,
    termsVersion: "terms-2026-08",
  });
  await publishOffer(handle.db, offer.id, NOW);

  await createSkuMapping(handle.db, {
    provider: "sejoli_bridge",
    site: "superlatif.id",
    externalSkuId: skuId,
    mappingVersion: 1,
    offerId: offer.id,
    validFrom: NOW,
  });

  return { offerId: offer.id, policyId: policy.id };
}

async function createStudent(externalUserId: string): Promise<string> {
  const user = await createUser(handle.db, {
    emailNormalized: `${externalUserId}@example.test`,
    phoneE164: null,
  });
  await linkExternalIdentity(handle.db, {
    userId: user.userId,
    provider: "sejoli_bridge",
    externalSubject: externalUserId,
    linkReason: "test fixture",
  });
  return user.userId;
}

interface IngestParams {
  readonly eventId: string;
  readonly externalOrderId: string;
  readonly rawStatus: string;
  readonly occurredAt: string;
  readonly externalUserId?: string;
  readonly externalSkuId: string;
}

/** Ingests one commerce webhook delivery through COM-002's real pipeline. */
async function ingestNormalizedEvent(params: IngestParams): Promise<string> {
  const payload = {
    provider: "sejoli_bridge",
    site: "superlatif.id",
    eventId: params.eventId,
    eventType: "purchase.status_changed",
    occurredAt: params.occurredAt,
    order: {
      externalId: params.externalOrderId,
      status: params.rawStatus,
      currency: "IDR",
      amountMinor: 199_000,
      externalUserId: params.externalUserId ?? "wp-user-1",
      externalSkuId: params.externalSkuId,
    },
    schemaVersion: 1,
  };
  const envelope: CommerceEventEnvelope = {
    provider: payload.provider,
    site: payload.site,
    eventId: payload.eventId,
    type: payload.eventType,
    occurredAt: payload.occurredAt,
    order: {
      externalId: payload.order.externalId,
      status: payload.order.status,
      currency: payload.order.currency,
      amountMinor: payload.order.amountMinor,
      externalUserId: payload.order.externalUserId,
      externalSkuId: payload.order.externalSkuId,
    },
    schemaVersion: payload.schemaVersion,
  };
  const signature = computeHmacSignature(JSON.stringify(payload), SECRET);
  const outcome = await ingestCommerceEvent(
    handle.db,
    {
      envelope,
      rawPayload: payload,
      providedSignature: signature,
      secret: SECRET,
      correlationId: `corr-${params.eventId}`,
      statusMap: SEJOLI_BRIDGE_STATUS_MAP_V1,
    },
    new Date(params.occurredAt),
  );
  if (outcome.kind !== "normalized") {
    throw new Error(`test fixture: expected "normalized", got "${outcome.kind}" for event ${params.eventId}`);
  }
  return outcome.normalizedEventId;
}

describe("required test: overlapping-grant refund (bundle + specialist source isolation)", () => {
  it("refunding one purchase revokes only that purchase's grant - the other source's access to the same target survives", async () => {
    const studentId = await createStudent("wp-user-1");
    const bundle = await setupOfferGrantingTarget("sku-bundle-2026");
    const specialist = await setupOfferGrantingTarget("sku-specialist-2026");

    const bundlePaidEvent = await ingestNormalizedEvent({
      eventId: "evt-bundle-paid",
      externalOrderId: "SJ-BUNDLE-1",
      rawStatus: "completed",
      externalSkuId: "sku-bundle-2026",
      occurredAt: NOW.toISOString(),
    });
    const bundleOutcome = await processPurchaseLifecycleEvent(handle.db, cache, bundlePaidEvent, NOW);
    if (bundleOutcome.kind !== "processed") throw new Error("expected processed");
    const bundleGrantId = bundleOutcome.grantsIssued[0]!;

    const specialistPaidEvent = await ingestNormalizedEvent({
      eventId: "evt-specialist-paid",
      externalOrderId: "SJ-SPECIALIST-1",
      rawStatus: "completed",
      externalSkuId: "sku-specialist-2026",
      occurredAt: LATER.toISOString(),
    });
    const specialistOutcome = await processPurchaseLifecycleEvent(
      handle.db,
      cache,
      specialistPaidEvent,
      LATER,
    );
    if (specialistOutcome.kind !== "processed") throw new Error("expected processed");
    const specialistGrantId = specialistOutcome.grantsIssued[0]!;

    expect(bundleGrantId).not.toBe(specialistGrantId); // two independent grants, same target

    const beforeRefund = await getEffectiveAccess(
      handle.db,
      cache,
      studentId,
      { targetType: "program", targetRef: TARGET_REF, action: "view" },
      EVEN_LATER,
    );
    expect(beforeRefund.allowed).toBe(true);

    // Refund the SPECIALIST purchase only.
    const refundEvent = await ingestNormalizedEvent({
      eventId: "evt-specialist-refund",
      externalOrderId: "SJ-SPECIALIST-1",
      rawStatus: "refunded",
      externalSkuId: "sku-specialist-2026",
      occurredAt: EVEN_LATER.toISOString(),
    });
    const refundOutcome = await processPurchaseLifecycleEvent(handle.db, cache, refundEvent, EVEN_LATER);
    if (refundOutcome.kind !== "processed") throw new Error("expected processed");
    expect(refundOutcome.grantsRevoked).toEqual([specialistGrantId]);

    // The bundle's grant is untouched - not even a "revoked" event on it.
    const bundleGrantEvents = await listGrantEvents(handle.db, bundleGrantId);
    expect(bundleGrantEvents.some((e) => e.eventType === "revoked")).toBe(false);
    const bundleGrant = await findGrantById(handle.db, bundleGrantId);
    expect(bundleGrant?.id).toBe(bundleGrantId); // the row itself was never rewritten

    // The specialist's grant DID get a revoked event, with a reason.
    const specialistGrantEvents = await listGrantEvents(handle.db, specialistGrantId);
    const revokedEvent = specialistGrantEvents.find((e) => e.eventType === "revoked");
    expect(revokedEvent?.reason).toBe("purchase_refunded_full");

    // The real, student-facing proof: effective access to the target SURVIVES the refund.
    const afterRefund = await getEffectiveAccess(
      handle.db,
      cache,
      studentId,
      { targetType: "program", targetRef: TARGET_REF, action: "view" },
      EVEN_LATER,
    );
    expect(afterRefund.allowed).toBe(true);
    expect(afterRefund.decisiveGrantIds).toEqual([bundleGrantId]);

    void bundle;
    void specialist;
  });
});

describe("required negative test: unknown-source revocation denial (isolation across source TYPES, not just other purchases)", () => {
  it("refunding a purchase never touches a manually-granted access to the same target", async () => {
    const studentId = await createStudent("wp-user-2");
    const { offerId, policyId } = await setupOfferGrantingTarget("sku-solo-2026");
    void offerId;

    const manualGrant = await issueGrantAndInvalidate(handle.db, cache, {
      userId: studentId,
      sourceType: "manual",
      sourceId: studentId,
      sourceKey: `${studentId}:manual-onboarding-grant`,
      accessPolicyId: policyId,
      validFrom: NOW,
      validTo: null,
    });

    const paidEvent = await ingestNormalizedEvent({
      eventId: "evt-solo-paid",
      externalOrderId: "SJ-SOLO-1",
      rawStatus: "completed",
      externalSkuId: "sku-solo-2026",
      externalUserId: "wp-user-2",
      occurredAt: NOW.toISOString(),
    });
    const paidOutcome = await processPurchaseLifecycleEvent(handle.db, cache, paidEvent, NOW);
    if (paidOutcome.kind !== "processed") throw new Error("expected processed");
    const purchaseGrantId = paidOutcome.grantsIssued[0]!;

    const refundEvent = await ingestNormalizedEvent({
      eventId: "evt-solo-refund",
      externalOrderId: "SJ-SOLO-1",
      rawStatus: "refunded",
      externalSkuId: "sku-solo-2026",
      externalUserId: "wp-user-2",
      occurredAt: LATER.toISOString(),
    });
    const refundOutcome = await processPurchaseLifecycleEvent(handle.db, cache, refundEvent, LATER);
    if (refundOutcome.kind !== "processed") throw new Error("expected processed");

    expect(refundOutcome.grantsRevoked).toEqual([purchaseGrantId]); // only the purchase's own grant
    expect(refundOutcome.grantsRevoked).not.toContain(manualGrant.id);

    const manualGrantEvents = await listGrantEvents(handle.db, manualGrant.id);
    expect(manualGrantEvents.some((e) => e.eventType === "revoked")).toBe(false);

    // Access still holds via the untouched manual grant.
    const access = await getEffectiveAccess(
      handle.db,
      cache,
      studentId,
      { targetType: "program", targetRef: TARGET_REF, action: "view" },
      LATER,
    );
    expect(access.allowed).toBe(true);
    expect(access.decisiveGrantIds).toEqual([manualGrant.id]);
  });
});

describe("required test: cancellation", () => {
  it("a paid-then-cancelled purchase revokes its own grant with a reason", async () => {
    const studentId = await createStudent("wp-user-3");
    await setupOfferGrantingTarget("sku-cancel-paid-2026");

    const paidEvent = await ingestNormalizedEvent({
      eventId: "evt-cancel-paid",
      externalOrderId: "SJ-CANCEL-PAID-1",
      rawStatus: "completed",
      externalSkuId: "sku-cancel-paid-2026",
      externalUserId: "wp-user-3",
      occurredAt: NOW.toISOString(),
    });
    const paidOutcome = await processPurchaseLifecycleEvent(handle.db, cache, paidEvent, NOW);
    if (paidOutcome.kind !== "processed") throw new Error("expected processed");
    const grantId = paidOutcome.grantsIssued[0]!;

    const cancelEvent = await ingestNormalizedEvent({
      eventId: "evt-cancel-cancelled",
      externalOrderId: "SJ-CANCEL-PAID-1",
      rawStatus: "cancelled",
      externalSkuId: "sku-cancel-paid-2026",
      externalUserId: "wp-user-3",
      occurredAt: LATER.toISOString(),
    });
    const cancelOutcome = await processPurchaseLifecycleEvent(handle.db, cache, cancelEvent, LATER);
    if (cancelOutcome.kind !== "processed") throw new Error("expected processed");
    expect(cancelOutcome.grantsRevoked).toEqual([grantId]);

    const events = await listGrantEvents(handle.db, grantId);
    const revoked = events.find((e) => e.eventType === "revoked");
    expect(revoked?.reason).toBe("purchase_cancelled");

    const access = await getEffectiveAccess(
      handle.db,
      cache,
      studentId,
      { targetType: "program", targetRef: TARGET_REF, action: "view" },
      LATER,
    );
    expect(access.allowed).toBe(false);
  });

  it("a pending purchase cancelled before ever being paid is a clean no-op - nothing to revoke, no error", async () => {
    await createStudent("wp-user-4");
    await setupOfferGrantingTarget("sku-cancel-pending-2026");

    const pendingEvent = await ingestNormalizedEvent({
      eventId: "evt-never-paid-pending",
      externalOrderId: "SJ-NEVER-PAID-1",
      rawStatus: "pending",
      externalSkuId: "sku-cancel-pending-2026",
      externalUserId: "wp-user-4",
      occurredAt: NOW.toISOString(),
    });
    await processPurchaseLifecycleEvent(handle.db, cache, pendingEvent, NOW);

    const cancelEvent = await ingestNormalizedEvent({
      eventId: "evt-never-paid-cancelled",
      externalOrderId: "SJ-NEVER-PAID-1",
      rawStatus: "cancelled",
      externalSkuId: "sku-cancel-pending-2026",
      externalUserId: "wp-user-4",
      occurredAt: LATER.toISOString(),
    });
    const outcome = await processPurchaseLifecycleEvent(handle.db, cache, cancelEvent, LATER);
    if (outcome.kind !== "processed") throw new Error("expected processed");
    expect(outcome.grantsIssued).toHaveLength(0);
    expect(outcome.grantsRevoked).toHaveLength(0);

    const purchase = await findPurchaseByExternalOrder(
      handle.db,
      "sejoli_bridge",
      "superlatif.id",
      "SJ-NEVER-PAID-1",
    );
    expect(purchase?.status).toBe("cancelled");
  });
});

describe("required test: expiry boundary", () => {
  it("a pending purchase that expires before ever being paid never issues a grant, and the transition is idempotent under replay", async () => {
    await createStudent("wp-user-5");
    await setupOfferGrantingTarget("sku-expiry-2026");

    const pendingEvent = await ingestNormalizedEvent({
      eventId: "evt-expiry-pending",
      externalOrderId: "SJ-EXPIRY-1",
      rawStatus: "pending",
      externalSkuId: "sku-expiry-2026",
      externalUserId: "wp-user-5",
      occurredAt: NOW.toISOString(),
    });
    await processPurchaseLifecycleEvent(handle.db, cache, pendingEvent, NOW);

    const expiredEvent = await ingestNormalizedEvent({
      eventId: "evt-expiry-expired",
      externalOrderId: "SJ-EXPIRY-1",
      rawStatus: "expired",
      externalSkuId: "sku-expiry-2026",
      externalUserId: "wp-user-5",
      occurredAt: LATER.toISOString(),
    });
    const outcome = await processPurchaseLifecycleEvent(handle.db, cache, expiredEvent, LATER);
    if (outcome.kind !== "processed") throw new Error("expected processed");
    expect(outcome.transitionOutcome).toBe("applied");
    expect(outcome.grantsIssued).toHaveLength(0);

    const purchase = await findPurchaseByExternalOrder(
      handle.db,
      "sejoli_bridge",
      "superlatif.id",
      "SJ-EXPIRY-1",
    );
    expect(purchase?.status).toBe("expired");

    // Idempotent under replay: re-processing the SAME normalized event is a no-op.
    const replay = await processPurchaseLifecycleEvent(handle.db, cache, expiredEvent, EVEN_LATER);
    expect(replay.kind).toBe("already_processed");
  });
});

describe("required test: idempotent repeated refund/cancel", () => {
  it("a refund delivered twice under different delivery ids revokes the grant exactly once", async () => {
    await createStudent("wp-user-6");
    await setupOfferGrantingTarget("sku-repeat-refund-2026");

    const paidEvent = await ingestNormalizedEvent({
      eventId: "evt-repeat-paid",
      externalOrderId: "SJ-REPEAT-1",
      rawStatus: "completed",
      externalSkuId: "sku-repeat-refund-2026",
      externalUserId: "wp-user-6",
      occurredAt: NOW.toISOString(),
    });
    const paidOutcome = await processPurchaseLifecycleEvent(handle.db, cache, paidEvent, NOW);
    if (paidOutcome.kind !== "processed") throw new Error("expected processed");
    const grantId = paidOutcome.grantsIssued[0]!;

    const firstRefundEvent = await ingestNormalizedEvent({
      eventId: "evt-repeat-refund-a",
      externalOrderId: "SJ-REPEAT-1",
      rawStatus: "refunded",
      externalSkuId: "sku-repeat-refund-2026",
      externalUserId: "wp-user-6",
      occurredAt: LATER.toISOString(),
    });
    const firstRefundOutcome = await processPurchaseLifecycleEvent(handle.db, cache, firstRefundEvent, LATER);
    if (firstRefundOutcome.kind !== "processed") throw new Error("expected processed");
    expect(firstRefundOutcome.grantsRevoked).toEqual([grantId]);

    // A SECOND, distinct delivery (different eventId - simulating a provider retry) reporting the SAME final status.
    const secondRefundEvent = await ingestNormalizedEvent({
      eventId: "evt-repeat-refund-b",
      externalOrderId: "SJ-REPEAT-1",
      rawStatus: "refunded",
      externalSkuId: "sku-repeat-refund-2026",
      externalUserId: "wp-user-6",
      occurredAt: EVEN_LATER.toISOString(),
    });
    const secondRefundOutcome = await processPurchaseLifecycleEvent(
      handle.db,
      cache,
      secondRefundEvent,
      EVEN_LATER,
    );
    if (secondRefundOutcome.kind !== "processed") throw new Error("expected processed");
    expect(secondRefundOutcome.transitionOutcome).toBe("ignored_duplicate");
    expect(secondRefundOutcome.grantsRevoked).toHaveLength(0); // no second revocation attempt

    // Exactly one "revoked" event exists in the grant's audit trail - not two.
    const events = await listGrantEvents(handle.db, grantId);
    const revokedEvents = events.filter((e) => e.eventType === "revoked");
    expect(revokedEvents).toHaveLength(1);
  });
});

describe("required test: reason-required audit trail", () => {
  it("every removal this task performs (refund, cancel, chargeback-suspend) carries a non-empty reason", async () => {
    await createStudent("wp-user-7");
    await setupOfferGrantingTarget("sku-audit-refund-2026");
    await setupOfferGrantingTarget("sku-audit-cancel-2026");
    await setupOfferGrantingTarget("sku-audit-chargeback-2026");

    async function paidThenTerminal(sku: string, order: string, terminalRawStatus: string): Promise<string> {
      const paid = await ingestNormalizedEvent({
        eventId: `evt-${order}-paid`,
        externalOrderId: order,
        rawStatus: "completed",
        externalSkuId: sku,
        externalUserId: "wp-user-7",
        occurredAt: NOW.toISOString(),
      });
      const paidOutcome = await processPurchaseLifecycleEvent(handle.db, cache, paid, NOW);
      if (paidOutcome.kind !== "processed") throw new Error("expected processed");
      const grantId = paidOutcome.grantsIssued[0]!;

      const terminal = await ingestNormalizedEvent({
        eventId: `evt-${order}-terminal`,
        externalOrderId: order,
        rawStatus: terminalRawStatus,
        externalSkuId: sku,
        externalUserId: "wp-user-7",
        occurredAt: LATER.toISOString(),
      });
      await processPurchaseLifecycleEvent(handle.db, cache, terminal, LATER);
      return grantId;
    }

    const refundedGrantId = await paidThenTerminal("sku-audit-refund-2026", "SJ-AUDIT-REFUND-1", "refunded");
    const cancelledGrantId = await paidThenTerminal(
      "sku-audit-cancel-2026",
      "SJ-AUDIT-CANCEL-1",
      "cancelled",
    );
    const chargebackGrantId = await paidThenTerminal(
      "sku-audit-chargeback-2026",
      "SJ-AUDIT-CHARGEBACK-1",
      "chargeback",
    );

    const refundEvents = await listGrantEvents(handle.db, refundedGrantId);
    expect(refundEvents.find((e) => e.eventType === "revoked")?.reason).toBe("purchase_refunded_full");

    const cancelEvents = await listGrantEvents(handle.db, cancelledGrantId);
    expect(cancelEvents.find((e) => e.eventType === "revoked")?.reason).toBe("purchase_cancelled");

    const chargebackEvents = await listGrantEvents(handle.db, chargebackGrantId);
    const suspended = chargebackEvents.find((e) => e.eventType === "suspended");
    expect(suspended?.reason).toBe("purchase_chargeback_review");
    // Chargeback suspends, never revokes outright (dok 22 §18 - never an automatic accusation).
    expect(chargebackEvents.some((e) => e.eventType === "revoked")).toBe(false);
  });
});
