CREATE TABLE "question_import_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_checksum" text NOT NULL,
	"job_mode" text NOT NULL,
	"template_version" text NOT NULL,
	"status" text NOT NULL,
	"result_summary" jsonb NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "question_import_jobs" ADD CONSTRAINT "question_import_jobs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "question_import_job_checksum_uq" ON "question_import_jobs" USING btree ("content_checksum");