// Reusable asset and secure-delivery schema (LRN-001).
//
// dok 14 §4/§5: "Asset lama tidak dihapus selama masih direferensikan
// version historis" - an asset belongs to one resource_version (its
// ownership, per LRN-002 "Asset disimpan terpisah dengan ownership dan
// access policy"), never to a placement or a program directly. Its ACCESS
// policy is not a column here: delivery authorization is derived fresh from
// the resource's placement (program access + release visibility), exactly
// "gunakan authorize() dan effective access, jangan bikin aturan akses
// baru" (founder instruction) - see program/delivery-service.ts.
//
// `storageRef` is a deliberately OPAQUE, synthetic reference - shaped like a
// real object-storage key ("protected-learning/<resourceVersionId>/<uuid>")
// but never resolved against a real S3/CDN provider ("Jangan integrasi
// S3/CDN/video provider nyata dulu" - founder instruction). It is written
// once at asset creation and NEVER returned to a student-facing caller
// directly - only delivery-service.ts#resolveAssetDelivery reads it, at the
// final gated step, mirroring dok 20 §11's "gated proxy/redirect" shape
// rather than a client-held signed URL.

import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { recordingProcessingStatus } from "./enums.ts";
import { resourcePlacements, resourceVersions } from "./curriculum.ts";
import { users } from "./identity.ts";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/**
 * One deliverable file/stream owned by exactly one resource version. `role`
 * lets one resource version carry more than one asset (dok 14 §14:
 * "Caption/transcript metadata disediakan bila tersedia") without a nested
 * asset-of-an-asset chain - "primary" is the one delivery-service.ts
 * resolves for playback/download; other roles are metadata-only in this
 * task (no caption FILE delivery yet, only the flag on `recordings`).
 */
export const assets = pgTable(
  "assets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    resourceVersionId: uuid("resource_version_id")
      .notNull()
      .references(() => resourceVersions.id),
    role: text("role").notNull().default("primary"),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    /** Video/recording only - null for a plain file/PDF asset. */
    durationSeconds: integer("duration_seconds"),
    storageRef: text("storage_ref").notNull(),
    checksum: text("checksum"),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("asset_resource_version_role_uq").on(table.resourceVersionId, table.role)],
);

/**
 * Recording-specific lifecycle (dok 14 §14), one row per resource version of
 * type "recording". Deliberately separate from `assets`: `processingStatus`
 * tracks the RECORDING's own pending -> ready/failed -> archived lifecycle,
 * which is independent of the resource version's own draft/published/
 * archived status (curriculum.ts) - a recording can be "published" as
 * curriculum content while its underlying media is still "processing".
 * `assetId` is null until an asset actually exists to deliver (set the same
 * moment processingStatus becomes "ready"); `providerRef` is an OPAQUE,
 * metadata-only external session reference when `sourceKind = "provider"` -
 * "tidak ada provider call" (founder instruction): this column is never
 * dereferenced against a real provider API anywhere in this task, and is
 * never logged or returned to a student-facing caller raw (dok 24 §17
 * "Never log ... signed private URLs" - the same discipline extends to any
 * opaque provider session reference).
 */
export const recordings = pgTable(
  "recordings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    resourceVersionId: uuid("resource_version_id")
      .notNull()
      .references(() => resourceVersions.id),
    sourceKind: text("source_kind").notNull(),
    processingStatus: recordingProcessingStatus("processing_status").notNull().default("pending"),
    providerRef: text("provider_ref"),
    assetId: uuid("asset_id").references(() => assets.id),
    captionAvailable: boolean("caption_available").notNull().default(false),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("recording_resource_version_uq").on(table.resourceVersionId)],
);

/**
 * A single issued, time-bound delivery reference - "assets use authorized
 * time-bound delivery" (acceptance criterion). Only `tokenHash` is stored,
 * never the raw token, matching identity.ts's `userSessions.secretHash`
 * precedent exactly ("only hash stored server-side. No column exists for a
 * raw token; there is nothing for application code to accidentally persist
 * unhashed"). `placementId` is kept so resolveAssetDelivery can re-derive
 * and RE-CHECK program access at redemption time (dok 14 §14: "Access
 * mengikuti grant saat playback, bukan hanya saat link dibuat") - a
 * reference that has not hit its TTL can still be denied if the grant that
 * authorized it was revoked in between.
 */
export const assetDeliveryReferences = pgTable(
  "asset_delivery_references",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    placementId: uuid("placement_id")
      .notNull()
      .references(() => resourcePlacements.id),
    tokenHash: text("token_hash").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("asset_delivery_reference_token_hash_uq").on(table.tokenHash),
    index("asset_delivery_reference_asset_idx").on(table.assetId),
  ],
);
