CREATE TABLE "commerce_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "purchase_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_id" uuid NOT NULL,
	"normalized_event_id" uuid NOT NULL,
	"status" "purchase_state" NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"transition_outcome" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"site" text NOT NULL,
	"external_order_id" text NOT NULL,
	"user_id" uuid,
	"offer_id" uuid,
	"external_sku_id" text NOT NULL,
	"status" "purchase_state" NOT NULL,
	"currency" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"ordered_at" timestamp with time zone NOT NULL,
	"last_event_occurred_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"refunded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reconciliation_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_type" text NOT NULL,
	"severity" text DEFAULT 'review_required' NOT NULL,
	"related_user_id" uuid,
	"related_purchase_id" uuid,
	"related_normalized_event_id" uuid,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "commerce_outbox" ADD CONSTRAINT "commerce_outbox_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_events" ADD CONSTRAINT "purchase_events_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_events" ADD CONSTRAINT "purchase_events_normalized_event_id_normalized_commerce_events_id_fk" FOREIGN KEY ("normalized_event_id") REFERENCES "public"."normalized_commerce_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_cases" ADD CONSTRAINT "reconciliation_cases_related_user_id_users_id_fk" FOREIGN KEY ("related_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_cases" ADD CONSTRAINT "reconciliation_cases_related_purchase_id_purchases_id_fk" FOREIGN KEY ("related_purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_cases" ADD CONSTRAINT "reconciliation_cases_related_normalized_event_id_normalized_commerce_events_id_fk" FOREIGN KEY ("related_normalized_event_id") REFERENCES "public"."normalized_commerce_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "commerce_outbox_status_idx" ON "commerce_outbox" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_event_normalized_event_uq" ON "purchase_events" USING btree ("normalized_event_id");--> statement-breakpoint
CREATE INDEX "purchase_event_purchase_idx" ON "purchase_events" USING btree ("purchase_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_provider_site_order_uq" ON "purchases" USING btree ("provider","site","external_order_id");--> statement-breakpoint
CREATE INDEX "purchase_user_idx" ON "purchases" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "purchase_offer_idx" ON "purchases" USING btree ("offer_id");--> statement-breakpoint
CREATE INDEX "reconciliation_case_purchase_idx" ON "reconciliation_cases" USING btree ("related_purchase_id");--> statement-breakpoint
CREATE INDEX "reconciliation_case_status_idx" ON "reconciliation_cases" USING btree ("status");