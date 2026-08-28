CREATE TYPE "public"."target_type" AS ENUM('program', 'program_track', 'module', 'resource', 'live_session', 'live_session_series', 'exam_batch', 'batch_collection', 'community', 'capability');--> statement-breakpoint
CREATE TABLE "external_sku_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"site" text NOT NULL,
	"external_sku_id" text NOT NULL,
	"mapping_version" integer NOT NULL,
	"offer_id" uuid NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_to" timestamp with time zone,
	"priority" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_version_id" uuid NOT NULL,
	"code" text NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"status" "record_status" DEFAULT 'draft' NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"list_amount_minor" bigint,
	"current_amount_minor" bigint NOT NULL,
	"currency" text DEFAULT 'IDR' NOT NULL,
	"sale_starts_at" timestamp with time zone,
	"sale_ends_at" timestamp with time zone,
	"quota" integer,
	"terms_version" text NOT NULL,
	"sold_count_source" text,
	"reservation_policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"return_url_template" text,
	"upgrade_from_offer_id" uuid,
	"eligibility_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"checksum" text NOT NULL,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_version_id" uuid NOT NULL,
	"component_code" text NOT NULL,
	"access_policy_id" uuid NOT NULL,
	"target_type" "target_type" NOT NULL,
	"target_ref" text NOT NULL,
	"include_descendants" boolean DEFAULT false NOT NULL,
	"overrides" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" "record_status" DEFAULT 'draft' NOT NULL,
	"benefits_summary" jsonb NOT NULL,
	"terms_version" text NOT NULL,
	"checksum" text NOT NULL,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "external_sku_mappings" ADD CONSTRAINT "external_sku_mappings_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_product_version_id_product_versions_id_fk" FOREIGN KEY ("product_version_id") REFERENCES "public"."product_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_components" ADD CONSTRAINT "product_components_product_version_id_product_versions_id_fk" FOREIGN KEY ("product_version_id") REFERENCES "public"."product_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_components" ADD CONSTRAINT "product_components_access_policy_id_access_policies_id_fk" FOREIGN KEY ("access_policy_id") REFERENCES "public"."access_policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_versions" ADD CONSTRAINT "product_versions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "external_sku_mapping_start_uq" ON "external_sku_mappings" USING btree ("provider","site","external_sku_id","valid_from");--> statement-breakpoint
CREATE INDEX "external_sku_mapping_lookup_idx" ON "external_sku_mappings" USING btree ("provider","site","external_sku_id");--> statement-breakpoint
CREATE UNIQUE INDEX "offer_code_version_uq" ON "offers" USING btree ("code","version");--> statement-breakpoint
CREATE INDEX "offer_product_version_idx" ON "offers" USING btree ("product_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_component_code_uq" ON "product_components" USING btree ("product_version_id","component_code");--> statement-breakpoint
CREATE UNIQUE INDEX "product_versions_product_version_uq" ON "product_versions" USING btree ("product_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "products_code_uq" ON "products" USING btree ("code");