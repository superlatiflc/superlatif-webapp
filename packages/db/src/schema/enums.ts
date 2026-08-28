// Identity schema enums (IDN-001).
//
// 21_ERD_AND_DATA_DICTIONARY.md §3 `users`; matches contracts/drizzle-schema.ts
// (Gate 3 reviewed contract artifact), used as implementation reference, not
// imported directly - contracts/ is a review artifact, not a runtime module.

import { pgEnum } from "drizzle-orm/pg-core";

export const userStatus = pgEnum("user_status", ["active", "suspended", "archived"]);
