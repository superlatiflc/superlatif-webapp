CREATE TABLE "answer_mutations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"instance_id" uuid NOT NULL,
	"client_mutation_id" uuid NOT NULL,
	"lease_token_hash" text NOT NULL,
	"expected_revision" integer NOT NULL,
	"payload" jsonb,
	"outcome" text NOT NULL,
	"resulting_revision" integer,
	"captured_at_client" timestamp with time zone,
	"server_received_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "answer_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"instance_id" uuid NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"payload" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "answer_mutations" ADD CONSTRAINT "answer_mutations_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer_mutations" ADD CONSTRAINT "answer_mutations_instance_id_attempt_question_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."attempt_question_instances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer_states" ADD CONSTRAINT "answer_states_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer_states" ADD CONSTRAINT "answer_states_instance_id_attempt_question_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."attempt_question_instances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "answer_mutation_attempt_instance_client_uq" ON "answer_mutations" USING btree ("attempt_id","instance_id","client_mutation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "answer_state_attempt_instance_uq" ON "answer_states" USING btree ("attempt_id","instance_id");