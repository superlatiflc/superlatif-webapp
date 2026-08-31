CREATE TABLE "result_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"submission_id" uuid NOT NULL,
	"scoring_policy_version_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"state" text NOT NULL,
	"scores" jsonb NOT NULL,
	"evaluation" jsonb NOT NULL,
	"total_score" double precision NOT NULL,
	"overall_passed" boolean,
	"scoring_engine_version" text NOT NULL,
	"input_checksum" text NOT NULL,
	"released_at" timestamp with time zone,
	"corrected_at" timestamp with time zone,
	"computed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "result_versions" ADD CONSTRAINT "result_versions_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_versions" ADD CONSTRAINT "result_versions_submission_id_attempt_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."attempt_submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_versions" ADD CONSTRAINT "result_versions_scoring_policy_version_id_scoring_policy_versions_id_fk" FOREIGN KEY ("scoring_policy_version_id") REFERENCES "public"."scoring_policy_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "result_version_attempt_version_uq" ON "result_versions" USING btree ("attempt_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "result_version_attempt_current_uq" ON "result_versions" USING btree ("attempt_id") WHERE "result_versions"."is_current" = true;