// Manual access change workflow schema (ENT-004, fourth migration after
// IDN-001/ENT-001/COM-001/IDN-004).
//
// dok 21 §5 "access_change_requests": "Dry-run and approval for manual/
// large changes; stores requested action, preview, reason, approvals,
// result." ENT-001's ADR-047 explicitly deferred this table to ENT-004.
//
// Split into TWO tables rather than one mutable-status row, matching the
// exact immutable-fact-plus-append-only-decision-log shape every other
// domain area in this repository already uses (access_grants/grant_events,
// user_roles/role_assignment_events): `access_change_requests` is the
// immutable ASK (what was requested, by whom, why, and the before-state
// preview); `access_change_decisions` is the append-only OUTCOME log
// (approve/reject plus the execution result). Status is DERIVED from the
// two (@superlatif/domain/access#deriveManualChangeStatus), never stored -
// see ADR-051.

import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { accessGrants } from "./access.ts";
import { users } from "./identity.ts";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const changeDecisionOutcome = pgEnum("change_decision_outcome", ["approved", "rejected"]);
export const changeExecutionStatus = pgEnum("change_execution_status", ["executed", "execution_failed"]);

/**
 * The immutable request fact. `payload` carries the requested action's
 * parameters (a manual_grant/manual_extension's accessPolicyId/validFrom/
 * validTo, or a manual_revocation's targetGrantId) - shape depends on
 * `changeType`, validated by the service layer, not this column's JSONB
 * type. `previewSnapshot` is the BEFORE-state effective-access decision for
 * every target/action the requested policy touches
 * (packages/db/src/access/manual-change-service.ts#buildChangePreview) -
 * "preview" per dok 21 §5, computed once at request time and never
 * recomputed, so it stays a true record of what the requester was shown.
 *
 * No status column - see the module doc.
 */
export const accessChangeRequests = pgTable(
  "access_change_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    changeType: text("change_type").notNull(),
    targetUserId: uuid("target_user_id")
      .notNull()
      .references(() => users.id),
    requestedByUserId: uuid("requested_by_user_id")
      .notNull()
      .references(() => users.id),
    reason: text("reason").notNull(),
    correlationId: text("correlation_id").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    previewSnapshot: jsonb("preview_snapshot").$type<unknown[]>().notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("access_change_request_target_idx").on(table.targetUserId)],
);

/**
 * Append-only decision log - the ONLY way a request's effective status
 * changes after creation. `executionStatus`/`executionResult` are set only
 * when `outcome = 'approved'` (a rejection never executes anything);
 * `resultGrantId` is populated when execution created or referenced a
 * grant, for direct audit traceability from decision to grant row.
 * `decidedByUserId` is required and checked against `requestedByUserId` by
 * @superlatif/domain/authorization's universal maker-checker rule
 * (IDN-004) at the service layer, not by a database constraint - self-
 * approval is refused before this row is ever written.
 */
export const accessChangeDecisions = pgTable(
  "access_change_decisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    changeRequestId: uuid("change_request_id")
      .notNull()
      .references(() => accessChangeRequests.id),
    decidedByUserId: uuid("decided_by_user_id")
      .notNull()
      .references(() => users.id),
    outcome: changeDecisionOutcome("outcome").notNull(),
    reason: text("reason").notNull(),
    correlationId: text("correlation_id").notNull(),
    executionStatus: changeExecutionStatus("execution_status"),
    executionResult: jsonb("execution_result").$type<Record<string, unknown>>(),
    resultGrantId: uuid("result_grant_id").references(() => accessGrants.id),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("access_change_decision_request_idx").on(table.changeRequestId)],
);
