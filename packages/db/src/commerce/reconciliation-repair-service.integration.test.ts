import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SEJOLI_BRIDGE_STATUS_MAP_V1,
  computeHmacSignature,
  type CommerceEventEnvelope,
} from "@superlatif/domain/commerce";
import { createInMemoryEffectiveAccessCache, type EffectiveAccessCache } from "@superlatif/domain/access";
import { createUser, linkExternalIdentity } from "../identity/repository.ts";
import { assignRole, seedCanonicalRoles } from "../authorization/index.ts";
import { createPolicyDraft, publishPolicyVersion } from "../access/policy-repository.ts";
import { listGrantEvents, listGrantsForUser } from "../access/grant-repository.ts";
import { getEffectiveAccess } from "../access/effective-access-service.ts";
import { createTestDatabase, type TestDatabaseHandle } from "../test-client.ts";
import { createProduct, createProductVersionDraft, publishProductVersion } from "./product-repository.ts";
import { createOfferDraft, publishOffer } from "./offer-repository.ts";
import { createSkuMapping } from "./sku-mapping-repository.ts";
import { ingestCommerceEvent } from "./commerce-event-service.ts";
import { findPurchaseByExternalOrder } from "./purchase-repository.ts";
import { processPurchaseLifecycleEvent } from "./purchase-lifecycle-service.ts";
import { listReconciliationCasesForPurchase } from "./reconciliation-repository.ts";
import {
  ReconciliationRepairNotAuthorizedError,
  assignReconciliationCaseToOperator,
  repairReconciliationCase,
} from "./reconciliation-repair-service.ts";

const NOW = new Date("2026-08-29T00:00:00.000Z");
const EARLIER = new Date("2026-08-28T23:00:00.000Z");
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

function codeFor(prefix: string, sourceId: string): string {
  return `${prefix}_${sourceId.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
}

let handle: TestDatabaseHandle;
let cache: EffectiveAccessCache;
let founderId: string;

beforeEach(async () => {
  handle = await createTestDatabase();
  cache = createInMemoryEffectiveAccessCache();
  await seedCanonicalRoles(handle.db);
  const founder = await createUser(handle.db, { emailNormalized: "founder@superlatif.id", phoneE164: null });
  founderId = founder.userId;
});

afterEach(async () => {
  await handle.close();
});

async function makeOperationsAdmin(email: string): Promise<string> {
  const user = await createUser(handle.db, { emailNormalized: email, phoneE164: null });
  await assignRole(handle.db, {
    userId: user.userId,
    role: "operations_admin",
    grantedByUserId: founderId,
    grantedReason: "onboarding",
  });
  return user.userId;
}

async function makeFinanceReconciliation(email: string): Promise<string> {
  const user = await createUser(handle.db, { emailNormalized: email, phoneE164: null });
  await assignRole(handle.db, {
    userId: user.userId,
    role: "finance_reconciliation",
    grantedByUserId: founderId,
    grantedReason: "onboarding",
  });
  return user.userId;
}

async function makeAcademicAdmin(email: string): Promise<string> {
  const user = await createUser(handle.db, { emailNormalized: email, phoneE164: null });
  await assignRole(handle.db, {
    userId: user.userId,
    role: "academic_admin",
    grantedByUserId: founderId,
    grantedReason: "onboarding",
  });
  return user.userId;
}

async function makeStudent(email: string): Promise<string> {
  const user = await createUser(handle.db, { emailNormalized: email, phoneE164: null });
  return user.userId;
}

/** Publishes an offer that grants `TARGET_REF` through one component, and (unless `skipMapping`) maps `skuId` to it. */
async function setupOfferGrantingTarget(
  skuId: string,
  options: { skipMapping?: boolean } = {},
): Promise<{ offerId: string }> {
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

  if (!options.skipMapping) {
    await createSkuMapping(handle.db, {
      provider: "sejoli_bridge",
      site: "superlatif.id",
      externalSkuId: skuId,
      mappingVersion: 1,
      offerId: offer.id,
      validFrom: NOW,
    });
  }

  return { offerId: offer.id };
}

interface IngestParams {
  readonly eventId: string;
  readonly externalOrderId: string;
  readonly rawStatus: string;
  readonly occurredAt: string;
  readonly externalUserId?: string;
  readonly externalSkuId: string;
}

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

describe("required test: repair idempotent, audit trail, repair grant/access invalidation, double repair", () => {
  it("repairing an unknown-SKU case once the mapping exists issues the grant, stamps the audit trail, updates effective access - and a second repair call is a pure no-op", async () => {
    const operator = await makeOperationsAdmin("ops-1@superlatif.id");
    const studentId = await makeStudent("wp-user-1@example.test");
    await linkExternalIdentity(handle.db, {
      userId: studentId,
      provider: "sejoli_bridge",
      externalSubject: "wp-user-1",
      linkReason: "test fixture",
    });
    const { offerId } = await setupOfferGrantingTarget("sku-unknown-repair-2026", { skipMapping: true });

    const paidEvent = await ingestNormalizedEvent({
      eventId: "evt-unknown-sku-paid",
      externalOrderId: "SJ-UNKNOWN-SKU-1",
      rawStatus: "completed",
      externalSkuId: "sku-unknown-repair-2026",
      occurredAt: NOW.toISOString(),
    });
    const paidOutcome = await processPurchaseLifecycleEvent(handle.db, cache, paidEvent, NOW);
    expect(paidOutcome.kind).toBe("unresolved_sku");
    const purchase = await findPurchaseByExternalOrder(
      handle.db,
      "sejoli_bridge",
      "superlatif.id",
      "SJ-UNKNOWN-SKU-1",
    );
    const cases = await listReconciliationCasesForPurchase(handle.db, purchase!.id);
    const kase = cases.find((c) => c.caseType === "unknown_sku")!;
    expect(kase.status).toBe("open");

    const beforeAccess = await getEffectiveAccess(
      handle.db,
      cache,
      studentId,
      { targetType: "program", targetRef: TARGET_REF, action: "view" },
      LATER,
    );
    expect(beforeAccess.allowed).toBe(false);

    // Fix the mapping - the underlying blocker dok 30 §10.1 describes ("fix mapping/adapter").
    await createSkuMapping(handle.db, {
      provider: "sejoli_bridge",
      site: "superlatif.id",
      externalSkuId: "sku-unknown-repair-2026",
      mappingVersion: 1,
      offerId,
      validFrom: NOW,
    });

    const repaired = await repairReconciliationCase(
      handle.db,
      cache,
      { caseId: kase.id, actorUserId: operator, reason: "SKU mapping added" },
      LATER,
    );
    expect(repaired.kind).toBe("repaired");
    if (repaired.kind !== "repaired") return;
    expect(repaired.grantsIssued).toHaveLength(1);
    const grantId = repaired.grantsIssued[0]!;

    // Audit trail: who/when/why, stamped on the case.
    const casesAfter = await listReconciliationCasesForPurchase(handle.db, purchase!.id);
    const resolvedCase = casesAfter.find((c) => c.id === kase.id)!;
    expect(resolvedCase.status).toBe("resolved");
    expect(resolvedCase.resolvedByUserId).toBe(operator);
    expect(resolvedCase.resolutionReason).toBe("SKU mapping added");
    expect(resolvedCase.resolvedAt).not.toBeNull();

    // Access invalidation: the cache reflects the repair immediately.
    const afterAccess = await getEffectiveAccess(
      handle.db,
      cache,
      studentId,
      { targetType: "program", targetRef: TARGET_REF, action: "view" },
      EVEN_LATER,
    );
    expect(afterAccess.allowed).toBe(true);
    expect(afterAccess.decisiveGrantIds).toEqual([grantId]);

    // Double repair: calling it again is idempotent - no second grant, audit trail unchanged.
    const secondRepair = await repairReconciliationCase(
      handle.db,
      cache,
      { caseId: kase.id, actorUserId: operator, reason: "trying again" },
      EVEN_LATER,
    );
    expect(secondRepair.kind).toBe("already_resolved");
    const grants = await listGrantsForUser(handle.db, studentId);
    const purchaseGrants = grants.filter((g) => g.sourceType === "purchase" && g.sourceId === purchase!.id);
    expect(purchaseGrants).toHaveLength(1);
    const casesAfterSecond = await listReconciliationCasesForPurchase(handle.db, purchase!.id);
    expect(casesAfterSecond.find((c) => c.id === kase.id)?.resolutionReason).toBe("SKU mapping added"); // unchanged by the second call
  });
});

describe("required negative test: unauthorized operator", () => {
  it("a plain student cannot repair a reconciliation case", async () => {
    const student = await makeStudent("wp-user-2@example.test");
    await setupOfferGrantingTarget("sku-unauth-1-2026", { skipMapping: true });
    const paidEvent = await ingestNormalizedEvent({
      eventId: "evt-unauth-1-paid",
      externalOrderId: "SJ-UNAUTH-1",
      rawStatus: "completed",
      externalSkuId: "sku-unauth-1-2026",
      externalUserId: "wp-user-2",
      occurredAt: NOW.toISOString(),
    });
    await processPurchaseLifecycleEvent(handle.db, cache, paidEvent, NOW);
    const purchase = await findPurchaseByExternalOrder(
      handle.db,
      "sejoli_bridge",
      "superlatif.id",
      "SJ-UNAUTH-1",
    );
    const kase = (await listReconciliationCasesForPurchase(handle.db, purchase!.id))[0]!;

    await expect(
      repairReconciliationCase(
        handle.db,
        cache,
        { caseId: kase.id, actorUserId: student, reason: "trying anyway" },
        LATER,
      ),
    ).rejects.toThrow(ReconciliationRepairNotAuthorizedError);

    const casesAfter = await listReconciliationCasesForPurchase(handle.db, purchase!.id);
    expect(casesAfter.find((c) => c.id === kase.id)?.status).toBe("open"); // untouched
  });

  it("academic_admin (read-only on reconciliation.manage) cannot repair either - a role that can SEE a case is not automatically allowed to CHANGE it", async () => {
    const academicAdmin = await makeAcademicAdmin("academic-1@superlatif.id");
    await setupOfferGrantingTarget("sku-unauth-2-2026", { skipMapping: true });
    const paidEvent = await ingestNormalizedEvent({
      eventId: "evt-unauth-2-paid",
      externalOrderId: "SJ-UNAUTH-2",
      rawStatus: "completed",
      externalSkuId: "sku-unauth-2-2026",
      externalUserId: "wp-user-3",
      occurredAt: NOW.toISOString(),
    });
    await processPurchaseLifecycleEvent(handle.db, cache, paidEvent, NOW);
    const purchase = await findPurchaseByExternalOrder(
      handle.db,
      "sejoli_bridge",
      "superlatif.id",
      "SJ-UNAUTH-2",
    );
    const kase = (await listReconciliationCasesForPurchase(handle.db, purchase!.id))[0]!;

    await expect(
      repairReconciliationCase(
        handle.db,
        cache,
        { caseId: kase.id, actorUserId: academicAdmin, reason: "trying anyway" },
        LATER,
      ),
    ).rejects.toThrow(ReconciliationRepairNotAuthorizedError);
  });
});

describe("required negative test: no silent mutation", () => {
  it("repairing an unknown-SKU case whose SKU is STILL unmapped leaves the case open and creates no grant", async () => {
    const operator = await makeOperationsAdmin("ops-2@superlatif.id");
    await setupOfferGrantingTarget("sku-still-unmapped-2026", { skipMapping: true });
    const paidEvent = await ingestNormalizedEvent({
      eventId: "evt-still-unmapped-paid",
      externalOrderId: "SJ-STILL-UNMAPPED-1",
      rawStatus: "completed",
      externalSkuId: "sku-still-unmapped-2026",
      externalUserId: "wp-user-4",
      occurredAt: NOW.toISOString(),
    });
    await processPurchaseLifecycleEvent(handle.db, cache, paidEvent, NOW);
    const purchase = await findPurchaseByExternalOrder(
      handle.db,
      "sejoli_bridge",
      "superlatif.id",
      "SJ-STILL-UNMAPPED-1",
    );
    const kase = (await listReconciliationCasesForPurchase(handle.db, purchase!.id))[0]!;

    const outcome = await repairReconciliationCase(
      handle.db,
      cache,
      { caseId: kase.id, actorUserId: operator, reason: "attempting repair" },
      LATER,
    );
    expect(outcome.kind).toBe("still_blocked");

    const purchaseAfter = await findPurchaseByExternalOrder(
      handle.db,
      "sejoli_bridge",
      "superlatif.id",
      "SJ-STILL-UNMAPPED-1",
    );
    expect(purchaseAfter?.offerId).toBeNull(); // untouched
    const casesAfter = await listReconciliationCasesForPurchase(handle.db, purchase!.id);
    expect(casesAfter.find((c) => c.id === kase.id)?.status).toBe("open"); // untouched, never silently marked resolved
    const grants = await listGrantsForUser(
      handle.db,
      (await findPurchaseByExternalOrder(handle.db, "sejoli_bridge", "superlatif.id", "SJ-STILL-UNMAPPED-1"))!
        .userId!,
    );
    expect(grants).toHaveLength(0);
  });
});

describe("required support: unresolved identity", () => {
  it("repairing an unresolved-identity case once the identity is linked issues the grant", async () => {
    const operator = await makeOperationsAdmin("ops-3@superlatif.id");
    await setupOfferGrantingTarget("sku-identity-repair-2026");

    const paidEvent = await ingestNormalizedEvent({
      eventId: "evt-identity-paid",
      externalOrderId: "SJ-IDENTITY-1",
      rawStatus: "completed",
      externalSkuId: "sku-identity-repair-2026",
      externalUserId: "wp-user-unlinked-1",
      occurredAt: NOW.toISOString(),
    });
    const paidOutcome = await processPurchaseLifecycleEvent(handle.db, cache, paidEvent, NOW);
    expect(paidOutcome.kind).toBe("unresolved_identity");
    const purchase = await findPurchaseByExternalOrder(
      handle.db,
      "sejoli_bridge",
      "superlatif.id",
      "SJ-IDENTITY-1",
    );
    const kase = (await listReconciliationCasesForPurchase(handle.db, purchase!.id)).find(
      (c) => c.caseType === "unresolved_identity",
    )!;

    const studentId = await makeStudent("wp-user-unlinked-1@example.test");
    await linkExternalIdentity(handle.db, {
      userId: studentId,
      provider: "sejoli_bridge",
      externalSubject: "wp-user-unlinked-1",
      linkReason: "identity resolved via support",
    });

    const outcome = await repairReconciliationCase(
      handle.db,
      cache,
      { caseId: kase.id, actorUserId: operator, reason: "identity linked" },
      LATER,
    );
    expect(outcome.kind).toBe("repaired");
    if (outcome.kind !== "repaired") return;
    expect(outcome.grantsIssued).toHaveLength(1);

    const access = await getEffectiveAccess(
      handle.db,
      cache,
      studentId,
      { targetType: "program", targetRef: TARGET_REF, action: "view" },
      LATER,
    );
    expect(access.allowed).toBe(true);
  });
});

describe("required support: ambiguous transition (refund mismatch repair)", () => {
  it("decision=apply forces a stale-but-legitimate refund through once reviewed", async () => {
    const operator = await makeFinanceReconciliation("finance-1@superlatif.id");
    await setupOfferGrantingTarget("sku-ambiguous-apply-2026");
    const studentId = await makeStudent("wp-user-ambiguous-1@example.test");
    await linkExternalIdentity(handle.db, {
      userId: studentId,
      provider: "sejoli_bridge",
      externalSubject: "wp-user-ambiguous-1",
      linkReason: "test fixture",
    });

    const paidEvent = await ingestNormalizedEvent({
      eventId: "evt-ambiguous-apply-paid",
      externalOrderId: "SJ-AMBIGUOUS-APPLY-1",
      rawStatus: "completed",
      externalSkuId: "sku-ambiguous-apply-2026",
      externalUserId: "wp-user-ambiguous-1",
      occurredAt: NOW.toISOString(),
    });
    const paidOutcome = await processPurchaseLifecycleEvent(handle.db, cache, paidEvent, NOW);
    if (paidOutcome.kind !== "processed") throw new Error("expected processed");
    const grantId = paidOutcome.grantsIssued[0]!;

    // A genuine refund, but delivered with an EARLIER occurredAt than the
    // paid event - flagged "stale" (ambiguous), not auto-applied.
    const refundEvent = await ingestNormalizedEvent({
      eventId: "evt-ambiguous-apply-refund",
      externalOrderId: "SJ-AMBIGUOUS-APPLY-1",
      rawStatus: "refunded",
      externalSkuId: "sku-ambiguous-apply-2026",
      externalUserId: "wp-user-ambiguous-1",
      occurredAt: EARLIER.toISOString(),
    });
    const refundEventOutcome = await processPurchaseLifecycleEvent(handle.db, cache, refundEvent, NOW);
    if (refundEventOutcome.kind !== "processed") throw new Error("expected processed");
    expect(refundEventOutcome.transitionOutcome).toBe("ignored_out_of_order");

    const purchase = await findPurchaseByExternalOrder(
      handle.db,
      "sejoli_bridge",
      "superlatif.id",
      "SJ-AMBIGUOUS-APPLY-1",
    );
    const kase = (await listReconciliationCasesForPurchase(handle.db, purchase!.id)).find(
      (c) => c.caseType === "ambiguous_transition",
    )!;

    const outcome = await repairReconciliationCase(
      handle.db,
      cache,
      {
        caseId: kase.id,
        actorUserId: operator,
        reason: "reviewed - refund confirmed legitimate",
        decision: "apply",
      },
      LATER,
    );
    expect(outcome.kind).toBe("repaired");
    if (outcome.kind !== "repaired") return;
    expect(outcome.grantsRevoked).toEqual([grantId]);

    const purchaseAfter = await findPurchaseByExternalOrder(
      handle.db,
      "sejoli_bridge",
      "superlatif.id",
      "SJ-AMBIGUOUS-APPLY-1",
    );
    expect(purchaseAfter?.status).toBe("refunded_full");
    const access = await getEffectiveAccess(
      handle.db,
      cache,
      studentId,
      { targetType: "program", targetRef: TARGET_REF, action: "view" },
      LATER,
    );
    expect(access.allowed).toBe(false);
  });

  it("decision=reject resolves the case with no purchase or grant mutation at all", async () => {
    const operator = await makeOperationsAdmin("ops-4@superlatif.id");
    await setupOfferGrantingTarget("sku-ambiguous-reject-2026");
    await makeStudent("wp-user-ambiguous-2@example.test");

    const paidEvent = await ingestNormalizedEvent({
      eventId: "evt-ambiguous-reject-paid",
      externalOrderId: "SJ-AMBIGUOUS-REJECT-1",
      rawStatus: "completed",
      externalSkuId: "sku-ambiguous-reject-2026",
      externalUserId: "wp-user-ambiguous-2",
      occurredAt: NOW.toISOString(),
    });
    await processPurchaseLifecycleEvent(handle.db, cache, paidEvent, NOW);

    // paid -> pending is always illegal, regardless of timestamp (dok 22 §18).
    const badEvent = await ingestNormalizedEvent({
      eventId: "evt-ambiguous-reject-pending",
      externalOrderId: "SJ-AMBIGUOUS-REJECT-1",
      rawStatus: "pending",
      externalSkuId: "sku-ambiguous-reject-2026",
      externalUserId: "wp-user-ambiguous-2",
      occurredAt: LATER.toISOString(),
    });
    await processPurchaseLifecycleEvent(handle.db, cache, badEvent, LATER);

    const purchase = await findPurchaseByExternalOrder(
      handle.db,
      "sejoli_bridge",
      "superlatif.id",
      "SJ-AMBIGUOUS-REJECT-1",
    );
    const kase = (await listReconciliationCasesForPurchase(handle.db, purchase!.id)).find(
      (c) => c.caseType === "ambiguous_transition",
    )!;

    const outcome = await repairReconciliationCase(
      handle.db,
      cache,
      {
        caseId: kase.id,
        actorUserId: operator,
        reason: "confirmed spurious replay, ignoring",
        decision: "reject",
      },
      EVEN_LATER,
    );
    expect(outcome.kind).toBe("rejected");

    const purchaseAfter = await findPurchaseByExternalOrder(
      handle.db,
      "sejoli_bridge",
      "superlatif.id",
      "SJ-AMBIGUOUS-REJECT-1",
    );
    expect(purchaseAfter?.status).toBe("paid"); // untouched

    const casesAfter = await listReconciliationCasesForPurchase(handle.db, purchase!.id);
    expect(casesAfter.find((c) => c.id === kase.id)?.status).toBe("ignored_with_reason");
  });
});

describe("required support: chargeback review", () => {
  it("decision=apply confirms the chargeback - the suspended grant is revoked", async () => {
    const operator = await makeOperationsAdmin("ops-5@superlatif.id");
    await setupOfferGrantingTarget("sku-chargeback-apply-2026");
    const studentId = await makeStudent("wp-user-chargeback-1@example.test");
    await linkExternalIdentity(handle.db, {
      userId: studentId,
      provider: "sejoli_bridge",
      externalSubject: "wp-user-chargeback-1",
      linkReason: "test fixture",
    });

    const paidEvent = await ingestNormalizedEvent({
      eventId: "evt-chargeback-apply-paid",
      externalOrderId: "SJ-CHARGEBACK-APPLY-1",
      rawStatus: "completed",
      externalSkuId: "sku-chargeback-apply-2026",
      externalUserId: "wp-user-chargeback-1",
      occurredAt: NOW.toISOString(),
    });
    const paidOutcome = await processPurchaseLifecycleEvent(handle.db, cache, paidEvent, NOW);
    if (paidOutcome.kind !== "processed") throw new Error("expected processed");
    const grantId = paidOutcome.grantsIssued[0]!;

    const chargebackEvent = await ingestNormalizedEvent({
      eventId: "evt-chargeback-apply-chargeback",
      externalOrderId: "SJ-CHARGEBACK-APPLY-1",
      rawStatus: "chargeback",
      externalSkuId: "sku-chargeback-apply-2026",
      externalUserId: "wp-user-chargeback-1",
      occurredAt: LATER.toISOString(),
    });
    await processPurchaseLifecycleEvent(handle.db, cache, chargebackEvent, LATER);

    const purchase = await findPurchaseByExternalOrder(
      handle.db,
      "sejoli_bridge",
      "superlatif.id",
      "SJ-CHARGEBACK-APPLY-1",
    );
    const kase = (await listReconciliationCasesForPurchase(handle.db, purchase!.id)).find(
      (c) => c.caseType === "chargeback_review",
    )!;
    expect(kase.evidence["suspendedGrantIds"]).toEqual([grantId]);

    const outcome = await repairReconciliationCase(
      handle.db,
      cache,
      {
        caseId: kase.id,
        actorUserId: operator,
        reason: "chargeback confirmed by payment provider",
        decision: "apply",
      },
      EVEN_LATER,
    );
    expect(outcome.kind).toBe("repaired");
    if (outcome.kind !== "repaired") return;
    expect(outcome.grantsRevoked).toEqual([grantId]);

    const events = await listGrantEvents(handle.db, grantId);
    expect(events.some((e) => e.eventType === "revoked")).toBe(true);
  });

  it("decision=reject resolves the case without touching the suspended grant", async () => {
    const operator = await makeOperationsAdmin("ops-6@superlatif.id");
    await setupOfferGrantingTarget("sku-chargeback-reject-2026");
    const studentId = await makeStudent("wp-user-chargeback-2@example.test");
    await linkExternalIdentity(handle.db, {
      userId: studentId,
      provider: "sejoli_bridge",
      externalSubject: "wp-user-chargeback-2",
      linkReason: "test fixture",
    });

    const paidEvent = await ingestNormalizedEvent({
      eventId: "evt-chargeback-reject-paid",
      externalOrderId: "SJ-CHARGEBACK-REJECT-1",
      rawStatus: "completed",
      externalSkuId: "sku-chargeback-reject-2026",
      externalUserId: "wp-user-chargeback-2",
      occurredAt: NOW.toISOString(),
    });
    const paidOutcome = await processPurchaseLifecycleEvent(handle.db, cache, paidEvent, NOW);
    if (paidOutcome.kind !== "processed") throw new Error("expected processed");
    const grantId = paidOutcome.grantsIssued[0]!;

    const chargebackEvent = await ingestNormalizedEvent({
      eventId: "evt-chargeback-reject-chargeback",
      externalOrderId: "SJ-CHARGEBACK-REJECT-1",
      rawStatus: "chargeback",
      externalSkuId: "sku-chargeback-reject-2026",
      externalUserId: "wp-user-chargeback-2",
      occurredAt: LATER.toISOString(),
    });
    await processPurchaseLifecycleEvent(handle.db, cache, chargebackEvent, LATER);
    const purchase = await findPurchaseByExternalOrder(
      handle.db,
      "sejoli_bridge",
      "superlatif.id",
      "SJ-CHARGEBACK-REJECT-1",
    );
    const kase = (await listReconciliationCasesForPurchase(handle.db, purchase!.id)).find(
      (c) => c.caseType === "chargeback_review",
    )!;

    const outcome = await repairReconciliationCase(
      handle.db,
      cache,
      {
        caseId: kase.id,
        actorUserId: operator,
        reason: "chargeback dispute resolved in student's favor",
        decision: "reject",
      },
      EVEN_LATER,
    );
    expect(outcome.kind).toBe("rejected");

    const events = await listGrantEvents(handle.db, grantId);
    expect(events.some((e) => e.eventType === "revoked")).toBe(false);
    expect(events.some((e) => e.eventType === "reinstated")).toBe(false); // reject never mutates the grant either way
  });
});

describe("owner assignment (dok 25 §13 queue state)", () => {
  it("assigns a case to an operator, and the assignment itself is authorization-gated", async () => {
    const operator = await makeOperationsAdmin("ops-7@superlatif.id");
    const student = await makeStudent("wp-user-assign@example.test");
    await setupOfferGrantingTarget("sku-assign-2026", { skipMapping: true });
    const paidEvent = await ingestNormalizedEvent({
      eventId: "evt-assign-paid",
      externalOrderId: "SJ-ASSIGN-1",
      rawStatus: "completed",
      externalSkuId: "sku-assign-2026",
      externalUserId: "wp-user-assign",
      occurredAt: NOW.toISOString(),
    });
    await processPurchaseLifecycleEvent(handle.db, cache, paidEvent, NOW);
    const purchase = await findPurchaseByExternalOrder(
      handle.db,
      "sejoli_bridge",
      "superlatif.id",
      "SJ-ASSIGN-1",
    );
    const kase = (await listReconciliationCasesForPurchase(handle.db, purchase!.id))[0]!;

    await expect(assignReconciliationCaseToOperator(handle.db, student, kase.id, operator)).rejects.toThrow(
      ReconciliationRepairNotAuthorizedError,
    );

    const assigned = await assignReconciliationCaseToOperator(handle.db, operator, kase.id, operator);
    expect(assigned.status).toBe("assigned");
    expect(assigned.assignedToUserId).toBe(operator);
  });
});
