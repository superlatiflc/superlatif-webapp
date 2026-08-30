CREATE TYPE "public"."activation_scope" AS ENUM('draft_only', 'staging', 'production');--> statement-breakpoint
CREATE TABLE "exam_blueprint_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"blueprint_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" "record_status" DEFAULT 'draft' NOT NULL,
	"activation_scope" "activation_scope" DEFAULT 'draft_only' NOT NULL,
	"title" text NOT NULL,
	"config" jsonb NOT NULL,
	"checksum" text NOT NULL,
	"created_by_user_id" uuid,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_blueprints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"exam_family_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_families" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_form_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_form_version_id" uuid NOT NULL,
	"section_code" text NOT NULL,
	"order" integer NOT NULL,
	"question_version_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_form_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_form_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" "record_status" DEFAULT 'draft' NOT NULL,
	"blueprint_version_id" uuid NOT NULL,
	"scoring_policy_version_id" uuid NOT NULL,
	"checksum" text NOT NULL,
	"created_by_user_id" uuid,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_forms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scoring_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scoring_policy_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scoring_policy_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" "record_status" DEFAULT 'draft' NOT NULL,
	"policy_config" jsonb NOT NULL,
	"checksum" text NOT NULL,
	"created_by_user_id" uuid,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exam_blueprint_versions" ADD CONSTRAINT "exam_blueprint_versions_blueprint_id_exam_blueprints_id_fk" FOREIGN KEY ("blueprint_id") REFERENCES "public"."exam_blueprints"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_blueprint_versions" ADD CONSTRAINT "exam_blueprint_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_blueprints" ADD CONSTRAINT "exam_blueprints_exam_family_id_exam_families_id_fk" FOREIGN KEY ("exam_family_id") REFERENCES "public"."exam_families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_form_items" ADD CONSTRAINT "exam_form_items_exam_form_version_id_exam_form_versions_id_fk" FOREIGN KEY ("exam_form_version_id") REFERENCES "public"."exam_form_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_form_items" ADD CONSTRAINT "exam_form_items_question_version_id_question_versions_id_fk" FOREIGN KEY ("question_version_id") REFERENCES "public"."question_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_form_versions" ADD CONSTRAINT "exam_form_versions_exam_form_id_exam_forms_id_fk" FOREIGN KEY ("exam_form_id") REFERENCES "public"."exam_forms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_form_versions" ADD CONSTRAINT "exam_form_versions_blueprint_version_id_exam_blueprint_versions_id_fk" FOREIGN KEY ("blueprint_version_id") REFERENCES "public"."exam_blueprint_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_form_versions" ADD CONSTRAINT "exam_form_versions_scoring_policy_version_id_scoring_policy_versions_id_fk" FOREIGN KEY ("scoring_policy_version_id") REFERENCES "public"."scoring_policy_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_form_versions" ADD CONSTRAINT "exam_form_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_policy_versions" ADD CONSTRAINT "scoring_policy_versions_scoring_policy_id_scoring_policies_id_fk" FOREIGN KEY ("scoring_policy_id") REFERENCES "public"."scoring_policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_policy_versions" ADD CONSTRAINT "scoring_policy_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "exam_blueprint_version_blueprint_version_uq" ON "exam_blueprint_versions" USING btree ("blueprint_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "exam_blueprint_code_uq" ON "exam_blueprints" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "exam_family_code_uq" ON "exam_families" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "exam_form_item_version_question_uq" ON "exam_form_items" USING btree ("exam_form_version_id","question_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "exam_form_item_version_section_order_uq" ON "exam_form_items" USING btree ("exam_form_version_id","section_code","order");--> statement-breakpoint
CREATE UNIQUE INDEX "exam_form_version_form_version_uq" ON "exam_form_versions" USING btree ("exam_form_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "exam_form_code_uq" ON "exam_forms" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "scoring_policy_code_uq" ON "scoring_policies" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "scoring_policy_version_policy_version_uq" ON "scoring_policy_versions" USING btree ("scoring_policy_id","version");