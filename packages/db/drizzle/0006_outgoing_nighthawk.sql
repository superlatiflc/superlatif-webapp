CREATE TABLE "modules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stage_id" uuid NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"position" integer NOT NULL,
	"status" "record_status" DEFAULT 'published' NOT NULL,
	"release_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"completion_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "program_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"status" "record_status" DEFAULT 'draft' NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resource_placements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"released_resource_version_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"release_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"prerequisite_placement_ids" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resource_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"status" "record_status" DEFAULT 'draft' NOT NULL,
	"body" jsonb NOT NULL,
	"completion_policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"accessibility_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roadmap_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"track_id" uuid NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"position" integer NOT NULL,
	"completion_config" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_version_id" uuid NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"position" integer NOT NULL,
	"release_config" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "program_enrollments" ADD COLUMN "pinned_program_version_id" uuid;--> statement-breakpoint
ALTER TABLE "modules" ADD CONSTRAINT "modules_stage_id_roadmap_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."roadmap_stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_versions" ADD CONSTRAINT "program_versions_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_placements" ADD CONSTRAINT "resource_placements_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_placements" ADD CONSTRAINT "resource_placements_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_placements" ADD CONSTRAINT "resource_placements_released_resource_version_id_resource_versions_id_fk" FOREIGN KEY ("released_resource_version_id") REFERENCES "public"."resource_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_versions" ADD CONSTRAINT "resource_versions_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roadmap_stages" ADD CONSTRAINT "roadmap_stages_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_program_version_id_program_versions_id_fk" FOREIGN KEY ("program_version_id") REFERENCES "public"."program_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "module_stage_code_uq" ON "modules" USING btree ("stage_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "program_version_uq" ON "program_versions" USING btree ("program_id","version");--> statement-breakpoint
CREATE INDEX "resource_placement_module_idx" ON "resource_placements" USING btree ("module_id");--> statement-breakpoint
CREATE UNIQUE INDEX "resource_versions_uq" ON "resource_versions" USING btree ("resource_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "resources_code_uq" ON "resources" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "roadmap_stage_track_code_uq" ON "roadmap_stages" USING btree ("track_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "track_program_version_code_uq" ON "tracks" USING btree ("program_version_id","code");--> statement-breakpoint
ALTER TABLE "program_enrollments" ADD CONSTRAINT "program_enrollments_pinned_program_version_id_program_versions_id_fk" FOREIGN KEY ("pinned_program_version_id") REFERENCES "public"."program_versions"("id") ON DELETE no action ON UPDATE no action;