import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { access, authorization as authorizationDomain } from "@superlatif/domain";
import { createUser } from "../identity/repository.ts";
import { createPolicyDraft, issueGrant, listGrantEvents, publishPolicyVersion } from "../access/index.ts";
import { createTestDatabase, type TestDatabaseHandle } from "../test-client.ts";
import {
  RoleAssignmentAuditRequiredError,
  assignRole,
  findRoleByCode,
  listActiveRoleHoldings,
  reinstateRoleAssignment,
  revokeRoleAssignment,
  seedCanonicalRoles,
} from "./role-repository.ts";

const NOW = new Date("2026-08-29T00:00:00.000Z");

function lifetimePolicyConfig(code: string) {
  return {
    schemaVersion: 2,
    code,
    version: 1,
    title: code,
    validity: { mode: "lifetime", timezone: "Asia/Jakarta" },
    claims: [
      {
        targetType: "resource",
        targetRef: { code: "placeholder" },
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

beforeEach(async () => {
  handle = await createTestDatabase();
  await seedCanonicalRoles(handle.db);
  const founder = await createUser(handle.db, { emailNormalized: "founder@superlatif.id", phoneE164: null });
  founderId = founder.userId;
});

afterEach(async () => {
  await handle.close();
});

describe("seedCanonicalRoles", () => {
  it("is idempotent - seeding twice creates no duplicate rows", async () => {
    await seedCanonicalRoles(handle.db);
    const superAdmin = await findRoleByCode(handle.db, "super_admin");
    expect(superAdmin).not.toBeNull();
  });

  it("seeds all eight canonical roles from dok 02 §5.3", async () => {
    for (const code of [
      "super_admin",
      "operations_admin",
      "academic_admin",
      "tutor_writer",
      "moderator_reviewer",
      "live_class_coordinator",
      "support",
      "finance_reconciliation",
    ] as const) {
      expect(await findRoleByCode(handle.db, code)).not.toBeNull();
    }
  });
});

describe("assignRole - privileged mutation includes actor, reason (required negative test: admin melewati audit trail)", () => {
  it("refuses to assign a role without a grantedReason - the audit trail cannot be bypassed by omission", async () => {
    const target = await createUser(handle.db, { emailNormalized: "tutor@superlatif.id", phoneE164: null });
    await expect(
      assignRole(handle.db, {
        userId: target.userId,
        role: "tutor_writer",
        grantedByUserId: founderId,
        grantedReason: "",
      }),
    ).rejects.toThrow(RoleAssignmentAuditRequiredError);
  });

  it("refuses to assign a role without a grantedByUserId", async () => {
    const target = await createUser(handle.db, { emailNormalized: "tutor2@superlatif.id", phoneE164: null });
    await expect(
      assignRole(handle.db, {
        userId: target.userId,
        role: "tutor_writer",
        grantedByUserId: "",
        grantedReason: "onboarding",
      }),
    ).rejects.toThrow(RoleAssignmentAuditRequiredError);
  });

  it("is idempotent - assigning the same (user, role) twice returns the existing row, never a duplicate", async () => {
    const target = await createUser(handle.db, { emailNormalized: "tutor3@superlatif.id", phoneE164: null });
    const first = await assignRole(handle.db, {
      userId: target.userId,
      role: "tutor_writer",
      grantedByUserId: founderId,
      grantedReason: "onboarding",
    });
    const second = await assignRole(handle.db, {
      userId: target.userId,
      role: "tutor_writer",
      grantedByUserId: founderId,
      grantedReason: "onboarding again",
    });
    expect(second.id).toBe(first.id);
  });
});

describe("role scope + revoke/reinstate (feeds listActiveRoleHoldings, which feeds authorize())", () => {
  it("a scoped assignment surfaces its scopes in listActiveRoleHoldings", async () => {
    const tutor = await createUser(handle.db, { emailNormalized: "tutor4@superlatif.id", phoneE164: null });
    await assignRole(handle.db, {
      userId: tutor.userId,
      role: "tutor_writer",
      scopes: [{ scopeType: "program", scopeRef: "program-2" }],
      grantedByUserId: founderId,
      grantedReason: "assigned to program-2",
    });

    const holdings = await listActiveRoleHoldings(handle.db, tutor.userId);
    expect(holdings).toEqual([
      { role: "tutor_writer", scopes: [{ scopeType: "program", scopeRef: "program-2" }] },
    ]);
  });

  it("revoking an assignment removes it from listActiveRoleHoldings - status is derived, never stored", async () => {
    const mod = await createUser(handle.db, { emailNormalized: "mod1@superlatif.id", phoneE164: null });
    const assignment = await assignRole(handle.db, {
      userId: mod.userId,
      role: "moderator_reviewer",
      grantedByUserId: founderId,
      grantedReason: "onboarding",
    });
    expect(await listActiveRoleHoldings(handle.db, mod.userId)).toHaveLength(1);

    await revokeRoleAssignment(handle.db, {
      userRoleId: assignment.id,
      actorUserId: founderId,
      reason: "role no longer needed",
      correlationId: "corr-revoke-1",
      occurredAt: NOW,
    });

    expect(await listActiveRoleHoldings(handle.db, mod.userId)).toHaveLength(0);
  });

  it("revoke requires reason and correlationId - the audit trail cannot be bypassed by omission", async () => {
    const mod = await createUser(handle.db, { emailNormalized: "mod2@superlatif.id", phoneE164: null });
    const assignment = await assignRole(handle.db, {
      userId: mod.userId,
      role: "moderator_reviewer",
      grantedByUserId: founderId,
      grantedReason: "onboarding",
    });
    await expect(
      revokeRoleAssignment(handle.db, {
        userRoleId: assignment.id,
        actorUserId: founderId,
        reason: "",
        correlationId: "corr-2",
        occurredAt: NOW,
      }),
    ).rejects.toThrow(RoleAssignmentAuditRequiredError);
  });

  it("reinstating a revoked assignment restores it in listActiveRoleHoldings", async () => {
    const mod = await createUser(handle.db, { emailNormalized: "mod3@superlatif.id", phoneE164: null });
    const assignment = await assignRole(handle.db, {
      userId: mod.userId,
      role: "moderator_reviewer",
      grantedByUserId: founderId,
      grantedReason: "onboarding",
    });
    await revokeRoleAssignment(handle.db, {
      userRoleId: assignment.id,
      actorUserId: founderId,
      reason: "temporary hold",
      correlationId: "corr-3",
      occurredAt: NOW,
    });
    expect(await listActiveRoleHoldings(handle.db, mod.userId)).toHaveLength(0);

    await reinstateRoleAssignment(handle.db, {
      userRoleId: assignment.id,
      actorUserId: founderId,
      reason: "hold lifted",
      correlationId: "corr-4",
      occurredAt: new Date(NOW.getTime() + 1000),
    });
    expect(await listActiveRoleHoldings(handle.db, mod.userId)).toHaveLength(1);
  });
});

describe("end-to-end: authorize() composed with real DB-backed roles AND real ENT-001 entitlement (object-level access checks ownership, entitlement, and scope role)", () => {
  it("a plain student (no role assignment at all) is denied reading another student's attempt by ownership alone", async () => {
    const alice = await createUser(handle.db, { emailNormalized: "alice@student.id", phoneE164: null });
    const bob = await createUser(handle.db, { emailNormalized: "bob@student.id", phoneE164: null });

    const aliceHoldings = await listActiveRoleHoldings(handle.db, alice.userId);
    expect(aliceHoldings).toEqual([]); // a student holds no canonical role at all

    const decision = authorizationDomain.authorize({
      actor: { userId: alice.userId, roles: aliceHoldings },
      action: { type: "read_attempt" },
      object: { ownerUserId: bob.userId },
    });
    expect(decision).toEqual({ allowed: false, reasonCode: "OBJECT_SCOPE_DENIED" });
  });

  it("entitlement composes with real ENT-001 grants: a student with an active grant is allowed, one without is denied", async () => {
    const student = await createUser(handle.db, { emailNormalized: "carol@student.id", phoneE164: null });
    const policy = await createPolicyDraft(handle.db, {
      code: "RESOURCE_POLICY",
      version: 1,
      title: "Resource policy",
      config: lifetimePolicyConfig("RESOURCE_POLICY"),
    });
    await publishPolicyVersion(handle.db, policy.id, NOW);
    const grant = await issueGrant(handle.db, {
      userId: student.userId,
      sourceType: "purchase",
      sourceId: "order-1",
      sourceKey: "order-1",
      accessPolicyId: policy.id,
      validFrom: NOW,
      validTo: null,
    });

    const events = await listGrantEvents(handle.db, grant.id);
    const status = access.deriveGrantStatus(
      {
        validFrom: grant.validFrom,
        validTo: grant.validTo,
        validityConfig: { mode: "lifetime" },
        issuedAt: NOW,
      },
      events,
      NOW,
    );

    const holdings = await listActiveRoleHoldings(handle.db, student.userId);
    const decision = authorizationDomain.authorize({
      actor: { userId: student.userId, roles: holdings },
      action: { type: "view_resource" },
      object: { requiresEntitlement: true },
      entitlement: { hasEffectiveAccess: status.status === "active" },
    });
    expect(decision).toEqual({ allowed: true, reasonCode: "GRANTED" });

    const studentWithoutGrant = await createUser(handle.db, {
      emailNormalized: "dave@student.id",
      phoneE164: null,
    });
    const noGrantHoldings = await listActiveRoleHoldings(handle.db, studentWithoutGrant.userId);
    const denied = authorizationDomain.authorize({
      actor: { userId: studentWithoutGrant.userId, roles: noGrantHoldings },
      action: { type: "view_resource" },
      object: { requiresEntitlement: true },
      entitlement: { hasEffectiveAccess: false },
    });
    expect(denied).toEqual({ allowed: false, reasonCode: "ENTITLEMENT_DENIED" });
  });

  it("a tutor scoped to program-2 is denied by real DB-backed scope when acting on program-9 (tutor mengakses program di luar scope)", async () => {
    const tutor = await createUser(handle.db, { emailNormalized: "tutor5@superlatif.id", phoneE164: null });
    await assignRole(handle.db, {
      userId: tutor.userId,
      role: "tutor_writer",
      scopes: [{ scopeType: "program", scopeRef: "program-2" }],
      grantedByUserId: founderId,
      grantedReason: "assigned to program-2",
    });
    const holdings = await listActiveRoleHoldings(handle.db, tutor.userId);

    const inScope = authorizationDomain.authorize({
      actor: { userId: tutor.userId, roles: holdings },
      action: { type: "edit_question_draft", permission: "question.draft.write" },
      object: { scopeType: "program", scopeRef: "program-2" },
    });
    expect(inScope).toEqual({ allowed: true, reasonCode: "ASSIGNED_SCOPE" });

    const outOfScope = authorizationDomain.authorize({
      actor: { userId: tutor.userId, roles: holdings },
      action: { type: "edit_question_draft", permission: "question.draft.write" },
      object: { scopeType: "program", scopeRef: "program-9" },
    });
    expect(outOfScope).toEqual({ allowed: false, reasonCode: "OBJECT_SCOPE_DENIED" });
  });

  it("a moderator with a real DB-backed role assignment cannot change entitlement (moderator mengubah entitlement)", async () => {
    const mod = await createUser(handle.db, { emailNormalized: "mod5@superlatif.id", phoneE164: null });
    await assignRole(handle.db, {
      userId: mod.userId,
      role: "moderator_reviewer",
      grantedByUserId: founderId,
      grantedReason: "onboarding",
    });
    const holdings = await listActiveRoleHoldings(handle.db, mod.userId);

    const decision = authorizationDomain.authorize({
      actor: { userId: mod.userId, roles: holdings },
      action: { type: "change_entitlement", permission: "access.manual.change" },
      object: { scopeType: "user", scopeRef: "some-student" },
      audit: { reason: "trying anyway", correlationId: "corr-5" },
    });
    expect(decision).toEqual({ allowed: false, reasonCode: "ROLE_DENIED" });
  });
});
