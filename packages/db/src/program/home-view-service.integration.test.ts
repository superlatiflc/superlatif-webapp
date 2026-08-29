import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createInMemoryEffectiveAccessCache, type EffectiveAccessCache } from "@superlatif/domain/access";
import { createUser } from "../identity/repository.ts";
import { createTestDatabase, type TestDatabaseHandle } from "../test-client.ts";
import { createPolicyDraft, publishPolicyVersion } from "../access/policy-repository.ts";
import { issueGrant } from "../access/grant-repository.ts";
import { createProgram, type ProgramRow } from "./program-repository.ts";
import {
  assertProgramAccess,
  listAccessibleProgramsForUser,
  setPrimaryProgram,
  syncProgramEnrollments,
} from "./enrollment-service.ts";
import { buildHomeViewModel } from "./home-view-service.ts";

const NOW = new Date("2026-08-29T00:00:00.000Z");

function programPolicyConfig(programCode: string, policyCode: string) {
  return {
    schemaVersion: 2,
    code: policyCode,
    version: 1,
    title: policyCode,
    validity: { mode: "lifetime", timezone: "Asia/Jakarta" },
    claims: [
      {
        targetType: "program",
        targetRef: { code: `program:${programCode}` },
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
let cache: EffectiveAccessCache;

async function makeProgram(code: string, name = code): Promise<ProgramRow> {
  return createProgram(handle.db, { code, name });
}

async function publishedPolicy(policyCode: string, programCode: string) {
  const policy = await createPolicyDraft(handle.db, {
    code: policyCode,
    version: 1,
    title: policyCode,
    config: programPolicyConfig(programCode, policyCode),
  });
  await publishPolicyVersion(handle.db, policy.id, NOW);
  return policy;
}

function policyCodeFor(sourceId: string): string {
  return `${sourceId.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_POLICY`;
}

async function grantProgramAccess(
  userId: string,
  programCode: string,
  sourceType: string,
  sourceId: string,
): Promise<void> {
  const policy = await publishedPolicy(policyCodeFor(sourceId), programCode);
  await issueGrant(handle.db, {
    userId,
    sourceType,
    sourceId,
    sourceKey: sourceId,
    accessPolicyId: policy.id,
    validFrom: new Date("2026-08-01T00:00:00.000Z"),
    validTo: null,
  });
}

beforeEach(async () => {
  handle = await createTestDatabase();
  cache = createInMemoryEffectiveAccessCache();
});

afterEach(async () => {
  await handle.close();
});

describe("required negative test: no active program", () => {
  it("returns status no_program when the student has zero accessible programs", async () => {
    const student = await createUser(handle.db, {
      emailNormalized: "no-program@example.id",
      phoneE164: null,
    });
    await makeProgram("aks-2026", "Kelas Akselerasi 2026"); // exists in the catalogue, but the student has no grant for it

    const model = await buildHomeViewModel(handle.db, cache, student.userId, NOW);
    expect(model.status).toBe("no_program");
    expect(model.primaryProgram).toBeNull();
    expect(model.otherPrograms).toEqual([]);
  });
});

describe("required test: cross-product dedup", () => {
  it("a program granted by TWO different sources (bundle + specialist) appears exactly once in the accessible list", async () => {
    const student = await createUser(handle.db, { emailNormalized: "dedup@example.id", phoneE164: null });
    const program = await makeProgram("skd-2026", "Paket SKD 2026");

    await grantProgramAccess(student.userId, "skd-2026", "purchase", "order-bundle");
    await grantProgramAccess(student.userId, "skd-2026", "purchase", "order-specialist");

    const accessible = await listAccessibleProgramsForUser(handle.db, cache, student.userId, NOW);
    expect(accessible).toHaveLength(1);
    expect(accessible[0]?.id).toBe(program.id);

    const model = await buildHomeViewModel(handle.db, cache, student.userId, NOW);
    expect(model.status).toBe("ready");
    expect(model.primaryProgram?.id).toBe(program.id);
    expect(model.otherPrograms).toEqual([]);
  });

  it("two DIFFERENT programs each granted by their own product both appear, distinctly, with no duplication (multi-product state)", async () => {
    const student = await createUser(handle.db, {
      emailNormalized: "multi-product@example.id",
      phoneE164: null,
    });
    const programA = await makeProgram("aks-2026", "Kelas Akselerasi 2026");
    const programB = await makeProgram("tka-2026", "Paket TKA 2026");

    await grantProgramAccess(student.userId, "aks-2026", "purchase", "order-a");
    await grantProgramAccess(student.userId, "tka-2026", "purchase", "order-b");

    const accessible = await listAccessibleProgramsForUser(handle.db, cache, student.userId, NOW);
    expect(accessible.map((program) => program.id).sort()).toEqual([programA.id, programB.id].sort());

    const model = await buildHomeViewModel(handle.db, cache, student.userId, NOW);
    expect(model.status).toBe("ready");
    // Exactly one is primary, the other appears once in otherPrograms - no card is ever duplicated.
    expect(model.otherPrograms).toHaveLength(1);
  });
});

describe("required test: active program selection", () => {
  it("auto-selects the only accessible program", async () => {
    const student = await createUser(handle.db, {
      emailNormalized: "only-program@example.id",
      phoneE164: null,
    });
    const program = await makeProgram("aks-2026", "Kelas Akselerasi 2026");
    await grantProgramAccess(student.userId, "aks-2026", "purchase", "order-1");

    const model = await buildHomeViewModel(handle.db, cache, student.userId, NOW);
    expect(model.primaryProgram?.id).toBe(program.id);
    expect(model.primaryProgram?.primaryReasonCode).toBe("ONLY_PROGRAM");
  });

  it("a manual primary-program choice wins over a more recently active program (locked UX decision)", async () => {
    const student = await createUser(handle.db, {
      emailNormalized: "manual-primary@example.id",
      phoneE164: null,
    });
    const chosen = await makeProgram("aks-2026", "Kelas Akselerasi 2026");
    const otherProgram = await makeProgram("tka-2026", "Paket TKA 2026");
    await grantProgramAccess(student.userId, "aks-2026", "purchase", "order-chosen");
    await grantProgramAccess(student.userId, "tka-2026", "purchase", "order-other");

    // First sync creates both enrollments; then the student manually picks "chosen" as primary.
    await syncProgramEnrollments(handle.db, cache, student.userId, NOW);
    await setPrimaryProgram(handle.db, student.userId, chosen.id);

    const model = await buildHomeViewModel(handle.db, cache, student.userId, NOW);
    expect(model.primaryProgram?.id).toBe(chosen.id);
    expect(model.primaryProgram?.primaryReasonCode).toBe("MANUAL_SELECTION");
    expect(model.otherPrograms[0]?.id).toBe(otherProgram.id);
  });
});

describe("required negative test: unauthorized access", () => {
  it("assertProgramAccess denies a program the student has no grant for - direct URL access is not authorized by menu visibility alone", async () => {
    const student = await createUser(handle.db, {
      emailNormalized: "unauthorized@example.id",
      phoneE164: null,
    });
    await makeProgram("locked-program", "Program Terkunci");

    const decision = await assertProgramAccess(handle.db, cache, student.userId, "locked-program", NOW);
    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe("ENTITLEMENT_DENIED");
  });

  it("assertProgramAccess allows a program the student DOES have a grant for", async () => {
    const student = await createUser(handle.db, {
      emailNormalized: "authorized@example.id",
      phoneE164: null,
    });
    await makeProgram("aks-2026", "Kelas Akselerasi 2026");
    await grantProgramAccess(student.userId, "aks-2026", "purchase", "order-1");

    const decision = await assertProgramAccess(handle.db, cache, student.userId, "aks-2026", NOW);
    expect(decision.allowed).toBe(true);
  });
});

describe("setPrimaryProgram - required negative test", () => {
  it("refuses to set a program as primary when the student has no enrollment for it", async () => {
    const student = await createUser(handle.db, {
      emailNormalized: "no-enrollment@example.id",
      phoneE164: null,
    });
    const program = await makeProgram("aks-2026", "Kelas Akselerasi 2026");

    await expect(setPrimaryProgram(handle.db, student.userId, program.id)).rejects.toThrow();
  });
});
