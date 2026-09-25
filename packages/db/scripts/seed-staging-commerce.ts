// Staging catalogue for the M2 end-to-end test (ADR-074).
//
// STAGING ONLY. Refuses to run with APP_ENV=production. Creates only synthetic
// catalogue data and never deletes or changes anything it did not create;
// re-running is safe (every object is looked up by its stable code first).
//
// What it sets up, all through the real governance services:
//   - batch TO-STG-M2, attempt window open for 30 days, reusing the published
//     form of TO-STG-PAST (run seed-staging.ts once before this);
//   - an entitlement policy granting `start_attempt` on that batch;
//   - a published product (component: that batch) and offer;
//   - an external SKU mapping: (sejoli_bridge, <site>, <Sejoli product ID>)
//     -> that offer.
//
// After this, a paid staging Sejoli order for that product - delivered by the
// bridge plugin's webhook - is what lets the buyer start TO-STG-M2. Nobody is
// granted anything by this script.
//
// Run:
//   node packages/db/scripts/seed-staging-commerce.ts --sejoli-product-id=<ID> [--site=wp-staging.superlatif.id]
// DATABASE_URL must point at STAGING (never PRODUCTION_DATABASE_URL).

import { createDatabaseClient } from "../src/client.ts";
import { findUsersByContact } from "../src/identity/repository.ts";
import { createPolicyDraft, publishPolicyVersion } from "../src/access/policy-repository.ts";
import {
  approveExamBatch,
  createExamBatchDraft,
  examBatchTargetRef,
  findExamBatchByCode,
  publishExamBatch,
  setExamBatchWindows,
  submitExamBatchForReview,
} from "../src/exam/batch/index.ts";
import {
  createProduct,
  createProductVersionDraft,
  findProductByCode,
  publishProductVersion,
} from "../src/commerce/product-repository.ts";
import { createOfferDraft, publishOffer } from "../src/commerce/offer-repository.ts";
import { createSkuMapping, resolveOfferForSku } from "../src/commerce/sku-mapping-repository.ts";

if (process.env["APP_ENV"] === "production") {
  throw new Error("seed-staging-commerce refuses to run with APP_ENV=production");
}
const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl) throw new Error("DATABASE_URL is required (staging)");

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

const productId = arg("sejoli-product-id");
if (!productId || !/^[1-9][0-9]{0,19}$/.test(productId)) {
  throw new Error(
    "--sejoli-product-id=<positive integer> is required (the Sejoli product post ID on staging)",
  );
}
const site = arg("site") ?? "wp-staging.superlatif.id";
if (!/^[a-z0-9.-]+$/.test(site)) throw new Error("--site must be a bare host name");

const BATCH_CODE = "TO-STG-M2";
const CODE_SUFFIX = `SJ_${productId}`;
const DAY = 24 * 60 * 60 * 1000;
const now = new Date();
const at = (offsetMs: number) => new Date(now.getTime() + offsetMs);

const handle = createDatabaseClient(databaseUrl, { maxConnections: 3 });
const db = handle.db;

async function userIdByEmail(email: string): Promise<string> {
  const [user] = await findUsersByContact(db, { emailNormalized: email, phoneE164: null });
  if (!user) throw new Error(`${email} not found - run seed-staging.ts first`);
  return user.userId;
}

async function ensureBatch(adminId: string, reviewerId: string): Promise<string> {
  const existing = await findExamBatchByCode(db, BATCH_CODE);
  if (existing) return existing.id;
  const template = await findExamBatchByCode(db, "TO-STG-PAST");
  if (!template) throw new Error("TO-STG-PAST not found - run seed-staging.ts first");

  const batch = await createExamBatchDraft(db, adminId, {
    code: BATCH_CODE,
    examFormVersionId: template.examFormVersionId,
    title: "Tryout SKD Kedinasan - Uji Pembelian (M2 staging)",
    timezone: "Asia/Jakarta",
  });
  await setExamBatchWindows(db, adminId, batch.id, [
    { windowType: "attempt", startsAt: at(-DAY / 24), endsAt: at(30 * DAY) },
    { windowType: "provisional_result_release", startsAt: at(30 * DAY + DAY / 24) },
    { windowType: "final_result_release", startsAt: at(30 * DAY + DAY / 12) },
    { windowType: "explanation_release", startsAt: at(30 * DAY + DAY / 8) },
  ]);
  await submitExamBatchForReview(db, adminId, batch.id);
  await approveExamBatch(db, reviewerId, batch.id);
  await publishExamBatch(db, adminId, batch.id);
  return batch.id;
}

function policyConfig(code: string) {
  return {
    schemaVersion: 2,
    code,
    version: 1,
    title: "Staging M2 - purchase grants TO-STG-M2",
    validity: { mode: "lifetime", timezone: "Asia/Jakarta" },
    claims: [
      {
        targetType: "exam_batch",
        targetRef: { code: examBatchTargetRef(BATCH_CODE) },
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

async function main() {
  const adminId = await userIdByEmail("stg-admin@superlatif.id");
  const reviewerId = await userIdByEmail("stg-reviewer@superlatif.id");
  await ensureBatch(adminId, reviewerId);

  const mapped = await resolveOfferForSku(db, "sejoli_bridge", site, productId!, now);
  if (!mapped) {
    const productCode = `STG_M2_${CODE_SUFFIX}`;
    if (await findProductByCode(db, productCode)) {
      throw new Error(`${productCode} exists but has no active SKU mapping - inspect it before re-running`);
    }
    const policyCode = `STG_M2_POLICY_${CODE_SUFFIX}`;
    const policy = await createPolicyDraft(db, {
      code: policyCode,
      version: 1,
      title: "Staging M2 purchase policy",
      config: policyConfig(policyCode),
    });
    await publishPolicyVersion(db, policy.id, now);

    const product = await createProduct(db, {
      code: productCode,
      name: "Staging M2 - Tryout SKD (Sejoli)",
      type: "single_batch",
    });
    const { version } = await createProductVersionDraft(db, {
      productId: product.id,
      version: 1,
      benefitsSummary: { staging: true },
      termsVersion: "staging-m2",
      components: [
        {
          componentCode: "batch",
          accessPolicyId: policy.id,
          targetType: "exam_batch",
          targetRef: examBatchTargetRef(BATCH_CODE),
          includeDescendants: false,
        },
      ],
    });
    await publishProductVersion(db, version.id, now);
    const offer = await createOfferDraft(db, {
      productVersionId: version.id,
      code: `STG_M2_OFFER_${CODE_SUFFIX}`,
      version: 1,
      title: "Staging M2 - Tryout SKD (Sejoli)",
      currentAmountMinor: 0,
      termsVersion: "staging-m2",
    });
    await publishOffer(db, offer.id, now);
    await createSkuMapping(db, {
      provider: "sejoli_bridge",
      site,
      externalSkuId: productId!,
      mappingVersion: 1,
      offerId: offer.id,
      validFrom: at(-DAY),
    });
  }

  const mapping = await resolveOfferForSku(db, "sejoli_bridge", site, productId!, now);
  console.log(
    JSON.stringify(
      {
        ok: true,
        provider: "sejoli_bridge",
        site,
        sejoliProductId: productId,
        mappingVersion: mapping?.mappingVersion ?? null,
        batch: BATCH_CODE,
        startUrl: `/tryouts/${BATCH_CODE}`,
        alreadyExisted: mapped !== null,
      },
      null,
      2,
    ),
  );
}

try {
  await main();
} finally {
  await handle.close();
}
