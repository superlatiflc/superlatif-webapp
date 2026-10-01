// M2 launch prep against real Postgres: the production catalogue loader and the
// read-only reconciliation report. A loaded catalogue is exercised through the
// real webhook pipeline (receiveCommerceEvent), so "loaded" means "a paid
// Sejoli order for that product grants exactly the declared access".

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { WIRE_EVENT_TYPE_STATUS_MAP_V1 } from "@superlatif/domain/commerce";
import { createInMemoryEffectiveAccessCache, type EffectiveAccessCache } from "@superlatif/domain/access";
import { WORDPRESS_LOGIN_PROVIDER } from "@superlatif/domain/identity";
import { createTestDatabase, type TestDatabaseHandle } from "../test-client.ts";
import { createUser, linkExternalIdentity } from "../identity/repository.ts";
import { getEffectiveAccess, recordGrantEventAndInvalidate } from "../access/effective-access-service.ts";
import { listGrantsForUser } from "../access/grant-repository.ts";
import { createProgram, programTargetRef } from "../program/program-repository.ts";
import { receiveCommerceEvent } from "./commerce-receipt-service.ts";
import {
  CataloguePlanNotApplicableError,
  applyCatalogue,
  parseCatalogueSpec,
  planCatalogue,
  type CatalogueSpec,
} from "./catalogue-loader.ts";
import { buildReconciliationReport } from "./reconciliation-report.ts";

const SITE = "superlatif.id";
const T0 = new Date("2026-10-01T03:00:00.000Z");
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

function spec(overrides: Partial<CatalogueSpec["products"][number]> = {}): CatalogueSpec {
  return {
    schemaVersion: 1,
    provider: "sejoli_bridge",
    site: SITE,
    products: [
      {
        sejoliProductId: "5350",
        code: "KELAS_AKSELERASI_2026",
        name: "Kelas Akselerasi Lulus Kedinasan 2026",
        type: "full_program_bundle",
        termsVersion: "terms-2026-10",
        offer: { code: "OFFER_KELAS_AKSELERASI_2026", title: "Kelas Akselerasi 2026", amountMinor: 499_000 },
        validity: { mode: "duration_after_purchase", durationDays: 180 },
        components: [
          {
            componentCode: "program",
            targetType: "program",
            targetCode: "AKS-2026",
            actions: ["view", "consume"],
          },
        ],
        ...overrides,
      },
    ],
  };
}

async function student(wordpressUserId: string): Promise<string> {
  const user = await createUser(handle.db, { emailNormalized: null, phoneE164: null });
  await linkExternalIdentity(handle.db, {
    userId: user.userId,
    provider: WORDPRESS_LOGIN_PROVIDER,
    externalSubject: wordpressUserId,
    linkReason: "test",
  });
  return user.userId;
}

function deliver(eventId: string, eventType: string, order: string, buyer: string, sku: string, when: Date) {
  const rawPayload = {
    eventId,
    eventType,
    order: { externalOrderId: order, externalSkuId: sku, externalUserId: buyer },
  };
  return receiveCommerceEvent(
    handle.db,
    cache,
    {
      envelope: {
        provider: "sejoli_bridge",
        site: SITE,
        eventId,
        type: "purchase.status_changed",
        occurredAt: when.toISOString(),
        order: {
          externalId: order,
          status: eventType,
          currency: "IDR",
          amountMinor: 499_000,
          externalUserId: buyer,
          externalSkuId: sku,
        },
        schemaVersion: 1,
      },
      rawPayload,
      signatureOutcome: "verified",
      correlationId: `c-${eventId}`,
      statusMap: WIRE_EVENT_TYPE_STATUS_MAP_V1,
    },
    when,
  );
}

async function canView(userId: string, now: Date): Promise<boolean> {
  return (
    await getEffectiveAccess(
      handle.db,
      createInMemoryEffectiveAccessCache(),
      userId,
      { targetType: "program", targetRef: programTargetRef("AKS-2026"), action: "view" },
      now,
    )
  ).allowed;
}

describe("parseCatalogueSpec", () => {
  it("accepts a complete spec", () => {
    expect(parseCatalogueSpec(spec()).ok).toBe(true);
  });

  it("reports every problem at once and never accepts guesses", () => {
    const result = parseCatalogueSpec({
      schemaVersion: 2,
      provider: "woocommerce",
      site: "https://superlatif.id",
      products: [
        {
          sejoliProductId: 5350,
          code: "lower-case",
          name: "",
          type: "x",
          termsVersion: "t",
          offer: { code: "OK_CODE", title: "t", amountMinor: -1 },
          validity: { mode: "through_program_or_batch_end" },
          components: [{ componentCode: "p", targetType: "module", targetCode: "X", actions: ["teleport"] }],
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThanOrEqual(9);
    expect(result.errors.join("\n")).toMatch(/sejoliProductId must be a decimal string/);
    expect(result.errors.join("\n")).toMatch(/validity.mode must be lifetime/);
  });

  it("rejects duplicate SKUs and codes across products", () => {
    const one = spec().products[0]!;
    const result = parseCatalogueSpec({ ...spec(), products: [one, one] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join("\n")).toMatch(/duplicate sejoliProductId 5350/);
  });
});

describe("catalogue plan and apply", () => {
  it("blocks a product whose target does not exist, and writes nothing", async () => {
    const plan = await planCatalogue(handle.db, spec(), T0);
    expect(plan.applicable).toBe(false);
    expect(plan.products[0]).toMatchObject({ action: "blocked", reason: "program AKS-2026 does not exist" });
    await expect(applyCatalogue(handle.db, spec(), T0)).rejects.toBeInstanceOf(
      CataloguePlanNotApplicableError,
    );
    const result = (await handle.db.execute(sql`select count(*)::int as n from products`)) as unknown;
    const rows = (Array.isArray(result) ? result : (result as { rows: { n: number }[] }).rows) as {
      n: number;
    }[];
    expect(rows[0]?.n).toBe(0);
  });

  it("blocks an exam batch target that does not exist", async () => {
    const plan = await planCatalogue(
      handle.db,
      spec({
        components: [
          {
            componentCode: "batch",
            targetType: "exam_batch",
            targetCode: "TO-NONE",
            actions: ["start_attempt"],
          },
        ],
      }),
      T0,
    );
    expect(plan.products[0]).toMatchObject({
      action: "blocked",
      reason: "exam batch TO-NONE does not exist",
    });
  });

  it("loads once, then reports `exists` on re-run without writing again", async () => {
    await createProgram(handle.db, { code: "AKS-2026", name: "Kelas Akselerasi 2026" });
    expect((await planCatalogue(handle.db, spec(), T0)).products[0]?.action).toBe("create");

    const applied = await applyCatalogue(handle.db, spec(), T0);
    expect(applied).toHaveLength(1);
    expect((await planCatalogue(handle.db, spec(), T0)).products[0]?.action).toBe("exists");
    expect(await applyCatalogue(handle.db, spec(), T0)).toEqual([]);
  });

  it("a loaded product grants exactly its declared access when a paid order arrives - and nothing before", async () => {
    await createProgram(handle.db, { code: "AKS-2026", name: "Kelas Akselerasi 2026" });
    await applyCatalogue(handle.db, spec(), T0);
    const buyer = await student("9001");
    expect(await canView(buyer, at(1))).toBe(false);

    await deliver("e1", "payment_settled", "70001", "9001", "5350", at(1));
    expect(await canView(buyer, at(2))).toBe(true);
    const [grant] = (await listGrantsForUser(handle.db, buyer)).filter((g) => g.sourceType === "purchase");
    // duration_after_purchase 180 days, measured from issuance.
    expect(grant?.validTo?.getTime()).toBe(at(1).getTime() + 180 * 86_400_000);
  });

  it("refuses to remap a SKU already mapped to another product", async () => {
    await createProgram(handle.db, { code: "AKS-2026", name: "Kelas Akselerasi 2026" });
    await applyCatalogue(handle.db, spec(), T0);
    const other = spec({ code: "OTHER_PRODUCT", offer: { code: "OTHER_OFFER", title: "o", amountMinor: 1 } });
    const plan = await planCatalogue(handle.db, other, T0);
    expect(plan.products[0]).toMatchObject({ action: "conflict" });
    await expect(applyCatalogue(handle.db, other, T0)).rejects.toBeInstanceOf(
      CataloguePlanNotApplicableError,
    );
  });
});

describe("reconciliation report (read-only)", () => {
  async function loaded() {
    await createProgram(handle.db, { code: "AKS-2026", name: "Kelas Akselerasi 2026" });
    await applyCatalogue(handle.db, spec(), T0);
  }

  it("is OK on a clean system and runs inside a READ ONLY transaction", async () => {
    await loaded();
    const buyer = await student("9001");
    await deliver("e1", "payment_settled", "70001", "9001", "5350", at(1));
    expect(await canView(buyer, at(2))).toBe(true);

    const report = await handle.db.transaction(async (tx) => {
      await tx.execute(sql`set transaction read only`);
      return buildReconciliationReport(tx, at(30));
    });
    expect(report.status).toBe("OK");
    expect(report.paidWithoutActiveGrant).toEqual([]);
    expect(report.activeGrantOnClosedPurchase).toEqual([]);
    expect(report.deliveries.receivedLast24h).toBe(1);
  });

  it("lists a purchase waiting for its buyer without raising ATTENTION", async () => {
    await loaded();
    await deliver("e1", "payment_settled", "70002", "9002", "5350", at(1));
    const report = await buildReconciliationReport(handle.db, at(60));
    expect(report.unboundPurchases).toEqual([{ order: "70002", status: "paid", ageHours: 1 }]);
    expect(report.openCases).toEqual([expect.objectContaining({ type: "unresolved_identity" })]);
    expect(report.status).toBe("OK");
  });

  it("raises ATTENTION for an unknown SKU and for a paid purchase whose grant was removed", async () => {
    await loaded();
    const buyer = await student("9001");
    await deliver("e1", "payment_settled", "70001", "9001", "5350", at(1));
    await deliver("e2", "payment_settled", "70003", "9001", "4444", at(2));
    const [grant] = (await listGrantsForUser(handle.db, buyer)).filter((g) => g.sourceType === "purchase");
    await recordGrantEventAndInvalidate(handle.db, cache, buyer, {
      grantId: grant!.id,
      eventType: "revoked",
      occurredAt: at(3),
      reason: "test drift",
      actor: { sourceType: grant!.sourceType, sourceId: grant!.sourceId },
    });

    const report = await buildReconciliationReport(handle.db, at(10));
    expect(report.status).toBe("ATTENTION");
    expect(report.openCases.map((c) => c.type)).toContain("unknown_sku");
    expect(report.openCaseItems.find((c) => c.type === "unknown_sku")?.order).toBe("70003");
    expect(report.paidWithoutActiveGrant).toEqual([{ order: "70001" }]);
  });

  it("carries no user ID, email, or amount", async () => {
    await loaded();
    const buyer = await student("9001");
    await deliver("e1", "payment_settled", "70001", "9001", "5350", at(1));
    const text = JSON.stringify(await buildReconciliationReport(handle.db, at(10)));
    expect(text).not.toContain(buyer);
    expect(text).not.toContain("499000");
    expect(text).not.toContain("9001");
  });
});
