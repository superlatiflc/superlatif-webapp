import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createInMemoryEffectiveAccessCache, type EffectiveAccessCache } from "@superlatif/domain/access";
import { createUser } from "../identity/repository.ts";
import { createTestDatabase, type TestDatabaseHandle } from "../test-client.ts";
import { createPolicyDraft, publishPolicyVersion } from "./policy-repository.ts";
import { issueGrant, recordGrantEvent } from "./grant-repository.ts";
import { getEffectiveAccess, issueGrantAndInvalidate } from "./effective-access-service.ts";
import {
  createPurchase,
  listReconciliationCasesForPurchase,
  resolveReconciliationCase,
} from "../commerce/index.ts";
import {
  detectEffectiveAccessDrift,
  detectPurchaseGrantDrift,
  rebuildEffectiveAccess,
} from "./entitlement-rebuild-service.ts";

const NOW = new Date("2026-08-29T00:00:00.000Z");
const LATER = new Date("2026-08-29T01:00:00.000Z");
const TARGET_REF = "program:aks-2026";
const QUERY = { targetType: "program", targetRef: TARGET_REF, action: "view" };

function lifetimePolicyConfig(code: string) {
  return {
    schemaVersion: 2,
    code,
    version: 1,
    title: code,
    validity: { mode: "lifetime", timezone: "Asia/Jakarta" },
    claims: [
      { targetType: "program", targetRef: { code: TARGET_REF }, actions: ["view"], includeDescendants: true },
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
let cache: EffectiveAccessCache;
let policyId: string;

beforeEach(async () => {
  handle = await createTestDatabase();
  cache = createInMemoryEffectiveAccessCache();
  const policy = await createPolicyDraft(handle.db, {
    code: "ENT003_TEST_POLICY",
    version: 1,
    title: "policy",
    config: lifetimePolicyConfig("ENT003_TEST_POLICY"),
  });
  await publishPolicyVersion(handle.db, policy.id, NOW);
  policyId = policy.id;
});

afterEach(async () => {
  await handle.close();
});

async function makeStudent(email: string): Promise<string> {
  const user = await createUser(handle.db, { emailNormalized: email, phoneE164: null });
  return user.userId;
}

describe("required test: repeatable rebuild", () => {
  it("rebuilding twice from the same source records produces an identical decision", async () => {
    const studentId = await makeStudent("wp-repeatable@example.test");
    await issueGrantAndInvalidate(handle.db, cache, {
      userId: studentId,
      sourceType: "purchase",
      sourceId: "purchase-repeatable",
      sourceKey: "purchase-repeatable:program",
      accessPolicyId: policyId,
      validFrom: NOW,
      validTo: null,
    });

    const first = await rebuildEffectiveAccess(handle.db, studentId, QUERY, LATER);
    const second = await rebuildEffectiveAccess(handle.db, studentId, QUERY, LATER);
    expect(second).toEqual(first);
  });
});

describe("required test: drift detection and stale cache detection", () => {
  it("a grant revoked without going through the invalidating wrapper leaves the cache stale until drift detection catches it", async () => {
    const studentId = await makeStudent("wp-stale@example.test");
    const grant = await issueGrantAndInvalidate(handle.db, cache, {
      userId: studentId,
      sourceType: "purchase",
      sourceId: "purchase-stale",
      sourceKey: "purchase-stale:program",
      accessPolicyId: policyId,
      validFrom: NOW,
      validTo: null,
    });

    // Populate the cache the normal way.
    const cachedDecision = await getEffectiveAccess(handle.db, cache, studentId, QUERY, NOW);
    expect(cachedDecision.allowed).toBe(true);

    // Revoke the grant using ENT-001's RAW function - deliberately bypassing
    // ENT-002's recordGrantEventAndInvalidate, to simulate a code path that
    // mutated a grant without invalidating the cache (exactly the class of
    // bug this task exists to catch).
    await recordGrantEvent(handle.db, {
      grantId: grant.id,
      eventType: "revoked",
      occurredAt: LATER,
      reason: "test: simulated out-of-band revocation",
    });

    // The cache is still stale - it does not know about the revocation yet.
    const staleRead = await getEffectiveAccess(handle.db, cache, studentId, QUERY, LATER);
    expect(staleRead.allowed).toBe(true);

    const report = await detectEffectiveAccessDrift(handle.db, cache, studentId, QUERY, LATER);
    expect(report.hasDrift).toBe(true);
    expect(report.driftKind).toBe("cache_over_permissive");
    expect(report.rebuilt.allowed).toBe(false);
  });
});

describe("required negative test: no access widening", () => {
  it("after drift is detected and the cache invalidated, the next real read reflects the MORE RESTRICTIVE rebuilt decision, never the stale wider one", async () => {
    const studentId = await makeStudent("wp-no-widen@example.test");
    const grant = await issueGrantAndInvalidate(handle.db, cache, {
      userId: studentId,
      sourceType: "purchase",
      sourceId: "purchase-no-widen",
      sourceKey: "purchase-no-widen:program",
      accessPolicyId: policyId,
      validFrom: NOW,
      validTo: null,
    });
    await getEffectiveAccess(handle.db, cache, studentId, QUERY, NOW); // populate cache
    await recordGrantEvent(handle.db, {
      grantId: grant.id,
      eventType: "revoked",
      occurredAt: LATER,
      reason: "test: simulated out-of-band revocation",
    });

    await detectEffectiveAccessDrift(handle.db, cache, studentId, QUERY, LATER); // invalidates

    const afterRepair = await getEffectiveAccess(handle.db, cache, studentId, QUERY, LATER);
    expect(afterRepair.allowed).toBe(false); // never trusts the stale "allowed" answer
    expect(afterRepair.decisiveGrantIds).toHaveLength(0);
  });

  it("no drift is reported when cache and rebuild already agree - detection never invents a problem", async () => {
    const studentId = await makeStudent("wp-agree@example.test");
    await issueGrantAndInvalidate(handle.db, cache, {
      userId: studentId,
      sourceType: "purchase",
      sourceId: "purchase-agree",
      sourceKey: "purchase-agree:program",
      accessPolicyId: policyId,
      validFrom: NOW,
      validTo: null,
    });
    await getEffectiveAccess(handle.db, cache, studentId, QUERY, NOW);

    const report = await detectEffectiveAccessDrift(handle.db, cache, studentId, QUERY, LATER);
    expect(report.hasDrift).toBe(false);
    expect(report.driftKind).toBe("none");
  });
});

describe("required test: deterministic output ordering", () => {
  it("decisiveGrantIds is in the same order across repeated rebuilds, for three overlapping grants from three different sources", async () => {
    const studentId = await makeStudent("wp-ordering@example.test");
    const first = await issueGrant(handle.db, {
      userId: studentId,
      sourceType: "purchase",
      sourceId: "purchase-order-1",
      sourceKey: "purchase-order-1:program",
      accessPolicyId: policyId,
      validFrom: NOW,
      validTo: null,
    });
    const second = await issueGrant(handle.db, {
      userId: studentId,
      sourceType: "purchase",
      sourceId: "purchase-order-2",
      sourceKey: "purchase-order-2:program",
      accessPolicyId: policyId,
      validFrom: NOW,
      validTo: null,
    });
    const third = await issueGrant(handle.db, {
      userId: studentId,
      sourceType: "manual",
      sourceId: studentId,
      sourceKey: `${studentId}:program`,
      accessPolicyId: policyId,
      validFrom: NOW,
      validTo: null,
    });

    const runs = await Promise.all(
      Array.from({ length: 5 }, () => rebuildEffectiveAccess(handle.db, studentId, QUERY, LATER)),
    );
    const expectedOrder = [first.id, second.id, third.id];
    for (const decision of runs) {
      expect(decision.allowed).toBe(true);
      expect(decision.decisiveGrantIds).toEqual(expectedOrder);
    }
  });
});

describe("required test: repair audit (paid purchase without a supporting grant)", () => {
  it("raises an open reconciliation case, is idempotent on repeat detection, and a human resolving it stamps the audit trail", async () => {
    const studentId = await makeStudent("wp-paid-no-grant@example.test");
    const purchase = await createPurchase(handle.db, {
      provider: "sejoli_bridge",
      site: "superlatif.id",
      externalOrderId: "SJ-ENT003-NO-GRANT-1",
      userId: studentId,
      offerId: null,
      externalSkuId: "sku-ent003-test",
      status: "paid",
      currency: "IDR",
      amountMinor: 199_000,
      orderedAt: NOW,
      lastEventOccurredAt: NOW,
      paidAt: NOW,
    });

    const operator = await makeStudent("ops-ent003@superlatif.id"); // a real user row, used only as the resolving actor id here

    const firstPass = await detectPurchaseGrantDrift(handle.db, studentId, LATER);
    expect(firstPass).toHaveLength(1);
    expect(firstPass[0]?.purchaseId).toBe(purchase.id);

    const casesAfterFirst = await listReconciliationCasesForPurchase(handle.db, purchase.id);
    expect(casesAfterFirst).toHaveLength(1);
    expect(casesAfterFirst[0]?.caseType).toBe("paid_purchase_no_grant");
    expect(casesAfterFirst[0]?.status).toBe("open");

    // Idempotent: detecting again does not create a second case for the same purchase.
    const secondPass = await detectPurchaseGrantDrift(handle.db, studentId, LATER);
    expect(secondPass).toHaveLength(1);
    expect(secondPass[0]?.reconciliationCaseId).toBe(firstPass[0]?.reconciliationCaseId);
    const casesAfterSecond = await listReconciliationCasesForPurchase(handle.db, purchase.id);
    expect(casesAfterSecond).toHaveLength(1);

    // A human investigates (e.g. confirms a manual grant was issued via
    // ENT-004 for a documented reason) and resolves the case - reusing
    // COM-006's exact audit-stamping primitive, not a new mechanism.
    const resolved = await resolveReconciliationCase(
      handle.db,
      casesAfterFirst[0]!.id,
      "resolved",
      operator,
      "Confirmed scholarship exception - manual grant issued separately via ENT-004",
      LATER,
    );
    expect(resolved.status).toBe("resolved");
    expect(resolved.resolvedByUserId).toBe(operator);
    expect(resolved.resolutionReason).toBe(
      "Confirmed scholarship exception - manual grant issued separately via ENT-004",
    );
    expect(resolved.resolvedAt).not.toBeNull();

    // Once resolved, a further detection pass no longer reports it as open drift needing a new case.
    const thirdPass = await detectPurchaseGrantDrift(handle.db, studentId, LATER);
    const casesAfterThird = await listReconciliationCasesForPurchase(handle.db, purchase.id);
    expect(casesAfterThird).toHaveLength(2); // the resolved one, plus a fresh open one - the underlying gap is still real
    expect(thirdPass).toHaveLength(1);
    expect(thirdPass[0]?.reconciliationCaseId).not.toBe(casesAfterFirst[0]!.id);
  });

  it("reports nothing when a paid purchase already has a supporting grant", async () => {
    const studentId = await makeStudent("wp-paid-with-grant@example.test");
    const purchase = await createPurchase(handle.db, {
      provider: "sejoli_bridge",
      site: "superlatif.id",
      externalOrderId: "SJ-ENT003-WITH-GRANT-1",
      userId: studentId,
      offerId: null,
      externalSkuId: "sku-ent003-test-2",
      status: "paid",
      currency: "IDR",
      amountMinor: 199_000,
      orderedAt: NOW,
      lastEventOccurredAt: NOW,
      paidAt: NOW,
    });
    await issueGrant(handle.db, {
      userId: studentId,
      sourceType: "purchase",
      sourceId: purchase.id,
      sourceKey: `${purchase.id}:program`,
      accessPolicyId: policyId,
      validFrom: NOW,
      validTo: null,
    });

    const drifts = await detectPurchaseGrantDrift(handle.db, studentId, LATER);
    expect(drifts).toHaveLength(0);
  });
});
