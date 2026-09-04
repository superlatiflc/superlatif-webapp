#!/usr/bin/env node

/**
 * Production database bring-up verification (Production Launch Plan, Phase C
 * checks C3/C4 and the mandatory Phase 7 environment-isolation proof).
 *
 * WHY THIS EXISTS AS A SCRIPT: the launch plan's Phase C requires evidence
 * that production is connected to the production database, that it holds no
 * staging or student data, and that production and preview are provably NOT
 * the same database. Doing that by hand invites two failure modes - pasting a
 * connection string somewhere it gets logged, and eyeballing row counts
 * inconsistently. This does it as one read-only command with a stable output
 * shape, so whoever performs the bring-up produces the same evidence.
 *
 * STRICTLY READ-ONLY. It issues SELECTs and nothing else. It cannot create,
 * alter, or delete anything, so it is safe to run against production at any
 * time, including before the go/no-go.
 *
 * NEVER PRINTS A SECRET. It reads DATABASE_URL from the environment and never
 * echoes it, no part of it, and no password. The "fingerprint" it prints is a
 * SHA-256 over the applied-migration timestamps plus the database name - a
 * value that differs between two environments (because their migrations were
 * applied at different moments) while revealing nothing about credentials,
 * host, or content. That is exactly what the isolation proof needs: a token
 * you can compare across environments and paste into a report safely.
 *
 * Usage:
 *   DATABASE_URL=... node scripts/verify-production-db.mjs
 *   DATABASE_URL=... node scripts/verify-production-db.mjs --expect-empty
 *
 * --expect-empty makes business-data emptiness a hard failure rather than an
 * observation. Use it for a freshly created production database, where any
 * row at all means something was copied that should not have been.
 */

import { createHash } from "node:crypto";
import process from "node:process";
import postgres from "postgres";

const EXPECTED_MIGRATIONS = 24; // 0000-0023 inclusive

/** Tables that must be empty in a fresh production database. */
const BUSINESS_TABLES = [
  "users",
  "user_sessions",
  "external_identities",
  "attempts",
  "answer_mutations",
  "answer_states",
  "attempt_submissions",
  "result_versions",
  "access_grants",
  "purchases",
  "raw_commerce_events",
];

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

async function main() {
  const url = process.env["DATABASE_URL"];
  if (!url) {
    console.error("DATABASE_URL is required (it is never printed by this script).");
    process.exit(2);
  }
  const expectEmpty = process.argv.includes("--expect-empty");

  const sql = postgres(url, { max: 1, connect_timeout: 20, idle_timeout: 5 });
  const report = { checks: {}, fingerprint: null, businessRows: {} };

  try {
    // --- C3: connected, and to what (by name only, never by URL) ---
    const [{ db, version }] = await sql`
      select current_database() as db, version() as version`;
    report.checks.database = db;
    report.checks.postgresVersion = /PostgreSQL ([0-9.]+)/.exec(version)?.[1] ?? version.slice(0, 40);

    // --- migrations ---
    const migrations = await sql`
      select created_at from drizzle.__drizzle_migrations order by created_at asc`;
    report.checks.migrationsApplied = migrations.length;
    if (migrations.length !== EXPECTED_MIGRATIONS) {
      fail(`expected ${EXPECTED_MIGRATIONS} applied migrations, found ${migrations.length}`);
    }

    // --- schema sentinel: the newest migration's table must exist ---
    const [{ present }] = await sql`
      select to_regclass('public.rate_limit_counters') is not null as present`;
    report.checks.rateLimitCountersPresent = present;
    if (!present) fail("rate_limit_counters is missing - migration 0023 did not apply");

    // --- C4: business-data emptiness ---
    let totalRows = 0;
    for (const table of BUSINESS_TABLES) {
      const [{ exists }] = await sql`select to_regclass(${"public." + table}) is not null as exists`;
      if (!exists) {
        report.businessRows[table] = "MISSING_TABLE";
        fail(`expected table ${table} does not exist`);
        continue;
      }
      const [row] = await sql.unsafe(`select count(*)::int as n from public.${table}`);
      report.businessRows[table] = row.n;
      totalRows += row.n;
    }
    report.checks.totalBusinessRows = totalRows;
    if (expectEmpty && totalRows !== 0) {
      fail(
        `--expect-empty was requested but found ${totalRows} business row(s). ` +
          "A fresh production database must contain no staging fixtures, no test students, and no seeded data.",
      );
    }

    // --- Phase 7 isolation proof: a safe, comparable fingerprint ---
    // Built from WHEN migrations were applied plus the database name. Two
    // separately provisioned environments cannot share this value; the same
    // environment reproduces it exactly.
    const material = `${db}::${migrations.map((m) => String(m.created_at)).join(",")}`;
    report.fingerprint = createHash("sha256").update(material).digest("hex").slice(0, 16);

    console.log(JSON.stringify({ status: process.exitCode ? "FAIL" : "PASS", ...report }, null, 2));
    console.log(
      "\nIsolation proof: run this against production and against preview/staging.\n" +
        "The two `fingerprint` values MUST differ. Identical values mean both\n" +
        "environments point at the same database, which is a stop condition.",
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  // Never surface the connection string, which some driver errors embed.
  const message = error instanceof Error ? error.message : String(error);
  console.error(`FAIL: ${message.replace(/postgres(ql)?:\/\/[^\s]*/gi, "[connection string redacted]")}`);
  process.exit(1);
});
