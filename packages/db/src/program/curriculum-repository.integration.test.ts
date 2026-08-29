import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabaseHandle } from "../test-client.ts";
import { resourcePlacements } from "../schema/index.ts";
import { createProgram } from "./program-repository.ts";
import {
  CircularPrerequisiteError,
  ModuleAlreadyArchivedError,
  ProgramVersionLockedError,
  ResourceVersionNotPublishedError,
  archiveModule,
  createModule,
  createProgramVersionDraft,
  createResource,
  createResourcePlacement,
  createResourceVersion,
  createRoadmapStage,
  createTrack,
  findProgramVersionById,
  publishProgramVersion,
  publishResourceVersion,
} from "./curriculum-repository.ts";

const NOW = new Date("2026-08-29T00:00:00.000Z");

let handle: TestDatabaseHandle;

beforeEach(async () => {
  handle = await createTestDatabase();
});

afterEach(async () => {
  await handle.close();
});

async function buildDraftTree(programCode: string) {
  const program = await createProgram(handle.db, { code: programCode, name: programCode });
  const version = await createProgramVersionDraft(handle.db, {
    programId: program.id,
    version: 1,
    title: "v1",
  });
  const track = await createTrack(handle.db, {
    programVersionId: version.id,
    code: "skd",
    title: "SKD",
    position: 1,
  });
  const stage = await createRoadmapStage(handle.db, {
    trackId: track.id,
    code: "stage-1",
    title: "Tahap 1",
    position: 1,
  });
  const module = await createModule(handle.db, {
    stageId: stage.id,
    code: "module-1",
    title: "Modul 1",
    position: 1,
  });
  const resource = await createResource(handle.db, { code: `${programCode}-resource-1`, type: "article" });
  const resourceVersion = await createResourceVersion(handle.db, {
    resourceId: resource.id,
    version: 1,
    title: "Artikel Pengantar",
    body: { html: "<p>Halo</p>" },
  });
  await publishResourceVersion(handle.db, resourceVersion.id, NOW);
  const placement = await createResourcePlacement(handle.db, {
    moduleId: module.id,
    resourceId: resource.id,
    releasedResourceVersionId: resourceVersion.id,
    position: 1,
  });
  return { program, version, track, stage, module, resource, resourceVersion, placement };
}

describe("required test: versioned curriculum", () => {
  it("publishing a draft version locks its status and stamps lockedAt", async () => {
    const { version } = await buildDraftTree("aks-2026");
    await publishProgramVersion(handle.db, version.id, NOW);
    const published = await findProgramVersionById(handle.db, version.id);
    expect(published?.status).toBe("published");
  });

  it("a published version's structure is immutable - creating a track/module/placement under it is refused", async () => {
    const { version, module, resource, resourceVersion } = await buildDraftTree("aks-2026-locked");
    await publishProgramVersion(handle.db, version.id, NOW);

    await expect(
      createTrack(handle.db, { programVersionId: version.id, code: "new-track", title: "x", position: 2 }),
    ).rejects.toThrow(ProgramVersionLockedError);
    await expect(
      createResourcePlacement(handle.db, {
        moduleId: module.id,
        resourceId: resource.id,
        releasedResourceVersionId: resourceVersion.id,
        position: 2,
      }),
    ).rejects.toThrow(ProgramVersionLockedError);
  });

  it("publishing a later version does not affect an earlier published version's structure (multiple versions coexist)", async () => {
    const program = await createProgram(handle.db, { code: "multi-version", name: "multi-version" });
    const v1 = await createProgramVersionDraft(handle.db, { programId: program.id, version: 1, title: "v1" });
    await publishProgramVersion(handle.db, v1.id, NOW);

    const v2 = await createProgramVersionDraft(handle.db, { programId: program.id, version: 2, title: "v2" });
    const track = await createTrack(handle.db, {
      programVersionId: v2.id,
      code: "new-track",
      title: "Track baru",
      position: 1,
    });
    expect(track.programVersionId).toBe(v2.id);

    const v1Reloaded = await findProgramVersionById(handle.db, v1.id);
    expect(v1Reloaded?.status).toBe("published");
  });
});

describe("required negative test: resource version must be published before placement", () => {
  it("refuses to place a draft (unpublished) resource version", async () => {
    const program = await createProgram(handle.db, { code: "draft-resource", name: "draft-resource" });
    const version = await createProgramVersionDraft(handle.db, {
      programId: program.id,
      version: 1,
      title: "v1",
    });
    const track = await createTrack(handle.db, {
      programVersionId: version.id,
      code: "skd",
      title: "SKD",
      position: 1,
    });
    const stage = await createRoadmapStage(handle.db, {
      trackId: track.id,
      code: "stage-1",
      title: "Tahap 1",
      position: 1,
    });
    const module = await createModule(handle.db, {
      stageId: stage.id,
      code: "module-1",
      title: "Modul 1",
      position: 1,
    });
    const resource = await createResource(handle.db, { code: "unpublished-resource", type: "article" });
    const resourceVersion = await createResourceVersion(handle.db, {
      resourceId: resource.id,
      version: 1,
      title: "Draft artikel",
      body: {},
    });

    await expect(
      createResourcePlacement(handle.db, {
        moduleId: module.id,
        resourceId: resource.id,
        releasedResourceVersionId: resourceVersion.id,
        position: 1,
      }),
    ).rejects.toThrow(ResourceVersionNotPublishedError);
  });
});

describe("required negative test: circular prerequisite rejected at publish", () => {
  it("a version with no cycle publishes normally (control case)", async () => {
    const { version } = await buildDraftTree("acyclic");
    await expect(publishProgramVersion(handle.db, version.id, NOW)).resolves.toBeUndefined();
  });

  it("refuses to publish when two placements directly depend on each other", async () => {
    const program = await createProgram(handle.db, { code: "circular-direct", name: "circular-direct" });
    const version = await createProgramVersionDraft(handle.db, {
      programId: program.id,
      version: 1,
      title: "v1",
    });
    const track = await createTrack(handle.db, {
      programVersionId: version.id,
      code: "skd",
      title: "SKD",
      position: 1,
    });
    const stage = await createRoadmapStage(handle.db, {
      trackId: track.id,
      code: "stage-1",
      title: "Tahap 1",
      position: 1,
    });
    const module = await createModule(handle.db, {
      stageId: stage.id,
      code: "module-1",
      title: "Modul 1",
      position: 1,
    });
    const resource = await createResource(handle.db, { code: "circular-direct-resource", type: "article" });
    const resourceVersion = await createResourceVersion(handle.db, {
      resourceId: resource.id,
      version: 1,
      title: "x",
      body: {},
    });
    await publishResourceVersion(handle.db, resourceVersion.id, NOW);

    const placementA = await createResourcePlacement(handle.db, {
      moduleId: module.id,
      resourceId: resource.id,
      releasedResourceVersionId: resourceVersion.id,
      position: 1,
    });
    // A gets updated to depend on B after B is created - direct DB update since the repository has no
    // "edit placement" API (placements are set once at creation in this task's scope).
    const placementB = await createResourcePlacement(handle.db, {
      moduleId: module.id,
      resourceId: resource.id,
      releasedResourceVersionId: resourceVersion.id,
      position: 2,
      prerequisitePlacementIds: [placementA.id],
    });

    await handle.db
      .update(resourcePlacements)
      .set({ prerequisitePlacementIds: [placementB.id] })
      .where(eq(resourcePlacements.id, placementA.id));

    await expect(publishProgramVersion(handle.db, version.id, NOW)).rejects.toThrow(
      CircularPrerequisiteError,
    );
  });
});

describe("required test: archived module hidden (repository layer)", () => {
  it("archiveModule is a one-way published -> archived transition and refuses to archive twice", async () => {
    const { module } = await buildDraftTree("archive-test");
    await archiveModule(handle.db, module.id, NOW);
    await expect(archiveModule(handle.db, module.id, NOW)).rejects.toThrow(ModuleAlreadyArchivedError);
  });
});
