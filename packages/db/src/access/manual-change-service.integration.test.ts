import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createInMemoryEffectiveAccessCache, type EffectiveAccessCache } from "@superlatif/domain/access";
import { createUser } from "../identity/repository.ts";
import { assignRole, seedCanonicalRoles } from "../authorization/index.ts";
import { createTestDatabase, type TestDatabaseHandle } from "../test-client.ts";
import { accessChangeRequests, accessGrants } from "../schema/index.ts";
import { createPolicyDraft, publishPolicyVersion } from "./policy-repository.ts";
import { issueGrant } from "./grant-repository.ts";
import { getEffectiveAccess } from "./effective-access-service.ts";
import {
  ManualChangeAlreadyDecidedError,
  ManualChangeNotAuthorizedError,
  ManualChangeRequestNotFoundError,
  decideManualChange,
  getManualChangeRequest,
  requestManualChange,
} from "./manual-change-service.ts";

const NOW = new Date("2026-08-29T00:00:00.000Z");

function policyConfig(code: string) {
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
        includeDescendants: false,
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
let founderId: string;
let policyId: string;
let cache: EffectiveAccessCache;

async function makeAcademicAdmin(email: string): Promise<string> {
  const user = await createUser(handle.db, { emailNormalized: email, phoneE164: null });
  await assignRole(handle.db, {
    userId: user.userId,
    role: "academic_admin",
    grantedByUserId: founderId,
    grantedReason: "onboarding",
  });
  return user.userId;
}

async function makeStudent(email: string): Promise<string> {
  const user = await createUser(handle.db, { emailNormalized: email, phoneE164: null });
  return user.userId;
}

beforeEach(async () => {
  handle = await createTestDatabase();
  cache = createInMemoryEffectiveAccessCache();
  await seedCanonicalRoles(handle.db);
  const founder = await createUser(handle.db, { emailNormalized: "founder@superlatif.id", phoneE164: null });
  founderId = founder.userId;
  const policy = await createPolicyDraft(handle.db, {
    code: "MANUAL_TEST_POLICY",
    version: 1,
    title: "Manual test policy",
    config: policyConfig("MANUAL_TEST_POLICY"),
  });
  await publishPolicyVersion(handle.db, policy.id, NOW);
  policyId = policy.id;
});

afterEach(async () => {
  await handle.close();
});

describe("requestManualChange - required negative test: unauthorized actor", () => {
  it("a plain student (no role) is refused before anything is written", async () => {
    const student = await makeStudent("student-unauth@example.id");
    const target = await makeStudent("target-unauth@example.id");

    await expect(
      requestManualChange(
        handle.db,
        cache,
        {
          changeType: "manual_grant",
          targetUserId: target,
          requestedByUserId: student,
          reason: "trying anyway",
          correlationId: "corr-unauth",
          accessPolicyId: policyId,
          validFrom: NOW,
          validTo: null,
        },
        NOW,
      ),
    ).rejects.toThrow(ManualChangeNotAuthorizedError);

    // Nothing was written at all - a denied request leaves zero trace rows.
    const rows = await handle.db
      .select()
      .from(accessChangeRequests)
      .where(eq(accessChangeRequests.targetUserId, target));
    expect(rows).toHaveLength(0);
  });
});

describe("requestManualChange - required negative test: missing reason", () => {
  it("an authorized actor with an empty reason is refused (AUDIT_FIELDS_REQUIRED)", async () => {
    const admin = await makeAcademicAdmin("admin-missing-reason@superlatif.id");
    const target = await makeStudent("target-missing-reason@example.id");

    await expect(
      requestManualChange(
        handle.db,
        cache,
        {
          changeType: "manual_grant",
          targetUserId: target,
          requestedByUserId: admin,
          reason: "",
          correlationId: "corr-missing-reason",
          accessPolicyId: policyId,
          validFrom: NOW,
          validTo: null,
        },
        NOW,
      ),
    ).rejects.toThrow(ManualChangeNotAuthorizedError);
  });
});

describe("requestManualChange / decideManualChange - authorized manual grant, peer-approval workflow", () => {
  it("a request by one academic_admin, approved by a DIFFERENT academic_admin, executes and creates a grant", async () => {
    const requester = await makeAcademicAdmin("requester@superlatif.id");
    const approver = await makeAcademicAdmin("approver@superlatif.id");
    const target = await makeStudent("target-happy-path@example.id");

    const request = await requestManualChange(
      handle.db,
      cache,
      {
        changeType: "manual_grant",
        targetUserId: target,
        requestedByUserId: requester,
        reason: "scholarship award",
        correlationId: "corr-happy",
        accessPolicyId: policyId,
        validFrom: NOW,
        validTo: null,
      },
      NOW,
    );
    expect(request.previewSnapshot).toHaveLength(1);
    expect((request.previewSnapshot[0] as { before: { allowed: boolean } }).before.allowed).toBe(false);

    const pending = await getManualChangeRequest(handle.db, request.id);
    expect(pending?.status).toBe("pending_approval");

    const decisionRow = await decideManualChange(
      handle.db,
      cache,
      {
        changeRequestId: request.id,
        decidedByUserId: approver,
        outcome: "approved",
        reason: "confirmed eligible",
        correlationId: "corr-approve",
      },
      NOW,
    );
    expect(decisionRow.executionStatus).toBe("executed");
    expect(decisionRow.resultGrantId).not.toBeNull();

    const after = await getManualChangeRequest(handle.db, request.id);
    expect(after?.status).toBe("executed");

    const access = await getEffectiveAccess(
      handle.db,
      cache,
      target,
      { targetType: "program_track", targetRef: "track:skd", action: "view" },
      NOW,
    );
    expect(access.allowed).toBe(true);
  });
});

describe("decideManualChange - required negative test: self-approval", () => {
  it("the requester cannot approve their own request (universal maker-checker, IDN-004)", async () => {
    const admin = await makeAcademicAdmin("self-approve@superlatif.id");
    const target = await makeStudent("target-self-approve@example.id");

    const request = await requestManualChange(
      handle.db,
      cache,
      {
        changeType: "manual_grant",
        targetUserId: target,
        requestedByUserId: admin,
        reason: "self grant attempt",
        correlationId: "corr-self",
        accessPolicyId: policyId,
        validFrom: NOW,
        validTo: null,
      },
      NOW,
    );

    await expect(
      decideManualChange(
        handle.db,
        cache,
        {
          changeRequestId: request.id,
          decidedByUserId: admin,
          outcome: "approved",
          reason: "approving myself",
          correlationId: "corr-self-2",
        },
        NOW,
      ),
    ).rejects.toThrow(ManualChangeNotAuthorizedError);

    const stillPending = await getManualChangeRequest(handle.db, request.id);
    expect(stillPending?.status).toBe("pending_approval");
  });
});

describe("decideManualChange - required negative test: revoking a purchase grant by mutation", () => {
  it("a manual revocation targeting a purchase-sourced grant executes as approved but FAILS to execute (ownership mismatch) - the purchase grant is never mutated", async () => {
    const requester = await makeAcademicAdmin("revoke-requester@superlatif.id");
    const approver = await makeAcademicAdmin("revoke-approver@superlatif.id");
    const target = await makeStudent("target-purchase-revoke@example.id");

    const purchaseGrant = await issueGrant(handle.db, {
      userId: target,
      sourceType: "purchase",
      sourceId: "order-immutable-1",
      sourceKey: "order-immutable-1",
      accessPolicyId: policyId,
      validFrom: NOW,
      validTo: new Date("2026-12-31T00:00:00.000Z"),
    });
    const [beforeRow] = await handle.db
      .select()
      .from(accessGrants)
      .where(eq(accessGrants.id, purchaseGrant.id))
      .limit(1);

    const request = await requestManualChange(
      handle.db,
      cache,
      {
        changeType: "manual_revocation",
        targetUserId: target,
        requestedByUserId: requester,
        reason: "attempting to manually revoke a purchase grant",
        correlationId: "corr-mutation-attempt",
        targetGrantId: purchaseGrant.id,
      },
      NOW,
    );

    const decisionRow = await decideManualChange(
      handle.db,
      cache,
      {
        changeRequestId: request.id,
        decidedByUserId: approver,
        outcome: "approved",
        reason: "approved by mistake",
        correlationId: "corr-mutation-approve",
      },
      NOW,
    );
    expect(decisionRow.executionStatus).toBe("execution_failed");
    expect(decisionRow.executionResult?.["errorType"]).toBe("GrantOwnershipMismatchError");

    const finalStatus = await getManualChangeRequest(handle.db, request.id);
    expect(finalStatus?.status).toBe("execution_failed");

    const [afterRow] = await handle.db
      .select()
      .from(accessGrants)
      .where(eq(accessGrants.id, purchaseGrant.id))
      .limit(1);
    expect(afterRow).toEqual(beforeRow);

    // The purchase grant is still active - effective access is completely unaffected by the failed manual attempt.
    const access = await getEffectiveAccess(
      handle.db,
      cache,
      target,
      { targetType: "program_track", targetRef: "track:skd", action: "view" },
      NOW,
    );
    expect(access.allowed).toBe(true);
    expect(access.decisiveGrantIds).toEqual([purchaseGrant.id]);
  });
});

describe("decideManualChange - required negative test: stale effective access cache", () => {
  it("effective access reflects a manual grant immediately after execution - never a stale cached decision", async () => {
    const requester = await makeAcademicAdmin("cache-requester@superlatif.id");
    const approver = await makeAcademicAdmin("cache-approver@superlatif.id");
    const target = await makeStudent("target-cache@example.id");

    const query = { targetType: "program_track", targetRef: "track:skd", action: "view" } as const;
    // Warm the cache with a "not claimed" decision BEFORE the manual grant exists.
    const before = await getEffectiveAccess(handle.db, cache, target, query, NOW);
    expect(before.reasonCode).toBe("NOT_CLAIMED");

    const request = await requestManualChange(
      handle.db,
      cache,
      {
        changeType: "manual_grant",
        targetUserId: target,
        requestedByUserId: requester,
        reason: "cache invalidation check",
        correlationId: "corr-cache",
        accessPolicyId: policyId,
        validFrom: NOW,
        validTo: null,
      },
      NOW,
    );
    await decideManualChange(
      handle.db,
      cache,
      {
        changeRequestId: request.id,
        decidedByUserId: approver,
        outcome: "approved",
        reason: "approved",
        correlationId: "corr-cache-approve",
      },
      NOW,
    );

    // No manual cache.invalidateUser call anywhere in this test - execution's
    // own issueGrantAndInvalidate must have done it already.
    const after = await getEffectiveAccess(handle.db, cache, target, query, NOW);
    expect(after.allowed).toBe(true);
  });
});

describe("decideManualChange - reject workflow", () => {
  it("a rejected request never executes - no grant is created, status is rejected", async () => {
    const requester = await makeAcademicAdmin("reject-requester@superlatif.id");
    const approver = await makeAcademicAdmin("reject-approver@superlatif.id");
    const target = await makeStudent("target-reject@example.id");

    const request = await requestManualChange(
      handle.db,
      cache,
      {
        changeType: "manual_grant",
        targetUserId: target,
        requestedByUserId: requester,
        reason: "not actually eligible",
        correlationId: "corr-reject",
        accessPolicyId: policyId,
        validFrom: NOW,
        validTo: null,
      },
      NOW,
    );
    await decideManualChange(
      handle.db,
      cache,
      {
        changeRequestId: request.id,
        decidedByUserId: approver,
        outcome: "rejected",
        reason: "insufficient evidence",
        correlationId: "corr-reject-2",
      },
      NOW,
    );

    const status = await getManualChangeRequest(handle.db, request.id);
    expect(status?.status).toBe("rejected");

    const access = await getEffectiveAccess(
      handle.db,
      cache,
      target,
      { targetType: "program_track", targetRef: "track:skd", action: "view" },
      NOW,
    );
    expect(access.allowed).toBe(false);
  });
});

describe("decideManualChange - a request cannot be decided twice", () => {
  it("throws ManualChangeAlreadyDecidedError on a second decision attempt", async () => {
    const requester = await makeAcademicAdmin("double-decide-requester@superlatif.id");
    const approver = await makeAcademicAdmin("double-decide-approver@superlatif.id");
    const target = await makeStudent("target-double-decide@example.id");

    const request = await requestManualChange(
      handle.db,
      cache,
      {
        changeType: "manual_grant",
        targetUserId: target,
        requestedByUserId: requester,
        reason: "grant",
        correlationId: "corr-double-1",
        accessPolicyId: policyId,
        validFrom: NOW,
        validTo: null,
      },
      NOW,
    );
    await decideManualChange(
      handle.db,
      cache,
      {
        changeRequestId: request.id,
        decidedByUserId: approver,
        outcome: "approved",
        reason: "ok",
        correlationId: "corr-double-2",
      },
      NOW,
    );

    await expect(
      decideManualChange(
        handle.db,
        cache,
        {
          changeRequestId: request.id,
          decidedByUserId: approver,
          outcome: "approved",
          reason: "again",
          correlationId: "corr-double-3",
        },
        NOW,
      ),
    ).rejects.toThrow(ManualChangeAlreadyDecidedError);
  });

  it("throws ManualChangeRequestNotFoundError for an unknown request id", async () => {
    const approver = await makeAcademicAdmin("not-found-approver@superlatif.id");
    await expect(
      decideManualChange(
        handle.db,
        cache,
        {
          changeRequestId: "00000000-0000-0000-0000-000000000000",
          decidedByUserId: approver,
          outcome: "approved",
          reason: "ok",
          correlationId: "corr-nf",
        },
        NOW,
      ),
    ).rejects.toThrow(ManualChangeRequestNotFoundError);
  });
});

describe("manual extension never rewrites the original purchase grant (Changes never rewrite original purchase grants)", () => {
  it("a manual extension coexists with an existing purchase grant - the purchase grant row is untouched, coverage is additive", async () => {
    const requester = await makeAcademicAdmin("extend-requester@superlatif.id");
    const approver = await makeAcademicAdmin("extend-approver@superlatif.id");
    const target = await makeStudent("target-extend@example.id");

    const purchaseGrant = await issueGrant(handle.db, {
      userId: target,
      sourceType: "purchase",
      sourceId: "order-extend-1",
      sourceKey: "order-extend-1",
      accessPolicyId: policyId,
      validFrom: NOW,
      validTo: new Date("2026-09-30T00:00:00.000Z"),
    });
    const [beforeRow] = await handle.db
      .select()
      .from(accessGrants)
      .where(eq(accessGrants.id, purchaseGrant.id))
      .limit(1);

    const request = await requestManualChange(
      handle.db,
      cache,
      {
        changeType: "manual_extension",
        targetUserId: target,
        requestedByUserId: requester,
        reason: "goodwill extension after outage",
        correlationId: "corr-extend",
        accessPolicyId: policyId,
        validFrom: NOW,
        validTo: new Date("2026-12-31T00:00:00.000Z"),
        extendsGrantId: purchaseGrant.id,
      },
      NOW,
    );
    await decideManualChange(
      handle.db,
      cache,
      {
        changeRequestId: request.id,
        decidedByUserId: approver,
        outcome: "approved",
        reason: "approved",
        correlationId: "corr-extend-2",
      },
      NOW,
    );

    const [afterRow] = await handle.db
      .select()
      .from(accessGrants)
      .where(eq(accessGrants.id, purchaseGrant.id))
      .limit(1);
    expect(afterRow).toEqual(beforeRow);

    const access = await getEffectiveAccess(
      handle.db,
      cache,
      target,
      { targetType: "program_track", targetRef: "track:skd", action: "view" },
      NOW,
    );
    expect(access.allowed).toBe(true);
    expect(access.decisiveGrantIds).toHaveLength(2);
    expect(access.effectiveTo?.toISOString()).toBe(new Date("2026-12-31T00:00:00.000Z").toISOString());
  });
});
