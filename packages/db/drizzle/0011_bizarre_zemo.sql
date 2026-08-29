CREATE TYPE "public"."live_session_status" AS ENUM('draft', 'scheduled', 'live', 'ended', 'cancelled', 'rescheduled');--> statement-breakpoint
CREATE TYPE "public"."schedule_item_type" AS ENUM('live_class', 'exam_window', 'deadline', 'announcement', 'other');--> statement-breakpoint
CREATE TABLE "live_session_attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"live_session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"checked_in_at" timestamp with time zone,
	"checked_out_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "live_session_join_references" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"live_session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "live_session_reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"live_session_id" uuid NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"offset_minutes_before_start" integer NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"is_synthetic" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "live_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_item_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_meeting_ref" text NOT NULL,
	"host_user_id" uuid,
	"join_window_before_minutes" integer DEFAULT 15 NOT NULL,
	"join_window_after_minutes" integer DEFAULT 30 NOT NULL,
	"capacity" integer,
	"recording_id" uuid,
	"status" "live_session_status" DEFAULT 'scheduled' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"rescheduled_from_id" uuid,
	"reschedule_reason" text,
	"cancellation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"track_id" uuid,
	"type" "schedule_item_type" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"timezone" text NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "live_session_attendance" ADD CONSTRAINT "live_session_attendance_live_session_id_live_sessions_id_fk" FOREIGN KEY ("live_session_id") REFERENCES "public"."live_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_session_attendance" ADD CONSTRAINT "live_session_attendance_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_session_join_references" ADD CONSTRAINT "live_session_join_references_live_session_id_live_sessions_id_fk" FOREIGN KEY ("live_session_id") REFERENCES "public"."live_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_session_join_references" ADD CONSTRAINT "live_session_join_references_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_session_reminders" ADD CONSTRAINT "live_session_reminders_live_session_id_live_sessions_id_fk" FOREIGN KEY ("live_session_id") REFERENCES "public"."live_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_schedule_item_id_schedule_items_id_fk" FOREIGN KEY ("schedule_item_id") REFERENCES "public"."schedule_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_host_user_id_users_id_fk" FOREIGN KEY ("host_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_recording_id_recordings_id_fk" FOREIGN KEY ("recording_id") REFERENCES "public"."recordings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_items" ADD CONSTRAINT "schedule_items_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_items" ADD CONSTRAINT "schedule_items_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "live_session_attendance_session_user_uq" ON "live_session_attendance" USING btree ("live_session_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "live_session_join_reference_token_hash_uq" ON "live_session_join_references" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "live_session_join_reference_session_idx" ON "live_session_join_references" USING btree ("live_session_id");--> statement-breakpoint
CREATE INDEX "live_session_reminder_session_idx" ON "live_session_reminders" USING btree ("live_session_id");--> statement-breakpoint
CREATE INDEX "live_session_schedule_item_idx" ON "live_sessions" USING btree ("schedule_item_id");--> statement-breakpoint
CREATE INDEX "live_session_status_idx" ON "live_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "schedule_item_program_idx" ON "schedule_items" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "schedule_item_starts_at_idx" ON "schedule_items" USING btree ("starts_at");