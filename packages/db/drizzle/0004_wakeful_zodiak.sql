CREATE TYPE "public"."change_decision_outcome" AS ENUM('approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."change_execution_status" AS ENUM('executed', 'execution_failed');--> statement-breakpoint
CREATE TABLE "access_change_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"change_request_id" uuid NOT NULL,
	"decided_by_user_id" uuid NOT NULL,
	"outcome" "change_decision_outcome" NOT NULL,
	"reason" text NOT NULL,
	"correlation_id" text NOT NULL,
	"execution_status" "change_execution_status",
	"execution_result" jsonb,
	"result_grant_id" uuid,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "access_change_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"change_type" text NOT NULL,
	"target_user_id" uuid NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"correlation_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"preview_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "access_change_decisions" ADD CONSTRAINT "access_change_decisions_change_request_id_access_change_requests_id_fk" FOREIGN KEY ("change_request_id") REFERENCES "public"."access_change_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_change_decisions" ADD CONSTRAINT "access_change_decisions_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_change_decisions" ADD CONSTRAINT "access_change_decisions_result_grant_id_access_grants_id_fk" FOREIGN KEY ("result_grant_id") REFERENCES "public"."access_grants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_change_requests" ADD CONSTRAINT "access_change_requests_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_change_requests" ADD CONSTRAINT "access_change_requests_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_change_decision_request_idx" ON "access_change_decisions" USING btree ("change_request_id");--> statement-breakpoint
CREATE INDEX "access_change_request_target_idx" ON "access_change_requests" USING btree ("target_user_id");