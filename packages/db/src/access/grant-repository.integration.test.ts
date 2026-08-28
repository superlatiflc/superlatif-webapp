import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deriveGrantStatus, distinctTargets, type GrantFacts } from "@superlatif/domain/access";
import { createTestDatabase, type TestDatabaseHandle } from "../test-client.ts";
import { createUser } from "../identity/repository.ts";
import { createPolicyDraft } from "./policy-repository.ts";
import {
  GrantEventReasonRequiredError,
  GrantOwnershipMismatchError,
  issueGrant,
  listGrantEvents,
  listGrantsForUser,
  recordGrantEvent,
} from "./grant-repository.ts";

const NOW = new Date("2026-06-01T00:00:00.000Z");

function lifetimeConfig(code: string): Record<string, unknown> {
  return {
    schemaVersion: 2,
    code,
    version: 1,
    title: code,
    validity: { mode: "lifetime", timezone: "Asia/Jakarta" },
    claims: [
      {
        targetType: "program_track",
        targetRef: { code: "track:skd" },
        actions: ["view"],
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
  };
}

let handle: TestDatabaseHandle;
let userId: string;
let policyId: string;

beforeEach(async () => {
  handle = await createTestDatabase();
  const user = await createUser(handle.db, { emailNormalized: "student@example.com", phoneE164: null });
  userId = user.userId;
  const policy = await createPolicyDraft(handle.db, {
    code: "SKD_TRACK_STANDARD",
    version: 1,
    title: "SKD Track",
    config: lifetimeConfig("SKD_TRACK_STANDARD"),
  });
  policyId = policy.id;
});

afterEach(async () => {
  await handle.close();
});

describe("grant immutability (ENT-001 acceptance: grant source/subject/resource/interval/policy version are immutable)", () => {
  it("issuing a grant records the exact facts supplied, and they never change afterward", async () => {
    const grant = await issueGrant(handle.db, {
      userId,
      sourceType: "purchase",
      sourceId: "order-1",
      sourceKey: "order-1",
      accessPolicyId: policyId,
      validFrom: NOW,
      validTo: null,
    });
    expect(grant.userId).toBe(userId);
    expect(grant.sourceType).toBe("purchase");
    expect(grant.sourceId).toBe("order-1");
    expect(grant.accessPolicyId).toBe(policyId);

    // The public repository API has no "update grant" function at all -
    // this is a structural guarantee, not a convention. Refetching the same
    // grant later must return byte-identical core facts.
    const [refetched] = await listGrantsForUser(handle.db, userId);
    expect(refetched).toEqual(grant);
  });

  it("changes are recorded as new grant_events rows, never as an update to the grant itself", async () => {
    const grant = await issueGrant(handle.db, {
      userId,
      sourceType: "manual",
      sourceId: "manual-1",
      sourceKey: "manual-1",
      accessPolicyId: policyId,
      validFrom: NOW,
      validTo: null,
    });
    await recordGrantEvent(handle.db, {
      grantId: grant.id,
      eventType: "suspended",
      occurredAt: NOW,
      reason: "policy review",
    });

    const [stillTheSameGrant] = await listGrantsForUser(handle.db, userId);
    expect(stillTheSameGrant).toEqual(grant); // the grant row itself did not change
    const events = await listGrantEvents(handle.db, grant.id);
    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe("suspended");
  });
});

describe("source coexistence (ENT-001 acceptance: manual, scholarship, purchase, and migration sources coexist)", () => {
  it.each([
    "purchase",
    "bundle_component",
    "upgrade",
    "scholarship",
    "promotion_bonus",
    "manual_support",
    "migration",
    "ecosystem_free",
  ])("issues a grant with sourceType=%s", async (sourceType) => {
    const grant = await issueGrant(handle.db, {
      userId,
      sourceType,
      sourceId: `${sourceType}-1`,
      sourceKey: `${sourceType}-1`,
      accessPolicyId: policyId,
      validFrom: NOW,
      validTo: null,
    });
    expect(grant.sourceType).toBe(sourceType);
  });

  it("a single subject can hold grants from every source at once", async () => {
    for (const sourceType of ["purchase", "scholarship", "manual_support", "migration"]) {
      await issueGrant(handle.db, {
        userId,
        sourceType,
        sourceId: `${sourceType}-x`,
        sourceKey: `${sourceType}-x`,
        accessPolicyId: policyId,
        validFrom: NOW,
        validTo: null,
      });
    }
    const grants = await listGrantsForUser(handle.db, userId);
    expect(grants.map((g) => g.sourceType).sort()).toEqual([
      "manual_support",
      "migration",
      "purchase",
      "scholarship",
    ]);
  });
});

describe("idempotent issuance - replaying the same source event never creates a duplicate grant (dok 16 invariant 7)", () => {
  it("issuing the same (userId, sourceType, sourceKey) twice returns the SAME row", async () => {
    const input = {
      userId,
      sourceType: "purchase",
      sourceId: "order-2",
      sourceKey: "order-2",
      accessPolicyId: policyId,
      validFrom: NOW,
      validTo: null,
    };
    const first = await issueGrant(handle.db, input);
    const second = await issueGrant(handle.db, input);
    expect(second.id).toBe(first.id);

    const grants = await listGrantsForUser(handle.db, userId);
    expect(grants).toHaveLength(1);
  });

  it("a DIFFERENT sourceKey for the same sourceType creates a genuinely separate grant", async () => {
    await issueGrant(handle.db, {
      userId,
      sourceType: "purchase",
      sourceId: "order-3a",
      sourceKey: "order-3a",
      accessPolicyId: policyId,
      validFrom: NOW,
      validTo: null,
    });
    await issueGrant(handle.db, {
      userId,
      sourceType: "purchase",
      sourceId: "order-3b",
      sourceKey: "order-3b",
      accessPolicyId: policyId,
      validFrom: NOW,
      validTo: null,
    });
    const grants = await listGrantsForUser(handle.db, userId);
    expect(grants).toHaveLength(2);
  });
});

describe("manual mutation requires a reason (dok 05 §10 E8)", () => {
  it("rejects a suspended event with no reason", async () => {
    const grant = await issueGrant(handle.db, {
      userId,
      sourceType: "manual",
      sourceId: "m-1",
      sourceKey: "m-1",
      accessPolicyId: policyId,
      validFrom: NOW,
      validTo: null,
    });
    await expect(
      recordGrantEvent(handle.db, { grantId: grant.id, eventType: "suspended", occurredAt: NOW }),
    ).rejects.toThrow(GrantEventReasonRequiredError);
  });

  it("rejects a revoked event with no reason", async () => {
    const grant = await issueGrant(handle.db, {
      userId,
      sourceType: "manual",
      sourceId: "m-2",
      sourceKey: "m-2",
      accessPolicyId: policyId,
      validFrom: NOW,
      validTo: null,
    });
    await expect(
      recordGrantEvent(handle.db, { grantId: grant.id, eventType: "revoked", occurredAt: NOW }),
    ).rejects.toThrow(GrantEventReasonRequiredError);
  });

  it("accepts a revoked event once a reason is supplied", async () => {
    const grant = await issueGrant(handle.db, {
      userId,
      sourceType: "manual",
      sourceId: "m-3",
      sourceKey: "m-3",
      accessPolicyId: policyId,
      validFrom: NOW,
      validTo: null,
    });
    await expect(
      recordGrantEvent(handle.db, {
        grantId: grant.id,
        eventType: "revoked",
        occurredAt: NOW,
        reason: "duplicate account",
      }),
    ).resolves.not.toThrow();
  });
});

describe("revocation is scoped to the owning source (matches ENT-SYN-004: SOURCE_OWNERSHIP_MISMATCH)", () => {
  it("rejects a revoke attempt from an actor that does not own the grant", async () => {
    const grant = await issueGrant(handle.db, {
      userId,
      sourceType: "manual",
      sourceId: "manual-case-4",
      sourceKey: "manual-case-4",
      accessPolicyId: policyId,
      validFrom: NOW,
      validTo: null,
    });
    await expect(
      recordGrantEvent(handle.db, {
        grantId: grant.id,
        eventType: "revoked",
        occurredAt: NOW,
        reason: "attempted refund",
        actor: { sourceType: "purchase", sourceId: "order-4" },
      }),
    ).rejects.toThrow(GrantOwnershipMismatchError);

    // The grant remains completely unaffected by the rejected attempt.
    const events = await listGrantEvents(handle.db, grant.id);
    expect(events).toHaveLength(0);
  });

  it("accepts a revoke attempt from the actual owning source", async () => {
    const grant = await issueGrant(handle.db, {
      userId,
      sourceType: "purchase",
      sourceId: "order-5",
      sourceKey: "order-5",
      accessPolicyId: policyId,
      validFrom: NOW,
      validTo: null,
    });
    await recordGrantEvent(handle.db, {
      grantId: grant.id,
      eventType: "revoked",
      occurredAt: NOW,
      reason: "refunded",
      actor: { sourceType: "purchase", sourceId: "order-5" },
    });
    const events = await listGrantEvents(handle.db, grant.id);
    expect(events).toHaveLength(1);
  });
});

/** Composes a GrantRow + its events into the pure domain's derived status - what a resolver (ENT-002) will eventually do at scale. */
async function statusOf(grant: { validFrom: Date | null; validTo: Date | null; id: string }, now: Date) {
  const events = await listGrantEvents(handle.db, grant.id);
  const facts: GrantFacts = {
    validityConfig: { mode: "lifetime" },
    issuedAt: NOW,
    validFrom: grant.validFrom,
    validTo: grant.validTo,
  };
  return deriveGrantStatus(
    facts,
    events.map((event) => ({ eventType: event.eventType, occurredAt: event.occurredAt })),
    now,
  );
}

describe("revoked access is denied (required negative test)", () => {
  it("a revoked grant's derived status is 'revoked', regardless of its time window", async () => {
    const grant = await issueGrant(handle.db, {
      userId,
      sourceType: "purchase",
      sourceId: "order-6",
      sourceKey: "order-6",
      accessPolicyId: policyId,
      validFrom: NOW,
      validTo: null,
    });
    await recordGrantEvent(handle.db, {
      grantId: grant.id,
      eventType: "revoked",
      occurredAt: NOW,
      reason: "refunded",
      actor: { sourceType: "purchase", sourceId: "order-6" },
    });
    expect((await statusOf(grant, NOW)).status).toBe("revoked");
  });
});

describe("expired access is denied at the exact boundary (required negative test, matches ENT-SYN-003)", () => {
  it("is expired exactly AT validTo", async () => {
    const validTo = new Date("2026-08-28T12:00:00.000Z");
    const grant = await issueGrant(handle.db, {
      userId,
      sourceType: "purchase",
      sourceId: "order-7",
      sourceKey: "order-7",
      accessPolicyId: policyId,
      validFrom: new Date("2026-08-01T00:00:00.000Z"),
      validTo,
    });
    expect((await statusOf(grant, validTo)).status).toBe("expired");
  });

  it("is still active one millisecond before the boundary", async () => {
    const validTo = new Date("2026-08-28T12:00:00.000Z");
    const grant = await issueGrant(handle.db, {
      userId,
      sourceType: "purchase",
      sourceId: "order-8",
      sourceKey: "order-8",
      accessPolicyId: policyId,
      validFrom: new Date("2026-08-01T00:00:00.000Z"),
      validTo,
    });
    expect((await statusOf(grant, new Date(validTo.getTime() - 1))).status).toBe("active");
  });
});

describe("overlapping grants are independent (required negative test, matches ENT-SYN-002)", () => {
  it("revoking one source's grant leaves an overlapping grant from a different source completely unaffected", async () => {
    // Evaluated at a point INSIDE both grants' windows (2026-08-01 onward) -
    // an earlier version of this test evaluated at the module-level NOW
    // (2026-06-01), which predates both grants' own validFrom and made the
    // "unaffected" grant read as "scheduled" rather than "active": a real
    // test-authoring bug, not a deriveGrantStatus defect (scheduled was the
    // objectively correct answer for a query before the window even opens).
    const evaluationInstant = new Date("2026-09-01T00:00:00.000Z");

    const purchaseGrant = await issueGrant(handle.db, {
      userId,
      sourceType: "purchase",
      sourceId: "order-9",
      sourceKey: "order-9",
      accessPolicyId: policyId,
      validFrom: new Date("2026-08-01T00:00:00.000Z"),
      validTo: new Date("2026-12-31T23:59:59.000Z"),
    });
    const scholarshipGrant = await issueGrant(handle.db, {
      userId,
      sourceType: "scholarship",
      sourceId: "scholarship-7",
      sourceKey: "scholarship-7",
      accessPolicyId: policyId,
      validFrom: new Date("2026-08-01T00:00:00.000Z"),
      validTo: new Date("2027-01-31T23:59:59.000Z"),
    });

    await recordGrantEvent(handle.db, {
      grantId: purchaseGrant.id,
      eventType: "revoked",
      occurredAt: evaluationInstant,
      reason: "refunded",
      actor: { sourceType: "purchase", sourceId: "order-9" },
    });

    expect((await statusOf(purchaseGrant, evaluationInstant)).status).toBe("revoked");
    expect((await statusOf(scholarshipGrant, evaluationInstant)).status).toBe("active");
  });

  it("two active overlapping grants for the same subject coexist as separate rows - support can see every source (dok 05 §10 E2)", async () => {
    await issueGrant(handle.db, {
      userId,
      sourceType: "purchase",
      sourceId: "order-10",
      sourceKey: "order-10",
      accessPolicyId: policyId,
      validFrom: NOW,
      validTo: null,
    });
    await issueGrant(handle.db, {
      userId,
      sourceType: "promotion_bonus",
      sourceId: "campaign-10",
      sourceKey: "campaign-10",
      accessPolicyId: policyId,
      validFrom: NOW,
      validTo: null,
    });
    const grants = await listGrantsForUser(handle.db, userId);
    expect(grants).toHaveLength(2);
  });
});

describe("duplicate content does not appear twice (required negative test, dok 05 §10 E2/E3A)", () => {
  it("two overlapping grants covering the same policy claim collapse to one visible target via distinctTargets", async () => {
    const purchaseGrant = await issueGrant(handle.db, {
      userId,
      sourceType: "purchase",
      sourceId: "order-11",
      sourceKey: "order-11",
      accessPolicyId: policyId,
      validFrom: NOW,
      validTo: null,
    });
    const bonusGrant = await issueGrant(handle.db, {
      userId,
      sourceType: "promotion_bonus",
      sourceId: "campaign-11",
      sourceKey: "campaign-11",
      accessPolicyId: policyId,
      validFrom: NOW,
      validTo: null,
    });

    // Both grants reference the SAME policy, whose one claim targets
    // track:skd/view - the exact E3A dedupeKey fields (source, target,
    // action, policyVersion), source varying per grant.
    const claims = [purchaseGrant, bonusGrant].map((grant) => ({
      source: `${grant.sourceType}:${grant.sourceId}`,
      target: "track:skd",
      action: "view",
      policyVersion: 1,
    }));

    const targets = distinctTargets(claims);
    expect(targets).toHaveLength(1);
    expect(targets[0]?.sources).toEqual(["purchase:order-11", "promotion_bonus:campaign-11"]);
  });
});
