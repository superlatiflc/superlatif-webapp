import { describe, expect, it } from "vitest";
import {
  findCircularPrerequisite,
  resolveModuleVisibility,
  resolvePlacementVisibility,
  resolveReleaseState,
  type ReleaseContext,
} from "./release-rule.ts";

const NOW = new Date("2026-08-29T00:00:00.000Z");

function context(overrides: Partial<ReleaseContext> = {}): ReleaseContext {
  return { now: NOW, enrolledAt: null, completedPlacementIds: new Set(), ...overrides };
}

describe("resolveReleaseState", () => {
  it("immediate is always released", () => {
    expect(resolveReleaseState({ mode: "immediate" }, context())).toBe("released");
  });

  describe("fixed_datetime (scheduled release)", () => {
    it("is locked before the release datetime", () => {
      const rule = { mode: "fixed_datetime" as const, releaseAt: "2026-09-01T00:00:00.000Z" };
      expect(resolveReleaseState(rule, context())).toBe("locked");
    });

    it("is released at or after the release datetime", () => {
      const rule = { mode: "fixed_datetime" as const, releaseAt: "2026-08-29T00:00:00.000Z" };
      expect(resolveReleaseState(rule, context())).toBe("released");
      const past = { mode: "fixed_datetime" as const, releaseAt: "2026-08-01T00:00:00.000Z" };
      expect(resolveReleaseState(past, context())).toBe("released");
    });
  });

  describe("relative_to_enrollment (drip)", () => {
    const rule = { mode: "relative_to_enrollment" as const, offsetDays: 7 };

    it("is locked when there is no enrollment date to measure from", () => {
      expect(resolveReleaseState(rule, context({ enrolledAt: null }))).toBe("locked");
    });

    it("is locked before the offset has elapsed since enrollment", () => {
      const enrolledAt = new Date("2026-08-25T00:00:00.000Z"); // 4 days before NOW, offset is 7
      expect(resolveReleaseState(rule, context({ enrolledAt }))).toBe("locked");
    });

    it("is released once the offset has elapsed since enrollment", () => {
      const enrolledAt = new Date("2026-08-20T00:00:00.000Z"); // 9 days before NOW, offset is 7
      expect(resolveReleaseState(rule, context({ enrolledAt }))).toBe("released");
    });

    it("two learners enrolled on different dates see different release states for the same rule at the same instant", () => {
      const earlyLearner = new Date("2026-08-20T00:00:00.000Z");
      const lateLearner = new Date("2026-08-28T00:00:00.000Z");
      expect(resolveReleaseState(rule, context({ enrolledAt: earlyLearner }))).toBe("released");
      expect(resolveReleaseState(rule, context({ enrolledAt: lateLearner }))).toBe("locked");
    });
  });

  describe("after_prerequisite", () => {
    const rule = { mode: "after_prerequisite" as const, prerequisitePlacementIds: ["p1", "p2"] };

    it("is locked when no prerequisite is completed", () => {
      expect(resolveReleaseState(rule, context())).toBe("locked");
    });

    it("is locked when only some prerequisites are completed", () => {
      expect(resolveReleaseState(rule, context({ completedPlacementIds: new Set(["p1"]) }))).toBe("locked");
    });

    it("is released once every prerequisite is completed", () => {
      expect(resolveReleaseState(rule, context({ completedPlacementIds: new Set(["p1", "p2"]) }))).toBe(
        "released",
      );
    });
  });

  describe("manual", () => {
    it("is locked while an admin has not released it", () => {
      expect(resolveReleaseState({ mode: "manual", released: false }, context())).toBe("locked");
    });

    it("is released once an admin releases it", () => {
      expect(resolveReleaseState({ mode: "manual", released: true }, context())).toBe("released");
    });
  });
});

describe("resolveModuleVisibility", () => {
  const immediate = { mode: "immediate" as const };
  const futureScheduled = { mode: "fixed_datetime" as const, releaseAt: "2099-01-01T00:00:00.000Z" };

  it("required negative test: an archived module is hidden even though its release rule would say released", () => {
    expect(resolveModuleVisibility("archived", immediate, context())).toBe("hidden_archived");
  });

  it("a draft module is hidden as not-yet-published, distinctly from archived", () => {
    expect(resolveModuleVisibility("draft", immediate, context())).toBe("hidden_unpublished");
  });

  it("a published module with an unmet release rule is locked", () => {
    expect(resolveModuleVisibility("published", futureScheduled, context())).toBe("locked");
  });

  it("a published module with a met release rule is released", () => {
    expect(resolveModuleVisibility("published", immediate, context())).toBe("released");
  });
});

describe("resolvePlacementVisibility", () => {
  const immediate = { mode: "immediate" as const };
  const futureScheduled = { mode: "fixed_datetime" as const, releaseAt: "2099-01-01T00:00:00.000Z" };

  it("an archived module hides its placement regardless of the placement's own release rule", () => {
    expect(resolvePlacementVisibility("archived", immediate, immediate, context())).toBe("hidden_archived");
  });

  it("a released module with a locked placement rule is locked (AND, not OR)", () => {
    expect(resolvePlacementVisibility("published", immediate, futureScheduled, context())).toBe("locked");
  });

  it("a locked module locks its placement even if the placement's own rule is met", () => {
    expect(resolvePlacementVisibility("published", futureScheduled, immediate, context())).toBe("locked");
  });

  it("is released only when both the module and the placement's own rule are met", () => {
    expect(resolvePlacementVisibility("published", immediate, immediate, context())).toBe("released");
  });
});

describe("findCircularPrerequisite", () => {
  it("returns null for an acyclic prerequisite graph", () => {
    const edges = [
      { placementId: "a", prerequisitePlacementIds: [] },
      { placementId: "b", prerequisitePlacementIds: ["a"] },
      { placementId: "c", prerequisitePlacementIds: ["b"] },
    ];
    expect(findCircularPrerequisite(edges)).toBeNull();
  });

  it("detects a direct two-node cycle", () => {
    const edges = [
      { placementId: "a", prerequisitePlacementIds: ["b"] },
      { placementId: "b", prerequisitePlacementIds: ["a"] },
    ];
    expect(findCircularPrerequisite(edges)).not.toBeNull();
  });

  it("detects a longer indirect cycle", () => {
    const edges = [
      { placementId: "a", prerequisitePlacementIds: ["b"] },
      { placementId: "b", prerequisitePlacementIds: ["c"] },
      { placementId: "c", prerequisitePlacementIds: ["a"] },
    ];
    expect(findCircularPrerequisite(edges)).not.toBeNull();
  });

  it("a self-referential prerequisite is a cycle", () => {
    const edges = [{ placementId: "a", prerequisitePlacementIds: ["a"] }];
    expect(findCircularPrerequisite(edges)).not.toBeNull();
  });
});
