import { describe, expect, it } from "vitest";
import { createInMemoryEffectiveAccessCache, effectiveAccessCacheKey } from "./effective-access-cache.ts";
import type { EffectiveAccessDecision } from "./effective-access.ts";

const NOW = new Date("2026-08-29T00:00:00.000Z");

function decision(overrides: Partial<EffectiveAccessDecision> = {}): EffectiveAccessDecision {
  return {
    allowed: true,
    targetType: "program_track",
    targetRef: "track:skd",
    action: "view",
    decisiveGrantIds: ["g-1"],
    ignoredGrantIds: [],
    reasonCode: "ACTIVE_GRANT",
    effectiveFrom: null,
    effectiveTo: null,
    studentReason: "Aktif - lanjutkan belajar",
    diagnostic: [{ grantId: "g-1", status: "active" }],
    ...overrides,
  };
}

describe("createInMemoryEffectiveAccessCache", () => {
  it("is a plain in-process store - miss on an empty cache", () => {
    const cache = createInMemoryEffectiveAccessCache();
    expect(cache.get("user-1", "key", NOW)).toBeUndefined();
  });

  it("returns what was set, scoped per user", () => {
    const cache = createInMemoryEffectiveAccessCache();
    const value = decision();
    cache.set("user-1", "key", value, NOW);
    expect(cache.get("user-1", "key", NOW)).toEqual(value);
    expect(cache.get("user-2", "key", NOW)).toBeUndefined();
  });

  it("invalidateUser clears only that user's entries - cache invalidation follows grant mutations", () => {
    const cache = createInMemoryEffectiveAccessCache();
    cache.set("user-1", "key-a", decision(), NOW);
    cache.set("user-2", "key-a", decision(), NOW);
    cache.invalidateUser("user-1");
    expect(cache.get("user-1", "key-a", NOW)).toBeUndefined();
    expect(cache.get("user-2", "key-a", NOW)).toEqual(decision());
  });

  it("with no ttlMs configured, an entry never expires on its own - only invalidateUser removes it", () => {
    const cache = createInMemoryEffectiveAccessCache();
    cache.set("user-1", "key", decision(), NOW);
    const muchLater = new Date(NOW.getTime() + 365 * 86_400_000);
    expect(cache.get("user-1", "key", muchLater)).toEqual(decision());
  });

  it("with a ttlMs configured, an entry expires once `now` passes its deadline - driven entirely by the injected clock, never Date.now()", () => {
    const cache = createInMemoryEffectiveAccessCache({ ttlMs: 60_000 });
    cache.set("user-1", "key", decision(), NOW);
    expect(cache.get("user-1", "key", new Date(NOW.getTime() + 59_000))).toEqual(decision());
    expect(cache.get("user-1", "key", new Date(NOW.getTime() + 60_000))).toBeUndefined();
  });
});

describe("effectiveAccessCacheKey", () => {
  it("is stable for the same query and distinct across target/action", () => {
    const a = effectiveAccessCacheKey({
      targetType: "program_track",
      targetRef: "track:skd",
      action: "view",
    });
    const b = effectiveAccessCacheKey({
      targetType: "program_track",
      targetRef: "track:skd",
      action: "view",
    });
    const c = effectiveAccessCacheKey({
      targetType: "program_track",
      targetRef: "track:skd",
      action: "download",
    });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});
