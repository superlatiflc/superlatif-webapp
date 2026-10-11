// M2 Purchase -> Entitlement, end to end against real Postgres (ADR-074).
//
// Every scenario goes through receiveCommerceEvent - the exact function the
// webhook route calls after signature verification - and asserts on
// EFFECTIVE ACCESS (what the student can actually open), not only on rows.
// Buyers are identified the way production identifies them: the WordPress
// `users.ID` a Sejoli order carries (OD-02 outcome (a)), linked under the
// `wordpress` identity provider by the sign-in bridge.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WIRE_EVENT_TYPE_STATUS_MAP_V1, type CommerceEventEnvelope } from "@superlatif/domain/commerce";
import { createInMemoryEffectiveAccessCache, type EffectiveAccessCache } from "@superlatif/domain/access";
import { WORDPRESS_LOGIN_PROVIDER } from "@superlatif/domain/identity";
import { createUser, linkExternalIdentity } from "../identity/repository.ts";
import { createPolicyDraft, publishPolicyVersion } from "../access/policy-repository.ts";
import { getEffectiveAccess, issueGrantAndInvalidate } from "../access/effective-access-service.ts";
import { listGrantsForUser } from "../access/grant-repository.ts";
import { createTestDatabase, type TestDatabaseHandle } from "../test-client.ts";
import { createProduct, createProductVersionDraft, publishProductVersion } from "./product-repository.ts";
import { createOfferDraft, publishOffer } from "./offer-repository.ts";
import { createSkuMapping } from "./sku-mapping-repository.ts";
import { ingestCommerceEvent } from "./commerce-event-service.ts";
import { findRawCommerceEventByKey } from "./commerce-event-repository.ts";
import { findPurchaseByExternalOrder, listPurchaseEvents } from "./purchase-repository.ts";
import { listReconciliationCasesForPurchase } from "./reconciliation-repository.ts";
import { receiveCommerceEvent } from "./commerce-receipt-service.ts";
import { claimPurchasesForUser } from "./purchase-claim-service.ts";

const PROVIDER = "sejoli_bridge";
const SITE = "wp-staging.superlatif.id";
const SKU = "9001";
const TARGET_REF = "program:skd-2026";
const T0 = new Date("2026-09-24T03:00:00.000Z");
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

let handle: TestDatabaseHandle;
let cache: EffectiveAccessCache;

beforeEach(async () => {
  handle = await createTestDatabase();
  cache = createInMemoryEffectiveAccessCache();
});

afterEach(async () => {
  await handle.close();
});

function policyConfig(code: string) {
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

/** A published one-component offer for TARGET_REF, mapped from Sejoli product SKU. */
async function setupCatalogue(): Promise<string> {
  const policy = await createPolicyDraft(handle.db, {
    code: "POLICY_SKD_2026",
    version: 1,
    title: "SKD 2026",
    config: policyConfig("POLICY_SKD_2026"),
  });
  await publishPolicyVersion(handle.db, policy.id, T0);
  const product = await createProduct(handle.db, {
    code: "PROD_SKD_2026",
    name: "SKD 2026",
    type: "full_program_bundle",
  });
  const { version } = await createProductVersionDraft(handle.db, {
    productId: product.id,
    version: 1,
    benefitsSummary: {},
    termsVersion: "terms-2026-09",
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
  await publishProductVersion(handle.db, version.id, T0);
  const offer = await createOfferDraft(handle.db, {
    productVersionId: version.id,
    code: "OFFER_SKD_2026",
    version: 1,
    title: "SKD 2026",
    currentAmountMinor: 149_000,
    termsVersion: "terms-2026-09",
  });
  await publishOffer(handle.db, offer.id, T0);
  await createSkuMapping(handle.db, {
    provider: PROVIDER,
    site: SITE,
    externalSkuId: SKU,
    mappingVersion: 1,
    offerId: offer.id,
    validFrom: at(-60),
  });
  return policy.id;
}

/** What the WordPress bridge sign-in leaves behind: an app user linked to a WordPress user ID. */
async function signedInStudent(wordpressUserId: string): Promise<string> {
  const user = await createUser(handle.db, { emailNormalized: null, phoneE164: null });
  await linkExternalIdentity(handle.db, {
    userId: user.userId,
    provider: WORDPRESS_LOGIN_PROVIDER,
    externalSubject: wordpressUserId,
    linkReason: "wordpress bridge sign-in (test)",
  });
  return user.userId;
}

interface Delivery {
  readonly eventId: string;
  readonly eventType: string;
  readonly order: string;
  readonly buyer: string;
  readonly occurredAt: Date;
  readonly sku?: string;
  readonly verified?: boolean;
}

/** One webhook delivery, as the route hands it over after checking the signature. */
function deliver(d: Delivery) {
  const rawPayload = {
    schemaVersion: 1,
    eventId: d.eventId,
    eventType: d.eventType,
    occurredAt: d.occurredAt.toISOString(),
    order: { externalOrderId: d.order, externalSkuId: d.sku ?? SKU, externalUserId: d.buyer },
    customer: { emailHash: null, phoneHash: null },
    amounts: {
      currency: "IDR",
      grossMinor: 149_000,
      discountMinor: 0,
      netSettledMinor: 149_000,
      refundedMinor: 0,
    },
    rawPayloadChecksum: "0".repeat(64),
  };
  const envelope: CommerceEventEnvelope = {
    provider: PROVIDER,
    site: SITE,
    eventId: d.eventId,
    type: "purchase.status_changed",
    occurredAt: rawPayload.occurredAt,
    order: {
      externalId: d.order,
      status: d.eventType,
      currency: "IDR",
      amountMinor: 149_000,
      externalUserId: d.buyer,
      externalSkuId: d.sku ?? SKU,
    },
    schemaVersion: 1,
  };
  return receiveCommerceEvent(
    handle.db,
    cache,
    {
      envelope,
      rawPayload,
      signatureOutcome: d.verified === false ? "failed" : "verified",
      correlationId: `corr-${d.eventId}`,
      statusMap: WIRE_EVENT_TYPE_STATUS_MAP_V1,
    },
    d.occurredAt,
  );
}

async function canOpenProgram(userId: string, now: Date): Promise<boolean> {
  const decision = await getEffectiveAccess(
    handle.db,
    cache,
    userId,
    { targetType: "program", targetRef: TARGET_REF, action: "view" },
    now,
  );
  return decision.allowed;
}

async function purchase(order: string) {
  const row = await findPurchaseByExternalOrder(handle.db, PROVIDER, SITE, order);
  if (!row) throw new Error(`no purchase for ${order}`);
  return row;
}

describe("paid order -> access", () => {
  it("a signed-in buyer gets access as soon as the paid event lands, exactly once", async () => {
    await setupCatalogue();
    const student = await signedInStudent("5638");
    expect(await canOpenProgram(student, at(0))).toBe(false);

    const receipt = await deliver({
      eventId: "e1",
      eventType: "payment_settled",
      order: "9526",
      buyer: "5638",
      occurredAt: at(1),
    });
    expect(receipt.duplicate).toBe(false);
    expect(receipt.lifecycle?.kind).toBe("processed");
    expect(await canOpenProgram(student, at(2))).toBe(true);
    expect(
      (await listGrantsForUser(handle.db, student)).filter((g) => g.sourceType === "purchase"),
    ).toHaveLength(1);
  });

  it("pending grants nothing; the later paid event grants access", async () => {
    await setupCatalogue();
    const student = await signedInStudent("5638");

    await deliver({
      eventId: "e1",
      eventType: "order_pending",
      order: "9526",
      buyer: "5638",
      occurredAt: at(1),
    });
    expect((await purchase("9526")).status).toBe("pending");
    expect(await canOpenProgram(student, at(2))).toBe(false);

    await deliver({
      eventId: "e2",
      eventType: "payment_settled",
      order: "9526",
      buyer: "5638",
      occurredAt: at(3),
    });
    expect((await purchase("9526")).status).toBe("paid");
    expect(await canOpenProgram(student, at(4))).toBe(true);
  });

  it("an unmapped Sejoli product never grants a default: it opens an unknown_sku case", async () => {
    await setupCatalogue();
    const student = await signedInStudent("5638");
    const receipt = await deliver({
      eventId: "e1",
      eventType: "payment_settled",
      order: "9527",
      buyer: "5638",
      sku: "4444",
      occurredAt: at(1),
    });
    expect(receipt.lifecycle?.kind).toBe("unresolved_sku");
    expect(await canOpenProgram(student, at(2))).toBe(false);
  });
});

describe("refund and cancellation revoke only this purchase's access", () => {
  it("refund_full removes access granted by the purchase", async () => {
    await setupCatalogue();
    const student = await signedInStudent("5638");
    await deliver({
      eventId: "e1",
      eventType: "payment_settled",
      order: "9526",
      buyer: "5638",
      occurredAt: at(1),
    });
    expect(await canOpenProgram(student, at(2))).toBe(true);

    await deliver({
      eventId: "e2",
      eventType: "refund_full",
      order: "9526",
      buyer: "5638",
      occurredAt: at(3),
    });
    expect((await purchase("9526")).status).toBe("refunded_full");
    expect(await canOpenProgram(student, at(4))).toBe(false);
  });

  it("order_cancelled after payment removes access", async () => {
    await setupCatalogue();
    const student = await signedInStudent("5638");
    await deliver({
      eventId: "e1",
      eventType: "payment_settled",
      order: "9526",
      buyer: "5638",
      occurredAt: at(1),
    });
    await deliver({
      eventId: "e2",
      eventType: "order_cancelled",
      order: "9526",
      buyer: "5638",
      occurredAt: at(3),
    });
    expect((await purchase("9526")).status).toBe("cancelled");
    expect(await canOpenProgram(student, at(4))).toBe(false);
  });

  it("a refund keeps access that another source (a manual grant) still supports", async () => {
    const policyId = await setupCatalogue();
    const student = await signedInStudent("5638");
    await issueGrantAndInvalidate(handle.db, cache, {
      userId: student,
      sourceType: "manual",
      sourceId: "scholarship-1",
      sourceKey: "scholarship-1",
      accessPolicyId: policyId,
      validFrom: at(0),
      validTo: null,
    });
    await deliver({
      eventId: "e1",
      eventType: "payment_settled",
      order: "9526",
      buyer: "5638",
      occurredAt: at(1),
    });
    await deliver({
      eventId: "e2",
      eventType: "refund_full",
      order: "9526",
      buyer: "5638",
      occurredAt: at(3),
    });
    expect(await canOpenProgram(student, at(4))).toBe(true);
  });
});

describe("delivery semantics: duplicates, order, retries, signatures", () => {
  it("a retried delivery with the same event ID is a duplicate and grants nothing twice", async () => {
    await setupCatalogue();
    const student = await signedInStudent("5638");
    const first = await deliver({
      eventId: "e1",
      eventType: "payment_settled",
      order: "9526",
      buyer: "5638",
      occurredAt: at(1),
    });
    const retry = await deliver({
      eventId: "e1",
      eventType: "payment_settled",
      order: "9526",
      buyer: "5638",
      occurredAt: at(1),
    });
    expect(retry.duplicate).toBe(true);
    expect(retry.rawEventId).toBe(first.rawEventId);
    expect(retry.lifecycle?.kind).toBe("already_processed");
    expect(
      (await listGrantsForUser(handle.db, student)).filter((g) => g.sourceType === "purchase"),
    ).toHaveLength(1);
  });

  it("a paid event older than the refund already applied cannot bring access back", async () => {
    await setupCatalogue();
    const student = await signedInStudent("5638");
    await deliver({
      eventId: "e-refund",
      eventType: "refund_full",
      order: "9526",
      buyer: "5638",
      occurredAt: at(5),
    });
    await deliver({
      eventId: "e-paid",
      eventType: "payment_settled",
      order: "9526",
      buyer: "5638",
      occurredAt: at(1),
    });

    expect((await purchase("9526")).status).toBe("refunded_full");
    expect(await canOpenProgram(student, at(6))).toBe(false);
    const cases = await listReconciliationCasesForPurchase(handle.db, (await purchase("9526")).id);
    expect(cases.map((c) => c.caseType)).toContain("ambiguous_transition");
  });

  it("a retry completes an event whose first delivery was received but never processed", async () => {
    await setupCatalogue();
    const student = await signedInStudent("5638");
    // First delivery: the receipt committed, then the request died before processing.
    const outcome = await ingestCommerceEvent(
      handle.db,
      {
        envelope: {
          provider: PROVIDER,
          site: SITE,
          eventId: "e1",
          type: "purchase.status_changed",
          occurredAt: at(1).toISOString(),
          order: {
            externalId: "9526",
            status: "payment_settled",
            currency: "IDR",
            amountMinor: 149_000,
            externalUserId: "5638",
            externalSkuId: SKU,
          },
          schemaVersion: 1,
        },
        rawPayload: { eventId: "e1", first: true },
        providedSignature: null,
        secret: null,
        precomputedSignatureOutcome: "verified",
        correlationId: "corr-first",
        statusMap: WIRE_EVENT_TYPE_STATUS_MAP_V1,
      },
      at(1),
    );
    expect(outcome.kind).toBe("normalized");
    expect(await canOpenProgram(student, at(2))).toBe(false);

    const retry = await deliver({
      eventId: "e1",
      eventType: "payment_settled",
      order: "9526",
      buyer: "5638",
      occurredAt: at(1),
    });
    expect(retry.duplicate).toBe(true);
    expect(retry.lifecycle?.kind).toBe("processed");
    expect(await canOpenProgram(student, at(3))).toBe(true);
  });

  it("an unverified delivery is stored quarantined and cannot squat the genuine event ID", async () => {
    await setupCatalogue();
    const student = await signedInStudent("5638");
    const forged = await deliver({
      eventId: "e1",
      eventType: "payment_settled",
      order: "9526",
      buyer: "5638",
      occurredAt: at(1),
      verified: false,
    });
    expect(forged.ingest).toBe("quarantined");
    expect(await canOpenProgram(student, at(2))).toBe(false);
    expect(await findRawCommerceEventByKey(handle.db, PROVIDER, "e1")).toBeNull();

    const genuine = await deliver({
      eventId: "e1",
      eventType: "payment_settled",
      order: "9526",
      buyer: "5638",
      occurredAt: at(1),
    });
    expect(genuine.duplicate).toBe(false);
    expect(await canOpenProgram(student, at(3))).toBe(true);
  });

  it("chargeback_resolved is quarantined, not guessed", async () => {
    await setupCatalogue();
    await signedInStudent("5638");
    const receipt = await deliver({
      eventId: "e1",
      eventType: "chargeback_resolved",
      order: "9526",
      buyer: "5638",
      occurredAt: at(1),
    });
    expect(receipt.ingest).toBe("quarantined");
    expect(await findPurchaseByExternalOrder(handle.db, PROVIDER, SITE, "9526")).toBeNull();
  });
});

describe("purchase before the first sign-in", () => {
  it("is recorded without access, then claimed automatically when the buyer signs in", async () => {
    await setupCatalogue();
    const receipt = await deliver({
      eventId: "e1",
      eventType: "payment_settled",
      order: "9526",
      buyer: "5638",
      occurredAt: at(1),
    });
    expect(receipt.lifecycle?.kind).toBe("unresolved_identity");
    const pending = await purchase("9526");
    expect(pending.userId).toBeNull();

    const student = await signedInStudent("5638");
    const claim = await claimPurchasesForUser(handle.db, cache, student, at(10));
    expect(claim.results.map((r) => r.kind)).toEqual(["bound"]);
    expect(claim.grantsIssued).toHaveLength(1);
    expect((await purchase("9526")).userId).toBe(student);
    expect(await canOpenProgram(student, at(11))).toBe(true);

    const [kase] = await listReconciliationCasesForPurchase(handle.db, pending.id);
    expect(kase?.status).toBe("resolved");
    expect(kase?.resolvedByUserId).toBeNull();

    const again = await claimPurchasesForUser(handle.db, cache, student, at(12));
    expect(again.results).toEqual([]);
    expect(
      (await listGrantsForUser(handle.db, student)).filter((g) => g.sourceType === "purchase"),
    ).toHaveLength(1);
  });

  it("a purchase refunded before the buyer signs in is bound but grants nothing", async () => {
    await setupCatalogue();
    await deliver({
      eventId: "e1",
      eventType: "payment_settled",
      order: "9526",
      buyer: "5638",
      occurredAt: at(1),
    });
    await deliver({
      eventId: "e2",
      eventType: "refund_full",
      order: "9526",
      buyer: "5638",
      occurredAt: at(2),
    });

    const student = await signedInStudent("5638");
    const claim = await claimPurchasesForUser(handle.db, cache, student, at(10));
    expect(claim.results.map((r) => r.kind)).toEqual(["bound"]);
    expect(claim.grantsIssued).toEqual([]);
    expect(await canOpenProgram(student, at(11))).toBe(false);
  });

  it("the next event for an unclaimed order binds it once the buyer has signed in", async () => {
    await setupCatalogue();
    await deliver({
      eventId: "e1",
      eventType: "order_pending",
      order: "9526",
      buyer: "5638",
      occurredAt: at(1),
    });
    const student = await signedInStudent("5638");
    await deliver({
      eventId: "e2",
      eventType: "payment_settled",
      order: "9526",
      buyer: "5638",
      occurredAt: at(2),
    });

    expect((await purchase("9526")).userId).toBe(student);
    expect(await canOpenProgram(student, at(3))).toBe(true);
  });
});

describe("no access across users", () => {
  it("another student's sign-in never claims someone else's purchase", async () => {
    await setupCatalogue();
    await deliver({
      eventId: "e1",
      eventType: "payment_settled",
      order: "9526",
      buyer: "5638",
      occurredAt: at(1),
    });

    const other = await signedInStudent("7777");
    const claim = await claimPurchasesForUser(handle.db, cache, other, at(10));
    expect(claim.results).toEqual([]);
    expect(await canOpenProgram(other, at(11))).toBe(false);
    expect((await purchase("9526")).userId).toBeNull();
  });

  it("an event naming a different buyer is recorded but never moves or revokes the order", async () => {
    await setupCatalogue();
    const owner = await signedInStudent("5638");
    const other = await signedInStudent("7777");
    await deliver({
      eventId: "e1",
      eventType: "payment_settled",
      order: "9526",
      buyer: "5638",
      occurredAt: at(1),
    });

    const receipt = await deliver({
      eventId: "e2",
      eventType: "refund_full",
      order: "9526",
      buyer: "7777",
      occurredAt: at(2),
    });
    expect(receipt.lifecycle).toMatchObject({
      kind: "processed",
      transitionOutcome: "ignored_identity_mismatch",
    });

    const row = await purchase("9526");
    expect(row.userId).toBe(owner);
    expect(row.status).toBe("paid");
    expect(await canOpenProgram(owner, at(3))).toBe(true);
    expect(await canOpenProgram(other, at(3))).toBe(false);
    const cases = await listReconciliationCasesForPurchase(handle.db, row.id);
    expect(cases.map((c) => c.caseType)).toContain("identity_mismatch");
    const events = await listPurchaseEvents(handle.db, row.id);
    const ordered = [...events].sort((x, y) => x.occurredAt.getTime() - y.occurredAt.getTime());
    expect(ordered.map((e) => e.transitionOutcome)).toEqual(["applied", "ignored_identity_mismatch"]);
  });

  it("an unclaimed order whose events name two buyers is left for a human, not claimed", async () => {
    await setupCatalogue();
    await deliver({
      eventId: "e1",
      eventType: "order_pending",
      order: "9526",
      buyer: "5638",
      occurredAt: at(1),
    });
    await deliver({
      eventId: "e2",
      eventType: "payment_settled",
      order: "9526",
      buyer: "7777",
      occurredAt: at(2),
    });

    const a = await signedInStudent("5638");
    const b = await signedInStudent("7777");
    const claimA = await claimPurchasesForUser(handle.db, cache, a, at(10));
    const claimB = await claimPurchasesForUser(handle.db, cache, b, at(10));
    expect(claimA.results.map((r) => r.kind)).toEqual(["buyer_mismatch"]);
    expect(claimB.results.map((r) => r.kind)).toEqual(["buyer_mismatch"]);
    expect((await purchase("9526")).userId).toBeNull();
    expect(await canOpenProgram(a, at(11))).toBe(false);
    expect(await canOpenProgram(b, at(11))).toBe(false);
  });
});
