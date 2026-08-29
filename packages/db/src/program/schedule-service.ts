// Live session join, reschedule, cancellation, attendance, and reminder
// orchestration (SCH-001).
//
// dok 14 §12 "Join flow", steps in this exact order: (1) user opens the
// session, (2) app evaluates EFFECTIVE ACCESS first (ENT-002/IDN-004,
// reused unchanged via assertProgramAccess - no new access rule), (3) THEN
// join window and session status. Access is checked before window/status
// so an unauthorized user never learns anything about a session's timing
// from the response shape.
//
// Two separate functions, mirroring LRN-001's delivery-service.ts exactly
// (dok 14 §14 / §12: "Access mengikuti grant saat playback, bukan hanya
// saat link dibuat" applies to a join link the same way it applies to an
// asset):
//   requestLiveSessionJoin - at REQUEST time, issues a short-lived opaque
//     token. Never returns provider/externalMeetingRef.
//   resolveLiveSessionJoin - at REDEEM time, re-authorizes access FRESH and
//     re-checks the session's status (it may have been cancelled between
//     issue and redeem) before finally returning provider/externalMeetingRef
//     - the ONE place those ever leave this module.
//
// The crypto primitives (generateDeliveryToken/hashDeliveryToken/
// computeDeliveryExpiry/evaluateDeliveryReferenceValidity,
// @superlatif/domain/program) are LRN-001's own, fully reused - only the
// persistence table differs (live_session_join_references vs
// asset_delivery_references), because the FK target differs.
//
// Reschedule is append-only (dok 14 §13): the OLD live_sessions row is
// marked "rescheduled" and keeps its own original startsAt/endsAt
// permanently; a NEW row is inserted with `rescheduledFromId` pointing at
// the old one. Reschedule/cancel both require `live.occurrence.manage`
// (IDN-004's own permission matrix, already granted to academic_admin/
// operations_admin/live_class_coordinator - zero changes to permissions.ts)
// and a non-empty reason, mirroring ENT-001/COM-006's audit discipline.

import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { authorize, type AuthorizationReasonCode } from "@superlatif/domain/authorization";
import type { EffectiveAccessCache } from "@superlatif/domain/access";
import {
  computeDeliveryExpiry,
  deliveryTokenMatchesHash,
  evaluateDeliveryReferenceValidity,
  evaluateJoinWindow,
  generateDeliveryToken,
  hashDeliveryToken,
  isLiveSessionJoinable,
  type LiveSessionStatus,
} from "@superlatif/domain/program";
import type { Schema } from "../db-types.ts";
import { listActiveRoleHoldings } from "../authorization/index.ts";
import { getEffectiveAccess } from "../access/index.ts";
import { assertProgramAccess } from "./enrollment-service.ts";
import { findProgramById, programTargetRef } from "./program-repository.ts";
import {
  cancelPendingReminders,
  createAttendanceCheckIn,
  createJoinReference,
  createLiveSession,
  createReminder,
  findAttendanceRecord,
  findJoinReferenceByTokenHash,
  findLiveSessionById,
  findScheduleItemById,
  linkRecordingToLiveSession,
  recordAttendanceCheckOut,
  updateLiveSessionStatus,
  type AttendanceRow,
  type LiveSessionRow,
  type ReminderRow,
} from "./schedule-repository.ts";

const DEFAULT_JOIN_TTL_SECONDS = 300;

export class ScheduleReasonRequiredError extends Error {
  constructor() {
    super("A reason is required for this schedule action");
    this.name = "ScheduleReasonRequiredError";
  }
}

export class ScheduleActionNotAuthorizedError extends Error {
  constructor(reasonCode: string) {
    super(`Actor is not authorized to manage this live session (${reasonCode})`);
    this.name = "ScheduleActionNotAuthorizedError";
  }
}

export class LiveSessionNotFoundError extends Error {
  constructor(id: string) {
    super(`Live session ${id} not found`);
    this.name = "LiveSessionNotFoundError";
  }
}

async function programCodeForSession(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  session: LiveSessionRow,
): Promise<string | null> {
  const scheduleItem = await findScheduleItemById(db, session.scheduleItemId);
  if (!scheduleItem) return null;
  const program = await findProgramById(db, scheduleItem.programId);
  return program?.code ?? null;
}

export type JoinRequestOutcome =
  | { readonly kind: "not_found" }
  | { readonly kind: "denied"; readonly reasonCode: AuthorizationReasonCode }
  | { readonly kind: "not_joinable"; readonly status: LiveSessionStatus }
  | { readonly kind: "window_not_open_yet" }
  | { readonly kind: "window_closed" }
  /** Deliberately carries no provider/externalMeetingRef - only an opaque bearer token and its expiry ("no raw provider join URL leak", required negative test). */
  | { readonly kind: "ready"; readonly token: string; readonly expiresAt: Date };

export async function requestLiveSessionJoin(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  cache: EffectiveAccessCache,
  userId: string,
  liveSessionId: string,
  now: Date,
  ttlSeconds: number = DEFAULT_JOIN_TTL_SECONDS,
): Promise<JoinRequestOutcome> {
  const session = await findLiveSessionById(db, liveSessionId);
  if (!session) return { kind: "not_found" };

  const programCode = await programCodeForSession(db, session);
  if (!programCode) return { kind: "not_found" };

  // dok 14 §12: access is evaluated BEFORE join window/status.
  const authDecision = await assertProgramAccess(db, cache, userId, programCode, now);
  if (!authDecision.allowed) return { kind: "denied", reasonCode: authDecision.reasonCode };

  if (!isLiveSessionJoinable(session.status as LiveSessionStatus)) {
    return { kind: "not_joinable", status: session.status as LiveSessionStatus };
  }

  const windowState = evaluateJoinWindow(
    session,
    {
      joinWindowBeforeMinutes: session.joinWindowBeforeMinutes,
      joinWindowAfterMinutes: session.joinWindowAfterMinutes,
    },
    now,
  );
  if (windowState === "not_open_yet") return { kind: "window_not_open_yet" };
  if (windowState === "closed") return { kind: "window_closed" };

  const accessDecision = await getEffectiveAccess(
    db,
    cache,
    userId,
    { targetType: "program", targetRef: programTargetRef(programCode), action: "view" },
    now,
  );
  const expiresAt = computeDeliveryExpiry(now, ttlSeconds, accessDecision.effectiveTo);

  const token = generateDeliveryToken();
  await createJoinReference(db, {
    liveSessionId,
    userId,
    tokenHash: hashDeliveryToken(token),
    issuedAt: now,
    expiresAt,
  });

  return { kind: "ready", token, expiresAt };
}

export type JoinResolution =
  | { readonly kind: "not_found" }
  | { readonly kind: "expired" }
  | { readonly kind: "access_revoked"; readonly reasonCode: AuthorizationReasonCode }
  | { readonly kind: "not_joinable"; readonly status: LiveSessionStatus }
  /** Server-only shape - the ONE place provider/externalMeetingRef ever leave this module. Never serialize directly into a student-facing response; a caller of this function IS the gated redirect (dok 14 §12). */
  | { readonly kind: "ready"; readonly provider: string; readonly externalMeetingRef: string };

export async function resolveLiveSessionJoin(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  cache: EffectiveAccessCache,
  token: string,
  now: Date,
): Promise<JoinResolution> {
  const tokenHash = hashDeliveryToken(token);
  const reference = await findJoinReferenceByTokenHash(db, tokenHash);
  if (!reference) return { kind: "not_found" };
  if (!deliveryTokenMatchesHash(token, reference.tokenHash)) return { kind: "not_found" };
  if (evaluateDeliveryReferenceValidity(reference.expiresAt, now) === "expired") return { kind: "expired" };

  const session = await findLiveSessionById(db, reference.liveSessionId);
  if (!session) return { kind: "not_found" };

  const programCode = await programCodeForSession(db, session);
  if (!programCode) return { kind: "not_found" };

  const authDecision = await assertProgramAccess(db, cache, reference.userId, programCode, now);
  if (!authDecision.allowed) return { kind: "access_revoked", reasonCode: authDecision.reasonCode };

  if (!isLiveSessionJoinable(session.status as LiveSessionStatus)) {
    return { kind: "not_joinable", status: session.status as LiveSessionStatus };
  }

  return { kind: "ready", provider: session.provider, externalMeetingRef: session.externalMeetingRef };
}

async function assertOccurrenceManagePermission(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  actorUserId: string,
): Promise<void> {
  const roles = await listActiveRoleHoldings(db, actorUserId);
  const decision = authorize({
    actor: { userId: actorUserId, roles },
    action: { type: "live_session_manage", permission: "live.occurrence.manage" },
  });
  if (!decision.allowed) throw new ScheduleActionNotAuthorizedError(decision.reasonCode);
}

export interface RescheduleResult {
  readonly oldSession: LiveSessionRow;
  readonly newSession: LiveSessionRow;
}

/**
 * Marks the old occurrence "rescheduled" (its own startsAt/endsAt stay a
 * permanent historical record - dok 14 §13) and inserts a NEW occurrence
 * linked via `rescheduledFromId`. Cancels every still-"planned" reminder for
 * the old occurrence (dok 19 §13) - scheduling a fresh reminder for the new
 * occurrence is the caller's own explicit `scheduleReminder` call, not
 * implicit here.
 */
export async function rescheduleLiveSession(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  actorUserId: string,
  sessionId: string,
  newStartsAt: Date,
  newEndsAt: Date,
  reason: string,
): Promise<RescheduleResult> {
  if (!reason) throw new ScheduleReasonRequiredError();
  await assertOccurrenceManagePermission(db, actorUserId);

  const existing = await findLiveSessionById(db, sessionId);
  if (!existing) throw new LiveSessionNotFoundError(sessionId);

  return db.transaction(async (tx) => {
    await updateLiveSessionStatus(tx, existing.id, { status: "rescheduled", rescheduleReason: reason });
    const newSession = await createLiveSession(tx, {
      scheduleItemId: existing.scheduleItemId,
      provider: existing.provider,
      externalMeetingRef: existing.externalMeetingRef,
      hostUserId: existing.hostUserId,
      joinWindowBeforeMinutes: existing.joinWindowBeforeMinutes,
      joinWindowAfterMinutes: existing.joinWindowAfterMinutes,
      capacity: existing.capacity,
      startsAt: newStartsAt,
      endsAt: newEndsAt,
      status: "scheduled",
      rescheduledFromId: existing.id,
    });
    await cancelPendingReminders(tx, existing.id);
    const oldSession = await findLiveSessionById(tx, existing.id);
    return { oldSession: oldSession!, newSession };
  });
}

export async function cancelLiveSession(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  actorUserId: string,
  sessionId: string,
  reason: string,
): Promise<LiveSessionRow> {
  if (!reason) throw new ScheduleReasonRequiredError();
  await assertOccurrenceManagePermission(db, actorUserId);

  const existing = await findLiveSessionById(db, sessionId);
  if (!existing) throw new LiveSessionNotFoundError(sessionId);

  return db.transaction(async (tx) => {
    await updateLiveSessionStatus(tx, existing.id, { status: "cancelled", cancellationReason: reason });
    await cancelPendingReminders(tx, existing.id);
    const updated = await findLiveSessionById(tx, existing.id);
    return updated!;
  });
}

/** SCH-006: idempotent - calling this twice for the same user/session returns the FIRST check-in, never overwrites it. */
export async function checkInToLiveSession(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  liveSessionId: string,
  userId: string,
  now: Date,
): Promise<AttendanceRow> {
  const existing = await findAttendanceRecord(db, liveSessionId, userId);
  if (existing) return existing;
  return createAttendanceCheckIn(db, liveSessionId, userId, now);
}

export async function checkOutOfLiveSession(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  liveSessionId: string,
  userId: string,
  now: Date,
): Promise<void> {
  await recordAttendanceCheckOut(db, liveSessionId, userId, now);
}

/** dok 14 §14: "Recording ditempatkan sebagai resource ... Recording dapat ditautkan setelah session." `recordingId` must already exist (created via LRN-001's own createRecording, against a resource_version this task does not create) - this only attaches it. */
export async function linkRecording(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  sessionId: string,
  recordingId: string,
): Promise<LiveSessionRow> {
  const existing = await findLiveSessionById(db, sessionId);
  if (!existing) throw new LiveSessionNotFoundError(sessionId);
  await linkRecordingToLiveSession(db, sessionId, recordingId);
  const updated = await findLiveSessionById(db, sessionId);
  return updated!;
}

/** Synthetic scheduling only - "cukup outbox/synthetic scheduling model, bukan pengiriman nyata". No delivery of any kind happens here; a future NTF-001 task turns a "planned" row into a real notification. */
export async function scheduleReminder(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  liveSessionId: string,
  offsetMinutesBeforeStart: number,
): Promise<ReminderRow> {
  const session = await findLiveSessionById(db, liveSessionId);
  if (!session) throw new LiveSessionNotFoundError(liveSessionId);
  const scheduledFor = new Date(session.startsAt.getTime() - offsetMinutesBeforeStart * 60_000);
  return createReminder(db, liveSessionId, scheduledFor, offsetMinutesBeforeStart);
}
