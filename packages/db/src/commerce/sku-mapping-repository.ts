// External SKU mapping persistence (COM-001).
//
// Rows are append-only: `createSkuMapping` never updates an existing row - a
// remap is a new row with a new `mappingVersion` (dok 05 §11.1 "Mapping
// harus berversi"). Resolution (which mapping applies at a given instant)
// is @superlatif/domain/commerce's resolveSkuMapping, a pure function; this
// module only fetches candidates and hands them to it.

import { and, eq } from "drizzle-orm";
import { resolveSkuMapping, type SkuMappingCandidate } from "@superlatif/domain/commerce";
import type { Queryable, Schema } from "../db-types.ts";
import { externalSkuMappings } from "../schema/index.ts";

export interface CreateSkuMappingInput {
  readonly provider: string;
  readonly site: string;
  readonly externalSkuId: string;
  readonly mappingVersion: number;
  readonly offerId: string;
  readonly validFrom: Date;
  readonly validTo?: Date | null;
  readonly priority?: number;
  readonly status?: "active" | "inactive";
}

export interface SkuMappingRow {
  readonly id: string;
  readonly provider: string;
  readonly site: string;
  readonly externalSkuId: string;
  readonly mappingVersion: number;
  readonly offerId: string;
  readonly validFrom: Date;
  readonly validTo: Date | null;
  readonly priority: number;
  readonly status: string;
}

const MAPPING_COLUMNS = {
  id: externalSkuMappings.id,
  provider: externalSkuMappings.provider,
  site: externalSkuMappings.site,
  externalSkuId: externalSkuMappings.externalSkuId,
  mappingVersion: externalSkuMappings.mappingVersion,
  offerId: externalSkuMappings.offerId,
  validFrom: externalSkuMappings.validFrom,
  validTo: externalSkuMappings.validTo,
  priority: externalSkuMappings.priority,
  status: externalSkuMappings.status,
};

export async function createSkuMapping(
  db: Queryable<Schema>,
  input: CreateSkuMappingInput,
): Promise<SkuMappingRow> {
  const [row] = await db
    .insert(externalSkuMappings)
    .values({
      provider: input.provider,
      site: input.site,
      externalSkuId: input.externalSkuId,
      mappingVersion: input.mappingVersion,
      offerId: input.offerId,
      validFrom: input.validFrom,
      validTo: input.validTo ?? null,
      priority: input.priority ?? 0,
      status: input.status ?? "active",
    })
    .returning(MAPPING_COLUMNS);
  if (!row) throw new Error("createSkuMapping: insert returned no row");
  return row;
}

export async function listSkuMappings(
  db: Queryable<Schema>,
  provider: string,
  site: string,
  externalSkuId: string,
): Promise<SkuMappingRow[]> {
  return db
    .select(MAPPING_COLUMNS)
    .from(externalSkuMappings)
    .where(
      and(
        eq(externalSkuMappings.provider, provider),
        eq(externalSkuMappings.site, site),
        eq(externalSkuMappings.externalSkuId, externalSkuId),
      ),
    );
}

/**
 * Fetches every mapping row ever created for this external SKU and resolves
 * which one applies `at` a given instant, via
 * @superlatif/domain/commerce's resolveSkuMapping. Returns null - never a
 * default offer - when nothing applies (dok 05 §14 "Unknown SKU" belongs in
 * reconciliation, a COM-002/COM-003 concern this function does not decide).
 */
export async function resolveOfferForSku(
  db: Queryable<Schema>,
  provider: string,
  site: string,
  externalSkuId: string,
  at: Date,
): Promise<SkuMappingRow | null> {
  const candidates = await listSkuMappings(db, provider, site, externalSkuId);
  const resolvable: SkuMappingCandidate[] = candidates.map((row) => ({
    offerId: row.offerId,
    mappingVersion: row.mappingVersion,
    validFrom: row.validFrom,
    validTo: row.validTo,
    priority: row.priority,
    status: row.status === "active" ? "active" : "inactive",
  }));
  const resolved = resolveSkuMapping(resolvable, at);
  if (!resolved) return null;
  return (
    candidates.find(
      (row) => row.offerId === resolved.offerId && row.mappingVersion === resolved.mappingVersion,
    ) ?? null
  );
}
