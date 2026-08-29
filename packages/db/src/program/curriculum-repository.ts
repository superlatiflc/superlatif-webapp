// Versioned curriculum persistence (PRG-002).
//
// Mirrors packages/db/src/access/policy-repository.ts's draft -> publish
// discipline: every write that attaches structure to a program version
// (track/stage/module/placement) is refused once that version's status is
// no longer "draft" (`ProgramVersionLockedError`) - the same "published
// artifacts are immutable" invariant, enforced at the SERVICE layer here
// because a program version's content is a relational tree, not one JSON
// document a checksum can cover in one shot (see curriculum.ts's module
// doc).

import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { findCircularPrerequisite, type PrerequisiteEdge } from "@superlatif/domain/program";
import type { Queryable, Schema } from "../db-types.ts";
import {
  modules,
  programVersions,
  resourcePlacements,
  resourceVersions,
  resources,
  roadmapStages,
  tracks,
} from "../schema/index.ts";

const nowColumns = { status: programVersions.status };

export class ProgramVersionNotFoundError extends Error {
  constructor(programVersionId: string) {
    super(`Program version ${programVersionId} not found`);
    this.name = "ProgramVersionNotFoundError";
  }
}

export class ProgramVersionLockedError extends Error {
  constructor(programVersionId: string, status: string) {
    super(
      `Program version ${programVersionId} is "${status}", not "draft" - cannot attach or modify curriculum structure`,
    );
    this.name = "ProgramVersionLockedError";
  }
}

export class ResourceVersionNotPublishedError extends Error {
  constructor(resourceVersionId: string) {
    super(`Resource version ${resourceVersionId} is not published - cannot be placed in a module`);
    this.name = "ResourceVersionNotPublishedError";
  }
}

export class CircularPrerequisiteError extends Error {
  readonly cycle: readonly string[];

  constructor(cycle: readonly string[]) {
    super(`Publishing this program version would create a circular prerequisite: ${cycle.join(" -> ")}`);
    this.name = "CircularPrerequisiteError";
    this.cycle = cycle;
  }
}

async function assertProgramVersionIsDraft(db: Queryable<Schema>, programVersionId: string): Promise<void> {
  const [row] = await db
    .select(nowColumns)
    .from(programVersions)
    .where(eq(programVersions.id, programVersionId))
    .limit(1);
  if (!row) throw new ProgramVersionNotFoundError(programVersionId);
  if (row.status !== "draft") throw new ProgramVersionLockedError(programVersionId, row.status);
}

export interface ProgramVersionRow {
  readonly id: string;
  readonly programId: string;
  readonly version: number;
  readonly title: string;
  readonly status: string;
}

const PROGRAM_VERSION_COLUMNS = {
  id: programVersions.id,
  programId: programVersions.programId,
  version: programVersions.version,
  title: programVersions.title,
  status: programVersions.status,
};

export interface CreateProgramVersionDraftInput {
  readonly programId: string;
  readonly version: number;
  readonly title: string;
  readonly startsAt?: Date | null;
  readonly endsAt?: Date | null;
}

/** Creates a new draft curriculum version - mutable until publishProgramVersion locks it. Publishing an earlier version does not prevent drafting a later one; multiple draft/published versions of the same program can coexist (dok 14 §3: "Satu program boleh memiliki beberapa version"). */
export async function createProgramVersionDraft(
  db: Queryable<Schema>,
  input: CreateProgramVersionDraftInput,
): Promise<ProgramVersionRow> {
  const [row] = await db
    .insert(programVersions)
    .values({
      programId: input.programId,
      version: input.version,
      title: input.title,
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
    })
    .returning(PROGRAM_VERSION_COLUMNS);
  if (!row) throw new Error("createProgramVersionDraft: insert returned no row");
  return row;
}

export async function findProgramVersionById(
  db: Queryable<Schema>,
  programVersionId: string,
): Promise<ProgramVersionRow | null> {
  const [row] = await db
    .select(PROGRAM_VERSION_COLUMNS)
    .from(programVersions)
    .where(eq(programVersions.id, programVersionId))
    .limit(1);
  return row ?? null;
}

/** The highest-numbered PUBLISHED version for a program, or null if none has ever been published yet. "Current" for pinning purposes (enrollment-service.ts#syncProgramEnrollments) - publishing a new version never changes what an already-pinned enrollment sees. */
export async function findCurrentPublishedProgramVersion(
  db: Queryable<Schema>,
  programId: string,
): Promise<ProgramVersionRow | null> {
  const rows = await db
    .select(PROGRAM_VERSION_COLUMNS)
    .from(programVersions)
    .where(and(eq(programVersions.programId, programId), eq(programVersions.status, "published")));
  if (rows.length === 0) return null;
  return rows.reduce((latest, row) => (row.version > latest.version ? row : latest));
}

async function loadPlacementEdgesForVersion(
  db: Queryable<Schema>,
  programVersionId: string,
): Promise<PrerequisiteEdge[]> {
  const rows = await db
    .select({
      id: resourcePlacements.id,
      prerequisitePlacementIds: resourcePlacements.prerequisitePlacementIds,
    })
    .from(resourcePlacements)
    .innerJoin(modules, eq(resourcePlacements.moduleId, modules.id))
    .innerJoin(roadmapStages, eq(modules.stageId, roadmapStages.id))
    .innerJoin(tracks, eq(roadmapStages.trackId, tracks.id))
    .where(eq(tracks.programVersionId, programVersionId));
  return rows.map((row) => ({ placementId: row.id, prerequisitePlacementIds: row.prerequisitePlacementIds }));
}

/**
 * The one narrow, one-way exception to "program versions never update":
 * advances status draft -> published and stamps lockedAt. Refuses to
 * publish if the version's own prerequisite graph contains a cycle (dok 14
 * §6: "Circular dependency ditolak saat publish") - checked across every
 * placement under this version, not per module, since a prerequisite can
 * point anywhere in the same version.
 */
export async function publishProgramVersion(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  programVersionId: string,
  now: Date,
): Promise<void> {
  const edges = await loadPlacementEdgesForVersion(db, programVersionId);
  const cycle = findCircularPrerequisite(edges);
  if (cycle) throw new CircularPrerequisiteError(cycle);

  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select(nowColumns)
      .from(programVersions)
      .where(eq(programVersions.id, programVersionId))
      .limit(1);
    if (!existing) throw new ProgramVersionNotFoundError(programVersionId);
    if (existing.status !== "draft") throw new ProgramVersionLockedError(programVersionId, existing.status);
    await tx
      .update(programVersions)
      .set({ status: "published", lockedAt: now })
      .where(eq(programVersions.id, programVersionId));
  });
}

export interface TrackRow {
  readonly id: string;
  readonly programVersionId: string;
  readonly code: string;
  readonly title: string;
  readonly position: number;
  readonly releaseConfig: Record<string, unknown>;
}

export interface CreateTrackInput {
  readonly programVersionId: string;
  readonly code: string;
  readonly title: string;
  readonly position: number;
  readonly releaseConfig?: Record<string, unknown>;
}

export async function createTrack(db: Queryable<Schema>, input: CreateTrackInput): Promise<TrackRow> {
  await assertProgramVersionIsDraft(db, input.programVersionId);
  const [row] = await db
    .insert(tracks)
    .values({
      programVersionId: input.programVersionId,
      code: input.code,
      title: input.title,
      position: input.position,
      releaseConfig: input.releaseConfig ?? {},
    })
    .returning({
      id: tracks.id,
      programVersionId: tracks.programVersionId,
      code: tracks.code,
      title: tracks.title,
      position: tracks.position,
      releaseConfig: tracks.releaseConfig,
    });
  if (!row) throw new Error("createTrack: insert returned no row");
  return row;
}

export interface RoadmapStageRow {
  readonly id: string;
  readonly trackId: string;
  readonly code: string;
  readonly title: string;
  readonly position: number;
}

export interface CreateRoadmapStageInput {
  readonly trackId: string;
  readonly code: string;
  readonly title: string;
  readonly position: number;
  readonly completionConfig?: Record<string, unknown>;
}

async function draftVersionIdForTrack(db: Queryable<Schema>, trackId: string): Promise<string> {
  const [row] = await db
    .select({ programVersionId: tracks.programVersionId })
    .from(tracks)
    .where(eq(tracks.id, trackId))
    .limit(1);
  if (!row) throw new Error(`createRoadmapStage: track ${trackId} not found`);
  return row.programVersionId;
}

export async function createRoadmapStage(
  db: Queryable<Schema>,
  input: CreateRoadmapStageInput,
): Promise<RoadmapStageRow> {
  await assertProgramVersionIsDraft(db, await draftVersionIdForTrack(db, input.trackId));
  const [row] = await db
    .insert(roadmapStages)
    .values({
      trackId: input.trackId,
      code: input.code,
      title: input.title,
      position: input.position,
      completionConfig: input.completionConfig ?? {},
    })
    .returning({
      id: roadmapStages.id,
      trackId: roadmapStages.trackId,
      code: roadmapStages.code,
      title: roadmapStages.title,
      position: roadmapStages.position,
    });
  if (!row) throw new Error("createRoadmapStage: insert returned no row");
  return row;
}

export interface ModuleRow {
  readonly id: string;
  readonly stageId: string;
  readonly code: string;
  readonly title: string;
  readonly position: number;
  readonly status: string;
  readonly releaseConfig: Record<string, unknown>;
}

export interface CreateModuleInput {
  readonly stageId: string;
  readonly code: string;
  readonly title: string;
  readonly position: number;
  readonly releaseConfig?: Record<string, unknown>;
  readonly completionConfig?: Record<string, unknown>;
}

const MODULE_COLUMNS = {
  id: modules.id,
  stageId: modules.stageId,
  code: modules.code,
  title: modules.title,
  position: modules.position,
  status: modules.status,
  releaseConfig: modules.releaseConfig,
};

async function draftVersionIdForStage(db: Queryable<Schema>, stageId: string): Promise<string> {
  const [row] = await db
    .select({ programVersionId: tracks.programVersionId })
    .from(roadmapStages)
    .innerJoin(tracks, eq(roadmapStages.trackId, tracks.id))
    .where(eq(roadmapStages.id, stageId))
    .limit(1);
  if (!row) throw new Error(`createModule: stage ${stageId} not found`);
  return row.programVersionId;
}

/** New modules default to `published` - see curriculum.ts's module doc: there is no independent module-level draft/review workflow in this task, only the parent version's draft gate (checked here) and the one-way `archiveModule` transition below. */
export async function createModule(db: Queryable<Schema>, input: CreateModuleInput): Promise<ModuleRow> {
  await assertProgramVersionIsDraft(db, await draftVersionIdForStage(db, input.stageId));
  const [row] = await db
    .insert(modules)
    .values({
      stageId: input.stageId,
      code: input.code,
      title: input.title,
      position: input.position,
      releaseConfig: input.releaseConfig ?? {},
      completionConfig: input.completionConfig ?? {},
    })
    .returning(MODULE_COLUMNS);
  if (!row) throw new Error("createModule: insert returned no row");
  return row;
}

export class ModuleNotFoundError extends Error {
  constructor(moduleId: string) {
    super(`Module ${moduleId} not found`);
    this.name = "ModuleNotFoundError";
  }
}

export class ModuleAlreadyArchivedError extends Error {
  constructor(moduleId: string) {
    super(`Module ${moduleId} is already archived`);
    this.name = "ModuleAlreadyArchivedError";
  }
}

/** One-way published -> archived transition ("archived module hidden" - founder instruction). Does not require the parent program version to still be draft: retiring a module from an already-published, live curriculum is exactly the case this exists for. */
export async function archiveModule(db: Queryable<Schema>, moduleId: string, now: Date): Promise<void> {
  const [existing] = await db
    .select({ status: modules.status })
    .from(modules)
    .where(eq(modules.id, moduleId))
    .limit(1);
  if (!existing) throw new ModuleNotFoundError(moduleId);
  if (existing.status === "archived") throw new ModuleAlreadyArchivedError(moduleId);
  await db.update(modules).set({ status: "archived", archivedAt: now }).where(eq(modules.id, moduleId));
}

export interface ResourceRow {
  readonly id: string;
  readonly code: string;
  readonly type: string;
}

export async function createResource(
  db: Queryable<Schema>,
  input: { code: string; type: string },
): Promise<ResourceRow> {
  const [row] = await db
    .insert(resources)
    .values(input)
    .returning({ id: resources.id, code: resources.code, type: resources.type });
  if (!row) throw new Error("createResource: insert returned no row");
  return row;
}

export async function findResourceByCode(db: Queryable<Schema>, code: string): Promise<ResourceRow | null> {
  const [row] = await db
    .select({ id: resources.id, code: resources.code, type: resources.type })
    .from(resources)
    .where(eq(resources.code, code))
    .limit(1);
  return row ?? null;
}

export interface ResourceVersionRow {
  readonly id: string;
  readonly resourceId: string;
  readonly version: number;
  readonly title: string;
  readonly status: string;
}

const RESOURCE_VERSION_COLUMNS = {
  id: resourceVersions.id,
  resourceId: resourceVersions.resourceId,
  version: resourceVersions.version,
  title: resourceVersions.title,
  status: resourceVersions.status,
};

export interface CreateResourceVersionInput {
  readonly resourceId: string;
  readonly version: number;
  readonly title: string;
  readonly body: Record<string, unknown>;
  readonly completionPolicy?: Record<string, unknown>;
  readonly accessibilityMetadata?: Record<string, unknown>;
}

/** dok 14 §5: "Edit resource yang sudah dipakai menghasilkan version baru" - a resource's content is never mutated once created, only superseded by a new version row. */
export async function createResourceVersion(
  db: Queryable<Schema>,
  input: CreateResourceVersionInput,
): Promise<ResourceVersionRow> {
  const [row] = await db
    .insert(resourceVersions)
    .values({
      resourceId: input.resourceId,
      version: input.version,
      title: input.title,
      body: input.body,
      completionPolicy: input.completionPolicy ?? {},
      accessibilityMetadata: input.accessibilityMetadata ?? {},
    })
    .returning(RESOURCE_VERSION_COLUMNS);
  if (!row) throw new Error("createResourceVersion: insert returned no row");
  return row;
}

export class ResourceVersionNotFoundError extends Error {
  constructor(resourceVersionId: string) {
    super(`Resource version ${resourceVersionId} not found`);
    this.name = "ResourceVersionNotFoundError";
  }
}

export async function publishResourceVersion(
  db: Queryable<Schema>,
  resourceVersionId: string,
  now: Date,
): Promise<void> {
  const [existing] = await db
    .select({ status: resourceVersions.status })
    .from(resourceVersions)
    .where(eq(resourceVersions.id, resourceVersionId))
    .limit(1);
  if (!existing) throw new ResourceVersionNotFoundError(resourceVersionId);
  if (existing.status !== "draft")
    throw new Error(
      `publishResourceVersion: resource version ${resourceVersionId} is "${existing.status}", not "draft"`,
    );
  await db
    .update(resourceVersions)
    .set({ status: "published", lockedAt: now })
    .where(eq(resourceVersions.id, resourceVersionId));
}

export interface ResourcePlacementRow {
  readonly id: string;
  readonly moduleId: string;
  readonly resourceId: string;
  readonly releasedResourceVersionId: string;
  readonly position: number;
  readonly required: boolean;
  readonly releaseConfig: Record<string, unknown>;
  readonly prerequisitePlacementIds: string[];
}

const PLACEMENT_COLUMNS = {
  id: resourcePlacements.id,
  moduleId: resourcePlacements.moduleId,
  resourceId: resourcePlacements.resourceId,
  releasedResourceVersionId: resourcePlacements.releasedResourceVersionId,
  position: resourcePlacements.position,
  required: resourcePlacements.required,
  releaseConfig: resourcePlacements.releaseConfig,
  prerequisitePlacementIds: resourcePlacements.prerequisitePlacementIds,
};

export interface CreateResourcePlacementInput {
  readonly moduleId: string;
  readonly resourceId: string;
  readonly releasedResourceVersionId: string;
  readonly position: number;
  readonly required?: boolean;
  readonly releaseConfig?: Record<string, unknown>;
  readonly prerequisitePlacementIds?: readonly string[];
}

/**
 * Places a resource version into a module. Guards, in order: the parent
 * program version must still be draft (structure is being assembled, not
 * edited after the fact), and the referenced resource version must already
 * be PUBLISHED (`ResourceVersionNotPublishedError`) - a database foreign
 * key can express "this row exists", not "this row's status is X" (same
 * class of application-layer guard as access.ts's grant/policy pairing).
 */
export async function createResourcePlacement(
  db: Queryable<Schema>,
  input: CreateResourcePlacementInput,
): Promise<ResourcePlacementRow> {
  const stageId = await moduleStageId(db, input.moduleId);
  await assertProgramVersionIsDraft(db, await draftVersionIdForStage(db, stageId));

  const [resourceVersion] = await db
    .select({ status: resourceVersions.status })
    .from(resourceVersions)
    .where(eq(resourceVersions.id, input.releasedResourceVersionId))
    .limit(1);
  if (!resourceVersion || resourceVersion.status !== "published") {
    throw new ResourceVersionNotPublishedError(input.releasedResourceVersionId);
  }

  const [row] = await db
    .insert(resourcePlacements)
    .values({
      moduleId: input.moduleId,
      resourceId: input.resourceId,
      releasedResourceVersionId: input.releasedResourceVersionId,
      position: input.position,
      required: input.required ?? true,
      releaseConfig: input.releaseConfig ?? {},
      prerequisitePlacementIds: [...(input.prerequisitePlacementIds ?? [])],
    })
    .returning(PLACEMENT_COLUMNS);
  if (!row) throw new Error("createResourcePlacement: insert returned no row");
  return row;
}

async function moduleStageId(db: Queryable<Schema>, moduleId: string): Promise<string> {
  const [row] = await db
    .select({ stageId: modules.stageId })
    .from(modules)
    .where(eq(modules.id, moduleId))
    .limit(1);
  if (!row) throw new ModuleNotFoundError(moduleId);
  return row.stageId;
}

/** Full curriculum tree for one program version - tracks -> stages -> modules -> placements, used by curriculum-service.ts to resolve per-learner visibility. Modules that are `draft`/`in_review`/etc (never reached in this task, but the query does not filter them out) or `archived` are still RETURNED here; hiding them is curriculum-service.ts's job (resolveModuleVisibility), not this repository's. */
export async function listModulesForProgramVersion(db: Queryable<Schema>, programVersionId: string) {
  return db
    .select({
      moduleId: modules.id,
      moduleCode: modules.code,
      moduleTitle: modules.title,
      modulePosition: modules.position,
      moduleStatus: modules.status,
      moduleReleaseConfig: modules.releaseConfig,
      trackCode: tracks.code,
      stageCode: roadmapStages.code,
    })
    .from(modules)
    .innerJoin(roadmapStages, eq(modules.stageId, roadmapStages.id))
    .innerJoin(tracks, eq(roadmapStages.trackId, tracks.id))
    .where(eq(tracks.programVersionId, programVersionId));
}
