CREATE TYPE "public"."attempt_status" AS ENUM('created', 'in_progress', 'submitting', 'submitted', 'scoring', 'scored', 'voided');--> statement-breakpoint
CREATE TABLE "attempt_question_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"section_code" text NOT NULL,
	"order" integer NOT NULL,
	"question_version_id" uuid NOT NULL,
	"presented_option_order" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attempt_writer_leases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"renewed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attempt_writer_lease_revoked_shape_ck" CHECK ("attempt_writer_leases"."is_active" = true OR ("attempt_writer_leases"."is_active" = false AND "attempt_writer_leases"."revoked_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"exam_form_version_id" uuid NOT NULL,
	"blueprint_version_id" uuid NOT NULL,
	"scoring_policy_version_id" uuid NOT NULL,
	"status" "attempt_status" DEFAULT 'created' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"deadline_at" timestamp with time zone NOT NULL,
	"late_sync_cutoff_at" timestamp with time zone NOT NULL,
	"submitted_at" timestamp with time zone,
	"attempt_revision" integer DEFAULT 0 NOT NULL,
	"snapshot_checksum" text NOT NULL,
	"start_idempotency_key" text NOT NULL,
	"start_request_hash" text NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attempt_question_instances" ADD CONSTRAINT "attempt_question_instances_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_question_instances" ADD CONSTRAINT "attempt_question_instances_question_version_id_question_versions_id_fk" FOREIGN KEY ("question_version_id") REFERENCES "public"."question_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_writer_leases" ADD CONSTRAINT "attempt_writer_leases_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_batch_id_exam_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."exam_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_exam_form_version_id_exam_form_versions_id_fk" FOREIGN KEY ("exam_form_version_id") REFERENCES "public"."exam_form_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_blueprint_version_id_exam_blueprint_versions_id_fk" FOREIGN KEY ("blueprint_version_id") REFERENCES "public"."exam_blueprint_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_scoring_policy_version_id_scoring_policy_versions_id_fk" FOREIGN KEY ("scoring_policy_version_id") REFERENCES "public"."scoring_policy_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attempt_question_instance_attempt_sequence_uq" ON "attempt_question_instances" USING btree ("attempt_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "attempt_question_instance_attempt_question_uq" ON "attempt_question_instances" USING btree ("attempt_id","question_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attempt_writer_lease_active_uq" ON "attempt_writer_leases" USING btree ("attempt_id") WHERE "attempt_writer_leases"."is_active";--> statement-breakpoint
CREATE UNIQUE INDEX "attempts_user_batch_active_uq" ON "attempts" USING btree ("user_id","batch_id") WHERE "attempts"."status" <> 'voided';--> statement-breakpoint
CREATE UNIQUE INDEX "attempts_user_idempotency_key_uq" ON "attempts" USING btree ("user_id","start_idempotency_key");