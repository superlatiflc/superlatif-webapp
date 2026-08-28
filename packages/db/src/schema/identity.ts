// Identity schema (IDN-001, BD-05 first migration).
//
// 21_ERD_AND_DATA_DICTIONARY.md §3 "Identity and authorization". Deliberately
// narrower than contracts/drizzle-schema.ts's identity section: roles,
// permissions, and RBAC tables are IDN-004's scope ("Enforce RBAC, object
// scope, and privileged-action audit"), not IDN-001's. consent_records and
// the users.date_of_birth/guardian_consent_state columns that Gate 3's
// contract artifact carries are deferred to whichever task owns consent
// (ADR-036 asks for the model before legal policy freeze, not for this
// specific task) - see ADR-046 for the full scoping rationale.
//
// Invariant enforced here, not just in application code: users.email_normalized
// carries NO unique constraint. 23_SEJOLI_WORDPRESS_INTEGRATION.md §4 rule 3
// requires an email collision to become a reviewable conflict case, which is
// only possible if two users are allowed to (temporarily) share an email at
// the database level - a unique constraint here would make that rule
// impossible to implement.

import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { userStatus } from "./enums.ts";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    status: userStatus("status").notNull().default("active"),
    displayName: text("display_name"),
    emailNormalized: text("email_normalized"),
    phoneE164: text("phone_e164"),
    timezone: text("timezone").notNull().default("Asia/Jakarta"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("users_email_idx").on(table.emailNormalized),
    index("users_phone_idx").on(table.phoneE164),
  ],
);

/**
 * (provider, externalSubject) is the ONLY link key - unique at the database
 * level, matching the domain policy in
 * packages/domain/src/identity/identity-linking.ts that never links on
 * email/phone alone.
 */
export const externalIdentities = pgTable(
  "external_identities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    provider: text("provider").notNull(),
    externalSubject: text("external_subject").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    linkedByUserId: uuid("linked_by_user_id").references(() => users.id),
    linkReason: text("link_reason").notNull(),
    providerPayloadRef: text("provider_payload_ref"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("external_identity_provider_subject_uq").on(table.provider, table.externalSubject),
    index("external_identity_user_idx").on(table.userId),
  ],
);

/**
 * secretHash only - 24_AUTH_RBAC_SECURITY_AND_PRIVACY.md §4 "only hash
 * stored server-side". No column exists for a raw token; there is nothing
 * for application code to accidentally persist unhashed. Unique on
 * secretHash as a defensive belt-and-braces constraint against an
 * implementation bug producing colliding hashes.
 */
export const userSessions = pgTable(
  "user_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    secretHash: text("secret_hash").notNull(),
    deviceLabel: text("device_label"),
    ipPrefix: text("ip_prefix"),
    userAgentFamily: text("user_agent_family"),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("user_sessions_secret_hash_uq").on(table.secretHash),
    index("user_sessions_user_idx").on(table.userId),
    index("user_sessions_expiry_idx").on(table.expiresAt),
  ],
);

/**
 * Created whenever packages/domain's evaluateIdentityLink returns a
 * "conflict" decision. Never auto-resolved - IDN-003 owns the resolution
 * workflow; this table only records the case.
 */
export const identityConflicts = pgTable("identity_conflicts", {
  id: uuid("id").defaultRandom().primaryKey(),
  conflictType: text("conflict_type").notNull(),
  // Native Postgres array of UUIDs, not JSONB: CLAUDE.md reserves JSONB for
  // "versioned configuration/snapshots", and a list of user IDs is core
  // relational data, not a snapshot - it should be properly typed.
  candidateUserIds: uuid("candidate_user_ids").array().notNull(),
  // JSONB here is the right call: evidence is a versioned, shape-varying
  // snapshot of the collision context (redacted references, timestamps),
  // exactly what CLAUDE.md reserves JSONB for.
  evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default({}),
  status: text("status").notNull().default("open"),
  resolvedByUserId: uuid("resolved_by_user_id").references(() => users.id),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: createdAt(),
});
