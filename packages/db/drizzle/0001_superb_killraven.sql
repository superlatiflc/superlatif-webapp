CREATE TYPE "public"."grant_event_type" AS ENUM('activated', 'suspended', 'reinstated', 'revoked', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."record_status" AS ENUM('draft', 'in_review', 'changes_requested', 'approved', 'published', 'archived');--> statement-breakpoint
CREATE TABLE "access_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"source_key" text NOT NULL,
	"access_policy_id" uuid NOT NULL,
	"valid_from" timestamp with time zone,
	"valid_to" timestamp with time zone,
	"issued_by_user_id" uuid,
	"issued_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "access_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"status" "record_status" DEFAULT 'draft' NOT NULL,
	"config" jsonb NOT NULL,
	"checksum" text NOT NULL,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grant_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grant_id" uuid NOT NULL,
	"event_type" "grant_event_type" NOT NULL,
	"actor_user_id" uuid,
	"actor_source_type" text,
	"actor_source_id" text,
	"reason" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_access_policy_id_access_policies_id_fk" FOREIGN KEY ("access_policy_id") REFERENCES "public"."access_policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_issued_by_user_id_users_id_fk" FOREIGN KEY ("issued_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_events" ADD CONSTRAINT "grant_events_grant_id_access_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."access_grants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_events" ADD CONSTRAINT "grant_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "access_grant_source_key_uq" ON "access_grants" USING btree ("user_id","source_type","source_key");--> statement-breakpoint
CREATE INDEX "access_grant_user_idx" ON "access_grants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "access_grant_policy_idx" ON "access_grants" USING btree ("access_policy_id");--> statement-breakpoint
CREATE UNIQUE INDEX "access_policy_code_version_uq" ON "access_policies" USING btree ("code","version");--> statement-breakpoint
CREATE INDEX "grant_event_grant_idx" ON "grant_events" USING btree ("grant_id");--> statement-breakpoint
CREATE INDEX "grant_event_type_idx" ON "grant_events" USING btree ("grant_id","event_type");