ALTER TABLE "reconciliation_cases" ADD COLUMN "assigned_to_user_id" uuid;--> statement-breakpoint
ALTER TABLE "reconciliation_cases" ADD COLUMN "resolved_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "reconciliation_cases" ADD COLUMN "resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reconciliation_cases" ADD COLUMN "resolution_reason" text;--> statement-breakpoint
ALTER TABLE "reconciliation_cases" ADD CONSTRAINT "reconciliation_cases_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_cases" ADD CONSTRAINT "reconciliation_cases_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;