CREATE TYPE "public"."question_type" AS ENUM('single_choice', 'multiple_choice', 'true_false', 'weighted_choice', 'numeric');--> statement-breakpoint
CREATE TABLE "question_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_version_id" uuid,
	"stimulus_version_id" uuid,
	"placement" text NOT NULL,
	"option_code" text,
	"storage_ref" text NOT NULL,
	"mime_type" text,
	"checksum" text,
	"alt_text" text,
	"image_purpose" text DEFAULT 'informative' NOT NULL,
	"malware_scan_clean" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_version_id" uuid NOT NULL,
	"option_code" text NOT NULL,
	"order" integer NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_version_secrets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_version_id" uuid NOT NULL,
	"answer_key" jsonb NOT NULL,
	"checksum" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"type" "question_type" NOT NULL,
	"status" "record_status" DEFAULT 'draft' NOT NULL,
	"stimulus_version_id" uuid,
	"classification" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"stem_document" jsonb NOT NULL,
	"explanation_document" jsonb,
	"checksum" text NOT NULL,
	"created_by_user_id" uuid,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stimuli" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stimulus_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stimulus_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" "record_status" DEFAULT 'draft' NOT NULL,
	"body_document" jsonb NOT NULL,
	"checksum" text NOT NULL,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "question_assets" ADD CONSTRAINT "question_assets_question_version_id_question_versions_id_fk" FOREIGN KEY ("question_version_id") REFERENCES "public"."question_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_assets" ADD CONSTRAINT "question_assets_stimulus_version_id_stimulus_versions_id_fk" FOREIGN KEY ("stimulus_version_id") REFERENCES "public"."stimulus_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_question_version_id_question_versions_id_fk" FOREIGN KEY ("question_version_id") REFERENCES "public"."question_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_version_secrets" ADD CONSTRAINT "question_version_secrets_question_version_id_question_versions_id_fk" FOREIGN KEY ("question_version_id") REFERENCES "public"."question_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_versions" ADD CONSTRAINT "question_versions_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_versions" ADD CONSTRAINT "question_versions_stimulus_version_id_stimulus_versions_id_fk" FOREIGN KEY ("stimulus_version_id") REFERENCES "public"."stimulus_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_versions" ADD CONSTRAINT "question_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stimulus_versions" ADD CONSTRAINT "stimulus_versions_stimulus_id_stimuli_id_fk" FOREIGN KEY ("stimulus_id") REFERENCES "public"."stimuli"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "question_asset_question_version_idx" ON "question_assets" USING btree ("question_version_id");--> statement-breakpoint
CREATE INDEX "question_asset_stimulus_version_idx" ON "question_assets" USING btree ("stimulus_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "question_option_version_code_uq" ON "question_options" USING btree ("question_version_id","option_code");--> statement-breakpoint
CREATE INDEX "question_option_version_idx" ON "question_options" USING btree ("question_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "question_version_secret_version_uq" ON "question_version_secrets" USING btree ("question_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "question_version_question_version_uq" ON "question_versions" USING btree ("question_id","version");--> statement-breakpoint
CREATE INDEX "question_version_stimulus_idx" ON "question_versions" USING btree ("stimulus_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "question_code_uq" ON "questions" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "stimulus_code_uq" ON "stimuli" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "stimulus_version_stimulus_version_uq" ON "stimulus_versions" USING btree ("stimulus_id","version");