import { describe, expect, it } from "vitest";
import { resolveSkuMapping, type SkuMappingCandidate } from "./sku-mapping.ts";

function mapping(
  overrides: Partial<SkuMappingCandidate> & Pick<SkuMappingCandidate, "offerId" | "mappingVersion">,
): SkuMappingCandidate {
  return {
    validFrom: new Date("2026-01-01T00:00:00.000Z"),
    validTo: null,
    priority: 0,
    status: "active",
    ...overrides,
  };
}

describe("resolveSkuMapping", () => {
  it("returns null when no mapping has ever existed for this SKU", () => {
    expect(resolveSkuMapping([], new Date("2026-08-29T00:00:00.000Z"))).toBeNull();
  });

  it("resolves the mapping version whose window covers the instant - mapping version test", () => {
    const v1 = mapping({
      offerId: "offer-a",
      mappingVersion: 1,
      validFrom: new Date("2026-08-01T00:00:00.000Z"),
      validTo: new Date("2026-08-15T00:00:00.000Z"),
    });
    const v2 = mapping({
      offerId: "offer-b",
      mappingVersion: 2,
      validFrom: new Date("2026-08-15T00:00:00.000Z"),
      validTo: null,
    });

    expect(resolveSkuMapping([v1, v2], new Date("2026-07-01T00:00:00.000Z"))).toBeNull();
    expect(resolveSkuMapping([v1, v2], new Date("2026-08-10T00:00:00.000Z"))?.offerId).toBe("offer-a");
    // validTo is exclusive - the instant of remapping belongs to v2, not v1.
    expect(resolveSkuMapping([v1, v2], new Date("2026-08-15T00:00:00.000Z"))?.offerId).toBe("offer-b");
    expect(resolveSkuMapping([v1, v2], new Date("2026-08-20T00:00:00.000Z"))?.offerId).toBe("offer-b");
  });

  it("prefers the higher-priority mapping when two are valid at the same instant (duplicate catalogue entry recovery)", () => {
    const low = mapping({ offerId: "offer-low", mappingVersion: 1, priority: 0 });
    const high = mapping({ offerId: "offer-high", mappingVersion: 1, priority: 5 });
    expect(resolveSkuMapping([low, high], new Date("2026-08-29T00:00:00.000Z"))?.offerId).toBe("offer-high");
    expect(resolveSkuMapping([high, low], new Date("2026-08-29T00:00:00.000Z"))?.offerId).toBe("offer-high");
  });

  it("breaks an equal-priority tie by the most recently authored mapping version", () => {
    const older = mapping({ offerId: "offer-older", mappingVersion: 1, priority: 0 });
    const newer = mapping({ offerId: "offer-newer", mappingVersion: 2, priority: 0 });
    expect(resolveSkuMapping([older, newer], new Date("2026-08-29T00:00:00.000Z"))?.offerId).toBe(
      "offer-newer",
    );
  });

  it("ignores inactive mappings even if their window covers the instant", () => {
    const inactive = mapping({ offerId: "offer-inactive", mappingVersion: 1, status: "inactive" });
    expect(resolveSkuMapping([inactive], new Date("2026-08-29T00:00:00.000Z"))).toBeNull();
  });

  it("supports legacy and new external SKU IDs mapping to the same offer via separate rows", () => {
    const legacy = mapping({ offerId: "offer-shared", mappingVersion: 1 });
    const modern = mapping({ offerId: "offer-shared", mappingVersion: 2, priority: 1 });
    const resolved = resolveSkuMapping([legacy, modern], new Date("2026-08-29T00:00:00.000Z"));
    expect(resolved?.offerId).toBe("offer-shared");
  });
});
