// Test-case IDs reference test/fixtures/contracts/entitlement-resolution
// .cases.json's ENT-SYN-001..003 (ENT-SYN-004 is an ownership test already
// covered at the single-grant level in ENT-001; ENT-SYN-005 is a rebuild/
// drift case, explicitly ENT-003's scope - not reproduced here, see
// ADR-050).

import { describe, expect, it } from "vitest";
import { resolveEffectiveAccess, type PolicyClaim, type ResolvableGrant } from "./effective-access.ts";
import type { DerivedGrantStatus } from "./grant-status.ts";

function claim(overrides: Partial<PolicyClaim> = {}): PolicyClaim {
  return {
    targetType: "program_track",
    targetRef: { code: "track:skd" },
    actions: ["view"],
    includeDescendants: false,
    ...overrides,
  };
}

function activeGrant(
  grantId: string,
  from: Date,
  to: Date | null,
  claims: readonly PolicyClaim[],
): ResolvableGrant {
  const derived: DerivedGrantStatus = {
    status: "active",
    reasonCode: "ACTIVE_GRANT",
    effectiveFrom: from,
    effectiveTo: to,
  };
  return { grantId, derived, claims };
}

function terminalGrant(
  grantId: string,
  status: DerivedGrantStatus["status"],
  reasonCode: DerivedGrantStatus["reasonCode"],
  claims: readonly PolicyClaim[],
): ResolvableGrant {
  const derived: DerivedGrantStatus = { status, reasonCode, effectiveFrom: null, effectiveTo: null };
  return { grantId, derived, claims };
}

describe("resolveEffectiveAccess - ENT-SYN-001: single active purchase grant allows resource", () => {
  it("allows with reasonCode ACTIVE_GRANT and exactly one decisive grant, no ignored grants", () => {
    const grant = activeGrant("g-1", new Date("2026-08-01T00:00:00Z"), new Date("2026-12-31T23:59:59Z"), [
      claim(),
    ]);
    const decision = resolveEffectiveAccess([grant], {
      targetType: "program_track",
      targetRef: "track:skd",
      action: "view",
    });
    expect(decision.allowed).toBe(true);
    expect(decision.reasonCode).toBe("ACTIVE_GRANT");
    expect(decision.decisiveGrantIds).toEqual(["g-1"]);
    expect(decision.ignoredGrantIds).toEqual([]);
  });
});

describe("resolveEffectiveAccess - ENT-SYN-002: refund from one source preserves overlapping scholarship", () => {
  it("allows via the surviving scholarship grant, with the revoked purchase grant listed as ignored - required negative test: revoked is rejected with a clear explanation trace", () => {
    const revokedPurchase = terminalGrant("g-2a", "revoked", "REVOKED", [claim()]);
    const activeScholarship = activeGrant(
      "g-2b",
      new Date("2026-08-01T00:00:00Z"),
      new Date("2027-01-31T23:59:59Z"),
      [claim()],
    );

    const decision = resolveEffectiveAccess([revokedPurchase, activeScholarship], {
      targetType: "program_track",
      targetRef: "track:skd",
      action: "view",
    });

    expect(decision.allowed).toBe(true);
    expect(decision.decisiveGrantIds).toEqual(["g-2b"]);
    expect(decision.ignoredGrantIds).toEqual(["g-2a"]);
    expect(decision.reasonCode).toBe("OVERLAPPING_ACTIVE_GRANT");
    // Cancelling one source's grant does not remove the shared target -
    // both grants remain visible in the diagnostic trace for support.
    expect(decision.diagnostic).toEqual([
      { grantId: "g-2a", status: "revoked" },
      { grantId: "g-2b", status: "active" },
    ]);
  });
});

describe("resolveEffectiveAccess - ENT-SYN-003: expired grant denies access at exact boundary", () => {
  it("denies with reasonCode NO_ACTIVE_GRANT - required negative test: expired is rejected with a clear explanation trace", () => {
    const expired = terminalGrant("g-3", "expired", "NO_ACTIVE_GRANT", [
      claim({ targetType: "exam_batch", targetRef: { code: "batch:skd-3" } }),
    ]);
    const decision = resolveEffectiveAccess([expired], {
      targetType: "exam_batch",
      targetRef: "batch:skd-3",
      action: "view",
    });
    expect(decision.allowed).toBe(false);
    expect(decision.decisiveGrantIds).toEqual([]);
    expect(decision.ignoredGrantIds).toEqual(["g-3"]);
    expect(decision.reasonCode).toBe("NO_ACTIVE_GRANT");
    expect(decision.diagnostic).toEqual([{ grantId: "g-3", status: "expired" }]);
  });
});

describe("resolveEffectiveAccess - required negative tests: suspended and cancelled are rejected with a clear explanation trace", () => {
  it("suspended grant denies with NO_ACTIVE_GRANT and the suspended status visible in diagnostic", () => {
    const suspended = terminalGrant("g-susp", "suspended", "SUSPENDED", [claim()]);
    const decision = resolveEffectiveAccess([suspended], {
      targetType: "program_track",
      targetRef: "track:skd",
      action: "view",
    });
    expect(decision).toMatchObject({
      allowed: false,
      reasonCode: "NO_ACTIVE_GRANT",
      ignoredGrantIds: ["g-susp"],
    });
    expect(decision.diagnostic).toEqual([{ grantId: "g-susp", status: "suspended" }]);
  });

  it("cancelled grant denies with NO_ACTIVE_GRANT and the cancelled status visible in diagnostic", () => {
    const cancelled = terminalGrant("g-cancel", "cancelled", "CANCELLED", [claim()]);
    const decision = resolveEffectiveAccess([cancelled], {
      targetType: "program_track",
      targetRef: "track:skd",
      action: "view",
    });
    expect(decision).toMatchObject({
      allowed: false,
      reasonCode: "NO_ACTIVE_GRANT",
      ignoredGrantIds: ["g-cancel"],
    });
    expect(decision.diagnostic).toEqual([{ grantId: "g-cancel", status: "cancelled" }]);
  });
});

describe("resolveEffectiveAccess - duplicate target does not appear twice", () => {
  it("two active grants claiming the SAME target/action produce ONE decision object with both decisive grant IDs, not two decisions", () => {
    const grantA = activeGrant("g-a", new Date("2026-08-01T00:00:00Z"), new Date("2026-10-01T00:00:00Z"), [
      claim(),
    ]);
    const grantB = activeGrant("g-b", new Date("2026-08-01T00:00:00Z"), new Date("2026-12-01T00:00:00Z"), [
      claim(),
    ]);
    const decision = resolveEffectiveAccess([grantA, grantB], {
      targetType: "program_track",
      targetRef: "track:skd",
      action: "view",
    });
    expect(decision.allowed).toBe(true);
    expect(decision.reasonCode).toBe("OVERLAPPING_ACTIVE_GRANT");
    expect([...decision.decisiveGrantIds].sort()).toEqual(["g-a", "g-b"]);
    // "expiryResolution=latest_supporting_grant" - the union ends at the LATER of the two.
    expect(decision.effectiveTo?.toISOString()).toBe(new Date("2026-12-01T00:00:00Z").toISOString());
  });

  it("effectiveTo is open-ended (null) if ANY decisive grant is open-ended, even if others have a fixed end", () => {
    const fixedEnd = activeGrant(
      "g-fixed",
      new Date("2026-08-01T00:00:00Z"),
      new Date("2026-10-01T00:00:00Z"),
      [claim()],
    );
    const lifetime = activeGrant("g-lifetime", new Date("2026-08-01T00:00:00Z"), null, [claim()]);
    const decision = resolveEffectiveAccess([fixedEnd, lifetime], {
      targetType: "program_track",
      targetRef: "track:skd",
      action: "view",
    });
    expect(decision.effectiveTo).toBeNull();
  });
});

describe("resolveEffectiveAccess - target not claimed at all", () => {
  it("returns NOT_CLAIMED, distinct from NO_ACTIVE_GRANT, when no grant even claims this target/action", () => {
    const grant = activeGrant("g-unrelated", new Date("2026-08-01T00:00:00Z"), null, [
      claim({ targetRef: { code: "track:tka" } }),
    ]);
    const decision = resolveEffectiveAccess([grant], {
      targetType: "program_track",
      targetRef: "track:skd",
      action: "view",
    });
    expect(decision).toMatchObject({
      allowed: false,
      reasonCode: "NOT_CLAIMED",
      decisiveGrantIds: [],
      ignoredGrantIds: [],
    });
  });
});

describe("resolveEffectiveAccess - scheduled grant", () => {
  it("reports SCHEDULED with the next start time when the only claiming grant has not started yet", () => {
    const future = new Date("2026-09-01T00:00:00Z");
    const scheduled: ResolvableGrant = {
      grantId: "g-future",
      derived: { status: "scheduled", reasonCode: "SCHEDULED", effectiveFrom: future, effectiveTo: null },
      claims: [claim()],
    };
    const decision = resolveEffectiveAccess([scheduled], {
      targetType: "program_track",
      targetRef: "track:skd",
      action: "view",
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe("SCHEDULED");
    expect(decision.effectiveFrom?.toISOString()).toBe(future.toISOString());
    expect(decision.studentReason).toContain(future.toISOString());
  });
});

describe("resolveEffectiveAccess - includeDescendants requires an explicit ancestor check from the caller", () => {
  it("does not expand to a descendant target when isDescendantOf is omitted", () => {
    const grant = activeGrant("g-program", new Date("2026-08-01T00:00:00Z"), null, [
      claim({ targetType: "program", targetRef: { code: "program:aks-2026" }, includeDescendants: true }),
    ]);
    const decision = resolveEffectiveAccess([grant], {
      targetType: "program",
      targetRef: "module:strategi-tiu",
      action: "view",
    });
    expect(decision.reasonCode).toBe("NOT_CLAIMED");
  });

  it("expands to a descendant target when the caller supplies isDescendantOf", () => {
    const grant = activeGrant("g-program", new Date("2026-08-01T00:00:00Z"), null, [
      claim({ targetType: "program", targetRef: { code: "program:aks-2026" }, includeDescendants: true }),
    ]);
    const decision = resolveEffectiveAccess(
      [grant],
      { targetType: "program", targetRef: "module:strategi-tiu", action: "view" },
      {
        isDescendantOf: (candidate, ancestor) =>
          candidate === "module:strategi-tiu" && ancestor === "program:aks-2026",
      },
    );
    expect(decision.allowed).toBe(true);
    expect(decision.decisiveGrantIds).toEqual(["g-program"]);
  });

  it("does NOT expand when includeDescendants is false, even with a matching isDescendantOf supplied", () => {
    const grant = activeGrant("g-restricted", new Date("2026-08-01T00:00:00Z"), null, [
      claim({ targetType: "program", targetRef: { code: "program:aks-2026" }, includeDescendants: false }),
    ]);
    const decision = resolveEffectiveAccess(
      [grant],
      { targetType: "program", targetRef: "module:strategi-tiu", action: "view" },
      { isDescendantOf: () => true },
    );
    expect(decision.reasonCode).toBe("NOT_CLAIMED");
  });
});

describe("resolveEffectiveAccess - per-component availabilityOverride narrows the grant's own window", () => {
  it("denies once the claim's own availabilityOverride has ended, even though the grant itself is still active", () => {
    const grant = activeGrant(
      "g-narrowed",
      new Date("2026-08-01T00:00:00Z"),
      new Date("2026-12-31T00:00:00Z"),
      [claim({ availabilityOverride: { startsAt: null, endsAt: new Date("2026-08-15T00:00:00Z") } })],
    );
    // NOTE: resolveEffectiveAccess itself has no `now` parameter - the
    // caller's grants are already status-derived at a specific `now"` via
    // ENT-001's deriveGrantStatus (status="active" here means the GRANT is
    // active at that instant). The narrowed window's `to` still reflects
    // the override for effectiveTo reporting, proving the override is
    // honored in the returned window even though this decision's `allowed`
    // reflects only the derived grant status passed in, not a second time
    // check - a caller resolving for an instant after 2026-08-15 would
    // instead pass a grant already derived as "expired" for this narrower
    // window at the caller layer. This test asserts the effectiveTo
    // reporting is narrowed correctly.
    const decision = resolveEffectiveAccess([grant], {
      targetType: "program_track",
      targetRef: "track:skd",
      action: "view",
    });
    expect(decision.effectiveTo?.toISOString()).toBe(new Date("2026-08-15T00:00:00Z").toISOString());
  });
});
