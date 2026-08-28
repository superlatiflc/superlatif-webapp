import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deriveOfferSaleState } from "@superlatif/domain/commerce";
import { createPolicyDraft, publishPolicyVersion } from "../access/index.ts";
import { createTestDatabase, type TestDatabaseHandle } from "../test-client.ts";
import { offers } from "../schema/index.ts";
import { createProduct, createProductVersionDraft } from "./product-repository.ts";
import {
  OfferChecksumMismatchError,
  createOfferDraft,
  findOfferByCodeVersion,
  publishOffer,
} from "./offer-repository.ts";

const NOW = new Date("2026-08-29T00:00:00.000Z");

function lifetimePolicyConfig(code: string) {
  return {
    schemaVersion: 2,
    code,
    version: 1,
    title: code,
    validity: { mode: "lifetime", timezone: "Asia/Jakarta" },
    claims: [
      {
        targetType: "exam_batch",
        targetRef: { code: "placeholder" },
        actions: ["start_attempt"],
        includeDescendants: false,
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
let productVersionId: string;

beforeEach(async () => {
  handle = await createTestDatabase();
  const policy = await createPolicyDraft(handle.db, {
    code: "BATCH_POLICY",
    version: 1,
    title: "Batch policy",
    config: lifetimePolicyConfig("BATCH_POLICY"),
  });
  await publishPolicyVersion(handle.db, policy.id, NOW);
  const product = await createProduct(handle.db, {
    code: "TO_SKD_BATCH_01",
    name: "TO SKD Batch 01",
    type: "tryout_batch",
  });
  const { version } = await createProductVersionDraft(handle.db, {
    productId: product.id,
    version: 1,
    benefitsSummary: {},
    termsVersion: "t1",
    components: [
      {
        componentCode: "batch-01",
        accessPolicyId: policy.id,
        targetType: "exam_batch",
        targetRef: "batch:skd-01",
        includeDescendants: false,
      },
    ],
  });
  productVersionId = version.id;
});

afterEach(async () => {
  await handle.close();
});

describe("offer publication is versioned (COM-001 acceptance)", () => {
  it("creates a draft offer with a stamped checksum", async () => {
    const offer = await createOfferDraft(handle.db, {
      productVersionId,
      code: "TO_SKD_B01_FLASH",
      version: 1,
      title: "Flash Sale TO SKD Batch 01",
      currentAmountMinor: 19_900_00,
      termsVersion: "t1",
    });
    expect(offer.status).toBe("draft");
    expect(offer.checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects a second offer with the same (code, version)", async () => {
    const input = {
      productVersionId,
      code: "DUP_OFFER",
      version: 1,
      title: "v1",
      currentAmountMinor: 100_000,
      termsVersion: "t1",
    };
    await createOfferDraft(handle.db, input);
    await expect(createOfferDraft(handle.db, input)).rejects.toThrow();
  });

  it("publishing advances status without touching price/window/checksum", async () => {
    const offer = await createOfferDraft(handle.db, {
      productVersionId,
      code: "PUBLISH_OFFER",
      version: 1,
      title: "v1",
      currentAmountMinor: 199_000,
      termsVersion: "t1",
    });
    await publishOffer(handle.db, offer.id, NOW);
    const [row] = await handle.db.select().from(offers).where(eq(offers.id, offer.id)).limit(1);
    expect(row?.status).toBe("published");
    expect(row?.checksum).toBe(offer.checksum);
    expect(row?.lockedAt?.toISOString()).toBe(NOW.toISOString());
  });

  it("a new version requires a new row - findOfferByCodeVersion returns the exact version asked for", async () => {
    await createOfferDraft(handle.db, {
      productVersionId,
      code: "TO_SKD_B01_FLASH_V",
      version: 1,
      title: "v1",
      currentAmountMinor: 199_000,
      termsVersion: "t1",
    });
    await createOfferDraft(handle.db, {
      productVersionId,
      code: "TO_SKD_B01_FLASH_V",
      version: 2,
      title: "v2",
      currentAmountMinor: 149_000,
      termsVersion: "t2",
    });

    const v1 = await findOfferByCodeVersion(handle.db, "TO_SKD_B01_FLASH_V", 1);
    const v2 = await findOfferByCodeVersion(handle.db, "TO_SKD_B01_FLASH_V", 2);
    expect(v1?.currentAmountMinor).toBe(199_000);
    expect(v2?.currentAmountMinor).toBe(149_000);
  });

  it("publishOffer refuses to publish an offer whose stored checksum no longer matches its terms", async () => {
    const offer = await createOfferDraft(handle.db, {
      productVersionId,
      code: "TAMPER_OFFER",
      version: 1,
      title: "v1",
      currentAmountMinor: 199_000,
      termsVersion: "t1",
    });
    await handle.db.update(offers).set({ currentAmountMinor: 1 }).where(eq(offers.id, offer.id));
    await expect(publishOffer(handle.db, offer.id, NOW)).rejects.toThrow(OfferChecksumMismatchError);
  });
});

describe("offer sale state (COM-001 acceptance: flash sale window, expired offer)", () => {
  it("flash sale window test: an offer moves scheduled -> on_sale -> ended across its stored sale window", async () => {
    const offer = await createOfferDraft(handle.db, {
      productVersionId,
      code: "FLASH_WINDOW",
      version: 1,
      title: "Flash Sale",
      currentAmountMinor: 99_000,
      termsVersion: "t1",
      saleStartsAt: new Date("2026-09-01T00:00:00.000Z"),
      saleEndsAt: new Date("2026-09-02T00:00:00.000Z"),
    });
    await publishOffer(handle.db, offer.id, NOW);
    const row = await findOfferByCodeVersion(handle.db, "FLASH_WINDOW", 1);
    if (!row) throw new Error("offer not found");

    const stateAt = (at: Date) =>
      deriveOfferSaleState(
        {
          editorialStatus: row.status as "published",
          visibility: row.visibility as "public",
          saleStartsAt: row.saleStartsAt,
          saleEndsAt: row.saleEndsAt,
          quota: row.quota,
          soldCount: null,
        },
        at,
      );

    expect(stateAt(new Date("2026-08-31T00:00:00.000Z"))).toBe("scheduled");
    expect(stateAt(new Date("2026-09-01T12:00:00.000Z"))).toBe("on_sale");
    expect(stateAt(new Date("2026-09-02T00:00:00.000Z"))).toBe("ended");
  });

  it("expired offer test: an offer past its saleEndsAt reports ended, but its row (and terms) remain in place - the exam window is not the sale window", async () => {
    const offer = await createOfferDraft(handle.db, {
      productVersionId,
      code: "EXPIRED_OFFER",
      version: 1,
      title: "Early Bird",
      currentAmountMinor: 199_000,
      termsVersion: "t1",
      saleStartsAt: new Date("2026-08-01T00:00:00.000Z"),
      saleEndsAt: new Date("2026-08-15T00:00:00.000Z"),
    });
    await publishOffer(handle.db, offer.id, NOW);

    const row = await findOfferByCodeVersion(handle.db, "EXPIRED_OFFER", 1);
    expect(row).not.toBeNull();
    expect(row?.currentAmountMinor).toBe(199_000);

    const state = deriveOfferSaleState(
      {
        editorialStatus: "published",
        visibility: "public",
        saleStartsAt: row?.saleStartsAt ?? null,
        saleEndsAt: row?.saleEndsAt ?? null,
        quota: null,
        soldCount: null,
      },
      NOW,
    );
    expect(state).toBe("ended");
  });

  it("sold_out is never reported when the offer's quota column is null (not enforced)", async () => {
    const offer = await createOfferDraft(handle.db, {
      productVersionId,
      code: "NO_QUOTA",
      version: 1,
      title: "No quota",
      currentAmountMinor: 99_000,
      termsVersion: "t1",
    });
    await publishOffer(handle.db, offer.id, NOW);
    const row = await findOfferByCodeVersion(handle.db, "NO_QUOTA", 1);
    expect(row?.quota).toBeNull();
    const state = deriveOfferSaleState(
      {
        editorialStatus: "published",
        visibility: "public",
        saleStartsAt: null,
        saleEndsAt: null,
        quota: row?.quota ?? null,
        soldCount: 999_999,
      },
      NOW,
    );
    expect(state).toBe("on_sale");
  });

  it("sold_out IS reported once a published offer's real quota column is reached", async () => {
    const offer = await createOfferDraft(handle.db, {
      productVersionId,
      code: "ENFORCED_QUOTA",
      version: 1,
      title: "Enforced quota",
      currentAmountMinor: 99_000,
      termsVersion: "t1",
      quota: 50,
    });
    await publishOffer(handle.db, offer.id, NOW);
    const row = await findOfferByCodeVersion(handle.db, "ENFORCED_QUOTA", 1);
    expect(row?.quota).toBe(50);
    const state = deriveOfferSaleState(
      {
        editorialStatus: "published",
        visibility: "public",
        saleStartsAt: null,
        saleEndsAt: null,
        quota: row?.quota ?? null,
        soldCount: 50,
      },
      NOW,
    );
    expect(state).toBe("sold_out");
  });
});
