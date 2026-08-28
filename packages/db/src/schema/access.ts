// Access grant and entitlement policy schema (ENT-001, second migration).
//
// 21_ERD_AND_DATA_DICTIONARY.md §5 "Access" describes access_policies,
// access_grants, grant_claims, effective_access, and access_change_requests.
// This task implements the first two, deliberately narrower than the full
// section - see ADR-047 for the complete reasoning:
//
//   - grant_claims is NOT a separate table here: a grant's claims are
//     exactly its referenced policy VERSION's immutable `config.claims`
//     (validated against contracts/entitlement-policy.schema.json at
//     publish time). Per-grant claim overrides only matter once bundle
//     composition exists (COM series), which this repository does not
//     build yet.
//   - effective_access (the rebuildable projection) and
//     access_change_requests (manual-change dry-run/approval) are
//     ENT-002/ENT-004's explicit backlog scope, not this task's.
//
// The founder instruction for THIS task is stronger than the Gate 3 draft:
// "access grant harus immutable; perubahan dibuat sebagai grant/revocation/
// event baru, bukan update diam-diam." access_grants therefore has no
// status or updatedAt column at all - status is derived (never stored) by
// @superlatif/domain/access's deriveGrantStatus from these immutable facts
// plus the append-only grant_events log below. This mirrors IDN-001's
// user_sessions/evaluateSessionValidity pattern exactly.

import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { grantEventType, recordStatus } from "./enums.ts";
import { users } from "./identity.ts";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/**
 * A versioned entitlement policy. `config` holds the full document defined
 * by contracts/entitlement-policy.schema.json (validity, claims,
 * attemptAllowance, postExpiry, stacking, lifecycle) - validated by AJV at
 * publish time (packages/db/src/access/policy-repository.ts), not merely by
 * this column's JSONB type. `checksum` is
 * @superlatif/domain/access's computeChecksum over that same document: a
 * stored config whose checksum no longer matches is unambiguous evidence of
 * tampering, not something a database type alone would catch.
 *
 * No updatedAt: once a row exists, `config` and `checksum` never change.
 * `status` is the one narrow, one-way exception (draft -> published ->
 * archived) - see publishPolicyVersion, which updates only `status` and
 * `lockedAt`, never `config`. "Editing" a draft means creating a new
 * version row, not mutating this one - the same version-not-mutate
 * discipline ADR-014 already applies to questions/forms/results.
 */
export const accessPolicies = pgTable(
  "access_policies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: text("code").notNull(),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    status: recordStatus("status").notNull().default("draft"),
    config: jsonb("config").$type<Record<string, unknown>>().notNull(),
    checksum: text("checksum").notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("access_policy_code_version_uq").on(table.code, table.version)],
);

/**
 * Immutable record of a grant's issuance. No status column, no updatedAt -
 * see the module doc. `sourceType`/`sourceId` identify what conferred this
 * grant (dok 05 §8.1: purchase, bundle_component, upgrade, scholarship,
 * promotion_bonus, manual_support, migration, ecosystem_free - stored as
 * free text, not a Postgres enum, so a new source type never needs a schema
 * migration to add). `sourceKey` is the idempotency key: replaying the same
 * commerce event twice must not create a second grant (dok 16 invariant 7),
 * enforced by the unique index below, not by application-level "check then
 * insert" alone.
 *
 * `validFrom`/`validTo` are null for duration_after_activation policies
 * until an "activated" grant_events row exists - see
 * @superlatif/domain/access's computeValidityWindow/resolveActivatedWindow.
 */
export const accessGrants = pgTable(
  "access_grants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    sourceKey: text("source_key").notNull(),
    accessPolicyId: uuid("access_policy_id")
      .notNull()
      .references(() => accessPolicies.id),
    validFrom: timestamp("valid_from", { withTimezone: true }),
    validTo: timestamp("valid_to", { withTimezone: true }),
    issuedByUserId: uuid("issued_by_user_id").references(() => users.id),
    issuedReason: text("issued_reason"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("access_grant_source_key_uq").on(table.userId, table.sourceType, table.sourceKey),
    index("access_grant_user_idx").on(table.userId),
    index("access_grant_policy_idx").on(table.accessPolicyId),
  ],
);

/**
 * Append-only administrative event log - the ONLY way an access_grants
 * row's effective status ever changes. `reason` is nullable in the schema
 * (a system-derived "activated" event has none) but required at the
 * application layer for suspended/revoked/reinstated/cancelled (dok 05 §10
 * E8 "Perubahan manual memerlukan alasan") - see
 * packages/db/src/access/grant-repository.ts.
 */
export const grantEvents = pgTable(
  "grant_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    grantId: uuid("grant_id")
      .notNull()
      .references(() => accessGrants.id),
    eventType: grantEventType("event_type").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    actorSourceType: text("actor_source_type"),
    actorSourceId: text("actor_source_id"),
    reason: text("reason"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("grant_event_grant_idx").on(table.grantId),
    index("grant_event_type_idx").on(table.grantId, table.eventType),
  ],
);
