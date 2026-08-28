// Product, offer, SKU mapping, and bundle-composition schema (COM-001,
// second migration after ENT-001's access.ts).
//
// 21_ERD_AND_DATA_DICTIONARY.md §4 "Product and commerce" describes
// products, product_versions, product_components, offers,
// external_sku_mappings, checkout_intents, purchases, purchase_events, and
// reconciliation_cases. This task implements only the first five - a
// catalogue/entitlement DATA MODEL with no checkout, no live Sejoli bridge,
// and no payment provider touched (checkout_intents/purchases/
// purchase_events are COM-002/COM-003's explicit scope). See ADR-048.
//
// Immutability discipline: products/products_versions/product_components/
// offers follow the exact "version-not-mutate, checksum-stamped-at-
// creation, one narrow publish-lock exception" pattern ENT-001's
// access_policies already established (ADR-047) - see ADR-048 for why this
// task deliberately harmonizes with that pattern rather than the nullable-
// checksum shown in contracts/drizzle-schema.ts's review artifact.

import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { recordStatus, targetType } from "./enums.ts";
import { accessPolicies } from "./access.ts";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/**
 * Stable commercial identity (dok 05 §2: "Konsep komersial yang stabil").
 * `type` is free text, not a Postgres enum - a new bundle shape (Kelas
 * Akselerasi, SKD-only, TKA-only, Tryout Pass, a single flash-sale batch
 * product, ...) is a new row's `type` value, never a schema migration,
 * mirroring how access_grants.sourceType (ENT-001) stays free text for the
 * same reason. `status` is this product LINE's own simple lifecycle
 * (draft/active/archived) - separate from product_versions' full
 * draft/published/archived editorial workflow below.
 */
export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    type: text("type").notNull(),
    status: text("status").notNull().default("draft"),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("products_code_uq").on(table.code)],
);

/**
 * Immutable once created (same discipline as ENT-001's access_policies):
 * `benefitsSummary` and its `checksum` never change after insert.
 * `publishProductVersion` only ever flips `status` and `lockedAt` -
 * "editing" a draft means creating version N+1, not mutating version N (dok
 * 05 §5 "Product version menjadi immutable setelah dipakai order berbayar" -
 * ADR-048 explains why this task locks at creation/publish rather than
 * waiting for a first paid purchase, which does not exist yet in this
 * task's scope).
 */
export const productVersions = pgTable(
  "product_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    version: integer("version").notNull(),
    status: recordStatus("status").notNull().default("draft"),
    benefitsSummary: jsonb("benefits_summary").$type<Record<string, unknown>>().notNull(),
    termsVersion: text("terms_version").notNull(),
    checksum: text("checksum").notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("product_versions_product_version_uq").on(table.productId, table.version)],
);

/**
 * One row per target a product version grants (dok 05 §5's component
 * table). `targetType`/`targetRef` are the authoritative claim this
 * component makes - not the referenced `accessPolicy`'s own `claims` array,
 * which supplies validity/attemptAllowance/postExpiry/stacking/lifecycle
 * only when a policy is reused as a shared component template across many
 * products (ADR-048 explains this split in full). Rows are inserted only as
 * part of `createProductVersionDraft` (packages/db/src/commerce), never
 * added to or removed from an existing version - the component set is part
 * of what the version's checksum locks in.
 */
export const productComponents = pgTable(
  "product_components",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productVersionId: uuid("product_version_id")
      .notNull()
      .references(() => productVersions.id),
    componentCode: text("component_code").notNull(),
    accessPolicyId: uuid("access_policy_id")
      .notNull()
      .references(() => accessPolicies.id),
    targetType: targetType("target_type").notNull(),
    targetRef: text("target_ref").notNull(),
    includeDescendants: boolean("include_descendants").notNull().default(false),
    overrides: jsonb("overrides").$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => [uniqueIndex("product_component_code_uq").on(table.productVersionId, table.componentCode)],
);

/**
 * Commercial sale terms for one product version (dok 05 §6). Immutable once
 * created, same pattern as productVersions above. `status` here is the
 * EDITORIAL lifecycle (draft/published/archived); the shopper-facing sale
 * state (scheduled/on_sale/sold_out/ended/hidden) is never stored - see
 * @superlatif/domain/commerce's deriveOfferSaleState, which combines this
 * status with `visibility`, the sale window, and quota/soldCount at read
 * time. `upgradeFromOfferId` deliberately has no FK constraint, matching
 * contracts/drizzle-schema.ts exactly - self-referential insert ordering
 * for a still-draft offer family is not worth the constraint at this stage.
 */
export const offers = pgTable(
  "offers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productVersionId: uuid("product_version_id")
      .notNull()
      .references(() => productVersions.id),
    code: text("code").notNull(),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    status: recordStatus("status").notNull().default("draft"),
    visibility: text("visibility").notNull().default("public"),
    listAmountMinor: bigint("list_amount_minor", { mode: "number" }),
    currentAmountMinor: bigint("current_amount_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("IDR"),
    saleStartsAt: timestamp("sale_starts_at", { withTimezone: true }),
    saleEndsAt: timestamp("sale_ends_at", { withTimezone: true }),
    quota: integer("quota"),
    termsVersion: text("terms_version").notNull(),
    soldCountSource: text("sold_count_source"),
    reservationPolicy: jsonb("reservation_policy").$type<Record<string, unknown>>().notNull().default({}),
    returnUrlTemplate: text("return_url_template"),
    upgradeFromOfferId: uuid("upgrade_from_offer_id"),
    eligibilityConfig: jsonb("eligibility_config").$type<Record<string, unknown>>().notNull().default({}),
    checksum: text("checksum").notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("offer_code_version_uq").on(table.code, table.version),
    index("offer_product_version_idx").on(table.productVersionId),
  ],
);

/**
 * Versioned many-to-one mapping from an external (Sejoli/WordPress) SKU to
 * an internal offer (dok 05 §11.1). Rows are immutable and never updated -
 * a remap is a new row with a new `mappingVersion`; which row applies at a
 * given instant is resolved by @superlatif/domain/commerce's
 * resolveSkuMapping, not stored. This table only models the mapping data;
 * nothing in this task reads a live webhook or calls a checkout URL
 * (COM-002/COM-003 scope).
 */
export const externalSkuMappings = pgTable(
  "external_sku_mappings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    provider: text("provider").notNull(),
    site: text("site").notNull(),
    externalSkuId: text("external_sku_id").notNull(),
    mappingVersion: integer("mapping_version").notNull(),
    offerId: uuid("offer_id")
      .notNull()
      .references(() => offers.id),
    validFrom: timestamp("valid_from", { withTimezone: true }).notNull(),
    validTo: timestamp("valid_to", { withTimezone: true }),
    priority: integer("priority").notNull().default(0),
    status: text("status").notNull().default("active"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("external_sku_mapping_start_uq").on(
      table.provider,
      table.site,
      table.externalSkuId,
      table.validFrom,
    ),
    index("external_sku_mapping_lookup_idx").on(table.provider, table.site, table.externalSkuId),
  ],
);
