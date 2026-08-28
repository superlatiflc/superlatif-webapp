import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createInMemoryEffectiveAccessCache, type EffectiveAccessCache } from "@superlatif/domain/access";
import { createUser } from "../identity/repository.ts";
import { createTestDatabase, type TestDatabaseHandle } from "../test-client.ts";
import { createPolicyDraft, publishPolicyVersion } from "./policy-repository.ts";
import { issueGrant, recordGrantEvent } from "./grant-repository.ts";
import {
  getAttemptAllowance,
  getEffectiveAccess,
  issueGrantAndInvalidate,
  recordGrantEventAndInvalidate,
} from "./effective-access-service.ts";

const NOW = new Date("2026-08-29T00:00:00.000Z");

function policyConfig(overrides: {
  code: string;
  targetType?: string;
  targetRef?: string;
  actions?: string[];
  attemptAllowance?: Record<string, unknown>;
  stacking?: Record<string, unknown>;
}) {
  return {
    schemaVersion: 2,
    code: overrides.code,
    version: 1,
    title: overrides.code,
    validity: { mode: "lifetime", timezone: "Asia/Jakarta" },
    claims: [
      {
        targetType: overrides.targetType ?? "program_track",
        targetRef: { code: overrides.targetRef ?? "track:skd" },
        actions: overrides.actions ?? ["view"],
        includeDescendants: false,
      },
    ],
    attemptAllowance: overrides.attemptAllowance ?? {
      mode: "inherit_batch",
      maxRankedAttempts: null,
      maxPracticeAttempts: 0,
      rankingRuleSource: "batch",
    },
    postExpiry: { mode: "read_only_history" },
    stacking: overrides.stacking ?? {
      mode: "additive",
      expiryResolution: "latest_supporting_grant",
      attemptResolution: "batch_policy_only",
    },
    lifecycle: {
      refundAction: "revoke_source_grant",
      expiryAction: "expire_source_grant",
      manualChangeRequiresReason: true,
      retainAttemptHistory: true,
      retainResultHistory: true,
      retainRankingSnapshot: true,
    },
  };
}

let handle: TestDatabaseHandle;
let userId: string;
let cache: EffectiveAccessCache;

async function publishedPolicy(code: string, overrides: Parameters<typeof policyConfig>[0] = { code }) {
  const policy = await createPolicyDraft(handle.db, {
    code,
    version: 1,
    title: code,
    config: policyConfig({ ...overrides, code }),
  });
  await publishPolicyVersion(handle.db, policy.id, NOW);
  return policy;
}

beforeEach(async () => {
  handle = await createTestDatabase();
  const user = await createUser(handle.db, { emailNormalized: "student@example.id", phoneE164: null });
  userId = user.userId;
  cache = createInMemoryEffectiveAccessCache();
});

afterEach(async () => {
  await handle.close();
});

describe("getEffectiveAccess - required negative tests: revoked, expired, suspended, cancelled are rejected with a clear explanation trace", () => {
  it("revoked purchase grant denies while an overlapping active scholarship still allows (ENT-SYN-002, resolved via real DB rows)", async () => {
    const policy = await publishedPolicy("SKD_SHARED");
    const purchase = await issueGrant(handle.db, {
      userId,
      sourceType: "purchase",
      sourceId: "order-1",
      sourceKey: "order-1",
      accessPolicyId: policy.id,
      validFrom: new Date("2026-08-01T00:00:00.000Z"),
      validTo: new Date("2026-12-31T23:59:59.000Z"),
    });
    await issueGrant(handle.db, {
      userId,
      sourceType: "scholarship",
      sourceId: "sch-1",
      sourceKey: "sch-1",
      accessPolicyId: policy.id,
      validFrom: new Date("2026-08-01T00:00:00.000Z"),
      validTo: new Date("2027-01-31T23:59:59.000Z"),
    });
    await recordGrantEvent(handle.db, {
      grantId: purchase.id,
      eventType: "revoked",
      occurredAt: NOW,
      reason: "refunded",
      actor: { sourceType: "purchase", sourceId: "order-1" },
    });

    const decision = await getEffectiveAccess(
      handle.db,
      cache,
      userId,
      { targetType: "program_track", targetRef: "track:skd", action: "view" },
      NOW,
    );
    expect(decision.allowed).toBe(true);
    expect(decision.reasonCode).toBe("OVERLAPPING_ACTIVE_GRANT");
    expect(decision.ignoredGrantIds).toEqual([purchase.id]);
  });

  it("expired grant denies at the exact boundary (ENT-SYN-003, resolved via real DB rows)", async () => {
    const policy = await publishedPolicy("EXPIRED_TEST");
    const grant = await issueGrant(handle.db, {
      userId,
      sourceType: "purchase",
      sourceId: "order-2",
      sourceKey: "order-2",
      accessPolicyId: policy.id,
      validFrom: new Date("2026-08-01T00:00:00.000Z"),
      validTo: NOW,
    });

    const decision = await getEffectiveAccess(
      handle.db,
      cache,
      userId,
      { targetType: "program_track", targetRef: "track:skd", action: "view" },
      NOW,
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe("NO_ACTIVE_GRANT");
    expect(decision.ignoredGrantIds).toEqual([grant.id]);
    expect(decision.diagnostic).toEqual([{ grantId: grant.id, status: "expired" }]);
  });

  it("suspended grant denies with a clear explanation trace", async () => {
    const policy = await publishedPolicy("SUSPEND_TEST");
    const grant = await issueGrant(handle.db, {
      userId,
      sourceType: "purchase",
      sourceId: "order-3",
      sourceKey: "order-3",
      accessPolicyId: policy.id,
      validFrom: new Date("2026-08-01T00:00:00.000Z"),
      validTo: null,
    });
    await recordGrantEvent(handle.db, {
      grantId: grant.id,
      eventType: "suspended",
      occurredAt: NOW,
      reason: "payment dispute under review",
      actor: { sourceType: "purchase", sourceId: "order-3" },
    });

    const decision = await getEffectiveAccess(
      handle.db,
      cache,
      userId,
      { targetType: "program_track", targetRef: "track:skd", action: "view" },
      NOW,
    );
    expect(decision.allowed).toBe(false);
    expect(decision.diagnostic).toEqual([{ grantId: grant.id, status: "suspended" }]);
  });

  it("cancelled grant denies with a clear explanation trace", async () => {
    const policy = await publishedPolicy("CANCEL_TEST");
    const grant = await issueGrant(handle.db, {
      userId,
      sourceType: "purchase",
      sourceId: "order-4",
      sourceKey: "order-4",
      accessPolicyId: policy.id,
      validFrom: new Date("2026-08-01T00:00:00.000Z"),
      validTo: null,
    });
    await recordGrantEvent(handle.db, {
      grantId: grant.id,
      eventType: "cancelled",
      occurredAt: NOW,
      reason: "order cancelled before payment settled",
      actor: { sourceType: "purchase", sourceId: "order-4" },
    });

    const decision = await getEffectiveAccess(
      handle.db,
      cache,
      userId,
      { targetType: "program_track", targetRef: "track:skd", action: "view" },
      NOW,
    );
    expect(decision.allowed).toBe(false);
    expect(decision.diagnostic).toEqual([{ grantId: grant.id, status: "cancelled" }]);
  });
});

describe("getEffectiveAccess - duplicate target from several grants does not appear twice", () => {
  it("a bundle-shaped grant and a specialist-shaped grant sharing the same policy target collapse into ONE decision with both decisive grant IDs", async () => {
    const policy = await publishedPolicy("SHARED_TARGET");
    const bundleGrant = await issueGrant(handle.db, {
      userId,
      sourceType: "purchase",
      sourceId: "order-bundle",
      sourceKey: "order-bundle",
      accessPolicyId: policy.id,
      validFrom: new Date("2026-08-01T00:00:00.000Z"),
      validTo: new Date("2026-12-31T00:00:00.000Z"),
    });
    const specialistGrant = await issueGrant(handle.db, {
      userId,
      sourceType: "purchase",
      sourceId: "order-specialist",
      sourceKey: "order-specialist",
      accessPolicyId: policy.id,
      validFrom: new Date("2026-08-01T00:00:00.000Z"),
      validTo: new Date("2026-10-01T00:00:00.000Z"),
    });

    const decision = await getEffectiveAccess(
      handle.db,
      cache,
      userId,
      { targetType: "program_track", targetRef: "track:skd", action: "view" },
      NOW,
    );
    expect(decision.allowed).toBe(true);
    expect([...decision.decisiveGrantIds].sort()).toEqual([bundleGrant.id, specialistGrant.id].sort());
    // latest_supporting_grant: the union lasts until the LATER of the two.
    expect(decision.effectiveTo?.toISOString()).toBe(new Date("2026-12-31T00:00:00.000Z").toISOString());
  });
});

describe("cache invalidation follows grant mutations", () => {
  it("a cache hit is returned without a fresh DB read until issueGrantAndInvalidate mutates state", async () => {
    const query = { targetType: "program_track", targetRef: "track:skd", action: "view" } as const;
    const first = await getEffectiveAccess(handle.db, cache, userId, query, NOW);
    expect(first.reasonCode).toBe("NOT_CLAIMED");

    // A grant is issued directly (bypassing the invalidating wrapper) -
    // the cache must still return the STALE decision, proving invalidation
    // is not implicit or automatic.
    const policy = await publishedPolicy("CACHE_TEST");
    await issueGrant(handle.db, {
      userId,
      sourceType: "purchase",
      sourceId: "order-cache",
      sourceKey: "order-cache",
      accessPolicyId: policy.id,
      validFrom: new Date("2026-08-01T00:00:00.000Z"),
      validTo: null,
    });
    const stillCached = await getEffectiveAccess(handle.db, cache, userId, query, NOW);
    expect(stillCached.reasonCode).toBe("NOT_CLAIMED");

    cache.invalidateUser(userId);
    const afterManualInvalidate = await getEffectiveAccess(handle.db, cache, userId, query, NOW);
    expect(afterManualInvalidate.allowed).toBe(true);
  });

  it("issueGrantAndInvalidate makes the new grant visible on the very next call, with no manual invalidation needed", async () => {
    const query = { targetType: "program_track", targetRef: "track:skd", action: "view" } as const;
    const before = await getEffectiveAccess(handle.db, cache, userId, query, NOW);
    expect(before.reasonCode).toBe("NOT_CLAIMED");

    const policy = await publishedPolicy("AUTO_INVALIDATE");
    const grant = await issueGrantAndInvalidate(handle.db, cache, {
      userId,
      sourceType: "purchase",
      sourceId: "order-auto",
      sourceKey: "order-auto",
      accessPolicyId: policy.id,
      validFrom: new Date("2026-08-01T00:00:00.000Z"),
      validTo: null,
    });

    const after = await getEffectiveAccess(handle.db, cache, userId, query, NOW);
    expect(after.allowed).toBe(true);
    expect(after.decisiveGrantIds).toEqual([grant.id]);
  });

  it("recordGrantEventAndInvalidate makes a revocation visible on the very next call", async () => {
    const query = { targetType: "program_track", targetRef: "track:skd", action: "view" } as const;
    const policy = await publishedPolicy("REVOKE_INVALIDATE");
    const grant = await issueGrantAndInvalidate(handle.db, cache, {
      userId,
      sourceType: "purchase",
      sourceId: "order-revoke",
      sourceKey: "order-revoke",
      accessPolicyId: policy.id,
      validFrom: new Date("2026-08-01T00:00:00.000Z"),
      validTo: null,
    });
    const beforeRevoke = await getEffectiveAccess(handle.db, cache, userId, query, NOW);
    expect(beforeRevoke.allowed).toBe(true);

    await recordGrantEventAndInvalidate(handle.db, cache, userId, {
      grantId: grant.id,
      eventType: "revoked",
      occurredAt: NOW,
      reason: "refund processed",
      actor: { sourceType: "purchase", sourceId: "order-revoke" },
    });

    const afterRevoke = await getEffectiveAccess(handle.db, cache, userId, query, NOW);
    expect(afterRevoke.allowed).toBe(false);
    expect(afterRevoke.ignoredGrantIds).toEqual([grant.id]);
  });
});

describe("getAttemptAllowance - separate from content visibility (ENT-005)", () => {
  it("resolves independently of getEffectiveAccess - ownedByBatch:true at MVP default when no grant overrides it", async () => {
    const policy = await publishedPolicy("ATTEMPT_DEFAULT", {
      code: "ATTEMPT_DEFAULT",
      targetType: "exam_batch",
      targetRef: "batch:skd-01",
      actions: ["start_attempt"],
    });
    await issueGrant(handle.db, {
      userId,
      sourceType: "purchase",
      sourceId: "order-attempt",
      sourceKey: "order-attempt",
      accessPolicyId: policy.id,
      validFrom: new Date("2026-08-01T00:00:00.000Z"),
      validTo: null,
    });

    const query = { targetType: "exam_batch", targetRef: "batch:skd-01", action: "start_attempt" } as const;
    const access = await getEffectiveAccess(handle.db, cache, userId, query, NOW);
    const allowance = await getAttemptAllowance(handle.db, userId, query, NOW);

    expect(access.allowed).toBe(true);
    expect(allowance.ownedByBatch).toBe(true);
    expect(allowance.maxRankedAttempts).toBeNull();
  });

  it("sums per_batch allowances across distinct decisive sources when attemptResolution=sum_distinct_sources", async () => {
    const policy = await publishedPolicy("ATTEMPT_SUM", {
      code: "ATTEMPT_SUM",
      targetType: "exam_batch",
      targetRef: "batch:skd-02",
      actions: ["start_attempt"],
      attemptAllowance: {
        mode: "per_batch",
        maxRankedAttempts: 1,
        maxPracticeAttempts: 0,
        rankingRuleSource: "batch",
      },
      stacking: {
        mode: "additive",
        expiryResolution: "latest_supporting_grant",
        attemptResolution: "sum_distinct_sources",
      },
    });
    await issueGrant(handle.db, {
      userId,
      sourceType: "purchase",
      sourceId: "order-sum-1",
      sourceKey: "order-sum-1",
      accessPolicyId: policy.id,
      validFrom: new Date("2026-08-01T00:00:00.000Z"),
      validTo: null,
    });
    await issueGrant(handle.db, {
      userId,
      sourceType: "scholarship",
      sourceId: "sch-sum-1",
      sourceKey: "sch-sum-1",
      accessPolicyId: policy.id,
      validFrom: new Date("2026-08-01T00:00:00.000Z"),
      validTo: null,
    });

    const allowance = await getAttemptAllowance(
      handle.db,
      userId,
      { targetType: "exam_batch", targetRef: "batch:skd-02", action: "start_attempt" },
      NOW,
    );
    expect(allowance.ownedByBatch).toBe(false);
    expect(allowance.maxRankedAttempts).toBe(2);
  });
});
