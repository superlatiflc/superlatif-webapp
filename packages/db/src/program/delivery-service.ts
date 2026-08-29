// Secure, time-bound asset delivery (LRN-001).
//
// Two separate checks, not one - dok 14 §14: "Access mengikuti grant saat
// playback, bukan hanya saat link dibuat" (access follows the grant AT
// PLAYBACK, not only when the link was created):
//
//   1. requestAssetDelivery - at REQUEST time, checks program access
//      (assertProgramAccess, ENT-002/IDN-004 - no new access rule) AND this
//      specific placement's resolved visibility (release rule, dok 14 §6),
//      then issues a short-lived, server-authorized reference. It returns a
//      TOKEN and an expiry - NEVER the underlying storageRef.
//   2. resolveAssetDelivery - at REDEEM time (what a future download-proxy
//      route would call, server-side only), re-checks the TTL AND
//      re-authorizes program access FRESH. A reference that has not yet hit
//      its TTL is still denied if the grant that authorized it was revoked
//      in between - this is what makes "assets use authorized time-bound
//      delivery" track the grant, not just a clock.
//
// No object storage/CDN/video provider integration - storageRef stays
// opaque end-to-end (schema/assets.ts's module doc).

import {
  computeDeliveryExpiry,
  deliveryTokenMatchesHash,
  evaluateDeliveryReferenceValidity,
  generateDeliveryToken,
  hashDeliveryToken,
  resolvePlacementVisibility,
  type ContentVisibility,
  type ModuleLifecycleStatus,
  type ReleaseRule,
} from "@superlatif/domain/program";
import type { AuthorizationReasonCode } from "@superlatif/domain/authorization";
import type { EffectiveAccessCache } from "@superlatif/domain/access";
import type { Queryable, Schema } from "../db-types.ts";
import { assertProgramAccess } from "./enrollment-service.ts";
import { getEffectiveAccess } from "../access/index.ts";
import { programTargetRef } from "./program-repository.ts";
import { findPlacementDeliveryContext } from "./curriculum-repository.ts";
import {
  createDeliveryReference,
  findAssetById,
  findDeliveryReferenceByTokenHash,
  findPrimaryAssetForResourceVersion,
  findRecordingByResourceVersionId,
} from "./asset-repository.ts";
import { programEnrollments, programs } from "../schema/index.ts";
import { and, eq } from "drizzle-orm";

/** Short-lived by design - "authorized time-bound delivery" (acceptance criterion). Callers may override for tests, never for production leniency. */
const DEFAULT_DELIVERY_TTL_SECONDS = 300;

const RELEASE_RULE_MODES = new Set([
  "immediate",
  "fixed_datetime",
  "relative_to_enrollment",
  "after_prerequisite",
  "manual",
]);

function isReleaseRuleShape(value: unknown): value is ReleaseRule {
  return (
    typeof value === "object" &&
    value !== null &&
    "mode" in value &&
    RELEASE_RULE_MODES.has((value as { mode: unknown }).mode as string)
  );
}

/** Same boundary-parsing discipline as curriculum-service.ts's parseReleaseRule - untyped JSONB is never trusted, an unset config defaults to "immediate". */
function parseReleaseRule(config: Record<string, unknown>): ReleaseRule {
  return isReleaseRuleShape(config) ? config : { mode: "immediate" };
}

async function enrolledAtFor(
  db: Queryable<Schema>,
  userId: string,
  programCode: string,
): Promise<Date | null> {
  const [row] = await db
    .select({ enrolledAt: programEnrollments.enrolledAt })
    .from(programEnrollments)
    .innerJoin(programs, eq(programEnrollments.programId, programs.id))
    .where(and(eq(programEnrollments.userId, userId), eq(programs.code, programCode)))
    .limit(1);
  return row?.enrolledAt ?? null;
}

export type AssetDeliveryRequestResult =
  | { readonly kind: "denied"; readonly reasonCode: AuthorizationReasonCode | "OBJECT_NOT_FOUND" }
  /** The module/placement exists and the student has program access, but the content is not currently visible (locked, archived, or unpublished) - distinct from "denied" the same way curriculum-service.ts's "no_published_version" is distinct from "denied" (dok 24 §5 - menu visibility is never authorization, but "not visible yet" is not the same failure as "not authorized"). */
  | { readonly kind: "not_released"; readonly visibility: ContentVisibility }
  /** This resource type has no deliverable asset at all (article, external link, announcement, ...). */
  | { readonly kind: "no_asset" }
  /** A recording resource whose underlying media is not yet ready (dok 14 §14 processing lifecycle). */
  | { readonly kind: "not_ready"; readonly processingStatus: string }
  /** The only success shape. Deliberately carries no storageRef, no asset row, nothing beyond an opaque bearer token and its expiry - "no raw asset URL leak" (required negative test). */
  | { readonly kind: "ready"; readonly token: string; readonly expiresAt: Date };

/**
 * Requests a secure, time-bound delivery reference for one resource
 * placement's primary asset. Never returns the asset's storageRef - only
 * resolveAssetDelivery, called with the token this returns, reaches it.
 */
export async function requestAssetDelivery(
  db: Queryable<Schema>,
  cache: EffectiveAccessCache,
  userId: string,
  placementId: string,
  now: Date,
  ttlSeconds: number = DEFAULT_DELIVERY_TTL_SECONDS,
): Promise<AssetDeliveryRequestResult> {
  const context = await findPlacementDeliveryContext(db, placementId);
  if (!context) return { kind: "denied", reasonCode: "OBJECT_NOT_FOUND" };

  const authDecision = await assertProgramAccess(db, cache, userId, context.programCode, now);
  if (!authDecision.allowed) return { kind: "denied", reasonCode: authDecision.reasonCode };

  const enrolledAt = await enrolledAtFor(db, userId, context.programCode);
  const visibility = resolvePlacementVisibility(
    context.moduleStatus as ModuleLifecycleStatus,
    parseReleaseRule(context.moduleReleaseConfig),
    parseReleaseRule(context.placementReleaseConfig),
    { now, enrolledAt, completedPlacementIds: new Set() },
  );
  if (visibility !== "released") return { kind: "not_released", visibility };

  const recording = await findRecordingByResourceVersionId(db, context.resourceVersionId);
  let assetId: string | null;
  if (recording) {
    if (recording.processingStatus !== "ready" || !recording.assetId) {
      return { kind: "not_ready", processingStatus: recording.processingStatus };
    }
    assetId = recording.assetId;
  } else {
    const primaryAsset = await findPrimaryAssetForResourceVersion(db, context.resourceVersionId);
    if (!primaryAsset) return { kind: "no_asset" };
    assetId = primaryAsset.id;
  }

  const accessDecision = await getEffectiveAccess(
    db,
    cache,
    userId,
    { targetType: "program", targetRef: programTargetRef(context.programCode), action: "view" },
    now,
  );
  const expiresAt = computeDeliveryExpiry(now, ttlSeconds, accessDecision.effectiveTo);

  const token = generateDeliveryToken();
  await createDeliveryReference(db, {
    assetId,
    userId,
    placementId,
    tokenHash: hashDeliveryToken(token),
    issuedAt: now,
    expiresAt,
  });

  return { kind: "ready", token, expiresAt };
}

export type AssetDeliveryResolution =
  | { readonly kind: "not_found" }
  | { readonly kind: "expired" }
  | { readonly kind: "access_revoked"; readonly reasonCode: AuthorizationReasonCode }
  /**
   * Server-only shape - the one place `storageRef` ever leaves
   * asset-repository.ts. A caller of this function IS the gated
   * proxy/redirect (dok 20 §11); this value must never be serialized
   * directly into a student-facing API response.
   */
  | { readonly kind: "ready"; readonly storageRef: string; readonly mimeType: string | null };

/**
 * Redeems a delivery token. Re-authorizes program access FRESH (does not
 * trust the fact that a reference was issued earlier) - the second half of
 * dok 14 §14's "access mengikuti grant saat playback" invariant. Intended
 * to be called from a server-side download/stream proxy, never exposed as a
 * client-callable endpoint that echoes its result verbatim.
 */
export async function resolveAssetDelivery(
  db: Queryable<Schema>,
  cache: EffectiveAccessCache,
  token: string,
  now: Date,
): Promise<AssetDeliveryResolution> {
  const tokenHash = hashDeliveryToken(token);
  const reference = await findDeliveryReferenceByTokenHash(db, tokenHash);
  if (!reference) return { kind: "not_found" };
  // Defensive constant-time re-check even though lookup was already by hash -
  // guards against a future caller passing a hash directly instead of a raw
  // token (deliveryTokenMatchesHash never trusts a bare equality check).
  if (!deliveryTokenMatchesHash(token, reference.tokenHash)) return { kind: "not_found" };

  if (evaluateDeliveryReferenceValidity(reference.expiresAt, now) === "expired") {
    return { kind: "expired" };
  }

  const context = await findPlacementDeliveryContext(db, reference.placementId);
  if (!context) return { kind: "not_found" };

  const authDecision = await assertProgramAccess(db, cache, reference.userId, context.programCode, now);
  if (!authDecision.allowed) return { kind: "access_revoked", reasonCode: authDecision.reasonCode };

  const asset = await findAssetById(db, reference.assetId);
  if (!asset) return { kind: "not_found" };

  return { kind: "ready", storageRef: asset.storageRef, mimeType: asset.mimeType };
}
