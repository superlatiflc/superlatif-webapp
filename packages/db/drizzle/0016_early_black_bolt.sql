CREATE TYPE "public"."batch_window_type" AS ENUM('catalogue', 'sale', 'registration', 'attempt', 'late_sync_cutoff', 'provisional_result_release', 'final_result_release', 'leaderboard_release', 'explanation_release', 'access_end');--> statement-breakpoint
CREATE TABLE "batch_windows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_batch_id" uuid NOT NULL,
	"window_type" "batch_window_type" NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "batch_window_ranged_shape_ck" CHECK (("batch_windows"."window_type" IN ('registration', 'attempt') AND "batch_windows"."ends_at" IS NOT NULL AND "batch_windows"."ends_at" > "batch_windows"."starts_at")
        OR ("batch_windows"."window_type" NOT IN ('registration', 'attempt') AND "batch_windows"."ends_at" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "exam_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"exam_form_version_id" uuid NOT NULL,
	"title" text NOT NULL,
	"timezone" text NOT NULL,
	"ranking_attempt_rule" text DEFAULT 'first' NOT NULL,
	"leaderboard_enabled" boolean DEFAULT true NOT NULL,
	"status" "record_status" DEFAULT 'draft' NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_reason" text,
	"checksum" text NOT NULL,
	"created_by_user_id" uuid,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "batch_windows" ADD CONSTRAINT "batch_windows_exam_batch_id_exam_batches_id_fk" FOREIGN KEY ("exam_batch_id") REFERENCES "public"."exam_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_batches" ADD CONSTRAINT "exam_batches_exam_form_version_id_exam_form_versions_id_fk" FOREIGN KEY ("exam_form_version_id") REFERENCES "public"."exam_form_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_batches" ADD CONSTRAINT "exam_batches_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "batch_window_batch_type_uq" ON "batch_windows" USING btree ("exam_batch_id","window_type");--> statement-breakpoint
CREATE UNIQUE INDEX "exam_batch_code_uq" ON "exam_batches" USING btree ("code");