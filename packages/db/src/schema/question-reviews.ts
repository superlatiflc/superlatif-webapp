// Question version review/moderation audit trail (QST-003).
//
// dok 12 §31 "A09 — Review Queue" names an "open history" action and the
// founder instruction requires "rejected revisions harus preserve
// history." QST-001's own `question_versions.status` only ever holds the
// CURRENT state - it has no memory of who requested changes, why, or what
// a reviewer actually checked before approving. This table is that memory:
// one APPEND-ONLY row per moderation action
// (submitted_for_review/changes_requested/approved/published/archived),
// never updated or deleted - the same "history preserved" pattern
// `purchase_events`/`grant_events`/`role_assignment_events` already use
// elsewhere in this codebase.
//
// Scoped to `question_versions` only in this task - stimulus review
// history is not modeled (a documented scope reduction, see ADR-063), so
// this column is NOT NULL rather than the nullable XOR-owner pattern
// `question_assets` uses.

import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { questionVersions } from "./questions.ts";
import { users } from "./identity.ts";

export const questionVersionReviews = pgTable("question_version_reviews", {
  id: uuid("id").defaultRandom().primaryKey(),
  questionVersionId: uuid("question_version_id")
    .notNull()
    .references(() => questionVersions.id),
  actorUserId: uuid("actor_user_id").references(() => users.id),
  /** "submitted_for_review" | "changes_requested" | "approved" | "published" | "archived". */
  action: text("action").notNull(),
  /** Required by the service layer only for "changes_requested" (QuestionReasonRequiredError); optional everywhere else. */
  reason: text("reason"),
  /** dok 12 §31's nine-item checklist snapshot - present only on "approved" actions. */
  checklist: jsonb("checklist").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
