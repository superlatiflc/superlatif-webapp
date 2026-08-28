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
