import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SEJOLI_BRIDGE_STATUS_MAP_V1,
  computeHmacSignature,
  type CommerceEventEnvelope,
} from "@superlatif/domain/commerce";
import { createInMemoryEffectiveAccessCache, type EffectiveAccessCache } from "@superlatif/domain/access";
import { createUser, linkExternalIdentity } from "../identity/repository.ts";
import { createPolicyDraft, publishPolicyVersion } from "../access/policy-repository.ts";
import { findGrantById, listGrantEvents, listGrantsForUser } from "../access/grant-repository.ts";
import { issueGrantAndInvalidate } from "../access/effective-access-service.ts";
import { createTestDatabase, type TestDatabaseHandle } from "../test-client.ts";
import { createProduct, createProductVersionDraft, publishProductVersion } from "./product-repository.ts";
import { createOfferDraft, publishOffer } from "./offer-repository.ts";
import { createSkuMapping } from "./sku-mapping-repository.ts";
import { ingestCommerceEvent } from "./commerce-event-service.ts";
import { createOutboxEntry } from "./commerce-outbox-repository.ts";
import { findPurchaseByExternalOrder } from "./purchase-repository.ts";
import { listReconciliationCasesForPurchase } from "./reconciliation-repository.ts";
import { processPurchaseLifecycleEvent } from "./purchase-lifecycle-service.ts";

const NOW = new Date("2026-08-29T00:00:00.000Z");
const LATER = new Date("2026-08-29T01:00:00.000Z");
const SECRET = "synthetic-test-webhook-secret-do-not-use-in-production";

function lifetimePolicyConfig(code: string) {
  return {
    schemaVersion: 2,
    code,
    version: 1,
    title: code,
    validity: { mode: "lifetime", timezone: "Asia/Jakarta" },
    claims: [
      {
        targetType: "program",
        targetRef: { code: "placeholder" },
        actions: ["view"],
        includeDescendants: true,
      },
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

let handle: TestDatabaseHandle;
let cache: EffectiveAccessCache;

beforeEach(async () => {
  handle = await createTestDatabase();
  cache = createInMemoryEffectiveAccessCache();
});

afterEach(async () => {
  await handle.close();
});

/** entitlement-policy.schema.json's `code` pattern is `^[A-Z0-9_]+$` - test SKU ids use lowercase/hyphens, so derived codes are normalized through this helper (same pattern as packages/db/src/program's integration tests). */
function codeFor(prefix: string, sourceId: string): string {
  return `${prefix}_${sourceId.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
}

/** Publishes a one-component offer (targetRef "program:aks-2026") and maps a synthetic SKU to it. Returns the ids a purchase-lifecycle test needs. */
async function setupCatalogue(skuId = "sku-aks-2026") {
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
        targetRef: "program:aks-2026",
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
  readonly externalSkuId?: string;
  readonly amountMinor?: number;
}

/** Ingests one commerce webhook delivery through COM-002's real pipeline and returns the resulting normalized event id - proves COM-002 -> COM-003 wiring, not a shortcut. */
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
      amountMinor: params.amountMinor ?? 199_000,
      externalUserId: params.externalUserId ?? "wp-user-1",
      externalSkuId: params.externalSkuId ?? "sku-aks-2026",
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

describe("required test: paid creates grant once", () => {
  it("a paid event creates exactly one grant per product component, owned by the purchase", async () => {
    const studentId = await createStudent("wp-user-1");
    await setupCatalogue();

    const normalizedEventId = await ingestNormalizedEvent({
      eventId: "evt-paid-1",
      externalOrderId: "SJ-ORDER-1",
      rawStatus: "completed", // maps to "paid" (SEJOLI_BRIDGE_STATUS_MAP_V1)
      occurredAt: NOW.toISOString(),
    });

    const outcome = await processPurchaseLifecycleEvent(handle.db, cache, normalizedEventId, NOW);
    expect(outcome.kind).toBe("processed");
    if (outcome.kind !== "processed") return;
    expect(outcome.grantsIssued).toHaveLength(1);

    const purchase = await findPurchaseByExternalOrder(
      handle.db,
      "sejoli_bridge",
      "superlatif.id",
      "SJ-ORDER-1",
    );
    expect(purchase?.status).toBe("paid");
    expect(purchase?.userId).toBe(studentId);

    const grant = await findGrantById(handle.db, outcome.grantsIssued[0]!);
    expect(grant?.sourceType).toBe("purchase");
    expect(grant?.sourceId).toBe(purchase!.id);
    expect(grant?.sourceKey).toBe(`${purchase!.id}:program`);
  });
});

describe("required negative test: duplicate/replay", () => {
  it("re-processing the exact same normalized event is a no-op - no second grant, no second purchase_event", async () => {
    await createStudent("wp-user-1");
    await setupCatalogue();
    const normalizedEventId = await ingestNormalizedEvent({
      eventId: "evt-paid-replay",
      externalOrderId: "SJ-ORDER-REPLAY",
      rawStatus: "completed",
      occurredAt: NOW.toISOString(),
    });

    const first = await processPurchaseLifecycleEvent(handle.db, cache, normalizedEventId, NOW);
    const second = await processPurchaseLifecycleEvent(handle.db, cache, normalizedEventId, NOW);

    expect(first.kind).toBe("processed");
    expect(second.kind).toBe("already_processed");

    const purchase = await findPurchaseByExternalOrder(
      handle.db,
      "sejoli_bridge",
      "superlatif.id",
      "SJ-ORDER-REPLAY",
    );
    expect(purchase).not.toBeNull();
    if (first.kind !== "processed") throw new Error("expected processed");
    expect(first.grantsIssued).toHaveLength(1);

    const grants = await listGrantsForUser(handle.db, purchase!.userId!);
    const purchaseGrants = grants.filter((g) => g.sourceType === "purchase" && g.sourceId === purchase!.id);
    expect(purchaseGrants).toHaveLength(1); // replay never created a second grant
  });

  it("a provider retry with a different delivery id but the same target status is recognized as a duplicate transition, not applied again", async () => {
    await createStudent("wp-user-1");
    await setupCatalogue();
    const first = await ingestNormalizedEvent({
      eventId: "evt-retry-1a",
      externalOrderId: "SJ-ORDER-RETRY",
      rawStatus: "completed",
      occurredAt: NOW.toISOString(),
    });
    const retry = await ingestNormalizedEvent({
      eventId: "evt-retry-1b", // different delivery id
      externalOrderId: "SJ-ORDER-RETRY",
      rawStatus: "completed", // same status
      occurredAt: LATER.toISOString(),
    });

    const firstOutcome = await processPurchaseLifecycleEvent(handle.db, cache, first, NOW);
    const retryOutcome = await processPurchaseLifecycleEvent(handle.db, cache, retry, LATER);

    expect(firstOutcome.kind).toBe("processed");
    if (retryOutcome.kind !== "processed") throw new Error("expected processed");
    expect(retryOutcome.transitionOutcome).toBe("ignored_duplicate");
    expect(retryOutcome.grantsIssued).toHaveLength(0);
  });
});

describe("required test: refund revokes access", () => {
  it("a refunded_full event revokes exactly the grants this purchase issued, without rewriting the original grant row", async () => {
    await createStudent("wp-user-1");
    await setupCatalogue();
    const paidEventId = await ingestNormalizedEvent({
      eventId: "evt-paid-refund",
      externalOrderId: "SJ-ORDER-REFUND",
      rawStatus: "completed",
      occurredAt: NOW.toISOString(),
    });
    const paidOutcome = await processPurchaseLifecycleEvent(handle.db, cache, paidEventId, NOW);
    if (paidOutcome.kind !== "processed") throw new Error("expected processed");
    const grantId = paidOutcome.grantsIssued[0]!;

    const refundEventId = await ingestNormalizedEvent({
      eventId: "evt-refund-1",
      externalOrderId: "SJ-ORDER-REFUND",
      rawStatus: "refunded", // maps to "refunded_full"
      occurredAt: LATER.toISOString(),
    });
    const refundOutcome = await processPurchaseLifecycleEvent(handle.db, cache, refundEventId, LATER);
    if (refundOutcome.kind !== "processed") throw new Error("expected processed");
    expect(refundOutcome.grantsRevoked).toEqual([grantId]);

    const events = await listGrantEvents(handle.db, grantId);
    expect(events.some((e) => e.eventType === "revoked")).toBe(true);

    // The original grant row itself is never rewritten - only a new event is appended.
    const grant = await findGrantById(handle.db, grantId);
    expect(grant?.sourceType).toBe("purchase");
    expect(grant?.id).toBe(grantId);

    const purchase = await findPurchaseByExternalOrder(
      handle.db,
      "sejoli_bridge",
      "superlatif.id",
      "SJ-ORDER-REFUND",
    );
    expect(purchase?.status).toBe("refunded_full");
  });
});

describe("required negative test: out-of-order event", () => {
  it("paid -> pending never regresses the purchase, and creates a reconciliation case instead", async () => {
    await createStudent("wp-user-1");
    await setupCatalogue();
    const paidEventId = await ingestNormalizedEvent({
      eventId: "evt-paid-ooo",
      externalOrderId: "SJ-ORDER-OOO",
      rawStatus: "completed",
      occurredAt: NOW.toISOString(),
    });
    await processPurchaseLifecycleEvent(handle.db, cache, paidEventId, NOW);

    const staleEventId = await ingestNormalizedEvent({
      eventId: "evt-stale-pending",
      externalOrderId: "SJ-ORDER-OOO",
      rawStatus: "pending",
      occurredAt: LATER.toISOString(), // later timestamp, but "paid -> pending" is still illegal
    });
    const outcome = await processPurchaseLifecycleEvent(handle.db, cache, staleEventId, LATER);
    if (outcome.kind !== "processed") throw new Error("expected processed");
    expect(outcome.transitionOutcome).toBe("ignored_out_of_order");
    expect(outcome.grantsIssued).toHaveLength(0);
    expect(outcome.grantsRevoked).toHaveLength(0);

    const purchase = await findPurchaseByExternalOrder(
      handle.db,
      "sejoli_bridge",
      "superlatif.id",
      "SJ-ORDER-OOO",
    );
    expect(purchase?.status).toBe("paid"); // never regressed to pending

    const cases = await listReconciliationCasesForPurchase(handle.db, purchase!.id);
    expect(cases.some((c) => c.caseType === "ambiguous_transition")).toBe(true);
  });
});

describe("required negative test: unknown SKU quarantine/reconciliation", () => {
  it("a paid event for an unmapped SKU creates a purchase and a reconciliation case, and issues no grant", async () => {
    await createStudent("wp-user-1");
    // Deliberately no setupCatalogue() call - "sku-unmapped" has no SKU mapping at all.
    const normalizedEventId = await ingestNormalizedEvent({
      eventId: "evt-unknown-sku",
      externalOrderId: "SJ-ORDER-UNKNOWN-SKU",
      rawStatus: "completed",
      externalSkuId: "sku-unmapped",
      occurredAt: NOW.toISOString(),
    });

    const outcome = await processPurchaseLifecycleEvent(handle.db, cache, normalizedEventId, NOW);
    expect(outcome.kind).toBe("unresolved_sku");

    const purchase = await findPurchaseByExternalOrder(
      handle.db,
      "sejoli_bridge",
      "superlatif.id",
      "SJ-ORDER-UNKNOWN-SKU",
    );
    expect(purchase).not.toBeNull();
    expect(purchase?.offerId).toBeNull();
    expect(purchase?.userId).not.toBeNull(); // identity DID resolve; only the SKU is the problem

    const cases = await listReconciliationCasesForPurchase(handle.db, purchase!.id);
    expect(cases.some((c) => c.caseType === "unknown_sku")).toBe(true);
  });

  it("a paid event for an unresolved identity creates a purchase and a reconciliation case, and issues no grant", async () => {
    await setupCatalogue();
    // Deliberately no createStudent() call - "wp-user-unlinked" has no external_identities row.
    const normalizedEventId = await ingestNormalizedEvent({
      eventId: "evt-unresolved-identity",
      externalOrderId: "SJ-ORDER-UNRESOLVED-USER",
      rawStatus: "completed",
      externalUserId: "wp-user-unlinked",
      occurredAt: NOW.toISOString(),
    });

    const outcome = await processPurchaseLifecycleEvent(handle.db, cache, normalizedEventId, NOW);
    expect(outcome.kind).toBe("unresolved_identity");

    const purchase = await findPurchaseByExternalOrder(
      handle.db,
      "sejoli_bridge",
      "superlatif.id",
      "SJ-ORDER-UNRESOLVED-USER",
    );
    expect(purchase?.userId).toBeNull();

    const cases = await listReconciliationCasesForPurchase(handle.db, purchase!.id);
    expect(cases.some((c) => c.caseType === "unresolved_identity")).toBe(true);
  });
});

describe("required test: outbox prevents partial commits", () => {
  it("a failure writing the outbox entry rolls back the grant issued earlier in the same transaction", async () => {
    const studentId = await createStudent("wp-user-1");
    const { policyId } = await setupCatalogue();

    await expect(
      handle.db.transaction(async (tx) => {
        await issueGrantAndInvalidate(tx, cache, {
          userId: studentId,
          sourceType: "purchase",
          sourceId: "00000000-0000-0000-0000-000000000001",
          sourceKey: "00000000-0000-0000-0000-000000000001:program",
          accessPolicyId: policyId,
          validFrom: NOW,
          validTo: null,
        });
        // Deliberately invalid: no purchase row with this id exists, so this violates commerce_outbox's FK.
        await createOutboxEntry(tx, {
          purchaseId: "00000000-0000-0000-0000-000000000099",
          eventType: "grant_issued",
          payload: {},
        });
      }),
    ).rejects.toThrow();

    // The grant issued before the failing outbox write must not have survived the rollback.
    const grants = await listGrantsForUser(handle.db, studentId);
    const survivedBadGrant = grants.some(
      (g) => g.sourceKey === "00000000-0000-0000-0000-000000000001:program",
    );
    expect(survivedBadGrant).toBe(false);
  });
});
