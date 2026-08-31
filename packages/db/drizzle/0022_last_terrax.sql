CREATE TABLE "ranking_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ranking_snapshot_id" uuid NOT NULL,
	"ranking_subject_id" uuid NOT NULL,
	"result_version_id" uuid NOT NULL,
	"rank" integer NOT NULL,
	"total_score" double precision NOT NULL,
	"score_summary" jsonb NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL,
	"cohort" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ranking_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"state" text NOT NULL,
	"ranking_attempt_rule" text NOT NULL,
	"policy_version" text NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ranking_subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"subject_token" text NOT NULL,
	"public_opt_in" boolean DEFAULT false NOT NULL,
	"display_alias" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ranking_entries" ADD CONSTRAINT "ranking_entries_ranking_snapshot_id_ranking_snapshots_id_fk" FOREIGN KEY ("ranking_snapshot_id") REFERENCES "public"."ranking_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranking_entries" ADD CONSTRAINT "ranking_entries_ranking_subject_id_ranking_subjects_id_fk" FOREIGN KEY ("ranking_subject_id") REFERENCES "public"."ranking_subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranking_entries" ADD CONSTRAINT "ranking_entries_result_version_id_result_versions_id_fk" FOREIGN KEY ("result_version_id") REFERENCES "public"."result_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranking_snapshots" ADD CONSTRAINT "ranking_snapshots_batch_id_exam_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."exam_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranking_subjects" ADD CONSTRAINT "ranking_subjects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ranking_entry_snapshot_subject_uq" ON "ranking_entries" USING btree ("ranking_snapshot_id","ranking_subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ranking_snapshot_batch_version_uq" ON "ranking_snapshots" USING btree ("batch_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "ranking_snapshot_batch_current_uq" ON "ranking_snapshots" USING btree ("batch_id") WHERE "ranking_snapshots"."is_current" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "ranking_subject_user_uq" ON "ranking_subjects" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ranking_subject_token_uq" ON "ranking_subjects" USING btree ("subject_token");