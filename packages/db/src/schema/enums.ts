// Schema enums (IDN-001, ENT-001).
//
// Matches contracts/drizzle-schema.ts (Gate 3 reviewed contract artifact),
// used as implementation reference, not imported directly - contracts/ is a
// review artifact, not a runtime module.

import { pgEnum } from "drizzle-orm/pg-core";

// 21_ERD_AND_DATA_DICTIONARY.md §3 `users` (IDN-001).
export const userStatus = pgEnum("user_status", ["active", "suspended", "archived"]);

// contracts/drizzle-schema.ts's recordStatus (ENT-001, access_policies): a
// versioned artifact's own publication lifecycle. Reused as-is - this
// vocabulary is not specific to any one domain area.
export const recordStatus = pgEnum("record_status", [
  "draft",
  "in_review",
  "changes_requested",
  "approved",
  "published",
  "archived",
]);

// dok 05 §8.2 lifecycle table; matches CLAUDE.md's canonical Grant states
// exactly. Not stored on access_grants itself (that table is immutable -
// see access.ts) - used only as the DERIVED status type returned by
// @superlatif/domain/access's deriveGrantStatus, and as grant_events'
// administrative event vocabulary below.
export const grantEventType = pgEnum("grant_event_type", [
  "activated",
  "suspended",
  "reinstated",
  "revoked",
  "cancelled",
]);

// contracts/drizzle-schema.ts's targetType, matching
// entitlement-policy.schema.json's claim.targetType exactly (ENT-001) -
// what a product_component (COM-001) or a policy claim can point at. Shared
// vocabulary between the commerce and access domains, not duplicated.
export const targetType = pgEnum("target_type", [
  "program",
  "program_track",
  "module",
  "resource",
  "live_session",
  "live_session_series",
  "exam_batch",
  "batch_collection",
  "community",
  "capability",
]);

// dok 14 §14 "Recording": "Processing state: pending, processing, ready,
// failed, archived" - transcribed verbatim (LRN-001). A genuinely new state
// vocabulary, but not an invented one: the canonical UX/domain spec names it
// exactly, the same way grantEventType/recordStatus above transcribe their
// own source docs rather than inventing synonyms (CLAUDE.md "Do not
// introduce synonyms without updating the domain document").
export const recordingProcessingStatus = pgEnum("recording_processing_status", [
  "pending",
  "processing",
  "ready",
  "failed",
  "archived",
]);

// CLAUDE.md's canonical "Purchase states" vocabulary, transcribed verbatim
// (COM-002). This is the first task to actually persist it - COM-001's
// products/offers/external_sku_mappings deliberately stopped short of
// purchases/purchase_events (see commerce.ts's module doc).
export const purchaseState = pgEnum("purchase_state", [
  "pending",
  "paid",
  "failed",
  "expired",
  "cancelled",
  "refunded_partial",
  "refunded_full",
  "chargeback",
]);

// dok 14 §11 "Schedule item": "type: live_class, exam_window, deadline,
// announcement, other" - transcribed verbatim (SCH-001).
export const scheduleItemType = pgEnum("schedule_item_type", [
  "live_class",
  "exam_window",
  "deadline",
  "announcement",
  "other",
]);

// dok 14 §11 "Status": "draft, scheduled, live, ended, cancelled,
// rescheduled" - transcribed verbatim (SCH-001).
export const liveSessionStatus = pgEnum("live_session_status", [
  "draft",
  "scheduled",
  "live",
  "ended",
  "cancelled",
  "rescheduled",
]);
