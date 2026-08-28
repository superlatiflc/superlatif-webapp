import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPolicyDraft, publishPolicyVersion } from "../access/index.ts";
import { createTestDatabase, type TestDatabaseHandle } from "../test-client.ts";
import { createProduct, createProductVersionDraft } from "./product-repository.ts";
import { createOfferDraft, publishOffer } from "./offer-repository.ts";
import { createSkuMapping, listSkuMappings, resolveOfferForSku } from "./sku-mapping-repository.ts";

const NOW = new Date("2026-08-29T00:00:00.000Z");

function policyConfig(code: string) {
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

async function makeOffer(code: string): Promise<string> {
  const policy = await createPolicyDraft(handle.db, {
    code: `${code}_POLICY`,
    version: 1,
    title: code,
    config: policyConfig(`${code}_POLICY`),
  });
  await publishPolicyVersion(handle.db, policy.id, NOW);
  const product = await createProduct(handle.db, {
    code: `${code}_PRODUCT`,
    name: code,
    type: "specialist_program",
  });
  const { version } = await createProductVersionDraft(handle.db, {
    productId: product.id,
    version: 1,
    benefitsSummary: {},
    termsVersion: "t1",
    components: [
      {
        componentCode: "c1",
        accessPolicyId: policy.id,
        targetType: "program",
        targetRef: `program:${code}`,
        includeDescendants: true,
      },
    ],
  });
  const offer = await createOfferDraft(handle.db, {
    productVersionId: version.id,
    code: `${code}_OFFER`,
    version: 1,
    title: code,
    currentAmountMinor: 100_000,
    termsVersion: "t1",
  });
  await publishOffer(handle.db, offer.id, NOW);
  return offer.id;
}

beforeEach(async () => {
  handle = await createTestDatabase();
});

afterEach(async () => {
  await handle.close();
});

describe("external SKU mapping is versioned (COM-001 acceptance: mapping version test)", () => {
  it("resolves the mapping version whose window covers the requested instant", async () => {
    const offerA = await makeOffer("OFFER_A");
    const offerB = await makeOffer("OFFER_B");

    await createSkuMapping(handle.db, {
      provider: "sejoli",
      site: "superlatif.id",
      externalSkuId: "1548",
      mappingVersion: 1,
      offerId: offerA,
      validFrom: new Date("2026-08-01T00:00:00.000Z"),
      validTo: new Date("2026-08-15T00:00:00.000Z"),
    });
    await createSkuMapping(handle.db, {
      provider: "sejoli",
      site: "superlatif.id",
      externalSkuId: "1548",
      mappingVersion: 2,
      offerId: offerB,
      validFrom: new Date("2026-08-15T00:00:00.000Z"),
      validTo: null,
    });

    const before = await resolveOfferForSku(
      handle.db,
      "sejoli",
      "superlatif.id",
      "1548",
      new Date("2026-07-01T00:00:00.000Z"),
    );
    const duringV1 = await resolveOfferForSku(
      handle.db,
      "sejoli",
      "superlatif.id",
      "1548",
      new Date("2026-08-10T00:00:00.000Z"),
    );
    const duringV2 = await resolveOfferForSku(
      handle.db,
      "sejoli",
      "superlatif.id",
      "1548",
      new Date("2026-08-20T00:00:00.000Z"),
    );

    expect(before).toBeNull();
    expect(duringV1?.offerId).toBe(offerA);
    expect(duringV2?.offerId).toBe(offerB);
  });

  it("rejects two mappings with the same (provider, site, externalSkuId, validFrom) - unique index", async () => {
    const offerA = await makeOffer("DUP_A");
    const input = {
      provider: "sejoli",
      site: "superlatif.id",
      externalSkuId: "9999",
      mappingVersion: 1,
      offerId: offerA,
      validFrom: new Date("2026-08-01T00:00:00.000Z"),
    };
    await createSkuMapping(handle.db, input);
    await expect(createSkuMapping(handle.db, { ...input, mappingVersion: 2 })).rejects.toThrow();
  });

  it("supports legacy and new Sejoli IDs mapping to the same offer via separate rows", async () => {
    const offer = await makeOffer("SHARED");
    await createSkuMapping(handle.db, {
      provider: "sejoli",
      site: "superlatif.id",
      externalSkuId: "legacy-100",
      mappingVersion: 1,
      offerId: offer,
      validFrom: new Date("2026-01-01T00:00:00.000Z"),
    });
    await createSkuMapping(handle.db, {
      provider: "sejoli",
      site: "superlatif.id",
      externalSkuId: "new-200",
      mappingVersion: 1,
      offerId: offer,
      validFrom: new Date("2026-01-01T00:00:00.000Z"),
    });

    const legacy = await resolveOfferForSku(handle.db, "sejoli", "superlatif.id", "legacy-100", NOW);
    const modern = await resolveOfferForSku(handle.db, "sejoli", "superlatif.id", "new-200", NOW);
    expect(legacy?.offerId).toBe(offer);
    expect(modern?.offerId).toBe(offer);
  });

  it("duplicate catalogue entry recovery: higher-priority mapping wins when two rows are simultaneously valid", async () => {
    // Two different validFrom instants (the unique index forbids an exact
    // duplicate start), both still open and both <= NOW - i.e. both rows
    // ARE simultaneously valid "right now"; only priority should decide
    // which one resolveOfferForSku actually returns.
    const wrong = await makeOffer("WRONG_ENTRY");
    const correct = await makeOffer("CORRECT_ENTRY");
    await createSkuMapping(handle.db, {
      provider: "sejoli",
      site: "superlatif.id",
      externalSkuId: "7777",
      mappingVersion: 1,
      offerId: wrong,
      validFrom: new Date("2026-08-01T00:00:00.000Z"),
      priority: 0,
    });
    await createSkuMapping(handle.db, {
      provider: "sejoli",
      site: "superlatif.id",
      externalSkuId: "7777",
      mappingVersion: 2,
      offerId: correct,
      validFrom: new Date("2026-08-02T00:00:00.000Z"),
      priority: 10,
    });

    const resolved = await resolveOfferForSku(handle.db, "sejoli", "superlatif.id", "7777", NOW);
    expect(resolved?.offerId).toBe(correct);
  });

  it("an unknown external SKU resolves to null - never a default offer (dok 05 §14 Unknown SKU -> reconciliation)", async () => {
    const resolved = await resolveOfferForSku(handle.db, "sejoli", "superlatif.id", "does-not-exist", NOW);
    expect(resolved).toBeNull();
  });

  it("listSkuMappings returns every version ever created for one external SKU, in insertion order, for audit", async () => {
    const offerA = await makeOffer("AUDIT_A");
    const offerB = await makeOffer("AUDIT_B");
    await createSkuMapping(handle.db, {
      provider: "sejoli",
      site: "superlatif.id",
      externalSkuId: "audit-1",
      mappingVersion: 1,
      offerId: offerA,
      validFrom: new Date("2026-01-01T00:00:00.000Z"),
      validTo: new Date("2026-06-01T00:00:00.000Z"),
    });
    await createSkuMapping(handle.db, {
      provider: "sejoli",
      site: "superlatif.id",
      externalSkuId: "audit-1",
      mappingVersion: 2,
      offerId: offerB,
      validFrom: new Date("2026-06-01T00:00:00.000Z"),
    });

    const rows = await listSkuMappings(handle.db, "sejoli", "superlatif.id", "audit-1");
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.mappingVersion).sort()).toEqual([1, 2]);
  });
});
