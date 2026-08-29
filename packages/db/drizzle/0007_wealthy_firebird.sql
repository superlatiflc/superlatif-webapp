CREATE TYPE "public"."recording_processing_status" AS ENUM('pending', 'processing', 'ready', 'failed', 'archived');--> statement-breakpoint
CREATE TABLE "asset_delivery_references" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"placement_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_version_id" uuid NOT NULL,
	"role" text DEFAULT 'primary' NOT NULL,
	"mime_type" text,
	"size_bytes" integer,
	"duration_seconds" integer,
	"storage_ref" text NOT NULL,
	"checksum" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recordings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_version_id" uuid NOT NULL,
	"source_kind" text NOT NULL,
	"processing_status" "recording_processing_status" DEFAULT 'pending' NOT NULL,
	"provider_ref" text,
	"asset_id" uuid,
	"caption_available" boolean DEFAULT false NOT NULL,
	"ready_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asset_delivery_references" ADD CONSTRAINT "asset_delivery_references_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_delivery_references" ADD CONSTRAINT "asset_delivery_references_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_delivery_references" ADD CONSTRAINT "asset_delivery_references_placement_id_resource_placements_id_fk" FOREIGN KEY ("placement_id") REFERENCES "public"."resource_placements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_resource_version_id_resource_versions_id_fk" FOREIGN KEY ("resource_version_id") REFERENCES "public"."resource_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_resource_version_id_resource_versions_id_fk" FOREIGN KEY ("resource_version_id") REFERENCES "public"."resource_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "asset_delivery_reference_token_hash_uq" ON "asset_delivery_references" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "asset_delivery_reference_asset_idx" ON "asset_delivery_references" USING btree ("asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "asset_resource_version_role_uq" ON "assets" USING btree ("resource_version_id","role");--> statement-breakpoint
CREATE UNIQUE INDEX "recording_resource_version_uq" ON "recordings" USING btree ("resource_version_id");