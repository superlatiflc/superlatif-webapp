CREATE TABLE "program_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_activity_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "program_enrollments" ADD CONSTRAINT "program_enrollments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_enrollments" ADD CONSTRAINT "program_enrollments_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "program_enrollment_user_program_uq" ON "program_enrollments" USING btree ("user_id","program_id");--> statement-breakpoint
CREATE INDEX "program_enrollment_user_idx" ON "program_enrollments" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "programs_code_uq" ON "programs" USING btree ("code");