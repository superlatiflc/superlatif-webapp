/**
 * Superlatif Gate 3 physical schema 1.0-RC2.
 *
 * This file maps the critical aggregates from 21_ERD_AND_DATA_DICTIONARY.md.
 * It is a contract review artifact, not a ready-to-run production migration.
 * Published/versioned records must be locked through application services and
 * database constraints introduced in implementation migrations.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const recordStatus = pgEnum("record_status", ["draft", "in_review", "changes_requested", "approved", "published", "archived"]);
export const userStatus = pgEnum("user_status", ["active", "suspended", "archived"]);
export const purchaseStatus = pgEnum("purchase_status", [
  "pending",
  "paid",
  "failed",
  "expired",
  "cancelled",
  "refunded_partial",
  "refunded_full",
  "chargeback",
]);
export const grantStatus = pgEnum("grant_status", ["scheduled", "active", "suspended", "expired", "revoked", "cancelled"]);
export const attemptStatus = pgEnum("attempt_status", ["created", "in_progress", "submitting", "submitted", "scoring", "scored", "voided"]);
export const resultStatus = pgEnum("result_status", ["processing", "provisional", "final", "corrected", "withheld", "voided"]);
export const importStatus = pgEnum("import_status", [
  "awaiting_upload",
  "queued",
  "scanning",
  "parsing",
  "validating",
  "preview_ready",
  "blocked",
  "importing",
  "completed",
  "partial",
  "failed",
  "cancelled",
]);
export const targetType = pgEnum("target_type", ["program", "program_track", "module", "resource", "live_session", "live_session_series", "exam_batch", "batch_collection", "community", "capability"]);
export const examActivationScope = pgEnum("exam_activation_scope", ["draft_only", "staging", "production"]);
export const examBatchStatus = pgEnum("exam_batch_status", ["draft", "scheduled", "registration_open", "exam_open", "exam_closed", "scoring", "provisional_released", "final_released", "review_open", "voided", "archived"]);
export const batchWindowType = pgEnum("batch_window_type", ["catalogue", "sale", "registration", "attempt", "late_sync_cutoff", "provisional_result_release", "final_result_release", "leaderboard_release", "explanation_release", "access_end"]);

// Identity -------------------------------------------------------------------

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    status: userStatus("status").notNull().default("active"),
    displayName: text("display_name"),
    emailNormalized: text("email_normalized"),
    phoneE164: text("phone_e164"),
    dateOfBirth: timestamp("date_of_birth", { withTimezone: true }),
    guardianConsentState: text("guardian_consent_state").notNull().default("not_required"),
    timezone: text("timezone").notNull().default("Asia/Jakarta"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("users_email_idx").on(table.emailNormalized), index("users_phone_idx").on(table.phoneE164)],
);

export const consentRecords = pgTable("consent_records", {
  id: uuid("id").defaultRandom().primaryKey(),
  subjectUserId: uuid("subject_user_id").notNull().references(() => users.id),
  guardianUserId: uuid("guardian_user_id").references(() => users.id),
  purposeCode: text("purpose_code").notNull(),
  noticeVersion: text("notice_version").notNull(),
  state: text("state").notNull(),
  evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default({}),
  grantedAt: timestamp("granted_at", { withTimezone: true }),
  withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const roles = pgTable("roles", { id: uuid("id").defaultRandom().primaryKey(), code: text("code").notNull().unique(), name: text("name").notNull() });
export const permissions = pgTable("permissions", { id: uuid("id").defaultRandom().primaryKey(), code: text("code").notNull().unique(), description: text("description") });
export const userRoles = pgTable("user_roles", { id: uuid("id").defaultRandom().primaryKey(), userId: uuid("user_id").notNull().references(() => users.id), roleId: uuid("role_id").notNull().references(() => roles.id), grantedAt: createdAt() }, (table) => [uniqueIndex("user_role_uq").on(table.userId, table.roleId)]);
export const rolePermissions = pgTable("role_permissions", { id: uuid("id").defaultRandom().primaryKey(), roleId: uuid("role_id").notNull().references(() => roles.id), permissionId: uuid("permission_id").notNull().references(() => permissions.id) }, (table) => [uniqueIndex("role_permission_uq").on(table.roleId, table.permissionId)]);

export const externalIdentities = pgTable(
  "external_identities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id),
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

export const userSessions = pgTable(
  "user_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id),
    secretHash: text("secret_hash").notNull(),
    deviceLabel: text("device_label"),
    ipPrefix: text("ip_prefix"),
    userAgentFamily: text("user_agent_family"),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [index("user_sessions_user_idx").on(table.userId), index("user_sessions_expiry_idx").on(table.expiresAt)],
);

export const identityConflicts = pgTable("identity_conflicts", {
  id: uuid("id").defaultRandom().primaryKey(),
  conflictType: text("conflict_type").notNull(),
  candidateUserIds: jsonb("candidate_user_ids").$type<string[]>().notNull(),
  evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull(),
  status: text("status").notNull().default("open"),
  resolvedByUserId: uuid("resolved_by_user_id").references(() => users.id),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: createdAt(),
});

// Products, commerce, and access ---------------------------------------------

export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    type: text("type").notNull(),
    status: text("status").notNull().default("draft"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("products_code_uq").on(table.code)],
);

export const productVersions = pgTable(
  "product_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id").notNull().references(() => products.id),
    version: integer("version").notNull(),
    status: recordStatus("status").notNull().default("draft"),
    benefitsSummary: jsonb("benefits_summary").$type<Record<string, unknown>>().notNull(),
    termsVersion: text("terms_version").notNull(),
    checksum: text("checksum"),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("product_versions_product_version_uq").on(table.productId, table.version)],
);

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

export const productComponents = pgTable(
  "product_components",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productVersionId: uuid("product_version_id").notNull().references(() => productVersions.id),
    componentCode: text("component_code").notNull(),
    accessPolicyId: uuid("access_policy_id").notNull().references(() => accessPolicies.id),
    targetType: targetType("target_type").notNull(),
    targetRef: text("target_ref").notNull(),
    includeDescendants: boolean("include_descendants").notNull().default(false),
    overrides: jsonb("overrides").$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => [uniqueIndex("product_component_code_uq").on(table.productVersionId, table.componentCode)],
);

export const offers = pgTable(
  "offers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productVersionId: uuid("product_version_id").notNull().references(() => productVersions.id),
    code: text("code").notNull(),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    status: recordStatus("status").notNull().default("draft"),
    visibility: text("visibility").notNull().default("public"),
    listAmountMinor: bigint("list_amount_minor", { mode: "number" }),
    currentAmountMinor: bigint("current_amount_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("IDR"),
    saleStartsAt: timestamp("sale_starts_at", { withTimezone: true }),
    saleEndsAt: timestamp("sale_ends_at", { withTimezone: true }),
    quota: integer("quota"),
    termsVersion: text("terms_version").notNull(),
    soldCountSource: text("sold_count_source"),
    reservationPolicy: jsonb("reservation_policy").$type<Record<string, unknown>>().notNull().default({}),
    returnUrlTemplate: text("return_url_template"),
    upgradeFromOfferId: uuid("upgrade_from_offer_id"),
    eligibilityConfig: jsonb("eligibility_config").$type<Record<string, unknown>>().notNull().default({}),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("offer_code_version_uq").on(table.code, table.version)],
);

export const externalSkuMappings = pgTable(
  "external_sku_mappings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    provider: text("provider").notNull(),
    site: text("site").notNull(),
    externalSkuId: text("external_sku_id").notNull(),
    mappingVersion: integer("mapping_version").notNull(),
    offerId: uuid("offer_id").notNull().references(() => offers.id),
    validFrom: timestamp("valid_from", { withTimezone: true }).notNull(),
    validTo: timestamp("valid_to", { withTimezone: true }),
    priority: integer("priority").notNull().default(0),
    status: text("status").notNull().default("active"),
  },
  (table) => [
    uniqueIndex("external_sku_mapping_start_uq").on(table.provider, table.site, table.externalSkuId, table.validFrom),
    index("external_sku_mapping_lookup_idx").on(table.provider, table.site, table.externalSkuId),
  ],
);

export const checkoutIntents = pgTable(
  "checkout_intents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id),
    offerId: uuid("offer_id").notNull().references(() => offers.id),
    correlationTokenHash: text("correlation_token_hash").notNull(),
    returnPath: text("return_path").notNull(),
    overlapSnapshot: jsonb("overlap_snapshot").$type<Record<string, unknown>>().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    resolvedPurchaseId: uuid("resolved_purchase_id"),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("checkout_intent_token_uq").on(table.correlationTokenHash)],
);

export const purchases = pgTable(
  "purchases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    provider: text("provider").notNull(),
    site: text("site").notNull(),
    externalOrderId: text("external_order_id").notNull(),
    externalUserId: text("external_user_id"),
    externalSkuId: text("external_sku_id").notNull(),
    externalSkuMappingId: uuid("external_sku_mapping_id").references(() => externalSkuMappings.id),
    userId: uuid("user_id").references(() => users.id),
    offerId: uuid("offer_id").references(() => offers.id),
    status: purchaseStatus("status").notNull(),
    grossAmountMinor: bigint("gross_amount_minor", { mode: "number" }).notNull(),
    discountAmountMinor: bigint("discount_amount_minor", { mode: "number" }).notNull().default(0),
    netSettledAmountMinor: bigint("net_settled_amount_minor", { mode: "number" }).notNull(),
    refundedAmountMinor: bigint("refunded_amount_minor", { mode: "number" }).notNull().default(0),
    currency: text("currency").notNull(),
    orderedAt: timestamp("ordered_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    reconciliationState: text("reconciliation_state").notNull().default("pending"),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("purchases_external_order_uq").on(table.provider, table.site, table.externalOrderId),
    index("purchases_user_idx").on(table.userId),
  ],
);

export const purchaseEvents = pgTable(
  "purchase_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    provider: text("provider").notNull(),
    site: text("site").notNull(),
    providerEventKey: text("provider_event_key").notNull(),
    eventType: text("event_type").notNull(),
    verificationState: text("verification_state").notNull(),
    payloadChecksum: text("payload_checksum").notNull(),
    redactedPayload: jsonb("redacted_payload").$type<Record<string, unknown>>().notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processingState: text("processing_state").notNull().default("received"),
    purchaseId: uuid("purchase_id").references(() => purchases.id),
    failureCode: text("failure_code"),
  },
  (table) => [uniqueIndex("purchase_event_key_uq").on(table.provider, table.site, table.providerEventKey)],
);

export const accessGrants = pgTable(
  "access_grants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    sourceKey: text("source_key").notNull(),
    accessPolicyId: uuid("access_policy_id").notNull().references(() => accessPolicies.id),
    parentGrantId: uuid("parent_grant_id"),
    status: grantStatus("status").notNull().default("scheduled"),
    validFrom: timestamp("valid_from", { withTimezone: true }),
    validTo: timestamp("valid_to", { withTimezone: true }),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    statusReason: text("status_reason"),
    issuedByUserId: uuid("issued_by_user_id").references(() => users.id),
    revokedByUserId: uuid("revoked_by_user_id").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("access_grant_source_key_uq").on(table.userId, table.sourceType, table.sourceKey),
    index("access_grant_user_status_idx").on(table.userId, table.status),
  ],
);

export const grantClaims = pgTable(
  "grant_claims",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    grantId: uuid("grant_id").notNull().references(() => accessGrants.id),
    targetType: targetType("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    action: text("action").notNull(),
    includeDescendants: boolean("include_descendants").notNull().default(false),
    limits: jsonb("limits").$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => [uniqueIndex("grant_claim_target_action_uq").on(table.grantId, table.targetType, table.targetId, table.action)],
);

export const effectiveAccess = pgTable(
  "effective_access",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id),
    targetType: targetType("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    action: text("action").notNull(),
    allowed: boolean("allowed").notNull(),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    supportingGrantIds: jsonb("supporting_grant_ids").$type<string[]>().notNull(),
    reasonSummary: jsonb("reason_summary").$type<Record<string, unknown>>().notNull(),
    projectionVersion: bigint("projection_version", { mode: "number" }).notNull(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("effective_access_user_target_action_uq").on(table.userId, table.targetType, table.targetId, table.action)],
);

export const accessChangeRequests = pgTable("access_change_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  requestedByUserId: uuid("requested_by_user_id").notNull().references(() => users.id),
  operation: text("operation").notNull(),
  policyId: uuid("policy_id").notNull().references(() => accessPolicies.id),
  requestedUserIds: jsonb("requested_user_ids").$type<string[]>().notNull(),
  reason: text("reason").notNull(),
  impactPreview: jsonb("impact_preview").$type<Record<string, unknown>>().notNull(),
  status: text("status").notNull().default("awaiting_approval"),
  approvedByUserId: uuid("approved_by_user_id").references(() => users.id),
  committedAt: timestamp("committed_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const reconciliationCases = pgTable("reconciliation_cases", {
  id: uuid("id").defaultRandom().primaryKey(),
  caseType: text("case_type").notNull(),
  purchaseId: uuid("purchase_id").references(() => purchases.id),
  userId: uuid("user_id").references(() => users.id),
  status: text("status").notNull().default("open"),
  evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default({}),
  assignedToUserId: uuid("assigned_to_user_id").references(() => users.id),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: createdAt(),
});

// Program, resources, and schedules ------------------------------------------

export const programs = pgTable(
  "programs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    status: text("status").notNull().default("draft"),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("programs_code_uq").on(table.code)],
);

export const programVersions = pgTable(
  "program_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    programId: uuid("program_id").notNull().references(() => programs.id),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    status: recordStatus("status").notNull().default("draft"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    onboardingSchema: jsonb("onboarding_schema").$type<Record<string, unknown>>().notNull().default({}),
    checksum: text("checksum"),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("program_version_uq").on(table.programId, table.version)],
);

export const tracks = pgTable("tracks", {
  id: uuid("id").defaultRandom().primaryKey(),
  programVersionId: uuid("program_version_id").notNull().references(() => programVersions.id),
  code: text("code").notNull(),
  title: text("title").notNull(),
  position: integer("position").notNull(),
  releaseConfig: jsonb("release_config").$type<Record<string, unknown>>().notNull().default({}),
});

export const roadmapStages = pgTable("roadmap_stages", {
  id: uuid("id").defaultRandom().primaryKey(),
  trackId: uuid("track_id").notNull().references(() => tracks.id),
  code: text("code").notNull(),
  title: text("title").notNull(),
  position: integer("position").notNull(),
  completionConfig: jsonb("completion_config").$type<Record<string, unknown>>().notNull().default({}),
});

export const modules = pgTable("modules", {
  id: uuid("id").defaultRandom().primaryKey(),
  stageId: uuid("stage_id").notNull().references(() => roadmapStages.id),
  code: text("code").notNull(),
  title: text("title").notNull(),
  position: integer("position").notNull(),
  releaseConfig: jsonb("release_config").$type<Record<string, unknown>>().notNull().default({}),
  completionConfig: jsonb("completion_config").$type<Record<string, unknown>>().notNull().default({}),
});

export const assets = pgTable("assets", {
  id: uuid("id").defaultRandom().primaryKey(),
  storageProvider: text("storage_provider").notNull(),
  objectKey: text("object_key").notNull(),
  originalFileName: text("original_file_name").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  checksum: text("checksum").notNull(),
  width: integer("width"),
  height: integer("height"),
  altText: text("alt_text"),
  safetyStatus: text("safety_status").notNull().default("pending"),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
  createdAt: createdAt(),
});

export const resources = pgTable(
  "resources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: text("code").notNull(),
    type: text("type").notNull(),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("resources_code_uq").on(table.code)],
);

export const resourceVersions = pgTable(
  "resource_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    resourceId: uuid("resource_id").notNull().references(() => resources.id),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    status: recordStatus("status").notNull().default("draft"),
    body: jsonb("body").$type<Record<string, unknown>>().notNull(),
    primaryAssetId: uuid("primary_asset_id").references(() => assets.id),
    completionPolicy: jsonb("completion_policy").$type<Record<string, unknown>>().notNull().default({}),
    accessibilityMetadata: jsonb("accessibility_metadata").$type<Record<string, unknown>>().notNull().default({}),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("resource_versions_uq").on(table.resourceId, table.version)],
);

export const resourcePlacements = pgTable("resource_placements", {
  id: uuid("id").defaultRandom().primaryKey(),
  moduleId: uuid("module_id").notNull().references(() => modules.id),
  resourceId: uuid("resource_id").notNull().references(() => resources.id),
  releasedResourceVersionId: uuid("released_resource_version_id").notNull().references(() => resourceVersions.id),
  position: integer("position").notNull(),
  required: boolean("required").notNull().default(true),
  releaseConfig: jsonb("release_config").$type<Record<string, unknown>>().notNull().default({}),
  prerequisitePlacementIds: jsonb("prerequisite_placement_ids").$type<string[]>().notNull().default([]),
});

export const enrollments = pgTable(
  "enrollments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id),
    programId: uuid("program_id").notNull().references(() => programs.id),
    programVersionId: uuid("program_version_id").notNull().references(() => programVersions.id),
    status: text("status").notNull().default("active"),
    onboardingState: text("onboarding_state").notNull().default("not_started"),
    enrolledAt: timestamp("enrolled_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("enrollment_user_program_uq").on(table.userId, table.programId)],
);

export const onboardingResponses = pgTable("onboarding_responses", {
  id: uuid("id").defaultRandom().primaryKey(),
  enrollmentId: uuid("enrollment_id").notNull().references(() => enrollments.id),
  schemaVersion: integer("schema_version").notNull(),
  fieldKey: text("field_key").notNull(),
  value: jsonb("value").$type<unknown>().notNull(),
  dataClassification: text("data_classification").notNull().default("internal"),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex("onboarding_response_field_uq").on(table.enrollmentId, table.schemaVersion, table.fieldKey)]);

export const enrollmentGrants = pgTable("enrollment_grants", {
  id: uuid("id").defaultRandom().primaryKey(),
  enrollmentId: uuid("enrollment_id").notNull().references(() => enrollments.id),
  grantId: uuid("grant_id").notNull().references(() => accessGrants.id),
}, (table) => [uniqueIndex("enrollment_grant_uq").on(table.enrollmentId, table.grantId)]);

export const progressRecords = pgTable(
  "progress_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id),
    placementId: uuid("placement_id").notNull().references(() => resourcePlacements.id),
    experiencedResourceVersionId: uuid("experienced_resource_version_id").references(() => resourceVersions.id),
    status: text("status").notNull().default("not_started"),
    progressPercent: integer("progress_percent").notNull().default(0),
    lastSequence: bigint("last_sequence", { mode: "number" }).notNull().default(0),
    lastPosition: jsonb("last_position").$type<Record<string, unknown>>().notNull().default({}),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("progress_user_placement_uq").on(table.userId, table.placementId)],
);

export const progressEvents = pgTable("progress_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  placementId: uuid("placement_id").notNull().references(() => resourcePlacements.id),
  resourceVersionId: uuid("resource_version_id").notNull().references(() => resourceVersions.id),
  eventType: text("event_type").notNull(),
  sequence: bigint("sequence", { mode: "number" }).notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("progress_event_sequence_uq").on(table.userId, table.placementId, table.sequence)]);

export const progressProjections = pgTable("progress_projections", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  programId: uuid("program_id").notNull().references(() => programs.id),
  requiredCompleted: integer("required_completed").notNull().default(0),
  requiredTotal: integer("required_total").notNull().default(0),
  projectionVersion: bigint("projection_version", { mode: "number" }).notNull(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex("progress_projection_user_program_uq").on(table.userId, table.programId)]);

export const scheduleItems = pgTable("schedule_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  programVersionId: uuid("program_version_id").references(() => programVersions.id),
  type: text("type").notNull(),
  title: text("title").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  timezone: text("timezone").notNull().default("Asia/Jakarta"),
  status: text("status").notNull().default("upcoming"),
  targetType: text("target_type"),
  targetId: uuid("target_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
});

export const liveSessions = pgTable("live_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  scheduleItemId: uuid("schedule_item_id").notNull().references(() => scheduleItems.id),
  provider: text("provider").notNull(),
  providerMeetingRefEncrypted: text("provider_meeting_ref_encrypted").notNull(),
  hostUserId: uuid("host_user_id").references(() => users.id),
  recordingResourceVersionId: uuid("recording_resource_version_id").references(() => resourceVersions.id),
  joinWindowMinutes: integer("join_window_minutes").notNull().default(30),
  status: text("status").notNull().default("scheduled"),
});

export const liveSessionOccurrences = pgTable("live_session_occurrences", {
  id: uuid("id").defaultRandom().primaryKey(),
  liveSessionId: uuid("live_session_id").notNull().references(() => liveSessions.id),
  occurrenceNumber: integer("occurrence_number").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  timezone: text("timezone").notNull().default("Asia/Jakarta"),
  status: text("status").notNull().default("scheduled"),
  rescheduledFromOccurrenceId: uuid("rescheduled_from_occurrence_id"),
  providerOccurrenceRefEncrypted: text("provider_occurrence_ref_encrypted"),
  createdAt: createdAt(),
}, (table) => [uniqueIndex("live_occurrence_uq").on(table.liveSessionId, table.occurrenceNumber)]);

export const attendances = pgTable("attendances", {
  id: uuid("id").defaultRandom().primaryKey(),
  occurrenceId: uuid("occurrence_id").notNull().references(() => liveSessionOccurrences.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  status: text("status").notNull().default("registered"),
  source: text("source").notNull(),
  firstJoinedAt: timestamp("first_joined_at", { withTimezone: true }),
  lastLeftAt: timestamp("last_left_at", { withTimezone: true }),
  evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
}, (table) => [uniqueIndex("attendance_occurrence_user_uq").on(table.occurrenceId, table.userId)]);

export const communityLinks = pgTable("community_links", {
  id: uuid("id").defaultRandom().primaryKey(),
  programVersionId: uuid("program_version_id").notNull().references(() => programVersions.id),
  trackId: uuid("track_id").references(() => tracks.id),
  provider: text("provider").notNull(),
  title: text("title").notNull(),
  gatedUrlRefEncrypted: text("gated_url_ref_encrypted").notNull(),
  instructions: jsonb("instructions").$type<Record<string, unknown>>().notNull().default({}),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  status: text("status").notNull().default("active"),
  createdAt: createdAt(),
});

// Exam family registry --------------------------------------------------------

export const examFamilies = pgTable("exam_families", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  activationScope: examActivationScope("activation_scope").notNull().default("draft_only"),
  regulatoryOwner: text("regulatory_owner"),
  activatedAt: timestamp("activated_at", { withTimezone: true }),
  retiredAt: timestamp("retired_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex("exam_family_code_uq").on(table.code)]);

// Question bank and imports ---------------------------------------------------

export const stimuli = pgTable(
  "stimuli",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: text("code").notNull(),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("stimuli_code_uq").on(table.code)],
);

export const stimulusVersions = pgTable(
  "stimulus_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    stimulusId: uuid("stimulus_id").notNull().references(() => stimuli.id),
    version: integer("version").notNull(),
    title: text("title"),
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    status: recordStatus("status").notNull().default("draft"),
    checksum: text("checksum").notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("stimulus_version_uq").on(table.stimulusId, table.version)],
);

export const questions = pgTable(
  "questions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: text("code").notNull(),
    examFamilyId: uuid("exam_family_id").notNull().references(() => examFamilies.id),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("questions_code_uq").on(table.code)],
);

export const questionVersions = pgTable(
  "question_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    questionId: uuid("question_id").notNull().references(() => questions.id),
    version: integer("version").notNull(),
    questionType: text("question_type").notNull(),
    subjectCode: text("subject_code").notNull(),
    topicCode: text("topic_code"),
    difficulty: text("difficulty"),
    stimulusVersionId: uuid("stimulus_version_id").references(() => stimulusVersions.id),
    stem: jsonb("stem").$type<Record<string, unknown>>().notNull(),
    options: jsonb("options").$type<Array<Record<string, unknown>>>().notNull(),
    explanation: jsonb("explanation").$type<Record<string, unknown>>().notNull(),
    sourceMetadata: jsonb("source_metadata").$type<Record<string, unknown>>().notNull().default({}),
    status: recordStatus("status").notNull().default("draft"),
    checksum: text("checksum").notNull(),
    approvedByUserId: uuid("approved_by_user_id").references(() => users.id),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("question_version_uq").on(table.questionId, table.version)],
);

// Restricted academic secret; never joined into student attempt serialization.
export const questionVersionSecrets = pgTable("question_version_secrets", {
  questionVersionId: uuid("question_version_id").primaryKey().references(() => questionVersions.id),
  answerKeyEncrypted: text("answer_key_encrypted").notNull(),
  optionWeightsEncrypted: text("option_weights_encrypted"),
  encryptionKeyVersion: text("encryption_key_version").notNull(),
  checksum: text("checksum").notNull(),
  updatedAt: updatedAt(),
});

export const questionAssets = pgTable("question_assets", {
  id: uuid("id").defaultRandom().primaryKey(),
  questionVersionId: uuid("question_version_id").references(() => questionVersions.id),
  stimulusVersionId: uuid("stimulus_version_id").references(() => stimulusVersions.id),
  assetId: uuid("asset_id").notNull().references(() => assets.id),
  placementRole: text("placement_role").notNull(),
  optionCode: text("option_code"),
  position: integer("position").notNull().default(1),
  imagePurpose: text("image_purpose").notNull().default("informative"),
  altTextOverride: text("alt_text_override"),
  createdAt: createdAt(),
}, (table) => [
  check("question_asset_one_owner_ck", sql`num_nonnulls(${table.questionVersionId}, ${table.stimulusVersionId}) = 1`),
  check("question_asset_purpose_alt_ck", sql`${table.imagePurpose} = 'decorative' OR coalesce(${table.altTextOverride}, '') <> ''`),
  uniqueIndex("question_asset_question_position_uq").on(table.questionVersionId, table.placementRole, table.optionCode, table.position).where(sql`${table.questionVersionId} is not null`),
  uniqueIndex("question_asset_stimulus_position_uq").on(table.stimulusVersionId, table.placementRole, table.position).where(sql`${table.stimulusVersionId} is not null`),
]);

export const moderationReviews = pgTable("moderation_reviews", {
  id: uuid("id").defaultRandom().primaryKey(),
  targetType: text("target_type").notNull(),
  targetId: uuid("target_id").notNull(),
  reviewerUserId: uuid("reviewer_user_id").notNull().references(() => users.id),
  decision: text("decision").notNull(),
  reason: text("reason"),
  createdAt: createdAt(),
}, (table) => [uniqueIndex("moderation_reviewer_target_uq").on(table.targetType, table.targetId, table.reviewerUserId)]);

export const questionReports = pgTable("question_reports", {
  id: uuid("id").defaultRandom().primaryKey(),
  reporterUserId: uuid("reporter_user_id").notNull().references(() => users.id),
  attemptId: uuid("attempt_id").references(() => attempts.id),
  questionInstanceId: uuid("question_instance_id").references(() => attemptQuestionInstances.id),
  questionVersionId: uuid("question_version_id").notNull().references(() => questionVersions.id),
  category: text("category").notNull(),
  note: text("note"),
  screenshotAssetId: uuid("screenshot_asset_id").references(() => assets.id),
  status: text("status").notNull().default("open"),
  resolution: jsonb("resolution").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
});

export const questionImports = pgTable("question_imports", {
  id: uuid("id").defaultRandom().primaryKey(),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
  profileCode: text("profile_code").notNull(),
  importMode: text("import_mode").notNull(),
  status: importStatus("status").notNull().default("awaiting_upload"),
  xlsxAssetId: uuid("xlsx_asset_id").references(() => assets.id),
  mediaZipAssetId: uuid("media_zip_asset_id").references(() => assets.id),
  counts: jsonb("counts").$type<Record<string, number>>().notNull().default({}),
  summary: jsonb("summary").$type<Record<string, unknown>>().notNull().default({}),
  committedAt: timestamp("committed_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const questionImportRows = pgTable("question_import_rows", {
  id: uuid("id").defaultRandom().primaryKey(),
  importId: uuid("import_id").notNull().references(() => questionImports.id),
  sheetName: text("sheet_name").notNull(),
  rowNumber: integer("row_number").notNull(),
  questionCode: text("question_code"),
  state: text("state").notNull(),
  normalizedPayload: jsonb("normalized_payload").$type<Record<string, unknown>>(),
  outcomeQuestionVersionId: uuid("outcome_question_version_id").references(() => questionVersions.id),
}, (table) => [uniqueIndex("question_import_row_uq").on(table.importId, table.sheetName, table.rowNumber)]);

export const questionImportIssues = pgTable(
  "question_import_issues",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    importId: uuid("import_id").notNull().references(() => questionImports.id),
    severity: text("severity").notNull(),
    sheetName: text("sheet_name").notNull(),
    rowNumber: integer("row_number"),
    questionCode: text("question_code"),
    field: text("field"),
    code: text("code").notNull(),
    message: text("message").notNull(),
    evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => [index("question_import_issues_import_idx").on(table.importId, table.severity)],
);

// Exam configuration and runtime ---------------------------------------------

export const scoringPolicies = pgTable(
  "scoring_policies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: text("code").notNull(),
    version: integer("version").notNull(),
    status: recordStatus("status").notNull().default("draft"),
    config: jsonb("config").$type<Record<string, unknown>>().notNull(),
    checksum: text("checksum").notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("scoring_policy_code_version_uq").on(table.code, table.version)],
);

export const examBlueprints = pgTable(
  "exam_blueprints",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: text("code").notNull(),
    version: integer("version").notNull(),
    examFamilyId: uuid("exam_family_id").notNull().references(() => examFamilies.id),
    activationScope: examActivationScope("activation_scope").notNull().default("draft_only"),
    title: text("title").notNull(),
    status: recordStatus("status").notNull().default("draft"),
    config: jsonb("config").$type<Record<string, unknown>>().notNull(),
    scoringPolicyId: uuid("scoring_policy_id").notNull().references(() => scoringPolicies.id),
    checksum: text("checksum").notNull(),
    regulatoryVerifiedAt: timestamp("regulatory_verified_at", { withTimezone: true }),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("exam_blueprint_code_version_uq").on(table.code, table.version)],
);

export const examForms = pgTable(
  "exam_forms",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: text("code").notNull(),
    version: integer("version").notNull(),
    blueprintId: uuid("blueprint_id").notNull().references(() => examBlueprints.id),
    title: text("title").notNull(),
    status: recordStatus("status").notNull().default("draft"),
    checksum: text("checksum").notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    answerReviewReleasedAt: timestamp("answer_review_released_at", { withTimezone: true }),
    retiredFromRankedAt: timestamp("retired_from_ranked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("exam_form_code_version_uq").on(table.code, table.version)],
);

export const examFormItems = pgTable(
  "exam_form_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    formId: uuid("form_id").notNull().references(() => examForms.id),
    sectionCode: text("section_code").notNull(),
    position: integer("position").notNull(),
    questionVersionId: uuid("question_version_id").notNull().references(() => questionVersions.id),
    fixedOptionOrder: jsonb("fixed_option_order").$type<string[]>(),
  },
  (table) => [uniqueIndex("exam_form_item_position_uq").on(table.formId, table.position)],
);

export const attemptPolicies = pgTable(
  "attempt_policies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: text("code").notNull(),
    version: integer("version").notNull(),
    config: jsonb("config").$type<Record<string, unknown>>().notNull(),
    checksum: text("checksum").notNull(),
    status: recordStatus("status").notNull().default("draft"),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("attempt_policy_code_version_uq").on(table.code, table.version)],
);

export const examBatches = pgTable(
  "exam_batches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: text("code").notNull(),
    title: text("title").notNull(),
    formId: uuid("form_id").notNull().references(() => examForms.id),
    attemptPolicyId: uuid("attempt_policy_id").notNull().references(() => attemptPolicies.id),
    state: examBatchStatus("state").notNull().default("draft"),
    rankingMode: text("ranking_mode").notNull().default("batch"),
    resultReleaseMode: text("result_release_mode").notNull().default("scheduled_after_review"),
    rankingAttemptRule: text("ranking_attempt_rule").notNull().default("first"),
    timezone: text("timezone").notNull().default("Asia/Jakarta"),
    humanReviewRequired: boolean("human_review_required").notNull().default(true),
    instructions: jsonb("instructions").$type<Record<string, unknown>>().notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("exam_batches_code_uq").on(table.code)],
);

export const batchWindows = pgTable(
  "batch_windows",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    batchId: uuid("batch_id").notNull().references(() => examBatches.id),
    windowType: batchWindowType("window_type").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("batch_window_type_uq").on(table.batchId, table.windowType),
    check("batch_window_shape_ck", sql`(
      ${table.windowType} in ('catalogue', 'sale', 'registration', 'attempt')
      and ${table.endsAt} is not null and ${table.endsAt} > ${table.startsAt}
    ) or (
      ${table.windowType} in ('late_sync_cutoff', 'provisional_result_release', 'final_result_release', 'leaderboard_release', 'explanation_release', 'access_end')
      and ${table.endsAt} is null
    )`),
  ],
);

export const questionUsage = pgTable("question_usage", {
  id: uuid("id").defaultRandom().primaryKey(),
  questionVersionId: uuid("question_version_id").notNull().references(() => questionVersions.id),
  formId: uuid("form_id").notNull().references(() => examForms.id),
  batchId: uuid("batch_id").references(() => examBatches.id),
  usageType: text("usage_type").notNull().default("ranked"),
  firstExposedAt: timestamp("first_exposed_at", { withTimezone: true }),
  lastExposedAt: timestamp("last_exposed_at", { withTimezone: true }),
  exposureCount: integer("exposure_count").notNull().default(0),
  cohortMetadata: jsonb("cohort_metadata").$type<Record<string, unknown>>().notNull().default({}),
}, (table) => [uniqueIndex("question_usage_form_batch_uq").on(table.questionVersionId, table.formId, table.batchId)]);

export const attempts = pgTable(
  "attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id),
    batchId: uuid("batch_id").notNull().references(() => examBatches.id),
    ordinal: integer("ordinal").notNull(),
    status: attemptStatus("status").notNull().default("created"),
    revision: bigint("revision", { mode: "number" }).notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }).notNull(),
    lateSyncCutoffAt: timestamp("late_sync_cutoff_at", { withTimezone: true }).notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    formId: uuid("form_id").notNull().references(() => examForms.id),
    blueprintId: uuid("blueprint_id").notNull().references(() => examBlueprints.id),
    scoringPolicyId: uuid("scoring_policy_id").notNull().references(() => scoringPolicies.id),
    attemptPolicyId: uuid("attempt_policy_id").notNull().references(() => attemptPolicies.id),
    attemptPolicySnapshot: jsonb("attempt_policy_snapshot").$type<Record<string, unknown>>().notNull(),
    accommodationSnapshot: jsonb("accommodation_snapshot").$type<Record<string, unknown>>().notNull().default({}),
    startIdempotencyKey: text("start_idempotency_key").notNull(),
    formChecksum: text("form_checksum").notNull(),
    blueprintChecksum: text("blueprint_checksum").notNull(),
    scoringPolicyChecksum: text("scoring_policy_checksum").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => [
    uniqueIndex("attempt_user_batch_ordinal_uq").on(table.userId, table.batchId, table.ordinal),
    index("attempt_batch_status_idx").on(table.batchId, table.status),
  ],
);

export const attemptQuestionInstances = pgTable(
  "attempt_question_instances",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    attemptId: uuid("attempt_id").notNull().references(() => attempts.id),
    questionVersionId: uuid("question_version_id").notNull().references(() => questionVersions.id),
    sectionCode: text("section_code").notNull(),
    sequence: integer("sequence").notNull(),
    optionOrder: jsonb("option_order").$type<string[]>().notNull(),
    presentationChecksum: text("presentation_checksum").notNull(),
  },
  (table) => [uniqueIndex("attempt_instance_sequence_uq").on(table.attemptId, table.sequence)],
);

export const attemptWriterLeases = pgTable(
  "attempt_writer_leases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    attemptId: uuid("attempt_id").notNull().references(() => attempts.id),
    sessionId: uuid("session_id").notNull().references(() => userSessions.id),
    tokenHash: text("token_hash").notNull(),
    acquiredAt: timestamp("acquired_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    takeoverOfLeaseId: uuid("takeover_of_lease_id"),
  },
  (table) => [
    uniqueIndex("attempt_writer_one_active_uq").on(table.attemptId).where(sql`${table.isActive} = true`),
    index("attempt_writer_lease_expiry_idx").on(table.attemptId, table.expiresAt),
  ],
);

export const attemptAnswers = pgTable(
  "attempt_answers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    attemptId: uuid("attempt_id").notNull().references(() => attempts.id),
    instanceId: uuid("instance_id").notNull().references(() => attemptQuestionInstances.id),
    revision: bigint("revision", { mode: "number" }).notNull().default(0),
    answerPayload: jsonb("answer_payload").$type<Record<string, unknown> | null>(),
    persistedAt: timestamp("persisted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("attempt_answer_instance_uq").on(table.attemptId, table.instanceId)],
);

export const attemptFlags = pgTable("attempt_flags", {
  id: uuid("id").defaultRandom().primaryKey(),
  attemptId: uuid("attempt_id").notNull().references(() => attempts.id),
  instanceId: uuid("instance_id").notNull().references(() => attemptQuestionInstances.id),
  flagged: boolean("flagged").notNull().default(true),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex("attempt_flag_instance_uq").on(table.attemptId, table.instanceId)]);

export const answerMutations = pgTable(
  "answer_mutations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    attemptId: uuid("attempt_id").notNull().references(() => attempts.id),
    instanceId: uuid("instance_id").notNull().references(() => attemptQuestionInstances.id),
    mutationId: uuid("mutation_id").notNull(),
    expectedRevision: bigint("expected_revision", { mode: "number" }).notNull(),
    resultingRevision: bigint("resulting_revision", { mode: "number" }),
    answerPayload: jsonb("answer_payload").$type<Record<string, unknown> | null>(),
    writerLeaseId: uuid("writer_lease_id").notNull().references(() => attemptWriterLeases.id),
    state: text("state").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    clientObservedAt: timestamp("client_observed_at", { withTimezone: true }),
    lateSyncCandidate: boolean("late_sync_candidate").notNull().default(false),
    adjudicationState: text("adjudication_state").notNull().default("not_required"),
    requestChecksum: text("request_checksum").notNull(),
  },
  (table) => [uniqueIndex("answer_mutation_id_uq").on(table.attemptId, table.mutationId)],
);

export const submissions = pgTable(
  "submissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    attemptId: uuid("attempt_id").notNull().references(() => attempts.id),
    mutationId: uuid("mutation_id").notNull(),
    mode: text("mode").notNull(),
    answerSetSnapshot: jsonb("answer_set_snapshot").$type<Record<string, unknown>>().notNull(),
    answerSetChecksum: text("answer_set_checksum").notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("submission_attempt_uq").on(table.attemptId), uniqueIndex("submission_mutation_uq").on(table.mutationId)],
);

export const results = pgTable(
  "results",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    submissionId: uuid("submission_id").notNull().references(() => submissions.id),
    attemptId: uuid("attempt_id").notNull().references(() => attempts.id),
    version: integer("version").notNull(),
    state: resultStatus("state").notNull().default("processing"),
    isCurrent: boolean("is_current").notNull().default(true),
    scoreSummary: jsonb("score_summary").$type<Record<string, unknown>>().notNull(),
    scoringTrace: jsonb("scoring_trace").$type<Record<string, unknown>>().notNull(),
    scoringPolicyChecksum: text("scoring_policy_checksum").notNull(),
    calculatedAt: timestamp("calculated_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    supersedesResultId: uuid("supersedes_result_id"),
  },
  (table) => [
    uniqueIndex("result_attempt_version_uq").on(table.attemptId, table.version),
    uniqueIndex("result_attempt_one_current_uq").on(table.attemptId).where(sql`${table.isCurrent} = true`),
  ],
);

// Restricted mapping; ranking entries never reference users directly.
export const rankingSubjects = pgTable("ranking_subjects", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  subjectToken: text("subject_token").notNull(),
  publicAlias: text("public_alias"),
  aliasVersion: integer("alias_version").notNull().default(1),
  publicOptIn: boolean("public_opt_in").notNull().default(false),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("ranking_subject_user_uq").on(table.userId),
  uniqueIndex("ranking_subject_token_uq").on(table.subjectToken),
]);

export const rankingSnapshots = pgTable("ranking_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  batchId: uuid("batch_id").notNull().references(() => examBatches.id),
  version: integer("version").notNull(),
  state: text("state").notNull().default("draft"),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  releasedAt: timestamp("released_at", { withTimezone: true }),
}, (table) => [uniqueIndex("ranking_snapshot_version_uq").on(table.batchId, table.version)]);

export const rankingEntries = pgTable("ranking_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  snapshotId: uuid("snapshot_id").notNull().references(() => rankingSnapshots.id),
  attemptId: uuid("attempt_id").notNull().references(() => attempts.id),
  rankingSubjectId: uuid("ranking_subject_id").notNull().references(() => rankingSubjects.id),
  rank: integer("rank").notNull(),
  scoreSnapshot: jsonb("score_snapshot").$type<Record<string, unknown>>().notNull(),
}, (table) => [uniqueIndex("ranking_entry_attempt_uq").on(table.snapshotId, table.attemptId)]);

export const attemptAccommodations = pgTable("attempt_accommodations", {
  id: uuid("id").defaultRandom().primaryKey(),
  attemptId: uuid("attempt_id").notNull().references(() => attempts.id),
  state: text("state").notNull().default("pending_approval"),
  policySnapshot: jsonb("policy_snapshot").$type<Record<string, unknown>>().notNull(),
  beforeDeadlineAt: timestamp("before_deadline_at", { withTimezone: true }).notNull(),
  proposedDeadlineAt: timestamp("proposed_deadline_at", { withTimezone: true }).notNull(),
  reason: text("reason").notNull(),
  requestedByUserId: uuid("requested_by_user_id").notNull().references(() => users.id),
  approvedByUserId: uuid("approved_by_user_id").references(() => users.id),
  appliedAt: timestamp("applied_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  revokedByUserId: uuid("revoked_by_user_id").references(() => users.id),
  createdAt: createdAt(),
}, (table) => [check("accommodation_distinct_approver_ck", sql`${table.approvedByUserId} is null OR ${table.approvedByUserId} <> ${table.requestedByUserId}`)]);

export const examIncidents = pgTable("exam_incidents", {
  id: uuid("id").defaultRandom().primaryKey(),
  batchId: uuid("batch_id").references(() => examBatches.id),
  attemptId: uuid("attempt_id").references(() => attempts.id),
  severity: text("severity").notNull(),
  state: text("state").notNull().default("open"),
  summary: text("summary").notNull(),
  resolution: jsonb("resolution").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
});

export const resultCorrections = pgTable("result_corrections", {
  id: uuid("id").defaultRandom().primaryKey(),
  batchId: uuid("batch_id").notNull().references(() => examBatches.id),
  reasonCode: text("reason_code").notNull(),
  reason: text("reason").notNull(),
  impactPreview: jsonb("impact_preview").$type<Record<string, unknown>>().notNull(),
  status: text("status").notNull().default("draft"),
  requestedByUserId: uuid("requested_by_user_id").notNull().references(() => users.id),
  approvedByUserId: uuid("approved_by_user_id").references(() => users.id),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const correctionImpacts = pgTable("correction_impacts", {
  id: uuid("id").defaultRandom().primaryKey(),
  correctionId: uuid("correction_id").notNull().references(() => resultCorrections.id),
  attemptId: uuid("attempt_id").notNull().references(() => attempts.id),
  previousResultId: uuid("previous_result_id").references(() => results.id),
  proposedScoreSnapshot: jsonb("proposed_score_snapshot").$type<Record<string, unknown>>().notNull(),
  impactState: text("impact_state").notNull().default("previewed"),
  createdAt: createdAt(),
}, (table) => [uniqueIndex("correction_impact_attempt_uq").on(table.correctionId, table.attemptId)]);

export const correctionApprovals = pgTable("correction_approvals", {
  id: uuid("id").defaultRandom().primaryKey(),
  correctionId: uuid("correction_id").notNull().references(() => resultCorrections.id),
  approverUserId: uuid("approver_user_id").notNull().references(() => users.id),
  approvalRole: text("approval_role").notNull(),
  decision: text("decision").notNull(),
  note: text("note"),
  decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("correction_approval_actor_uq").on(table.correctionId, table.approverUserId)]);

// Cross-cutting reliability and audit ----------------------------------------

export const idempotencyRecords = pgTable(
  "idempotency_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorScope: text("actor_scope").notNull(),
    method: text("method").notNull(),
    routeKey: text("route_key").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    state: text("state").notNull(),
    responseStatus: integer("response_status"),
    responseBody: jsonb("response_body").$type<Record<string, unknown>>(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("idempotency_scope_key_uq").on(table.actorScope, table.method, table.routeKey, table.idempotencyKey)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    actorType: text("actor_type").notNull(),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    reason: text("reason"),
    requestId: uuid("request_id"),
    beforeChecksum: text("before_checksum"),
    afterChecksum: text("after_checksum"),
    beforeRedacted: jsonb("before_redacted").$type<Record<string, unknown>>(),
    afterRedacted: jsonb("after_redacted").$type<Record<string, unknown>>(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("audit_target_idx").on(table.targetType, table.targetId, table.occurredAt)],
);

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: text("aggregate_id").notNull(),
    eventType: text("event_type").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    schemaVersion: integer("schema_version").notNull().default(1),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastErrorCode: text("last_error_code"),
  },
  (table) => [
    uniqueIndex("outbox_idempotency_uq").on(table.idempotencyKey),
    index("outbox_unpublished_idx").on(table.publishedAt, table.availableAt),
  ],
);

export const notificationPreferences = pgTable("notification_preferences", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  channel: text("channel").notNull(),
  category: text("category").notNull(),
  state: text("state").notNull(),
  consentRecordId: uuid("consent_record_id").references(() => consentRecords.id),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex("notification_preference_uq").on(table.userId, table.channel, table.category)]);

export const notificationTemplates = pgTable("notification_templates", {
  id: uuid("id").defaultRandom().primaryKey(), code: text("code").notNull(), version: integer("version").notNull(), channel: text("channel").notNull(), category: text("category").notNull(), status: recordStatus("status").notNull().default("draft"), content: jsonb("content").$type<Record<string, unknown>>().notNull(), createdAt: createdAt(),
}, (table) => [uniqueIndex("notification_template_version_uq").on(table.code, table.version)]);

export const notificationJobs = pgTable("notification_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  templateId: uuid("template_id").notNull().references(() => notificationTemplates.id),
  audienceRule: jsonb("audience_rule").$type<Record<string, unknown>>().notNull(),
  audienceSnapshot: jsonb("audience_snapshot").$type<Record<string, unknown>>().notNull().default({}),
  estimatedCostMinor: bigint("estimated_cost_minor", { mode: "number" }),
  idempotencyKey: text("idempotency_key").notNull(),
  state: text("state").notNull().default("draft"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  validatedAt: timestamp("validated_at", { withTimezone: true }),
  approvedByUserId: uuid("approved_by_user_id").references(() => users.id),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
  createdAt: createdAt(),
}, (table) => [uniqueIndex("notification_job_idem_uq").on(table.idempotencyKey)]);

export const notificationDeliveries = pgTable("notification_deliveries", {
  id: uuid("id").defaultRandom().primaryKey(), jobId: uuid("job_id").notNull().references(() => notificationJobs.id), userId: uuid("user_id").notNull().references(() => users.id), channel: text("channel").notNull(), state: text("state").notNull(), providerMessageRef: text("provider_message_ref"), sentAt: timestamp("sent_at", { withTimezone: true }), createdAt: createdAt(),
}, (table) => [uniqueIndex("notification_delivery_user_uq").on(table.jobId, table.userId, table.channel)]);

export const analyticsEvents = pgTable("analytics_events", {
  id: uuid("id").defaultRandom().primaryKey(), eventName: text("event_name").notNull(), schemaVersion: integer("schema_version").notNull(), actorPseudonym: text("actor_pseudonym"), sessionPseudonym: text("session_pseudonym"), properties: jsonb("properties").$type<Record<string, unknown>>().notNull().default({}), occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(), receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (table) => [index("analytics_expiry_idx").on(table.expiresAt), index("analytics_event_time_idx").on(table.eventName, table.occurredAt)]);

export const backgroundJobs = pgTable("background_jobs", {
  id: uuid("id").defaultRandom().primaryKey(), queue: text("queue").notNull(), jobType: text("job_type").notNull(), idempotencyKey: text("idempotency_key").notNull(), payload: jsonb("payload").$type<Record<string, unknown>>().notNull(), state: text("state").notNull().default("queued"), attemptCount: integer("attempt_count").notNull().default(0), availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(), lockedAt: timestamp("locked_at", { withTimezone: true }), lastErrorCode: text("last_error_code"), createdAt: createdAt(), updatedAt: updatedAt(),
}, (table) => [uniqueIndex("background_job_idem_uq").on(table.queue, table.idempotencyKey)]);

export const systemConfigVersions = pgTable("system_config_versions", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull(),
  version: integer("version").notNull(),
  status: recordStatus("status").notNull().default("draft"),
  config: jsonb("config").$type<Record<string, unknown>>().notNull(),
  checksum: text("checksum").notNull(),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (table) => [uniqueIndex("system_config_code_version_uq").on(table.code, table.version)]);
