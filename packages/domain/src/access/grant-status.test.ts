import { describe, expect, it } from "vitest";
import { deriveGrantStatus, isOwnedBy, type GrantEvent, type GrantFacts } from "./grant-status.ts";

const NOW = new Date("2026-08-28T12:00:00.000Z");

function facts(overrides: Partial<GrantFacts> = {}): GrantFacts {
  return {
    validityConfig: { mode: "fixed_window" },
    issuedAt: new Date("2026-08-01T00:00:00.000Z"),
    validFrom: new Date("2026-08-01T00:00:00.000Z"),
    validTo: new Date("2026-12-31T23:59:59.000Z"),
    ...overrides,
  };
}

describe("active grant (matches ENT-SYN-001)", () => {
  it("is active when now falls inside the window and no events exist", () => {
    const result = deriveGrantStatus(facts(), [], NOW);
    expect(result).toEqual({
      status: "active",
      reasonCode: "ACTIVE_GRANT",
      effectiveFrom: facts().validFrom,
      effectiveTo: facts().validTo,
    });
  });
});

describe("expired grant at exact boundary (matches ENT-SYN-003)", () => {
  it("is expired exactly AT validTo, not only strictly after it", () => {
    const boundary = new Date("2026-08-28T12:00:00.000Z");
    const result = deriveGrantStatus(facts({ validTo: boundary }), [], boundary);
    expect(result.status).toBe("expired");
    expect(result.reasonCode).toBe("NO_ACTIVE_GRANT");
  });

  it("is still active one millisecond before the boundary", () => {
    const boundary = new Date("2026-08-28T12:00:00.000Z");
    const justBefore = new Date(boundary.getTime() - 1);
    const result = deriveGrantStatus(facts({ validTo: boundary }), [], justBefore);
    expect(result.status).toBe("active");
  });
});

describe("scheduled grant", () => {
  it("is scheduled when validFrom is in the future", () => {
    const validFrom = new Date("2026-09-01T00:00:00.000Z");
    const result = deriveGrantStatus(facts({ validFrom }), [], NOW);
    expect(result.status).toBe("scheduled");
    expect(result.reasonCode).toBe("SCHEDULED");
  });
});

describe("revocation (terminal, matches ENT-SYN-002's g-2a)", () => {
  it("is revoked once a revoked event exists, regardless of the time window", () => {
    const events: GrantEvent[] = [{ eventType: "revoked", occurredAt: new Date("2026-08-15T00:00:00.000Z") }];
    const result = deriveGrantStatus(facts(), events, NOW);
    expect(result).toEqual({
      status: "revoked",
      reasonCode: "REVOKED",
      effectiveFrom: null,
      effectiveTo: null,
    });
  });

  it("stays revoked even if a later reinstated event exists - revocation is permanent", () => {
    const events: GrantEvent[] = [
      { eventType: "revoked", occurredAt: new Date("2026-08-15T00:00:00.000Z") },
      { eventType: "reinstated", occurredAt: new Date("2026-08-16T00:00:00.000Z") },
    ];
    expect(deriveGrantStatus(facts(), events, NOW).status).toBe("revoked");
  });
});

describe("cancellation (terminal)", () => {
  it("is cancelled once a cancelled event exists", () => {
    const events: GrantEvent[] = [
      { eventType: "cancelled", occurredAt: new Date("2026-08-05T00:00:00.000Z") },
    ];
    expect(deriveGrantStatus(facts(), events, NOW).status).toBe("cancelled");
  });
});

describe("suspension (reversible)", () => {
  it("is suspended when the latest suspend/reinstate event is a suspension", () => {
    const events: GrantEvent[] = [
      { eventType: "suspended", occurredAt: new Date("2026-08-10T00:00:00.000Z") },
    ];
    expect(deriveGrantStatus(facts(), events, NOW).status).toBe("suspended");
  });

  it("returns to time-derived status once reinstated after the last suspension", () => {
    const events: GrantEvent[] = [
      { eventType: "suspended", occurredAt: new Date("2026-08-10T00:00:00.000Z") },
      { eventType: "reinstated", occurredAt: new Date("2026-08-12T00:00:00.000Z") },
    ];
    expect(deriveGrantStatus(facts(), events, NOW).status).toBe("active");
  });

  it("uses only the LATEST suspend/reinstate pair when suspended more than once", () => {
    const events: GrantEvent[] = [
      { eventType: "suspended", occurredAt: new Date("2026-08-05T00:00:00.000Z") },
      { eventType: "reinstated", occurredAt: new Date("2026-08-06T00:00:00.000Z") },
      { eventType: "suspended", occurredAt: new Date("2026-08-20T00:00:00.000Z") },
    ];
    expect(deriveGrantStatus(facts(), events, NOW).status).toBe("suspended");
  });
});

describe("duration_after_activation - status depends on an activation event, not a stored column", () => {
  const activationFacts = facts({
    validityConfig: { mode: "duration_after_activation", durationDays: 30 },
    validFrom: null,
    validTo: null,
  });

  it("is scheduled (pending activation) before any activated event exists", () => {
    const result = deriveGrantStatus(activationFacts, [], NOW);
    expect(result.status).toBe("scheduled");
    expect(result.reasonCode).toBe("PENDING_ACTIVATION");
  });

  it("becomes active once activated, anchored to the activation instant", () => {
    const activatedAt = new Date("2026-08-01T00:00:00.000Z");
    const events: GrantEvent[] = [{ eventType: "activated", occurredAt: activatedAt }];
    const result = deriveGrantStatus(activationFacts, events, NOW);
    expect(result.status).toBe("active");
    expect(result.effectiveTo?.toISOString()).toBe("2026-08-31T00:00:00.000Z");
  });

  it("expires 30 days after activation, at the boundary", () => {
    const activatedAt = new Date("2026-07-01T00:00:00.000Z");
    const events: GrantEvent[] = [{ eventType: "activated", occurredAt: activatedAt }];
    const boundary = new Date("2026-07-31T00:00:00.000Z");
    expect(deriveGrantStatus(activationFacts, events, boundary).status).toBe("expired");
  });
});

describe("isOwnedBy (matches ENT-SYN-004 SOURCE_OWNERSHIP_MISMATCH)", () => {
  it("is true when sourceType and sourceId both match", () => {
    expect(
      isOwnedBy(
        { sourceType: "manual", sourceId: "manual-case-4" },
        { sourceType: "manual", sourceId: "manual-case-4" },
      ),
    ).toBe(true);
  });

  it("is false when the actor's source differs from the grant's source", () => {
    expect(
      isOwnedBy(
        { sourceType: "manual", sourceId: "manual-case-4" },
        { sourceType: "purchase", sourceId: "order-4" },
      ),
    ).toBe(false);
  });

  it("is false when sourceType matches but sourceId differs", () => {
    expect(
      isOwnedBy(
        { sourceType: "purchase", sourceId: "order-1" },
        { sourceType: "purchase", sourceId: "order-2" },
      ),
    ).toBe(false);
  });
});
