// Drizzle Kit configuration (BD-05, IDN-001).
//
// dialect: "postgresql" produces standard Postgres DDL regardless of which
// runtime driver later applies it - verified by generating against pglite
// and a real postgres.js connection and confirming byte-identical SQL.
// generate/check never need a live database connection (verified: works
// with DATABASE_URL unset or unreachable); only `migrate` does.
//
// 25_MIGRATION_AND_RECONCILIATION_PLAN.md / CLAUDE.md "Migration rules":
// `drizzle-kit push` is never used here - generated migrations only,
// reviewed like any other source change.

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env["DATABASE_URL"] || "postgresql://placeholder/placeholder",
  },
});
