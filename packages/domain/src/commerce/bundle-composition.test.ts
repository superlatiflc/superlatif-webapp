import { describe, expect, it } from "vitest";
import {
  composeProductTargets,
  type ProductComponentClaim,
  type ProductComponentSource,
} from "./bundle-composition.ts";

function source(
  componentCode: string,
  productCode = "AKSELERASI_2026",
  productVersion = 1,
): ProductComponentSource {
  return { productCode, productVersion, componentCode };
}

describe("composeProductTargets", () => {
  it("bundle composition test: Kelas Akselerasi opens several distinct targets from one product version - a product that opens multiple access targets", () => {
    const claims: ProductComponentClaim[] = [
      {
        source: source("program"),
        targetType: "program",
        targetRef: "program:aks-2026",
        includeDescendants: true,
      },
      {
        source: source("batch-01"),
        targetType: "exam_batch",
        targetRef: "batch:skd-01",
        includeDescendants: false,
      },
      {
        source: source("batch-02"),
        targetType: "exam_batch",
        targetRef: "batch:skd-02",
        includeDescendants: false,
      },
      {
        source: source("community"),
        targetType: "community",
        targetRef: "community:aks-2026",
        includeDescendants: false,
      },
    ];

    const composed = composeProductTargets(claims);

    expect(composed).toHaveLength(4);
    expect(composed.map((target) => target.targetRef).sort()).toEqual(
      ["batch:skd-01", "batch:skd-02", "community:aks-2026", "program:aks-2026"].sort(),
    );
    // No content was copied - each composed target still points at the
    // original component's source, not a duplicated resource.
    for (const target of composed) {
      expect(target.sources).toHaveLength(1);
    }
  });

  it("overlapping product test: a bundle and a specialist package both include track:skd - the target appears once, with both sources visible", () => {
    const bundleClaim: ProductComponentClaim = {
      source: source("skd-track", "AKSELERASI_2026", 1),
      targetType: "program_track",
      targetRef: "track:skd",
      includeDescendants: true,
    };
    const specialistClaim: ProductComponentClaim = {
      source: source("skd-only", "PAKET_SKD", 1),
      targetType: "program_track",
      targetRef: "track:skd",
      includeDescendants: true,
    };

    const composed = composeProductTargets([bundleClaim, specialistClaim]);

    expect(composed).toHaveLength(1);
    expect(composed[0]?.targetRef).toBe("track:skd");
    expect(composed[0]?.sources).toEqual([bundleClaim.source, specialistClaim.source]);
  });

  it("does not duplicate a source that lists the same target twice within one product version", () => {
    const claim: ProductComponentClaim = {
      source: source("dup"),
      targetType: "resource",
      targetRef: "resource:guide-01",
      includeDescendants: false,
    };
    const composed = composeProductTargets([claim, claim]);
    expect(composed).toHaveLength(1);
    expect(composed[0]?.sources).toHaveLength(1);
  });

  it("includeDescendants is the union of every contributing component - the more permissive option wins (dok 18 §8)", () => {
    const restrictive: ProductComponentClaim = {
      source: source("restrictive", "PAKET_SKD", 1),
      targetType: "program_track",
      targetRef: "track:skd",
      includeDescendants: false,
    };
    const permissive: ProductComponentClaim = {
      source: source("permissive", "AKSELERASI_2026", 1),
      targetType: "program_track",
      targetRef: "track:skd",
      includeDescendants: true,
    };
    const composed = composeProductTargets([restrictive, permissive]);
    expect(composed[0]?.includeDescendants).toBe(true);
  });

  it("keeps different target types with the same ref string distinct (SKD-only and TKA-only do not collide)", () => {
    const skdOnly: ProductComponentClaim = {
      source: source("skd", "PAKET_SKD", 1),
      targetType: "program_track",
      targetRef: "track:skd",
      includeDescendants: true,
    };
    const tkaOnly: ProductComponentClaim = {
      source: source("tka", "PAKET_TKA", 1),
      targetType: "program_track",
      targetRef: "track:tka",
      includeDescendants: true,
    };
    const composed = composeProductTargets([skdOnly, tkaOnly]);
    expect(composed).toHaveLength(2);
  });

  it("returns an empty composition for an empty claim list (no components authored yet)", () => {
    expect(composeProductTargets([])).toEqual([]);
  });
});
