import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createInMemoryEffectiveAccessCache, type EffectiveAccessCache } from "@superlatif/domain/access";
import { createUser } from "../identity/repository.ts";
import { createTestDatabase, type TestDatabaseHandle } from "../test-client.ts";
import { createPolicyDraft, publishPolicyVersion } from "../access/policy-repository.ts";
import { issueGrant } from "../access/grant-repository.ts";
import { createProgram } from "./program-repository.ts";
import { syncProgramEnrollments } from "./enrollment-service.ts";
import {
  archiveModule,
  createModule,
  createProgramVersionDraft,
  createResource,
  createResourcePlacement,
  createResourceVersion,
  createRoadmapStage,
  createTrack,
  publishProgramVersion,
  publishResourceVersion,
} from "./curriculum-repository.ts";
import { getProgramCurriculum } from "./curriculum-service.ts";

const NOW = new Date("2026-08-29T00:00:00.000Z");
const LATER = new Date("2026-09-10T00:00:00.000Z");

let handle: TestDatabaseHandle;
let cache: EffectiveAccessCache;

beforeEach(async () => {
  handle = await createTestDatabase();
  cache = createInMemoryEffectiveAccessCache();
});

afterEach(async () => {
  await handle.close();
});

function policyCodeFor(sourceId: string): string {
  return `${sourceId.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_POLICY`;
}

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

async function grantProgramAccess(userId: string, programCode: string, sourceId: string): Promise<void> {
  const policyCode = policyCodeFor(sourceId);
  const policy = await createPolicyDraft(handle.db, {
    code: policyCode,
    version: 1,
    title: policyCode,
    config: programPolicyConfig(programCode, policyCode),
  });
  await publishPolicyVersion(handle.db, policy.id, NOW);
  await issueGrant(handle.db, {
    userId,
    sourceType: "purchase",
    sourceId,
    sourceKey: sourceId,
    accessPolicyId: policy.id,
    validFrom: new Date("2026-08-01T00:00:00.000Z"),
    validTo: null,
  });
}

/** Builds one module with a given release rule, inside its own fresh track/stage, under the given draft version. Returns the module id. */
async function addModule(
  programVersionId: string,
  trackCode: string,
  moduleCode: string,
  releaseConfig: Record<string, unknown> = {},
): Promise<string> {
  const track = await createTrack(handle.db, {
    programVersionId,
    code: trackCode,
    title: trackCode,
    position: 1,
  });
  const stage = await createRoadmapStage(handle.db, {
    trackId: track.id,
    code: `${trackCode}-stage`,
    title: "Stage",
    position: 1,
  });
  const module = await createModule(handle.db, {
    stageId: stage.id,
    code: moduleCode,
    title: moduleCode,
    position: 1,
    releaseConfig,
  });
  const resource = await createResource(handle.db, { code: `${moduleCode}-resource`, type: "article" });
  const resourceVersion = await createResourceVersion(handle.db, {
    resourceId: resource.id,
    version: 1,
    title: "x",
    body: {},
  });
  await publishResourceVersion(handle.db, resourceVersion.id, NOW);
  await createResourcePlacement(handle.db, {
    moduleId: module.id,
    resourceId: resource.id,
    releasedResourceVersionId: resourceVersion.id,
    position: 1,
  });
  return module.id;
}

describe("required test: pinned learner behavior", () => {
  it("an enrollment created before any version is published stays unpinned, then pins to the first version it observes as published", async () => {
    const student = await createUser(handle.db, {
      emailNormalized: "pin-before@example.id",
      phoneE164: null,
    });
    const program = await createProgram(handle.db, { code: "aks-2026", name: "Kelas Akselerasi 2026" });
    await grantProgramAccess(student.userId, "aks-2026", "order-pin-before");

    const [enrollmentBeforePublish] = await syncProgramEnrollments(handle.db, cache, student.userId, NOW);
    expect(enrollmentBeforePublish?.pinnedProgramVersionId).toBeNull();

    const v1 = await createProgramVersionDraft(handle.db, { programId: program.id, version: 1, title: "v1" });
    await publishProgramVersion(handle.db, v1.id, NOW);

    const [enrollmentAfterPublish] = await syncProgramEnrollments(handle.db, cache, student.userId, LATER);
    expect(enrollmentAfterPublish?.pinnedProgramVersionId).toBe(v1.id);
  });

  it("an existing learner's pin does NOT move when a newer version publishes later - a new learner enrolling after publish gets the new version", async () => {
    const program = await createProgram(handle.db, { code: "skd-2026", name: "Paket SKD 2026" });
    const v1 = await createProgramVersionDraft(handle.db, { programId: program.id, version: 1, title: "v1" });
    await publishProgramVersion(handle.db, v1.id, NOW);

    const existingLearner = await createUser(handle.db, {
      emailNormalized: "existing@example.id",
      phoneE164: null,
    });
    await grantProgramAccess(existingLearner.userId, "skd-2026", "order-existing");
    await syncProgramEnrollments(handle.db, cache, existingLearner.userId, NOW);

    const v2 = await createProgramVersionDraft(handle.db, { programId: program.id, version: 2, title: "v2" });
    await publishProgramVersion(handle.db, v2.id, LATER);

    const [existingAfterV2] = await syncProgramEnrollments(handle.db, cache, existingLearner.userId, LATER);
    expect(existingAfterV2?.pinnedProgramVersionId).toBe(v1.id); // unchanged - "existing learners retain pinned behavior"

    const newLearner = await createUser(handle.db, {
      emailNormalized: "new-learner@example.id",
      phoneE164: null,
    });
    await grantProgramAccess(newLearner.userId, "skd-2026", "order-new");
    const [newLearnerEnrollment] = await syncProgramEnrollments(handle.db, cache, newLearner.userId, LATER);
    expect(newLearnerEnrollment?.pinnedProgramVersionId).toBe(v2.id);
  });
});

describe("required test: scheduled and drip release", () => {
  it("a fixed_datetime (scheduled) module is locked before its release time and released after", async () => {
    const student = await createUser(handle.db, { emailNormalized: "scheduled@example.id", phoneE164: null });
    const program = await createProgram(handle.db, { code: "scheduled-program", name: "scheduled-program" });
    const version = await createProgramVersionDraft(handle.db, {
      programId: program.id,
      version: 1,
      title: "v1",
    });
    await addModule(version.id, "track-a", "future-module", {
      mode: "fixed_datetime",
      releaseAt: "2026-09-05T00:00:00.000Z",
    });
    await publishProgramVersion(handle.db, version.id, NOW);
    await grantProgramAccess(student.userId, "scheduled-program", "order-scheduled");
    await syncProgramEnrollments(handle.db, cache, student.userId, NOW);

    const beforeRelease = await getProgramCurriculum(
      handle.db,
      cache,
      student.userId,
      "scheduled-program",
      NOW,
    );
    expect(beforeRelease.kind).toBe("ready");
    expect(beforeRelease.kind === "ready" && beforeRelease.curriculum.modules[0]?.visibility).toBe("locked");

    const afterRelease = await getProgramCurriculum(
      handle.db,
      cache,
      student.userId,
      "scheduled-program",
      LATER,
    );
    expect(afterRelease.kind === "ready" && afterRelease.curriculum.modules[0]?.visibility).toBe("released");
  });

  it("a relative_to_enrollment (drip) module locks/releases per-learner based on THEIR OWN enrollment date", async () => {
    const program = await createProgram(handle.db, { code: "drip-program", name: "drip-program" });
    const version = await createProgramVersionDraft(handle.db, {
      programId: program.id,
      version: 1,
      title: "v1",
    });
    await addModule(version.id, "track-a", "drip-module", { mode: "relative_to_enrollment", offsetDays: 7 });
    await publishProgramVersion(handle.db, version.id, NOW);

    const earlyStudent = await createUser(handle.db, {
      emailNormalized: "drip-early@example.id",
      phoneE164: null,
    });
    await grantProgramAccess(earlyStudent.userId, "drip-program", "order-drip-early");
    await syncProgramEnrollments(handle.db, cache, earlyStudent.userId, NOW); // enrolledAt = NOW

    const lateStudent = await createUser(handle.db, {
      emailNormalized: "drip-late@example.id",
      phoneE164: null,
    });
    await grantProgramAccess(lateStudent.userId, "drip-program", "order-drip-late");
    await syncProgramEnrollments(handle.db, cache, lateStudent.userId, LATER); // enrolledAt = LATER (2026-09-10)

    // At LATER (11 days after the early student's enrollment, 0 days after the late student's):
    const earlyResult = await getProgramCurriculum(
      handle.db,
      cache,
      earlyStudent.userId,
      "drip-program",
      LATER,
    );
    const lateResult = await getProgramCurriculum(
      handle.db,
      cache,
      lateStudent.userId,
      "drip-program",
      LATER,
    );
    expect(earlyResult.kind === "ready" && earlyResult.curriculum.modules[0]?.visibility).toBe("released");
    expect(lateResult.kind === "ready" && lateResult.curriculum.modules[0]?.visibility).toBe("locked");
  });
});

describe("required test: archived module hidden", () => {
  it("an archived module never appears in the learner's curriculum, while its siblings still do", async () => {
    const student = await createUser(handle.db, { emailNormalized: "archived@example.id", phoneE164: null });
    const program = await createProgram(handle.db, { code: "archive-program", name: "archive-program" });
    const version = await createProgramVersionDraft(handle.db, {
      programId: program.id,
      version: 1,
      title: "v1",
    });
    const keepModuleId = await addModule(version.id, "track-a", "keep-module");
    const archiveModuleId = await addModule(version.id, "track-b", "archive-module");
    await publishProgramVersion(handle.db, version.id, NOW);
    await archiveModule(handle.db, archiveModuleId, NOW);

    await grantProgramAccess(student.userId, "archive-program", "order-archive");
    await syncProgramEnrollments(handle.db, cache, student.userId, NOW);

    const result = await getProgramCurriculum(handle.db, cache, student.userId, "archive-program", NOW);
    expect(result.kind).toBe("ready");
    const moduleIds = result.kind === "ready" ? result.curriculum.modules.map((m) => m.id) : [];
    expect(moduleIds).toContain(keepModuleId);
    expect(moduleIds).not.toContain(archiveModuleId);
  });
});

describe("required negative test: unauthorized access", () => {
  it("getProgramCurriculum denies a program the student has no grant for", async () => {
    const student = await createUser(handle.db, {
      emailNormalized: "curriculum-unauthorized@example.id",
      phoneE164: null,
    });
    await createProgram(handle.db, { code: "locked-curriculum", name: "locked-curriculum" });

    const result = await getProgramCurriculum(handle.db, cache, student.userId, "locked-curriculum", NOW);
    expect(result.kind).toBe("denied");
    expect(result.kind === "denied" && result.reasonCode).toBe("ENTITLEMENT_DENIED");
  });

  it("returns no_published_version when the student has real access but nothing has been published yet", async () => {
    const student = await createUser(handle.db, {
      emailNormalized: "no-version@example.id",
      phoneE164: null,
    });
    await createProgram(handle.db, { code: "unpublished-program", name: "unpublished-program" });
    await grantProgramAccess(student.userId, "unpublished-program", "order-unpublished");
    await syncProgramEnrollments(handle.db, cache, student.userId, NOW);

    const result = await getProgramCurriculum(handle.db, cache, student.userId, "unpublished-program", NOW);
    expect(result.kind).toBe("no_published_version");
  });
});
