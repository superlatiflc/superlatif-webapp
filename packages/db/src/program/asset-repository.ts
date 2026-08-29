// Asset and recording persistence (LRN-001).
//
// "One resource can be attached to multiple programs without content
// copying" (acceptance criterion) already holds at the resource/placement
// layer (PRG-002) - an asset inherits that reuse for free by belonging to a
// RESOURCE VERSION, not a placement: the same asset row is delivered no
// matter how many placements (across however many modules/programs)
// reference that resource version.

import { and, eq } from "drizzle-orm";
import type { Queryable, Schema } from "../db-types.ts";
import { assetDeliveryReferences, assets, recordings } from "../schema/index.ts";

export interface AssetRow {
  readonly id: string;
  readonly resourceVersionId: string;
  readonly role: string;
  readonly mimeType: string | null;
  readonly sizeBytes: number | null;
  readonly durationSeconds: number | null;
  readonly storageRef: string;
}

const ASSET_COLUMNS = {
  id: assets.id,
  resourceVersionId: assets.resourceVersionId,
  role: assets.role,
  mimeType: assets.mimeType,
  sizeBytes: assets.sizeBytes,
  durationSeconds: assets.durationSeconds,
  storageRef: assets.storageRef,
};

export interface CreateAssetInput {
  readonly resourceVersionId: string;
  readonly role?: string;
  readonly mimeType?: string | null;
  readonly sizeBytes?: number | null;
  readonly durationSeconds?: number | null;
  /** Opaque synthetic reference - see schema/assets.ts's module doc. Never a real, resolvable object-storage/CDN URL in this task. */
  readonly storageRef: string;
  readonly checksum?: string | null;
}

export async function createAsset(db: Queryable<Schema>, input: CreateAssetInput): Promise<AssetRow> {
  const [row] = await db
    .insert(assets)
    .values({
      resourceVersionId: input.resourceVersionId,
      role: input.role ?? "primary",
      mimeType: input.mimeType ?? null,
      sizeBytes: input.sizeBytes ?? null,
      durationSeconds: input.durationSeconds ?? null,
      storageRef: input.storageRef,
      checksum: input.checksum ?? null,
    })
    .returning(ASSET_COLUMNS);
  if (!row) throw new Error("createAsset: insert returned no row");
  return row;
}

export async function findPrimaryAssetForResourceVersion(
  db: Queryable<Schema>,
  resourceVersionId: string,
): Promise<AssetRow | null> {
  const [row] = await db
    .select(ASSET_COLUMNS)
    .from(assets)
    .where(and(eq(assets.resourceVersionId, resourceVersionId), eq(assets.role, "primary")))
    .limit(1);
  return row ?? null;
}

export async function findAssetById(db: Queryable<Schema>, assetId: string): Promise<AssetRow | null> {
  const [row] = await db.select(ASSET_COLUMNS).from(assets).where(eq(assets.id, assetId)).limit(1);
  return row ?? null;
}

export interface RecordingRow {
  readonly id: string;
  readonly resourceVersionId: string;
  readonly sourceKind: string;
  readonly processingStatus: string;
  readonly providerRef: string | null;
  readonly assetId: string | null;
  readonly captionAvailable: boolean;
}

const RECORDING_COLUMNS = {
  id: recordings.id,
  resourceVersionId: recordings.resourceVersionId,
  sourceKind: recordings.sourceKind,
  processingStatus: recordings.processingStatus,
  providerRef: recordings.providerRef,
  assetId: recordings.assetId,
  captionAvailable: recordings.captionAvailable,
};

export interface CreateRecordingInput {
  readonly resourceVersionId: string;
  readonly sourceKind: "provider" | "uploaded_asset";
  /** Opaque metadata only - "tidak ada provider call" (founder instruction). Never dereferenced against a real provider API. */
  readonly providerRef?: string | null;
}

/** A new recording always starts "pending" (dok 14 §14) - there is no "create it already ready" path, matching real processing pipelines where the metadata row exists before the media does. */
export async function createRecording(
  db: Queryable<Schema>,
  input: CreateRecordingInput,
): Promise<RecordingRow> {
  const [row] = await db
    .insert(recordings)
    .values({
      resourceVersionId: input.resourceVersionId,
      sourceKind: input.sourceKind,
      providerRef: input.providerRef ?? null,
    })
    .returning(RECORDING_COLUMNS);
  if (!row) throw new Error("createRecording: insert returned no row");
  return row;
}

export async function findRecordingByResourceVersionId(
  db: Queryable<Schema>,
  resourceVersionId: string,
): Promise<RecordingRow | null> {
  const [row] = await db
    .select(RECORDING_COLUMNS)
    .from(recordings)
    .where(eq(recordings.resourceVersionId, resourceVersionId))
    .limit(1);
  return row ?? null;
}

export class RecordingNotFoundError extends Error {
  constructor(recordingId: string) {
    super(`Recording ${recordingId} not found`);
    this.name = "RecordingNotFoundError";
  }
}

/** pending/processing -> ready, stamping the asset that is now deliverable and the moment it became ready (dok 14 §14 lifecycle). Does not itself create the asset - callers pass an already-created asset's ID. */
export async function markRecordingReady(
  db: Queryable<Schema>,
  recordingId: string,
  assetId: string,
  now: Date,
): Promise<void> {
  const [existing] = await db
    .select({ id: recordings.id })
    .from(recordings)
    .where(eq(recordings.id, recordingId))
    .limit(1);
  if (!existing) throw new RecordingNotFoundError(recordingId);
  await db
    .update(recordings)
    .set({ processingStatus: "ready", assetId, readyAt: now })
    .where(eq(recordings.id, recordingId));
}

export async function markRecordingFailed(db: Queryable<Schema>, recordingId: string): Promise<void> {
  const [existing] = await db
    .select({ id: recordings.id })
    .from(recordings)
    .where(eq(recordings.id, recordingId))
    .limit(1);
  if (!existing) throw new RecordingNotFoundError(recordingId);
  await db.update(recordings).set({ processingStatus: "failed" }).where(eq(recordings.id, recordingId));
}

export interface CreateDeliveryReferenceInput {
  readonly assetId: string;
  readonly userId: string;
  readonly placementId: string;
  readonly tokenHash: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
}

export interface DeliveryReferenceRow {
  readonly id: string;
  readonly assetId: string;
  readonly userId: string;
  readonly placementId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
}

const DELIVERY_REFERENCE_COLUMNS = {
  id: assetDeliveryReferences.id,
  assetId: assetDeliveryReferences.assetId,
  userId: assetDeliveryReferences.userId,
  placementId: assetDeliveryReferences.placementId,
  tokenHash: assetDeliveryReferences.tokenHash,
  expiresAt: assetDeliveryReferences.expiresAt,
};

export async function createDeliveryReference(
  db: Queryable<Schema>,
  input: CreateDeliveryReferenceInput,
): Promise<DeliveryReferenceRow> {
  const [row] = await db
    .insert(assetDeliveryReferences)
    .values({
      assetId: input.assetId,
      userId: input.userId,
      placementId: input.placementId,
      tokenHash: input.tokenHash,
      issuedAt: input.issuedAt,
      expiresAt: input.expiresAt,
    })
    .returning(DELIVERY_REFERENCE_COLUMNS);
  if (!row) throw new Error("createDeliveryReference: insert returned no row");
  return row;
}

/** Looks up a delivery reference by its token's hash - the raw token is NEVER stored, so this is the only lookup path (mirrors identity/repository.ts's session lookup-by-hash discipline). */
export async function findDeliveryReferenceByTokenHash(
  db: Queryable<Schema>,
  tokenHash: string,
): Promise<DeliveryReferenceRow | null> {
  const [row] = await db
    .select(DELIVERY_REFERENCE_COLUMNS)
    .from(assetDeliveryReferences)
    .where(eq(assetDeliveryReferences.tokenHash, tokenHash))
    .limit(1);
  return row ?? null;
}
