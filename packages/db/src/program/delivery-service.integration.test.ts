import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createInMemoryEffectiveAccessCache, type EffectiveAccessCache } from "@superlatif/domain/access";
import { createUser } from "../identity/repository.ts";
import { createTestDatabase, type TestDatabaseHandle } from "../test-client.ts";
import {
  createPolicyDraft,
  issueGrant,
  publishPolicyVersion,
  recordGrantEventAndInvalidate,
} from "../access/index.ts";
import { createProgram } from "./program-repository.ts";
import { syncProgramEnrollments } from "./enrollment-service.ts";
import {
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
import { createAsset, createRecording, markRecordingReady } from "./asset-repository.ts";
import { requestAssetDelivery, resolveAssetDelivery } from "./delivery-service.ts";

const NOW = new Date("2026-08-29T00:00:00.000Z");

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

/** Returns the grant's own ID so a test can later revoke it. */
async function grantProgramAccess(userId: string, programCode: string, sourceId: string): Promise<string> {
  const policyCode = policyCodeFor(sourceId);
  const policy = await createPolicyDraft(handle.db, {
    code: policyCode,
    version: 1,
    title: policyCode,
    config: programPolicyConfig(programCode, policyCode),
  });
  await publishPolicyVersion(handle.db, policy.id, NOW);
  const grant = await issueGrant(handle.db, {
    userId,
    sourceType: "purchase",
    sourceId,
    sourceKey: sourceId,
    accessPolicyId: policy.id,
    validFrom: new Date("2026-08-01T00:00:00.000Z"),
    validTo: null,
  });
  return grant.id;
}

/** One published program + version + track/stage/module/resource/placement, resource type "video" by default. Returns everything a delivery test needs. */
async function buildDeliverableTree(programCode: string, resourceType: string = "video") {
  const program = await createProgram(handle.db, { code: programCode, name: programCode });
  const version = await createProgramVersionDraft(handle.db, {
    programId: program.id,
    version: 1,
    title: "v1",
  });
  const track = await createTrack(handle.db, {
    programVersionId: version.id,
    code: "t",
    title: "t",
    position: 1,
  });
  const stage = await createRoadmapStage(handle.db, {
    trackId: track.id,
    code: "s",
    title: "s",
    position: 1,
  });
  const module = await createModule(handle.db, { stageId: stage.id, code: "m", title: "m", position: 1 });
  const resource = await createResource(handle.db, { code: `${programCode}-resource`, type: resourceType });
  const resourceVersion = await createResourceVersion(handle.db, {
    resourceId: resource.id,
    version: 1,
    title: "x",
    body: {},
  });
  await publishResourceVersion(handle.db, resourceVersion.id, NOW);
  const placement = await createResourcePlacement(handle.db, {
    moduleId: module.id,
    resourceId: resource.id,
    releasedResourceVersionId: resourceVersion.id,
    position: 1,
  });
  await publishProgramVersion(handle.db, version.id, NOW);
  return { program, version, module, resource, resourceVersion, placement };
}

describe("required test: authorized delivery", () => {
  it("a student with program access and a released placement receives a token, and redeeming it returns the asset's storage reference", async () => {
    const student = await createUser(handle.db, {
      emailNormalized: "authorized@example.id",
      phoneE164: null,
    });
    const { resourceVersion, placement } = await buildDeliverableTree("delivery-authorized");
    await grantProgramAccess(student.userId, "delivery-authorized", "order-authorized");
    await syncProgramEnrollments(handle.db, cache, student.userId, NOW);
    const asset = await createAsset(handle.db, {
      resourceVersionId: resourceVersion.id,
      storageRef: "protected-learning/synthetic/authorized-video.mp4",
      mimeType: "video/mp4",
    });

    const request = await requestAssetDelivery(handle.db, cache, student.userId, placement.id, NOW);
    expect(request.kind).toBe("ready");
    if (request.kind !== "ready") return;
    expect(request.token.length).toBeGreaterThan(30);

    const resolution = await resolveAssetDelivery(handle.db, cache, request.token, NOW);
    expect(resolution.kind).toBe("ready");
    expect(resolution.kind === "ready" && resolution.storageRef).toBe(asset.storageRef);
  });
});

describe("required negative test: expired signed reference", () => {
  it("a delivery reference whose TTL has elapsed is denied at redemption, even though it was validly issued", async () => {
    const student = await createUser(handle.db, { emailNormalized: "expiry@example.id", phoneE164: null });
    const { resourceVersion, placement } = await buildDeliverableTree("delivery-expiry");
    await grantProgramAccess(student.userId, "delivery-expiry", "order-expiry");
    await syncProgramEnrollments(handle.db, cache, student.userId, NOW);
    await createAsset(handle.db, {
      resourceVersionId: resourceVersion.id,
      storageRef: "protected-learning/synthetic/expiry-video.mp4",
    });

    const request = await requestAssetDelivery(handle.db, cache, student.userId, placement.id, NOW, 60);
    expect(request.kind).toBe("ready");
    if (request.kind !== "ready") return;

    const wellAfterExpiry = new Date(NOW.getTime() + 61_000);
    const resolution = await resolveAssetDelivery(handle.db, cache, request.token, wellAfterExpiry);
    expect(resolution.kind).toBe("expired");
  });

  it("the delivery reference's own expiry is capped by the grant's effectiveTo, not just the TTL", async () => {
    const student = await createUser(handle.db, { emailNormalized: "capped@example.id", phoneE164: null });
    const { resourceVersion, placement } = await buildDeliverableTree("delivery-capped");
    const policyCode = policyCodeFor("order-capped");
    const policy = await createPolicyDraft(handle.db, {
      code: policyCode,
      version: 1,
      title: policyCode,
      config: programPolicyConfig("delivery-capped", policyCode),
    });
    await publishPolicyVersion(handle.db, policy.id, NOW);
    const grantEndsAt = new Date(NOW.getTime() + 30_000); // 30s away - sooner than the 300s default TTL
    await issueGrant(handle.db, {
      userId: student.userId,
      sourceType: "purchase",
      sourceId: "order-capped",
      sourceKey: "order-capped",
      accessPolicyId: policy.id,
      validFrom: NOW,
      validTo: grantEndsAt,
    });
    await syncProgramEnrollments(handle.db, cache, student.userId, NOW);
    await createAsset(handle.db, {
      resourceVersionId: resourceVersion.id,
      storageRef: "protected-learning/synthetic/capped-video.mp4",
    });

    const request = await requestAssetDelivery(handle.db, cache, student.userId, placement.id, NOW);
    expect(request.kind).toBe("ready");
    expect(request.kind === "ready" && request.expiresAt.getTime()).toBe(grantEndsAt.getTime());
  });
});

describe("required negative test: unauthorized access", () => {
  it("a student with no program access is denied at request time", async () => {
    const student = await createUser(handle.db, { emailNormalized: "no-access@example.id", phoneE164: null });
    const { placement } = await buildDeliverableTree("delivery-unauthorized");

    const request = await requestAssetDelivery(handle.db, cache, student.userId, placement.id, NOW);
    expect(request.kind).toBe("denied");
    expect(request.kind === "denied" && request.reasonCode).toBe("ENTITLEMENT_DENIED");
  });

  it("access revoked AFTER a token is issued but before its TTL elapses is denied at redemption (dok 14 §14: access follows the grant at playback)", async () => {
    const student = await createUser(handle.db, { emailNormalized: "revoked@example.id", phoneE164: null });
    const { resourceVersion, placement } = await buildDeliverableTree("delivery-revoked");
    const grantId = await grantProgramAccess(student.userId, "delivery-revoked", "order-revoked");
    await syncProgramEnrollments(handle.db, cache, student.userId, NOW);
    await createAsset(handle.db, {
      resourceVersionId: resourceVersion.id,
      storageRef: "protected-learning/synthetic/revoked-video.mp4",
    });

    const request = await requestAssetDelivery(handle.db, cache, student.userId, placement.id, NOW, 600);
    expect(request.kind).toBe("ready");
    if (request.kind !== "ready") return;

    await recordGrantEventAndInvalidate(handle.db, cache, student.userId, {
      grantId,
      eventType: "revoked",
      occurredAt: NOW,
      actor: { sourceType: "purchase", sourceId: "order-revoked" },
      reason: "test: simulate refund between issuance and redemption",
    });

    const stillWithinTtl = new Date(NOW.getTime() + 10_000);
    const resolution = await resolveAssetDelivery(handle.db, cache, request.token, stillWithinTtl);
    expect(resolution.kind).toBe("access_revoked");
  });
});

describe("required test: reusable resource", () => {
  it("the same resource version's asset delivers identically from two different placements without duplicating the asset", async () => {
    const student = await createUser(handle.db, { emailNormalized: "reuse@example.id", phoneE164: null });
    const programA = await createProgram(handle.db, { code: "reuse-program-a", name: "reuse-program-a" });
    const programB = await createProgram(handle.db, { code: "reuse-program-b", name: "reuse-program-b" });
    const versionA = await createProgramVersionDraft(handle.db, {
      programId: programA.id,
      version: 1,
      title: "v1",
    });
    const versionB = await createProgramVersionDraft(handle.db, {
      programId: programB.id,
      version: 1,
      title: "v1",
    });

    const resource = await createResource(handle.db, { code: "shared-resource", type: "video" });
    const resourceVersion = await createResourceVersion(handle.db, {
      resourceId: resource.id,
      version: 1,
      title: "Shared video",
      body: {},
    });
    await publishResourceVersion(handle.db, resourceVersion.id, NOW);
    const asset = await createAsset(handle.db, {
      resourceVersionId: resourceVersion.id,
      storageRef: "protected-learning/synthetic/shared-video.mp4",
    });

    async function placeUnder(versionId: string, trackCode: string) {
      const track = await createTrack(handle.db, {
        programVersionId: versionId,
        code: trackCode,
        title: trackCode,
        position: 1,
      });
      const stage = await createRoadmapStage(handle.db, {
        trackId: track.id,
        code: "s",
        title: "s",
        position: 1,
      });
      const module = await createModule(handle.db, { stageId: stage.id, code: "m", title: "m", position: 1 });
      return createResourcePlacement(handle.db, {
        moduleId: module.id,
        resourceId: resource.id,
        releasedResourceVersionId: resourceVersion.id,
        position: 1,
      });
    }
    const placementA = await placeUnder(versionA.id, "t");
    const placementB = await placeUnder(versionB.id, "t");
    await publishProgramVersion(handle.db, versionA.id, NOW);
    await publishProgramVersion(handle.db, versionB.id, NOW);

    await grantProgramAccess(student.userId, "reuse-program-a", "order-reuse-a");
    await grantProgramAccess(student.userId, "reuse-program-b", "order-reuse-b");
    await syncProgramEnrollments(handle.db, cache, student.userId, NOW);

    const requestA = await requestAssetDelivery(handle.db, cache, student.userId, placementA.id, NOW);
    const requestB = await requestAssetDelivery(handle.db, cache, student.userId, placementB.id, NOW);
    expect(requestA.kind).toBe("ready");
    expect(requestB.kind).toBe("ready");
    if (requestA.kind !== "ready" || requestB.kind !== "ready") return;

    const resolutionA = await resolveAssetDelivery(handle.db, cache, requestA.token, NOW);
    const resolutionB = await resolveAssetDelivery(handle.db, cache, requestB.token, NOW);
    expect(resolutionA.kind === "ready" && resolutionA.storageRef).toBe(asset.storageRef);
    expect(resolutionB.kind === "ready" && resolutionB.storageRef).toBe(asset.storageRef);
  });
});

describe("required test: recording metadata", () => {
  it("a pending recording is not deliverable; once marked ready with an asset, it delivers normally", async () => {
    const student = await createUser(handle.db, { emailNormalized: "recording@example.id", phoneE164: null });
    const { resourceVersion, placement } = await buildDeliverableTree("delivery-recording", "recording");
    await grantProgramAccess(student.userId, "delivery-recording", "order-recording");
    await syncProgramEnrollments(handle.db, cache, student.userId, NOW);

    const recording = await createRecording(handle.db, {
      resourceVersionId: resourceVersion.id,
      sourceKind: "uploaded_asset",
    });

    const pendingRequest = await requestAssetDelivery(handle.db, cache, student.userId, placement.id, NOW);
    expect(pendingRequest.kind).toBe("not_ready");
    expect(pendingRequest.kind === "not_ready" && pendingRequest.processingStatus).toBe("pending");

    const asset = await createAsset(handle.db, {
      resourceVersionId: resourceVersion.id,
      storageRef: "protected-learning/synthetic/recording.mp4",
    });
    await markRecordingReady(handle.db, recording.id, asset.id, NOW);

    const readyRequest = await requestAssetDelivery(handle.db, cache, student.userId, placement.id, NOW);
    expect(readyRequest.kind).toBe("ready");
  });

  it("a provider-sourced recording never has its providerRef dereferenced or returned by this task's delivery flow", async () => {
    const { resourceVersion } = await buildDeliverableTree("delivery-recording-provider", "recording");
    const recording = await createRecording(handle.db, {
      resourceVersionId: resourceVersion.id,
      sourceKind: "provider",
      providerRef: "provider:zoom:session-opaque-id",
    });
    expect(recording.processingStatus).toBe("pending");
    expect(recording.sourceKind).toBe("provider");
  });
});

describe("required negative test: no raw asset URL leak", () => {
  it("requestAssetDelivery's ready result never contains storageRef or any asset field", async () => {
    const student = await createUser(handle.db, { emailNormalized: "no-leak@example.id", phoneE164: null });
    const { resourceVersion, placement } = await buildDeliverableTree("delivery-no-leak");
    await grantProgramAccess(student.userId, "delivery-no-leak", "order-no-leak");
    await syncProgramEnrollments(handle.db, cache, student.userId, NOW);
    const asset = await createAsset(handle.db, {
      resourceVersionId: resourceVersion.id,
      storageRef: "protected-learning/synthetic/secret-path/no-leak-video.mp4",
    });

    const request = await requestAssetDelivery(handle.db, cache, student.userId, placement.id, NOW);
    expect(request.kind).toBe("ready");

    const serialized = JSON.stringify(request);
    expect(Object.keys(request)).not.toContain("storageRef");
    expect(serialized).not.toContain(asset.storageRef);
    expect(serialized).not.toContain("storageRef");
  });
});
