import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { composeProductTargets, type ProductComponentClaim } from "@superlatif/domain/commerce";
import { createPolicyDraft, publishPolicyVersion } from "../access/index.ts";
import { createTestDatabase, type TestDatabaseHandle } from "../test-client.ts";
import { productVersions } from "../schema/index.ts";
import {
  ProductVersionChecksumMismatchError,
  createProduct,
  createProductVersionDraft,
  findProductVersion,
  listProductComponents,
  publishProductVersion,
} from "./product-repository.ts";

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

/** Publishes a fresh access policy and returns its id - the FK every product_component needs. */
async function publishedPolicyId(code: string): Promise<string> {
  const policy = await createPolicyDraft(handle.db, {
    code,
    version: 1,
    title: code,
    config: lifetimePolicyConfig(code),
  });
  await publishPolicyVersion(handle.db, policy.id, NOW);
  return policy.id;
}

beforeEach(async () => {
  handle = await createTestDatabase();
});

afterEach(async () => {
  await handle.close();
});

describe("createProductVersionDraft (ENT-001 access_policies reused as component templates)", () => {
  it("creates an immutable version with its full component set stamped by one checksum", async () => {
    const product = await createProduct(handle.db, {
      code: "AKSELERASI_2026",
      name: "Kelas Akselerasi Kedinasan 2026",
      type: "full_program_bundle",
    });
    const policyId = await publishedPolicyId("AKS_PROGRAM_POLICY");

    const { version, components } = await createProductVersionDraft(handle.db, {
      productId: product.id,
      version: 1,
      benefitsSummary: { headline: "Program overview + onboarding + roadmap" },
      termsVersion: "terms-2026-08",
      components: [
        {
          componentCode: "program",
          accessPolicyId: policyId,
          targetType: "program",
          targetRef: "program:aks-2026",
          includeDescendants: true,
        },
      ],
    });

    expect(version.status).toBe("draft");
    expect(version.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(components).toHaveLength(1);
    expect(components[0]?.targetRef).toBe("program:aks-2026");
  });

  it("rejects a second version with the same (productId, version) - unique index, not just application logic", async () => {
    const product = await createProduct(handle.db, {
      code: "PAKET_SKD",
      name: "Paket SKD Intensif",
      type: "specialist_program",
    });
    const policyId = await publishedPolicyId("SKD_POLICY");
    const input = {
      productId: product.id,
      version: 1,
      benefitsSummary: {},
      termsVersion: "t1",
      components: [
        {
          componentCode: "skd",
          accessPolicyId: policyId,
          targetType: "program_track",
          targetRef: "track:skd",
          includeDescendants: true,
        },
      ],
    };
    await createProductVersionDraft(handle.db, input);
    await expect(createProductVersionDraft(handle.db, input)).rejects.toThrow();
  });

  it("publishing advances status without touching benefitsSummary, components, or checksum", async () => {
    const product = await createProduct(handle.db, {
      code: "TKA_ONLY",
      name: "Paket TKA",
      type: "specialist_program",
    });
    const policyId = await publishedPolicyId("TKA_POLICY");
    const { version } = await createProductVersionDraft(handle.db, {
      productId: product.id,
      version: 1,
      benefitsSummary: { headline: "TKA track only" },
      termsVersion: "t1",
      components: [
        {
          componentCode: "tka",
          accessPolicyId: policyId,
          targetType: "program_track",
          targetRef: "track:tka",
          includeDescendants: true,
        },
      ],
    });

    await publishProductVersion(handle.db, version.id, NOW);

    const [row] = await handle.db
      .select()
      .from(productVersions)
      .where(eq(productVersions.id, version.id))
      .limit(1);
    expect(row?.status).toBe("published");
    expect(row?.checksum).toBe(version.checksum);
    expect(row?.lockedAt?.toISOString()).toBe(NOW.toISOString());
    const components = await listProductComponents(handle.db, version.id);
    expect(components).toHaveLength(1);
  });

  it("a new version is a new row - editing a draft means authoring version N+1", async () => {
    const product = await createProduct(handle.db, {
      code: "TO_PASS",
      name: "Tryout Pass September",
      type: "tryout_pass",
    });
    const policyId = await publishedPolicyId("TO_PASS_POLICY");
    const v1 = await createProductVersionDraft(handle.db, {
      productId: product.id,
      version: 1,
      benefitsSummary: { batches: ["batch-01"] },
      termsVersion: "t1",
      components: [
        {
          componentCode: "batch-01",
          accessPolicyId: policyId,
          targetType: "exam_batch",
          targetRef: "batch:skd-01",
          includeDescendants: false,
        },
      ],
    });
    await createProductVersionDraft(handle.db, {
      productId: product.id,
      version: 2,
      benefitsSummary: { batches: ["batch-01", "batch-02"] },
      termsVersion: "t2",
      components: [
        {
          componentCode: "batch-01",
          accessPolicyId: policyId,
          targetType: "exam_batch",
          targetRef: "batch:skd-01",
          includeDescendants: false,
        },
        {
          componentCode: "batch-02",
          accessPolicyId: policyId,
          targetType: "exam_batch",
          targetRef: "batch:skd-02",
          includeDescendants: false,
        },
      ],
    });

    const stillV1 = await findProductVersion(handle.db, product.id, 1);
    expect(stillV1?.id).toBe(v1.version.id);
    const v1Components = await listProductComponents(handle.db, v1.version.id);
    expect(v1Components).toHaveLength(1);
  });

  it("publishProductVersion refuses to publish a version whose stored checksum no longer matches its content", async () => {
    const product = await createProduct(handle.db, {
      code: "TAMPER_TEST",
      name: "Tamper Test",
      type: "specialist_program",
    });
    const policyId = await publishedPolicyId("TAMPER_POLICY");
    const { version } = await createProductVersionDraft(handle.db, {
      productId: product.id,
      version: 1,
      benefitsSummary: { headline: "original" },
      termsVersion: "t1",
      components: [
        {
          componentCode: "c1",
          accessPolicyId: policyId,
          targetType: "resource",
          targetRef: "resource:r1",
          includeDescendants: false,
        },
      ],
    });

    // Out-of-band tampering, the one path this repository's own API never
    // allows - same technique as ENT-001's policy-repository test.
    await handle.db
      .update(productVersions)
      .set({ benefitsSummary: { headline: "tampered" } })
      .where(eq(productVersions.id, version.id));

    await expect(publishProductVersion(handle.db, version.id, NOW)).rejects.toThrow(
      ProductVersionChecksumMismatchError,
    );
  });
});

describe("bundle composition and overlap (ENT-001-style pure-function composition over real rows)", () => {
  it("bundle composition test: Kelas Akselerasi opens several distinct targets from one product version", async () => {
    const product = await createProduct(handle.db, {
      code: "AKS_BUNDLE",
      name: "Kelas Akselerasi Kedinasan 2026",
      type: "full_program_bundle",
    });
    const policyId = await publishedPolicyId("AKS_BUNDLE_POLICY");
    const { version } = await createProductVersionDraft(handle.db, {
      productId: product.id,
      version: 1,
      benefitsSummary: {},
      termsVersion: "t1",
      components: [
        {
          componentCode: "program",
          accessPolicyId: policyId,
          targetType: "program",
          targetRef: "program:aks-2026",
          includeDescendants: true,
        },
        {
          componentCode: "batch-01",
          accessPolicyId: policyId,
          targetType: "exam_batch",
          targetRef: "batch:skd-01",
          includeDescendants: false,
        },
        {
          componentCode: "batch-02",
          accessPolicyId: policyId,
          targetType: "exam_batch",
          targetRef: "batch:skd-02",
          includeDescendants: false,
        },
        {
          componentCode: "community",
          accessPolicyId: policyId,
          targetType: "community",
          targetRef: "community:aks-2026",
          includeDescendants: false,
        },
      ],
    });

    const rows = await listProductComponents(handle.db, version.id);
    const claims: ProductComponentClaim[] = rows.map((row) => ({
      source: { productCode: "AKS_BUNDLE", productVersion: 1, componentCode: row.componentCode },
      targetType: row.targetType as ProductComponentClaim["targetType"],
      targetRef: row.targetRef,
      includeDescendants: row.includeDescendants,
    }));

    const composed = composeProductTargets(claims);
    // "produk yang membuka beberapa target akses" - one product version, many distinct access targets.
    expect(composed).toHaveLength(4);
  });

  it("overlapping product test: a full bundle and a specialist package both include track:skd - composed once, both sources visible", async () => {
    const policyId = await publishedPolicyId("SKD_SHARED_POLICY");

    const bundle = await createProduct(handle.db, {
      code: "AKS_OVERLAP",
      name: "Kelas Akselerasi",
      type: "full_program_bundle",
    });
    const bundleVersion = await createProductVersionDraft(handle.db, {
      productId: bundle.id,
      version: 1,
      benefitsSummary: {},
      termsVersion: "t1",
      components: [
        {
          componentCode: "skd",
          accessPolicyId: policyId,
          targetType: "program_track",
          targetRef: "track:skd",
          includeDescendants: true,
        },
      ],
    });

    const specialist = await createProduct(handle.db, {
      code: "SKD_OVERLAP",
      name: "Paket SKD Intensif",
      type: "specialist_program",
    });
    const specialistVersion = await createProductVersionDraft(handle.db, {
      productId: specialist.id,
      version: 1,
      benefitsSummary: {},
      termsVersion: "t1",
      components: [
        {
          componentCode: "skd",
          accessPolicyId: policyId,
          targetType: "program_track",
          targetRef: "track:skd",
          includeDescendants: true,
        },
      ],
    });

    const bundleRows = await listProductComponents(handle.db, bundleVersion.version.id);
    const specialistRows = await listProductComponents(handle.db, specialistVersion.version.id);

    const claims: ProductComponentClaim[] = [
      ...bundleRows.map((row) => ({
        source: { productCode: "AKS_OVERLAP", productVersion: 1, componentCode: row.componentCode },
        targetType: row.targetType as ProductComponentClaim["targetType"],
        targetRef: row.targetRef,
        includeDescendants: row.includeDescendants,
      })),
      ...specialistRows.map((row) => ({
        source: { productCode: "SKD_OVERLAP", productVersion: 1, componentCode: row.componentCode },
        targetType: row.targetType as ProductComponentClaim["targetType"],
        targetRef: row.targetRef,
        includeDescendants: row.includeDescendants,
      })),
    ];

    const composed = composeProductTargets(claims);
    expect(composed).toHaveLength(1);
    expect(composed[0]?.sources).toHaveLength(2);
    expect(composed[0]?.sources.map((source) => source.productCode).sort()).toEqual([
      "AKS_OVERLAP",
      "SKD_OVERLAP",
    ]);
  });
});
