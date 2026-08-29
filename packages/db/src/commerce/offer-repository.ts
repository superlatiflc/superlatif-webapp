// Offer persistence (COM-001).
//
// Same immutable-from-creation, checksum-locked, one-way-publish discipline
// as product-repository.ts and ENT-001's policy-repository.ts. The checksum
// covers every commercially-material field (price, currency, sale window,
// quota, eligibility, upgrade relationship, terms) - NOT `status`/
// `lockedAt` themselves, which is exactly what the publish transition is
// allowed to change.

import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { computeChecksum, type JsonValue } from "@superlatif/domain/shared";
import type { Queryable, Schema } from "../db-types.ts";
import { offers } from "../schema/index.ts";

export interface CreateOfferDraftInput {
  readonly productVersionId: string;
  readonly code: string;
  readonly version: number;
  readonly title: string;
  readonly visibility?: string;
  readonly listAmountMinor?: number | null;
  readonly currentAmountMinor: number;
  readonly currency?: string;
  readonly saleStartsAt?: Date | null;
  readonly saleEndsAt?: Date | null;
  readonly quota?: number | null;
  readonly termsVersion: string;
  readonly soldCountSource?: string | null;
  readonly reservationPolicy?: Record<string, unknown>;
  readonly returnUrlTemplate?: string | null;
  readonly upgradeFromOfferId?: string | null;
  readonly eligibilityConfig?: Record<string, unknown>;
}

export interface OfferRow {
  readonly id: string;
  readonly productVersionId: string;
  readonly code: string;
  readonly version: number;
  readonly title: string;
  readonly status: string;
  readonly visibility: string;
  readonly listAmountMinor: number | null;
  readonly currentAmountMinor: number;
  readonly currency: string;
  readonly saleStartsAt: Date | null;
  readonly saleEndsAt: Date | null;
  readonly quota: number | null;
  readonly termsVersion: string;
  readonly soldCountSource: string | null;
  readonly reservationPolicy: Record<string, unknown>;
  readonly returnUrlTemplate: string | null;
  readonly upgradeFromOfferId: string | null;
  readonly eligibilityConfig: Record<string, unknown>;
  readonly checksum: string;
  readonly lockedAt: Date | null;
}

const OFFER_COLUMNS = {
  id: offers.id,
  productVersionId: offers.productVersionId,
  code: offers.code,
  version: offers.version,
  title: offers.title,
  status: offers.status,
  visibility: offers.visibility,
  listAmountMinor: offers.listAmountMinor,
  currentAmountMinor: offers.currentAmountMinor,
  currency: offers.currency,
  saleStartsAt: offers.saleStartsAt,
  saleEndsAt: offers.saleEndsAt,
  quota: offers.quota,
  termsVersion: offers.termsVersion,
  soldCountSource: offers.soldCountSource,
  reservationPolicy: offers.reservationPolicy,
  returnUrlTemplate: offers.returnUrlTemplate,
  upgradeFromOfferId: offers.upgradeFromOfferId,
  eligibilityConfig: offers.eligibilityConfig,
  checksum: offers.checksum,
  lockedAt: offers.lockedAt,
};

function offerChecksumPayload(input: CreateOfferDraftInput): JsonValue {
  return {
    title: input.title,
    visibility: input.visibility ?? "public",
    listAmountMinor: input.listAmountMinor ?? null,
    currentAmountMinor: input.currentAmountMinor,
    currency: input.currency ?? "IDR",
    saleStartsAt: input.saleStartsAt ? input.saleStartsAt.toISOString() : null,
    saleEndsAt: input.saleEndsAt ? input.saleEndsAt.toISOString() : null,
    quota: input.quota ?? null,
    termsVersion: input.termsVersion,
    soldCountSource: input.soldCountSource ?? null,
    reservationPolicy: (input.reservationPolicy ?? {}) as JsonValue,
    returnUrlTemplate: input.returnUrlTemplate ?? null,
    upgradeFromOfferId: input.upgradeFromOfferId ?? null,
    eligibilityConfig: (input.eligibilityConfig ?? {}) as JsonValue,
  };
}

export async function createOfferDraft(
  db: Queryable<Schema>,
  input: CreateOfferDraftInput,
): Promise<OfferRow> {
  const checksum = computeChecksum(offerChecksumPayload(input));
  const [row] = await db
    .insert(offers)
    .values({
      productVersionId: input.productVersionId,
      code: input.code,
      version: input.version,
      title: input.title,
      visibility: input.visibility ?? "public",
      listAmountMinor: input.listAmountMinor ?? null,
      currentAmountMinor: input.currentAmountMinor,
      currency: input.currency ?? "IDR",
      saleStartsAt: input.saleStartsAt ?? null,
      saleEndsAt: input.saleEndsAt ?? null,
      quota: input.quota ?? null,
      termsVersion: input.termsVersion,
      soldCountSource: input.soldCountSource ?? null,
      reservationPolicy: input.reservationPolicy ?? {},
      returnUrlTemplate: input.returnUrlTemplate ?? null,
      upgradeFromOfferId: input.upgradeFromOfferId ?? null,
      eligibilityConfig: input.eligibilityConfig ?? {},
      checksum,
    })
    .returning(OFFER_COLUMNS);
  if (!row) throw new Error("createOfferDraft: insert returned no row");
  return row;
}

export class OfferChecksumMismatchError extends Error {
  constructor(offerId: string) {
    super(`Offer ${offerId}'s stored checksum no longer matches its terms - refusing to publish`);
    this.name = "OfferChecksumMismatchError";
  }
}

export async function publishOffer(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  offerId: string,
  now: Date,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx.select(OFFER_COLUMNS).from(offers).where(eq(offers.id, offerId)).limit(1);
    if (!row) throw new Error(`publishOffer: offer ${offerId} not found`);

    const recomputed = computeChecksum(
      offerChecksumPayload({
        productVersionId: row.productVersionId,
        code: row.code,
        version: row.version,
        title: row.title,
        visibility: row.visibility,
        listAmountMinor: row.listAmountMinor,
        currentAmountMinor: row.currentAmountMinor,
        currency: row.currency,
        saleStartsAt: row.saleStartsAt,
        saleEndsAt: row.saleEndsAt,
        quota: row.quota,
        termsVersion: row.termsVersion,
        soldCountSource: row.soldCountSource,
        reservationPolicy: row.reservationPolicy,
        returnUrlTemplate: row.returnUrlTemplate,
        upgradeFromOfferId: row.upgradeFromOfferId,
        eligibilityConfig: row.eligibilityConfig,
      }),
    );
    if (recomputed !== row.checksum) throw new OfferChecksumMismatchError(offerId);

    await tx.update(offers).set({ status: "published", lockedAt: now }).where(eq(offers.id, offerId));
  });
}

export async function findOfferByCodeVersion(
  db: Queryable<Schema>,
  code: string,
  version: number,
): Promise<OfferRow | null> {
  const [row] = await db
    .select(OFFER_COLUMNS)
    .from(offers)
    .where(and(eq(offers.code, code), eq(offers.version, version)))
    .limit(1);
  return row ?? null;
}

/** Looked up by primary key (COM-003) - what `external_sku_mappings.offer_id`/`purchases.offer_id` actually store, not a code+version pair a purchase-processing caller may not have on hand. */
export async function findOfferById(db: Queryable<Schema>, offerId: string): Promise<OfferRow | null> {
  const [row] = await db.select(OFFER_COLUMNS).from(offers).where(eq(offers.id, offerId)).limit(1);
  return row ?? null;
}
