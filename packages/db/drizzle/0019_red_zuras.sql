CREATE TABLE "attempt_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"triggered_by" text NOT NULL,
	"actor_user_id" uuid,
	"attempt_revision_at_event" integer NOT NULL,
	"answer_set_checksum" text,
	"recovery_state" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attempt_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"mutation_id" uuid,
	"triggered_by" text NOT NULL,
	"answer_set_checksum" text NOT NULL,
	"attempt_revision_at_submit" integer NOT NULL,
	"acknowledged_unanswered_count" integer,
	"submitted_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scoring_job_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"event_type" text DEFAULT 'score_attempt' NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "attempt_audit_events" ADD CONSTRAINT "attempt_audit_events_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_audit_events" ADD CONSTRAINT "attempt_audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_submissions" ADD CONSTRAINT "attempt_submissions_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_job_outbox" ADD CONSTRAINT "scoring_job_outbox_submission_id_attempt_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."attempt_submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_job_outbox" ADD CONSTRAINT "scoring_job_outbox_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attempt_submissions_attempt_id_uq" ON "attempt_submissions" USING btree ("attempt_id");