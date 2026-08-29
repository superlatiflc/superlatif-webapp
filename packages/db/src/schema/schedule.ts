// Schedule, live class, reminder, and attendance schema (SCH-001).
//
// dok 14 §11 "Schedule domain". Five tables:
//
//   schedule_items             - the general calendar entry (live_class,
//                                 exam_window, deadline, announcement,
//                                 other), tied to a program/track and an
//                                 explicit authoring timezone (SCH-001).
//   live_sessions               - the live_class-specific occurrence.
//                                 `provider`/`externalMeetingRef` are
//                                 deliberately opaque strings, never
//                                 dereferenced against a real Zoom/Meet
//                                 provider anywhere in this task ("Jangan
//                                 integrasi provider video nyata dulu").
//                                 `recordingId` REUSES LRN-001's own
//                                 `recordings` table unchanged - this
//                                 schema does not define a second recording
//                                 model. Reschedule is append-only:
//                                 `rescheduledFromId` links a NEW occurrence
//                                 row to the OLD one, which itself keeps
//                                 `status = "rescheduled"` and its own
//                                 original startsAt/endsAt as a permanent
//                                 historical record (dok 14 §13 "Jadwal
//                                 lama tidak hilang dari audit").
//   live_session_join_references - the join-link secure-delivery table,
//                                 the SAME shape as LRN-001's
//                                 asset_delivery_references (only a token
//                                 hash is ever stored) but for a different
//                                 FK target (a session, not an asset) - see
//                                 program/schedule-service.ts's module doc.
//   live_session_attendance     - SCH-006's deliberately lightweight
//                                 check-in/check-out record. Never read by
//                                 any progress-rollup code in this
//                                 repository - "attendance ringan ... tanpa
//                                 menjadi dependency progress MVP".
//   live_session_reminders      - a SYNTHETIC scheduling record only ("cukup
//                                 outbox/synthetic scheduling model, bukan
//                                 pengiriman nyata" - founder instruction).
//                                 No delivery of any kind happens from this
//                                 table in this task; a future NTF-001 task
//                                 (already in the backlog, depends on
//                                 SCH-001) owns turning a "planned" row into
//                                 a real notification.

import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { liveSessionStatus, scheduleItemType } from "./enums.ts";
import { tracks } from "./curriculum.ts";
import { programs } from "./program.ts";
import { recordings } from "./assets.ts";
import { users } from "./identity.ts";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const scheduleItems = pgTable(
  "schedule_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id),
    trackId: uuid("track_id").references(() => tracks.id),
    type: scheduleItemType("type").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    /** IANA zone the item was authored/is displayed in (e.g. "Asia/Jakarta") - startsAt/endsAt themselves are always the canonical UTC instant (SCH-001 acceptance). */
    timezone: text("timezone").notNull(),
    status: text("status").notNull().default("scheduled"),
    createdAt: createdAt(),
  },
  (table) => [
    index("schedule_item_program_idx").on(table.programId),
    index("schedule_item_starts_at_idx").on(table.startsAt),
  ],
);

export const liveSessions = pgTable(
  "live_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    scheduleItemId: uuid("schedule_item_id")
      .notNull()
      .references(() => scheduleItems.id),
    provider: text("provider").notNull(),
    externalMeetingRef: text("external_meeting_ref").notNull(),
    hostUserId: uuid("host_user_id").references(() => users.id),
    joinWindowBeforeMinutes: integer("join_window_before_minutes").notNull().default(15),
    joinWindowAfterMinutes: integer("join_window_after_minutes").notNull().default(30),
    /** Only set when a real capacity limit exists - dok 14 §11 "attendee capacity hanya bila nyata". */
    capacity: integer("capacity"),
    recordingId: uuid("recording_id").references(() => recordings.id),
    status: liveSessionStatus("status").notNull().default("scheduled"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    /** Self-referential, deliberately without an enforced FK constraint - matching commerce.ts's `offers.upgradeFromOfferId` exactly (self-reference insert ordering is not worth the constraint at this stage). */
    rescheduledFromId: uuid("rescheduled_from_id"),
    rescheduleReason: text("reschedule_reason"),
    cancellationReason: text("cancellation_reason"),
    createdAt: createdAt(),
  },
  (table) => [
    index("live_session_schedule_item_idx").on(table.scheduleItemId),
    index("live_session_status_idx").on(table.status),
  ],
);

/**
 * Same shape as LRN-001's `asset_delivery_references` - only `tokenHash` is
 * ever stored, matching `identity.ts`'s `userSessions.secretHash`
 * precedent. A separate table (not a reuse of `asset_delivery_references`
 * itself) because the FK target is a live session, not an asset+placement -
 * see program/schedule-service.ts's module doc for why the CRYPTO
 * PRIMITIVES are still fully reused (`@superlatif/domain/program`'s
 * `generateDeliveryToken`/`hashDeliveryToken`/`computeDeliveryExpiry`).
 */
export const liveSessionJoinReferences = pgTable(
  "live_session_join_references",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    liveSessionId: uuid("live_session_id")
      .notNull()
      .references(() => liveSessions.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    tokenHash: text("token_hash").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("live_session_join_reference_token_hash_uq").on(table.tokenHash),
    index("live_session_join_reference_session_idx").on(table.liveSessionId),
  ],
);

/** SCH-006: deliberately lightweight, never a progress-rollup input. */
export const liveSessionAttendance = pgTable(
  "live_session_attendance",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    liveSessionId: uuid("live_session_id")
      .notNull()
      .references(() => liveSessions.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }),
    checkedOutAt: timestamp("checked_out_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("live_session_attendance_session_user_uq").on(table.liveSessionId, table.userId)],
);

/** A synthetic scheduling record only - "status" is "planned" | "cancelled"; nothing in this repository ever transitions a row here to "sent". */
export const liveSessionReminders = pgTable(
  "live_session_reminders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    liveSessionId: uuid("live_session_id")
      .notNull()
      .references(() => liveSessions.id),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    offsetMinutesBeforeStart: integer("offset_minutes_before_start").notNull(),
    status: text("status").notNull().default("planned"),
    isSynthetic: boolean("is_synthetic").notNull().default(true),
    createdAt: createdAt(),
  },
  (table) => [index("live_session_reminder_session_idx").on(table.liveSessionId)],
);
