// Result correction case schema (SCR-002).
//
// Same immutable-ask + append-only-decision-log shape ENT-004's
// access_change_requests/access_change_decisions already established
// (packages/db/src/schema/access-change.ts's own module doc explains the
// pattern this mirrors) - status is DERIVED from the two tables
// (@superlatif/domain/exam#deriveCorrectionCaseStatus), never stored as a
// mutable column. dok 21 §10 names this concept `correction_cases`/
// `correction_impacts`/`correction_approvals`; this task collapses
// "impacts" (affected scope) into the case row itself (`attemptId` alone
// - a correction here always targets exactly ONE attempt's current
// result, not a multi-attempt campaign) rather than a third table, since
// nothing in this task's own acceptance criteria requires correcting more
// than one attempt at a time; a future task can add a real
// `correction_impacts` table if a bulk-correction campaign is ever built,
// without this table's own shape needing to change.
//
// `outcome`/`executionStatus` are plain `text` columns, not a shared
// `pgEnum` with access-change.ts's own `changeDecisionOutcome`/
// `changeExecutionStatus` - those are scoped to ENT-004's own module and
// reusing them across an unrelated domain would tie this table's
// lifecycle to a table it has nothing to do with. Matches this codebase's
// own prevailing convention (`attempt_submissions.triggered_by`,
// `scoring_job_outbox.status`, `result_versions.state` are all plain
// `text` too).

import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { attempts } from "./attempts.ts";
import { resultVersions } from "./results.ts";
import { scoringPolicyVersions } from "./exam-config.ts";
import { users } from "./identity.ts";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/**
 * The immutable ASK: which attempt's current result is being challenged,
 * why (`cause`, dok 16 §17's own "cause dan evidence"), and what the
 * proposed fix is (`correctedScoringPolicyVersionId` - re-score the SAME
 * frozen submission against a DIFFERENT, already-published scoring policy
 * version, never "current"/unpublished). `currentResultVersionId` pins
 * exactly which result row this case was requested against, so a stale
 * approval attempt (a newer correction already superseded it) is
 * detectable at decide time rather than silently re-deriving "current" and
 * possibly acting on a result the requester never actually saw.
 */
export const correctionCases = pgTable(
  "correction_cases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => attempts.id),
    currentResultVersionId: uuid("current_result_version_id")
      .notNull()
      .references(() => resultVersions.id),
    correctedScoringPolicyVersionId: uuid("corrected_scoring_policy_version_id")
      .notNull()
      .references(() => scoringPolicyVersions.id),
    cause: text("cause").notNull(),
    /** Free-text reference (URL, ticket ID, question-report reference) - no attachment/evidence-store system exists in this codebase yet, so this stays a plain pointer, matching dok 16 §17's own "cause dan evidence" without building a new evidence-storage feature. */
    evidenceRef: text("evidence_ref"),
    requestedByUserId: uuid("requested_by_user_id")
      .notNull()
      .references(() => users.id),
    correlationId: text("correlation_id").notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("correction_case_attempt_idx").on(table.attemptId)],
);

/**
 * Append-only decision log - the ONLY way a case's effective status
 * changes after creation. `decidedByUserId` is checked against
 * `requestedByUserId` by @superlatif/domain/authorization's universal
 * maker-checker rule (IDN-004) at the service layer before this row is
 * ever written - "Correction approval separation" (required test) is
 * exactly that check. `executionStatus`/`newResultVersionId` are set only
 * when `outcome = 'approved'`; a rejection never creates a result version.
 */
export const correctionDecisions = pgTable(
  "correction_decisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    correctionCaseId: uuid("correction_case_id")
      .notNull()
      .references(() => correctionCases.id),
    decidedByUserId: uuid("decided_by_user_id")
      .notNull()
      .references(() => users.id),
    /** "approved" | "rejected". */
    outcome: text("outcome").notNull(),
    reason: text("reason").notNull(),
    correlationId: text("correlation_id").notNull(),
    /** "executed" | "execution_failed" - null for a rejection. */
    executionStatus: text("execution_status"),
    executionResult: jsonb("execution_result").$type<Record<string, unknown>>(),
    /** The NEW result_versions row created by this decision, for direct audit traceability from decision to result - "old and new values... remain traceable" (acceptance). */
    newResultVersionId: uuid("new_result_version_id").references(() => resultVersions.id),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("correction_decision_case_idx").on(table.correctionCaseId)],
);
