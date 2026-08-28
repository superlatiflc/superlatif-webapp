import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabaseHandle } from "../test-client.ts";
import { accessPolicies } from "../schema/index.ts";
import {
  PolicyChecksumMismatchError,
  PolicyValidationError,
  assertValidPolicyConfig,
  createPolicyDraft,
  findPolicyByCodeVersion,
  publishPolicyVersion,
} from "./policy-repository.ts";

const NOW = new Date("2026-06-01T00:00:00.000Z");

function validConfig(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    schemaVersion: 2,
    code: "SKD_TRACK_STANDARD",
    version: 1,
    title: "SKD Track - Standard",
    validity: { mode: "lifetime", timezone: "Asia/Jakarta" },
    claims: [
      {
        targetType: "program_track",
        targetRef: { code: "track:skd" },
        actions: ["view", "consume"],
        includeDescendants: true,
      },
    ],
    attemptAllowance: {
      mode: "inherit_batch",
      maxRankedAttempts: null,
      maxPracticeAttempts: 0,
      rankingRuleSource: "batch",
    },
    postExpiry: { mode: "read_only_history" },
    stacking: {
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
    ...overrides,
  };
}

let handle: TestDatabaseHandle;

beforeEach(async () => {
  handle = await createTestDatabase();
});

afterEach(async () => {
  await handle.close();
});

describe("assertValidPolicyConfig - validated against the reviewed Gate 3 schema, not just JSONB shape", () => {
  it("accepts a well-formed config", () => {
    expect(() => assertValidPolicyConfig(validConfig())).not.toThrow();
  });

  it("rejects a config missing a required top-level field", () => {
    const { claims: _dropped, ...withoutClaims } = validConfig();
    expect(() => assertValidPolicyConfig(withoutClaims)).toThrow(PolicyValidationError);
  });

  it("rejects an unknown validity mode", () => {
    expect(() =>
      assertValidPolicyConfig(validConfig({ validity: { mode: "whenever_we_feel_like_it" } })),
    ).toThrow(PolicyValidationError);
  });

  it("rejects a fixed_window validity missing startsAt/endsAt", () => {
    expect(() =>
      assertValidPolicyConfig(validConfig({ validity: { mode: "fixed_window", timezone: "Asia/Jakarta" } })),
    ).toThrow(PolicyValidationError);
  });

  it("rejects maxPracticeAttempts other than 0 (practice attempts not available at MVP)", () => {
    expect(() =>
      assertValidPolicyConfig(
        validConfig({
          attemptAllowance: {
            mode: "inherit_batch",
            maxRankedAttempts: null,
            maxPracticeAttempts: 5,
            rankingRuleSource: "batch",
          },
        }),
      ),
    ).toThrow(PolicyValidationError);
  });
});

describe("policy publication is versioned (ENT-001 acceptance)", () => {
  it("creates a draft policy with a stamped checksum", async () => {
    const policy = await createPolicyDraft(handle.db, {
      code: "SKD_TRACK_STANDARD",
      version: 1,
      title: "v1",
      config: validConfig(),
    });
    expect(policy.status).toBe("draft");
    expect(policy.checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses to create a draft from an invalid config - a bad policy never reaches the database", async () => {
    const { claims: _dropped, ...withoutClaims } = validConfig();
    await expect(
      createPolicyDraft(handle.db, { code: "BAD", version: 1, title: "bad", config: withoutClaims }),
    ).rejects.toThrow(PolicyValidationError);
  });

  it("rejects a second draft with the same (code, version) - the unique index, not just application logic", async () => {
    await createPolicyDraft(handle.db, {
      code: "SKD_TRACK_STANDARD",
      version: 1,
      title: "v1",
      config: validConfig(),
    });
    await expect(
      createPolicyDraft(handle.db, {
        code: "SKD_TRACK_STANDARD",
        version: 1,
        title: "v1 again",
        config: validConfig(),
      }),
    ).rejects.toThrow();
  });

  it("publishing advances status without touching config or checksum", async () => {
    const policy = await createPolicyDraft(handle.db, {
      code: "SKD_TRACK_STANDARD",
      version: 1,
      title: "v1",
      config: validConfig(),
    });
    await publishPolicyVersion(handle.db, policy.id, NOW);
    const [row] = await handle.db
      .select()
      .from(accessPolicies)
      .where(eq(accessPolicies.id, policy.id))
      .limit(1);
    expect(row?.status).toBe("published");
    expect(row?.checksum).toBe(policy.checksum);
    expect(row?.lockedAt?.toISOString()).toBe(NOW.toISOString());
  });

  it("a new version requires a new row - the old version's config is never edited in place", async () => {
    const v1 = await createPolicyDraft(handle.db, {
      code: "SKD_TRACK_STANDARD",
      version: 1,
      title: "v1",
      config: validConfig(),
    });
    const v2 = await createPolicyDraft(handle.db, {
      code: "SKD_TRACK_STANDARD",
      version: 2,
      title: "v2",
      config: validConfig({ title: "SKD Track - Standard (revised)" }),
    });
    expect(v2.id).not.toBe(v1.id);

    const stillV1 = await findPolicyByCodeVersion(handle.db, "SKD_TRACK_STANDARD", 1);
    expect(stillV1?.config["title"]).toBe("SKD Track - Standard");
  });

  it("publishPolicyVersion refuses to publish a policy whose stored checksum no longer matches its config", async () => {
    const policy = await createPolicyDraft(handle.db, {
      code: "SKD_TRACK_STANDARD",
      version: 1,
      title: "v1",
      config: validConfig(),
    });
    // Simulate out-of-band tampering directly at the storage layer - the one
    // way this repository never allows in its own public API.
    await handle.db
      .update(accessPolicies)
      .set({ config: validConfig({ title: "tampered" }) })
      .where(eq(accessPolicies.id, policy.id));
    await expect(publishPolicyVersion(handle.db, policy.id, NOW)).rejects.toThrow(
      PolicyChecksumMismatchError,
    );
  });
});
