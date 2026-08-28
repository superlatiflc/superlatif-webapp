// Product / product-version / product-component persistence (COM-001).
//
// Mirrors packages/db/src/access/policy-repository.ts's shape deliberately
// (ADR-048): checksum stamped at creation over the whole immutable payload
// (benefitsSummary + the component list), re-verified before the one
// allowed status transition (`publishProductVersion`), which never touches
// the checksummed content.

import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { computeChecksum, type JsonValue } from "@superlatif/domain/shared";
import type { Queryable, Schema } from "../db-types.ts";
import { productComponents, productVersions, products } from "../schema/index.ts";

export interface CreateProductInput {
  readonly code: string;
  readonly name: string;
  readonly type: string;
}

export interface ProductRow {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly type: string;
  readonly status: string;
}

const PRODUCT_COLUMNS = {
  id: products.id,
  code: products.code,
  name: products.name,
  type: products.type,
  status: products.status,
};

export async function createProduct(db: Queryable<Schema>, input: CreateProductInput): Promise<ProductRow> {
  const [row] = await db.insert(products).values(input).returning(PRODUCT_COLUMNS);
  if (!row) throw new Error("createProduct: insert returned no row");
  return row;
}

export async function findProductByCode(db: Queryable<Schema>, code: string): Promise<ProductRow | null> {
  const [row] = await db.select(PRODUCT_COLUMNS).from(products).where(eq(products.code, code)).limit(1);
  return row ?? null;
}

export interface ProductComponentInput {
  readonly componentCode: string;
  readonly accessPolicyId: string;
  readonly targetType: string;
  readonly targetRef: string;
  readonly includeDescendants?: boolean;
  readonly overrides?: Record<string, unknown>;
}

export interface CreateProductVersionDraftInput {
  readonly productId: string;
  readonly version: number;
  readonly benefitsSummary: Record<string, unknown>;
  readonly termsVersion: string;
  /**
   * The full component set for this version. Inserted atomically with the
   * version row and never mutated afterward - "Product version berisi
   * daftar component/grant" (dok 05 §5) is part of what this version's
   * checksum locks in, not something added to piecemeal later.
   */
  readonly components: readonly ProductComponentInput[];
}

export interface ProductVersionRow {
  readonly id: string;
  readonly productId: string;
  readonly version: number;
  readonly status: string;
  readonly checksum: string;
}

export interface ProductComponentRow {
  readonly id: string;
  readonly productVersionId: string;
  readonly componentCode: string;
  readonly accessPolicyId: string;
  readonly targetType: string;
  readonly targetRef: string;
  readonly includeDescendants: boolean;
  readonly overrides: Record<string, unknown>;
}

function versionChecksumPayload(
  input: Pick<CreateProductVersionDraftInput, "benefitsSummary" | "termsVersion" | "components">,
): JsonValue {
  return {
    benefitsSummary: input.benefitsSummary as JsonValue,
    termsVersion: input.termsVersion,
    components: input.components.map((component) => ({
      componentCode: component.componentCode,
      accessPolicyId: component.accessPolicyId,
      targetType: component.targetType,
      targetRef: component.targetRef,
      includeDescendants: component.includeDescendants ?? false,
      overrides: (component.overrides ?? {}) as JsonValue,
    })),
  };
}

/**
 * Creates a new immutable product version plus its full component set in
 * one transaction. Two product versions of the same product are always two
 * separate rows (unique productId+version) - "editing a draft" means
 * authoring version N+1, exactly like ENT-001's access_policies.
 */
export async function createProductVersionDraft(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  input: CreateProductVersionDraftInput,
): Promise<{ version: ProductVersionRow; components: ProductComponentRow[] }> {
  const checksum = computeChecksum(versionChecksumPayload(input));

  return db.transaction(async (tx) => {
    const [versionRow] = await tx
      .insert(productVersions)
      .values({
        productId: input.productId,
        version: input.version,
        benefitsSummary: input.benefitsSummary,
        termsVersion: input.termsVersion,
        checksum,
      })
      .returning({
        id: productVersions.id,
        productId: productVersions.productId,
        version: productVersions.version,
        status: productVersions.status,
        checksum: productVersions.checksum,
      });
    if (!versionRow) throw new Error("createProductVersionDraft: insert returned no row");

    const componentRows =
      input.components.length === 0
        ? []
        : await tx
            .insert(productComponents)
            .values(
              input.components.map((component) => ({
                productVersionId: versionRow.id,
                componentCode: component.componentCode,
                accessPolicyId: component.accessPolicyId,
                targetType: component.targetType as (typeof productComponents.$inferInsert)["targetType"],
                targetRef: component.targetRef,
                includeDescendants: component.includeDescendants ?? false,
                overrides: component.overrides ?? {},
              })),
            )
            .returning({
              id: productComponents.id,
              productVersionId: productComponents.productVersionId,
              componentCode: productComponents.componentCode,
              accessPolicyId: productComponents.accessPolicyId,
              targetType: productComponents.targetType,
              targetRef: productComponents.targetRef,
              includeDescendants: productComponents.includeDescendants,
              overrides: productComponents.overrides,
            });

    return { version: versionRow, components: componentRows };
  });
}

export class ProductVersionChecksumMismatchError extends Error {
  constructor(productVersionId: string) {
    super(
      `Product version ${productVersionId}'s stored checksum no longer matches its content - refusing to publish`,
    );
    this.name = "ProductVersionChecksumMismatchError";
  }
}

/**
 * The one narrow, one-way exception: draft -> published, stamping
 * `lockedAt`. Never touches `benefitsSummary`/component rows/`checksum` -
 * re-verifies the stored checksum against the stored content first (over
 * the version row AND its component rows), so a version tampered with out
 * of band fails loudly instead of silently locking in a mismatch.
 */
export async function publishProductVersion(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  productVersionId: string,
  now: Date,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [versionRow] = await tx
      .select({
        benefitsSummary: productVersions.benefitsSummary,
        termsVersion: productVersions.termsVersion,
        checksum: productVersions.checksum,
      })
      .from(productVersions)
      .where(eq(productVersions.id, productVersionId))
      .limit(1);
    if (!versionRow) throw new Error(`publishProductVersion: product version ${productVersionId} not found`);

    const componentRows = await tx
      .select({
        componentCode: productComponents.componentCode,
        accessPolicyId: productComponents.accessPolicyId,
        targetType: productComponents.targetType,
        targetRef: productComponents.targetRef,
        includeDescendants: productComponents.includeDescendants,
        overrides: productComponents.overrides,
      })
      .from(productComponents)
      .where(eq(productComponents.productVersionId, productVersionId));

    const recomputed = computeChecksum(
      versionChecksumPayload({
        benefitsSummary: versionRow.benefitsSummary,
        termsVersion: versionRow.termsVersion,
        components: componentRows,
      }),
    );
    if (recomputed !== versionRow.checksum) throw new ProductVersionChecksumMismatchError(productVersionId);

    await tx
      .update(productVersions)
      .set({ status: "published", lockedAt: now })
      .where(eq(productVersions.id, productVersionId));
  });
}

export async function findProductVersion(
  db: Queryable<Schema>,
  productId: string,
  version: number,
): Promise<ProductVersionRow | null> {
  const [row] = await db
    .select({
      id: productVersions.id,
      productId: productVersions.productId,
      version: productVersions.version,
      status: productVersions.status,
      checksum: productVersions.checksum,
    })
    .from(productVersions)
    .where(and(eq(productVersions.productId, productId), eq(productVersions.version, version)))
    .limit(1);
  return row ?? null;
}

export async function listProductComponents(
  db: Queryable<Schema>,
  productVersionId: string,
): Promise<ProductComponentRow[]> {
  return db
    .select({
      id: productComponents.id,
      productVersionId: productComponents.productVersionId,
      componentCode: productComponents.componentCode,
      accessPolicyId: productComponents.accessPolicyId,
      targetType: productComponents.targetType,
      targetRef: productComponents.targetRef,
      includeDescendants: productComponents.includeDescendants,
      overrides: productComponents.overrides,
    })
    .from(productComponents)
    .where(eq(productComponents.productVersionId, productVersionId));
}
