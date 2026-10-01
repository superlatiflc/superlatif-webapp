// Production catalogue loader: Sejoli product → offer → access (M2 launch prep, ADR-074).
//
// Turns a reviewed JSON catalogue spec into the SAME governed records the
// commerce pipeline resolves at purchase time: an entitlement policy per
// component, a published product version, a published offer, and an external
// SKU mapping `(sejoli_bridge, <site>, <Sejoli product ID>) → offer`. It
// creates no grant and touches no purchase - a student only gets access when
// a signed `payment_settled` event for that product arrives.
//
// Three steps, deliberately separate:
//   parseCatalogueSpec  pure validation of the file (no I/O)
//   planCatalogue       read-only: what WOULD happen, per product
//   applyCatalogue      refuses unless the plan is clean; then writes every
//                       product in ONE transaction (all or nothing)
//
// Idempotent: a product already loaded with the same SKU → offer mapping is
// reported as `exists` and skipped. Anything that would change an existing
// mapping is a `conflict` - remapping a live SKU is a versioned change for a
// human (dok 05 §11.1), never a side effect of re-running this loader.
//
// Targets (programs, exam batches) are NOT created here: they are academic
// content with their own governance. A target that does not exist, or a batch
// that is not published, blocks the plan.

import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { Schema } from "../db-types.ts";
import { createPolicyDraft, publishPolicyVersion } from "../access/policy-repository.ts";
import { examBatchTargetRef, findExamBatchByCode } from "../exam/batch/index.ts";
import { findProgramByCode, programTargetRef } from "../program/program-repository.ts";
import { createOfferDraft, publishOffer } from "./offer-repository.ts";
import {
  createProduct,
  createProductVersionDraft,
  findProductByCode,
  publishProductVersion,
} from "./product-repository.ts";
import { createSkuMapping, resolveOfferForSku } from "./sku-mapping-repository.ts";

export const CATALOGUE_TARGET_TYPES = ["program", "exam_batch"] as const;
export type CatalogueTargetType = (typeof CATALOGUE_TARGET_TYPES)[number];

/** contracts/entitlement-policy.schema.json `claim.actions`. */
export const CATALOGUE_ACTIONS = [
  "view",
  "consume",
  "download",
  "join",
  "start_attempt",
  "view_result",
  "view_explanation",
] as const;

export type CatalogueValidity =
  | { readonly mode: "lifetime" }
  | { readonly mode: "duration_after_purchase"; readonly durationDays: number }
  | { readonly mode: "fixed_window"; readonly startsAt: string; readonly endsAt: string };

export interface CatalogueComponentSpec {
  readonly componentCode: string;
  readonly targetType: CatalogueTargetType;
  readonly targetCode: string;
  readonly actions: readonly string[];
}

export interface CatalogueProductSpec {
  /** The Sejoli product post ID on the WordPress site - the SKU the webhook carries. */
  readonly sejoliProductId: string;
  readonly code: string;
  readonly name: string;
  readonly type: string;
  readonly termsVersion: string;
  readonly offer: { readonly code: string; readonly title: string; readonly amountMinor: number };
  readonly validity: CatalogueValidity;
  readonly components: readonly CatalogueComponentSpec[];
}

export interface CatalogueSpec {
  readonly schemaVersion: 1;
  readonly provider: "sejoli_bridge";
  /** WordPress host, exactly as the app derives it from WP_BRIDGE_BASE_URL (e.g. `superlatif.id`). */
  readonly site: string;
  readonly products: readonly CatalogueProductSpec[];
}

const CODE = /^[A-Z0-9_]{2,80}$/;
const COMPONENT_CODE = /^[a-z0-9_]{1,40}$/;
const SKU = /^[1-9][0-9]{0,19}$/;
const HOST = /^[a-z0-9.-]{3,253}$/;
const TARGET_CODE = /^[A-Za-z0-9_-]{1,80}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, min: number, max: number): value is string {
  return typeof value === "string" && value.trim().length >= min && value.length <= max;
}

function validityErrors(value: unknown, at: string): string[] {
  if (!isRecord(value)) return [`${at}.validity must be an object`];
  switch (value["mode"]) {
    case "lifetime":
      return [];
    case "duration_after_purchase": {
      const days = value["durationDays"];
      return Number.isInteger(days) && (days as number) > 0 && (days as number) <= 3650
        ? []
        : [`${at}.validity.durationDays must be an integer between 1 and 3650`];
    }
    case "fixed_window": {
      const from = Date.parse(String(value["startsAt"]));
      const to = Date.parse(String(value["endsAt"]));
      if (Number.isNaN(from) || Number.isNaN(to)) return [`${at}.validity needs ISO startsAt and endsAt`];
      return to > from ? [] : [`${at}.validity.endsAt must be after startsAt`];
    }
    default:
      return [
        `${at}.validity.mode must be lifetime, duration_after_purchase, or fixed_window (other modes need a lifecycle the loader cannot supply)`,
      ];
  }
}

export type ParseCatalogueResult =
  | { readonly ok: true; readonly spec: CatalogueSpec }
  | { readonly ok: false; readonly errors: readonly string[] };

/** Pure validation. Reports every problem, not just the first. */
export function parseCatalogueSpec(value: unknown): ParseCatalogueResult {
  const errors: string[] = [];
  if (!isRecord(value)) return { ok: false, errors: ["catalogue must be a JSON object"] };
  if (value["schemaVersion"] !== 1) errors.push("schemaVersion must be 1");
  if (value["provider"] !== "sejoli_bridge") errors.push('provider must be "sejoli_bridge"');
  if (typeof value["site"] !== "string" || !HOST.test(value["site"])) {
    errors.push("site must be a bare lower-case host name, e.g. superlatif.id");
  }
  const products = value["products"];
  if (!Array.isArray(products) || products.length === 0) {
    errors.push("products must be a non-empty array");
    return { ok: false, errors };
  }

  const seen = { sku: new Set<string>(), code: new Set<string>() };
  const once = (kind: string, set: Set<string>, item: string, at: string) => {
    if (set.has(item)) errors.push(`${at}: duplicate ${kind} ${item}`);
    set.add(item);
  };

  products.forEach((product, index) => {
    const at = `products[${index}]`;
    if (!isRecord(product)) {
      errors.push(`${at} must be an object`);
      return;
    }
    const sku = product["sejoliProductId"];
    if (typeof sku !== "string" || !SKU.test(sku))
      errors.push(`${at}.sejoliProductId must be a decimal string`);
    else once("sejoliProductId", seen.sku, sku, at);
    for (const field of ["code"] as const) {
      const v = product[field];
      if (typeof v !== "string" || !CODE.test(v)) errors.push(`${at}.${field} must match ${CODE}`);
      else once("code", seen.code, v, at);
    }
    if (!text(product["name"], 1, 200)) errors.push(`${at}.name is required (max 200)`);
    if (!text(product["type"], 1, 60)) errors.push(`${at}.type is required`);
    if (!text(product["termsVersion"], 1, 60)) errors.push(`${at}.termsVersion is required`);

    const offer = product["offer"];
    if (!isRecord(offer)) errors.push(`${at}.offer must be an object`);
    else {
      if (typeof offer["code"] !== "string" || !CODE.test(offer["code"]))
        errors.push(`${at}.offer.code must match ${CODE}`);
      else once("code", seen.code, offer["code"], `${at}.offer`);
      if (!text(offer["title"], 1, 200)) errors.push(`${at}.offer.title is required`);
      const amount = offer["amountMinor"];
      if (!Number.isSafeInteger(amount) || (amount as number) < 0)
        errors.push(`${at}.offer.amountMinor must be a non-negative integer (rupiah)`);
    }

    errors.push(...validityErrors(product["validity"], at));

    const components = product["components"];
    if (!Array.isArray(components) || components.length === 0) {
      errors.push(`${at}.components must be a non-empty array`);
      return;
    }
    const componentCodes = new Set<string>();
    components.forEach((component, ci) => {
      const cat = `${at}.components[${ci}]`;
      if (!isRecord(component)) {
        errors.push(`${cat} must be an object`);
        return;
      }
      const cc = component["componentCode"];
      if (typeof cc !== "string" || !COMPONENT_CODE.test(cc))
        errors.push(`${cat}.componentCode must match ${COMPONENT_CODE}`);
      else if (componentCodes.has(cc)) errors.push(`${cat}: duplicate componentCode ${cc}`);
      else componentCodes.add(cc);
      if (!(CATALOGUE_TARGET_TYPES as readonly unknown[]).includes(component["targetType"])) {
        errors.push(`${cat}.targetType must be one of ${CATALOGUE_TARGET_TYPES.join(", ")}`);
      }
      if (typeof component["targetCode"] !== "string" || !TARGET_CODE.test(component["targetCode"])) {
        errors.push(`${cat}.targetCode is required`);
      }
      const actions = component["actions"];
      if (
        !Array.isArray(actions) ||
        actions.length === 0 ||
        actions.some((a) => !(CATALOGUE_ACTIONS as readonly unknown[]).includes(a)) ||
        new Set(actions).size !== actions.length
      ) {
        errors.push(`${cat}.actions must be a non-empty unique subset of ${CATALOGUE_ACTIONS.join(", ")}`);
      }
    });
  });

  return errors.length > 0 ? { ok: false, errors } : { ok: true, spec: value as unknown as CatalogueSpec };
}

export type ProductPlan =
  | { readonly sejoliProductId: string; readonly code: string; readonly action: "create" }
  | { readonly sejoliProductId: string; readonly code: string; readonly action: "exists" }
  | {
      readonly sejoliProductId: string;
      readonly code: string;
      readonly action: "conflict";
      readonly reason: string;
    }
  | {
      readonly sejoliProductId: string;
      readonly code: string;
      readonly action: "blocked";
      readonly reason: string;
    };

export interface CataloguePlan {
  readonly products: readonly ProductPlan[];
  /** True only when every product is `create` or `exists`. */
  readonly applicable: boolean;
}

type Db = PgDatabase<PgQueryResultHKT, Schema>;

function targetRef(component: CatalogueComponentSpec): string {
  return component.targetType === "program"
    ? programTargetRef(component.targetCode)
    : examBatchTargetRef(component.targetCode);
}

async function missingTarget(db: Db, component: CatalogueComponentSpec): Promise<string | null> {
  if (component.targetType === "program") {
    return (await findProgramByCode(db, component.targetCode))
      ? null
      : `program ${component.targetCode} does not exist`;
  }
  const batch = await findExamBatchByCode(db, component.targetCode);
  if (!batch) return `exam batch ${component.targetCode} does not exist`;
  return batch.status === "published"
    ? null
    : `exam batch ${component.targetCode} is ${batch.status}, not published`;
}

/** Read-only. Never writes, so it is safe as a dry run against any database. */
export async function planCatalogue(db: Db, spec: CatalogueSpec, now: Date): Promise<CataloguePlan> {
  const products: ProductPlan[] = [];
  for (const product of spec.products) {
    const base = { sejoliProductId: product.sejoliProductId, code: product.code };
    const blockers: string[] = [];
    for (const component of product.components) {
      const problem = await missingTarget(db, component);
      if (problem) blockers.push(problem);
    }
    const mapping = await resolveOfferForSku(db, spec.provider, spec.site, product.sejoliProductId, now);
    const existing = await findProductByCode(db, product.code);

    if (mapping && existing) {
      products.push({ ...base, action: "exists" });
    } else if (mapping) {
      products.push({
        ...base,
        action: "conflict",
        reason: `Sejoli product ${product.sejoliProductId} is already mapped on ${spec.site}, but not to ${product.code}`,
      });
    } else if (existing) {
      products.push({
        ...base,
        action: "conflict",
        reason: `product ${product.code} exists but has no active mapping for Sejoli product ${product.sejoliProductId}`,
      });
    } else if (blockers.length > 0) {
      products.push({ ...base, action: "blocked", reason: blockers.join("; ") });
    } else {
      products.push({ ...base, action: "create" });
    }
  }
  return { products, applicable: products.every((p) => p.action === "create" || p.action === "exists") };
}

function policyConfig(code: string, validity: CatalogueValidity, component: CatalogueComponentSpec) {
  return {
    schemaVersion: 2,
    code,
    version: 1,
    title: code,
    validity: { ...validity, timezone: "Asia/Jakarta" },
    claims: [
      {
        targetType: component.targetType,
        targetRef: { code: targetRef(component) },
        actions: [...component.actions],
        includeDescendants: component.targetType === "program",
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

export class CataloguePlanNotApplicableError extends Error {
  constructor(readonly plan: CataloguePlan) {
    super("The catalogue plan has conflicts or blocked products; nothing was written");
    this.name = "CataloguePlanNotApplicableError";
  }
}

export interface AppliedProduct {
  readonly sejoliProductId: string;
  readonly code: string;
  readonly offerId: string;
}

/** Writes every `create` product in one transaction, or nothing. Re-plans inside the transaction. */
export async function applyCatalogue(
  db: Db,
  spec: CatalogueSpec,
  now: Date,
): Promise<readonly AppliedProduct[]> {
  return db.transaction(async (tx) => {
    const plan = await planCatalogue(tx, spec, now);
    if (!plan.applicable) throw new CataloguePlanNotApplicableError(plan);

    const applied: AppliedProduct[] = [];
    for (const product of spec.products) {
      if (plan.products.find((p) => p.code === product.code)?.action !== "create") continue;

      const components = [];
      for (const component of product.components) {
        const policyCode = `${product.code}_${component.componentCode.toUpperCase()}`;
        const policy = await createPolicyDraft(tx, {
          code: policyCode,
          version: 1,
          title: `${product.name} - ${component.componentCode}`,
          config: policyConfig(policyCode, product.validity, component),
        });
        await publishPolicyVersion(tx, policy.id, now);
        components.push({
          componentCode: component.componentCode,
          accessPolicyId: policy.id,
          targetType: component.targetType,
          targetRef: targetRef(component),
          includeDescendants: component.targetType === "program",
        });
      }

      const created = await createProduct(tx, { code: product.code, name: product.name, type: product.type });
      const { version } = await createProductVersionDraft(tx, {
        productId: created.id,
        version: 1,
        benefitsSummary: { sejoliProductId: product.sejoliProductId },
        termsVersion: product.termsVersion,
        components,
      });
      await publishProductVersion(tx, version.id, now);
      const offer = await createOfferDraft(tx, {
        productVersionId: version.id,
        code: product.offer.code,
        version: 1,
        title: product.offer.title,
        currentAmountMinor: product.offer.amountMinor,
        termsVersion: product.termsVersion,
      });
      await publishOffer(tx, offer.id, now);
      await createSkuMapping(tx, {
        provider: spec.provider,
        site: spec.site,
        externalSkuId: product.sejoliProductId,
        mappingVersion: 1,
        offerId: offer.id,
        validFrom: now,
      });
      applied.push({ sejoliProductId: product.sejoliProductId, code: product.code, offerId: offer.id });
    }
    return applied;
  });
}
