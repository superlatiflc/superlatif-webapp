CREATE TABLE "correction_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"current_result_version_id" uuid NOT NULL,
	"corrected_scoring_policy_version_id" uuid NOT NULL,
	"cause" text NOT NULL,
	"evidence_ref" text,
	"requested_by_user_id" uuid NOT NULL,
	"correlation_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "correction_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"correction_case_id" uuid NOT NULL,
	"decided_by_user_id" uuid NOT NULL,
	"outcome" text NOT NULL,
	"reason" text NOT NULL,
	"correlation_id" text NOT NULL,
	"execution_status" text,
	"execution_result" jsonb,
	"new_result_version_id" uuid,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "correction_cases" ADD CONSTRAINT "correction_cases_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correction_cases" ADD CONSTRAINT "correction_cases_current_result_version_id_result_versions_id_fk" FOREIGN KEY ("current_result_version_id") REFERENCES "public"."result_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correction_cases" ADD CONSTRAINT "correction_cases_corrected_scoring_policy_version_id_scoring_policy_versions_id_fk" FOREIGN KEY ("corrected_scoring_policy_version_id") REFERENCES "public"."scoring_policy_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correction_cases" ADD CONSTRAINT "correction_cases_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correction_decisions" ADD CONSTRAINT "correction_decisions_correction_case_id_correction_cases_id_fk" FOREIGN KEY ("correction_case_id") REFERENCES "public"."correction_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correction_decisions" ADD CONSTRAINT "correction_decisions_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correction_decisions" ADD CONSTRAINT "correction_decisions_new_result_version_id_result_versions_id_fk" FOREIGN KEY ("new_result_version_id") REFERENCES "public"."result_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "correction_case_attempt_idx" ON "correction_cases" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "correction_decision_case_idx" ON "correction_decisions" USING btree ("correction_case_id");