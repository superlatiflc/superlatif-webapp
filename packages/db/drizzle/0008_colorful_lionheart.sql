CREATE TYPE "public"."purchase_state" AS ENUM('pending', 'paid', 'failed', 'expired', 'cancelled', 'refunded_partial', 'refunded_full', 'chargeback');--> statement-breakpoint
CREATE TABLE "commerce_event_quarantine" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"raw_event_id" uuid NOT NULL,
	"reason_code" text NOT NULL,
	"detail" text NOT NULL,
	"quarantined_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "normalized_commerce_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"raw_event_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"site" text NOT NULL,
	"event_key" text NOT NULL,
	"type" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"external_order_id" text NOT NULL,
	"order_status" "purchase_state" NOT NULL,
	"currency" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"external_user_id" text NOT NULL,
	"external_sku_id" text NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_commerce_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"site" text NOT NULL,
	"event_key" text NOT NULL,
	"signature_outcome" text NOT NULL,
	"payload_checksum" text NOT NULL,
	"raw_payload_redacted" jsonb NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"correlation_id" text NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "commerce_event_quarantine" ADD CONSTRAINT "commerce_event_quarantine_raw_event_id_raw_commerce_events_id_fk" FOREIGN KEY ("raw_event_id") REFERENCES "public"."raw_commerce_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "normalized_commerce_events" ADD CONSTRAINT "normalized_commerce_events_raw_event_id_raw_commerce_events_id_fk" FOREIGN KEY ("raw_event_id") REFERENCES "public"."raw_commerce_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "commerce_event_quarantine_raw_event_uq" ON "commerce_event_quarantine" USING btree ("raw_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "normalized_commerce_event_raw_event_uq" ON "normalized_commerce_events" USING btree ("raw_event_id");--> statement-breakpoint
CREATE INDEX "normalized_commerce_event_order_idx" ON "normalized_commerce_events" USING btree ("provider","external_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "raw_commerce_event_provider_key_uq" ON "raw_commerce_events" USING btree ("provider","event_key");--> statement-breakpoint
CREATE INDEX "raw_commerce_event_status_idx" ON "raw_commerce_events" USING btree ("status");