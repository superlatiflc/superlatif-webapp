// Schedule item, live session, attendance, join-reference, and reminder
// persistence (SCH-001). Thin CRUD - decisions (join eligibility, reschedule
// orchestration, authorization) live in schedule-service.ts.

import { and, eq } from "drizzle-orm";
import type { LiveSessionStatus, ScheduleItemType } from "@superlatif/domain/program";
import type { Queryable, Schema } from "../db-types.ts";
import {
  liveSessionAttendance,
  liveSessionJoinReferences,
  liveSessionReminders,
  liveSessions,
  scheduleItems,
} from "../schema/index.ts";

export interface ScheduleItemRow {
  readonly id: string;
  readonly programId: string;
  readonly trackId: string | null;
  readonly type: string;
  readonly title: string;
  readonly description: string | null;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly timezone: string;
  readonly status: string;
}

const SCHEDULE_ITEM_COLUMNS = {
  id: scheduleItems.id,
  programId: scheduleItems.programId,
  trackId: scheduleItems.trackId,
  type: scheduleItems.type,
  title: scheduleItems.title,
  description: scheduleItems.description,
  startsAt: scheduleItems.startsAt,
  endsAt: scheduleItems.endsAt,
  timezone: scheduleItems.timezone,
  status: scheduleItems.status,
};

export interface CreateScheduleItemInput {
  readonly programId: string;
  readonly trackId?: string | null;
  readonly type: ScheduleItemType;
  readonly title: string;
  readonly description?: string | null;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly timezone: string;
}

export async function createScheduleItem(
  db: Queryable<Schema>,
  input: CreateScheduleItemInput,
): Promise<ScheduleItemRow> {
  const [row] = await db
    .insert(scheduleItems)
    .values({
      programId: input.programId,
      trackId: input.trackId ?? null,
      type: input.type,
      title: input.title,
      description: input.description ?? null,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      timezone: input.timezone,
    })
    .returning(SCHEDULE_ITEM_COLUMNS);
  if (!row) throw new Error("createScheduleItem: insert returned no row");
  return row;
}

export async function findScheduleItemById(
  db: Queryable<Schema>,
  id: string,
): Promise<ScheduleItemRow | null> {
  const [row] = await db
    .select(SCHEDULE_ITEM_COLUMNS)
    .from(scheduleItems)
    .where(eq(scheduleItems.id, id))
    .limit(1);
  return row ?? null;
}

export interface LiveSessionRow {
  readonly id: string;
  readonly scheduleItemId: string;
  readonly provider: string;
  readonly externalMeetingRef: string;
  readonly hostUserId: string | null;
  readonly joinWindowBeforeMinutes: number;
  readonly joinWindowAfterMinutes: number;
  readonly capacity: number | null;
  readonly recordingId: string | null;
  readonly status: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly rescheduledFromId: string | null;
  readonly rescheduleReason: string | null;
  readonly cancellationReason: string | null;
}

const LIVE_SESSION_COLUMNS = {
  id: liveSessions.id,
  scheduleItemId: liveSessions.scheduleItemId,
  provider: liveSessions.provider,
  externalMeetingRef: liveSessions.externalMeetingRef,
  hostUserId: liveSessions.hostUserId,
  joinWindowBeforeMinutes: liveSessions.joinWindowBeforeMinutes,
  joinWindowAfterMinutes: liveSessions.joinWindowAfterMinutes,
  capacity: liveSessions.capacity,
  recordingId: liveSessions.recordingId,
  status: liveSessions.status,
  startsAt: liveSessions.startsAt,
  endsAt: liveSessions.endsAt,
  rescheduledFromId: liveSessions.rescheduledFromId,
  rescheduleReason: liveSessions.rescheduleReason,
  cancellationReason: liveSessions.cancellationReason,
};

export interface CreateLiveSessionInput {
  readonly scheduleItemId: string;
  /** Opaque - never a real, resolvable Zoom/Meet identifier in this task. */
  readonly provider: string;
  readonly externalMeetingRef: string;
  readonly hostUserId?: string | null;
  readonly joinWindowBeforeMinutes?: number;
  readonly joinWindowAfterMinutes?: number;
  readonly capacity?: number | null;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly status?: LiveSessionStatus;
  readonly rescheduledFromId?: string | null;
}

export async function createLiveSession(
  db: Queryable<Schema>,
  input: CreateLiveSessionInput,
): Promise<LiveSessionRow> {
  const [row] = await db
    .insert(liveSessions)
    .values({
      scheduleItemId: input.scheduleItemId,
      provider: input.provider,
      externalMeetingRef: input.externalMeetingRef,
      hostUserId: input.hostUserId ?? null,
      joinWindowBeforeMinutes: input.joinWindowBeforeMinutes ?? 15,
      joinWindowAfterMinutes: input.joinWindowAfterMinutes ?? 30,
      capacity: input.capacity ?? null,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      status: input.status ?? "scheduled",
      rescheduledFromId: input.rescheduledFromId ?? null,
    })
    .returning(LIVE_SESSION_COLUMNS);
  if (!row) throw new Error("createLiveSession: insert returned no row");
  return row;
}

export async function findLiveSessionById(db: Queryable<Schema>, id: string): Promise<LiveSessionRow | null> {
  const [row] = await db
    .select(LIVE_SESSION_COLUMNS)
    .from(liveSessions)
    .where(eq(liveSessions.id, id))
    .limit(1);
  return row ?? null;
}

/** Reuses LRN-001's `recordings` table unchanged - this only attaches an EXISTING recording (created via `@superlatif/db/program`'s own `createRecording`) to a session; it never creates a second recording model. */
export async function linkRecordingToLiveSession(
  db: Queryable<Schema>,
  id: string,
  recordingId: string,
): Promise<void> {
  await db.update(liveSessions).set({ recordingId }).where(eq(liveSessions.id, id));
}

export interface UpdateLiveSessionStatusInput {
  readonly status: LiveSessionStatus;
  readonly rescheduleReason?: string | null;
  readonly cancellationReason?: string | null;
  readonly recordingId?: string | null;
}

/** The only function that mutates an existing live_sessions row - a status transition plus its optional reason/recording fields. Never touches scheduleItemId/provider/externalMeetingRef/startsAt/endsAt (the occurrence's own identity/timing) - a reschedule creates a NEW row instead (schedule-service.ts). */
export async function updateLiveSessionStatus(
  db: Queryable<Schema>,
  id: string,
  input: UpdateLiveSessionStatusInput,
): Promise<void> {
  const patch: Record<string, unknown> = { status: input.status };
  if (input.rescheduleReason !== undefined) patch["rescheduleReason"] = input.rescheduleReason;
  if (input.cancellationReason !== undefined) patch["cancellationReason"] = input.cancellationReason;
  if (input.recordingId !== undefined) patch["recordingId"] = input.recordingId;
  await db.update(liveSessions).set(patch).where(eq(liveSessions.id, id));
}

export interface JoinReferenceRow {
  readonly id: string;
  readonly liveSessionId: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
}

const JOIN_REFERENCE_COLUMNS = {
  id: liveSessionJoinReferences.id,
  liveSessionId: liveSessionJoinReferences.liveSessionId,
  userId: liveSessionJoinReferences.userId,
  tokenHash: liveSessionJoinReferences.tokenHash,
  expiresAt: liveSessionJoinReferences.expiresAt,
};

export interface CreateJoinReferenceInput {
  readonly liveSessionId: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
}

export async function createJoinReference(
  db: Queryable<Schema>,
  input: CreateJoinReferenceInput,
): Promise<JoinReferenceRow> {
  const [row] = await db.insert(liveSessionJoinReferences).values(input).returning(JOIN_REFERENCE_COLUMNS);
  if (!row) throw new Error("createJoinReference: insert returned no row");
  return row;
}

export async function findJoinReferenceByTokenHash(
  db: Queryable<Schema>,
  tokenHash: string,
): Promise<JoinReferenceRow | null> {
  const [row] = await db
    .select(JOIN_REFERENCE_COLUMNS)
    .from(liveSessionJoinReferences)
    .where(eq(liveSessionJoinReferences.tokenHash, tokenHash))
    .limit(1);
  return row ?? null;
}

export interface AttendanceRow {
  readonly id: string;
  readonly liveSessionId: string;
  readonly userId: string;
  readonly checkedInAt: Date | null;
  readonly checkedOutAt: Date | null;
}

const ATTENDANCE_COLUMNS = {
  id: liveSessionAttendance.id,
  liveSessionId: liveSessionAttendance.liveSessionId,
  userId: liveSessionAttendance.userId,
  checkedInAt: liveSessionAttendance.checkedInAt,
  checkedOutAt: liveSessionAttendance.checkedOutAt,
};

export async function findAttendanceRecord(
  db: Queryable<Schema>,
  liveSessionId: string,
  userId: string,
): Promise<AttendanceRow | null> {
  const [row] = await db
    .select(ATTENDANCE_COLUMNS)
    .from(liveSessionAttendance)
    .where(
      and(eq(liveSessionAttendance.liveSessionId, liveSessionId), eq(liveSessionAttendance.userId, userId)),
    )
    .limit(1);
  return row ?? null;
}

export async function createAttendanceCheckIn(
  db: Queryable<Schema>,
  liveSessionId: string,
  userId: string,
  checkedInAt: Date,
): Promise<AttendanceRow> {
  const [row] = await db
    .insert(liveSessionAttendance)
    .values({ liveSessionId, userId, checkedInAt })
    .returning(ATTENDANCE_COLUMNS);
  if (!row) throw new Error("createAttendanceCheckIn: insert returned no row");
  return row;
}

export async function recordAttendanceCheckOut(
  db: Queryable<Schema>,
  liveSessionId: string,
  userId: string,
  checkedOutAt: Date,
): Promise<void> {
  await db
    .update(liveSessionAttendance)
    .set({ checkedOutAt })
    .where(
      and(eq(liveSessionAttendance.liveSessionId, liveSessionId), eq(liveSessionAttendance.userId, userId)),
    );
}

export interface ReminderRow {
  readonly id: string;
  readonly liveSessionId: string;
  readonly scheduledFor: Date;
  readonly offsetMinutesBeforeStart: number;
  readonly status: string;
}

const REMINDER_COLUMNS = {
  id: liveSessionReminders.id,
  liveSessionId: liveSessionReminders.liveSessionId,
  scheduledFor: liveSessionReminders.scheduledFor,
  offsetMinutesBeforeStart: liveSessionReminders.offsetMinutesBeforeStart,
  status: liveSessionReminders.status,
};

export async function createReminder(
  db: Queryable<Schema>,
  liveSessionId: string,
  scheduledFor: Date,
  offsetMinutesBeforeStart: number,
): Promise<ReminderRow> {
  const [row] = await db
    .insert(liveSessionReminders)
    .values({ liveSessionId, scheduledFor, offsetMinutesBeforeStart })
    .returning(REMINDER_COLUMNS);
  if (!row) throw new Error("createReminder: insert returned no row");
  return row;
}

export async function listRemindersForSession(
  db: Queryable<Schema>,
  liveSessionId: string,
): Promise<ReminderRow[]> {
  return db
    .select(REMINDER_COLUMNS)
    .from(liveSessionReminders)
    .where(eq(liveSessionReminders.liveSessionId, liveSessionId));
}

/** Cancels every still-"planned" reminder for a session - dok 19 §13 "Reschedule membatalkan job lama". Never deletes a row (append-only audit discipline); a "cancelled" row stays queryable. */
export async function cancelPendingReminders(db: Queryable<Schema>, liveSessionId: string): Promise<void> {
  await db
    .update(liveSessionReminders)
    .set({ status: "cancelled" })
    .where(
      and(eq(liveSessionReminders.liveSessionId, liveSessionId), eq(liveSessionReminders.status, "planned")),
    );
}
