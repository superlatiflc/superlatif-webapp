import { describe, expect, it } from "vitest";
import { compareEffectiveAccessDecisions } from "./entitlement-drift.ts";
import type { EffectiveAccessDecision } from "./effective-access.ts";

function decision(overrides: Partial<EffectiveAccessDecision> = {}): EffectiveAccessDecision {
  return {
    allowed: true,
    targetType: "program",
    targetRef: "program:aks-2026",
    action: "view",
    decisiveGrantIds: ["grant-1"],
    ignoredGrantIds: [],
    reasonCode: "ACTIVE_GRANT",
    effectiveFrom: null,
    effectiveTo: null,
    studentReason: "Aktif",
    diagnostic: [],
    ...overrides,
  };
}

describe("compareEffectiveAccessDecisions", () => {
  it("no prior cache is not drift - there is nothing to have drifted from", () => {
    const report = compareEffectiveAccessDecisions(null, decision());
    expect(report).toEqual({
      hasDrift: false,
      driftKind: "no_prior_cache",
      cached: null,
      rebuilt: report.rebuilt,
    });
  });

  it("required test: no drift when cached and rebuilt agree exactly", () => {
    const cached = decision();
    const rebuilt = decision();
    const report = compareEffectiveAccessDecisions(cached, rebuilt);
    expect(report.hasDrift).toBe(false);
    expect(report.driftKind).toBe("none");
  });

  describe("required negative test: drift detection", () => {
    it("cache_over_permissive - the dangerous direction: cache says allowed, a fresh rebuild says denied", () => {
      const cached = decision({ allowed: true });
      const rebuilt = decision({
        allowed: false,
        decisiveGrantIds: [],
        reasonCode: "NOT_CLAIMED",
        studentReason: "Belum ada akses",
      });
      const report = compareEffectiveAccessDecisions(cached, rebuilt);
      expect(report.hasDrift).toBe(true);
      expect(report.driftKind).toBe("cache_over_permissive");
    });

    it("cache_under_permissive - the safe direction: cache says denied, a fresh rebuild says allowed", () => {
      const cached = decision({
        allowed: false,
        decisiveGrantIds: [],
        reasonCode: "NOT_CLAIMED",
        studentReason: "Belum ada akses",
      });
      const rebuilt = decision({ allowed: true });
      const report = compareEffectiveAccessDecisions(cached, rebuilt);
      expect(report.hasDrift).toBe(true);
      expect(report.driftKind).toBe("cache_under_permissive");
    });

    it("decisive_grants_differ - both allow, but a different grant set supports the decision", () => {
      const cached = decision({ decisiveGrantIds: ["grant-1"] });
      const rebuilt = decision({ decisiveGrantIds: ["grant-1", "grant-2"] });
      const report = compareEffectiveAccessDecisions(cached, rebuilt);
      expect(report.hasDrift).toBe(true);
      expect(report.driftKind).toBe("decisive_grants_differ");
    });

    it("decisive_grants_differ is order-independent - the same set in a different order is NOT drift", () => {
      const cached = decision({ decisiveGrantIds: ["grant-1", "grant-2"] });
      const rebuilt = decision({ decisiveGrantIds: ["grant-2", "grant-1"] });
      const report = compareEffectiveAccessDecisions(cached, rebuilt);
      expect(report.hasDrift).toBe(false);
    });
  });
});
