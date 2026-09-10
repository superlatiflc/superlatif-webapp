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
 * echoes it or its password. It prints exactly two identity values:
 *
 *   - `projectRef`: the Supabase project reference, taken from the connection's
 *     user name (`postgres.<ref>`, pooler) or host (`db.<ref>.supabase.co`,
 *     direct). Not a secret - it is the `<ref>` in the project's public
 *     `https://<ref>.supabase.co` URL - and it is the most meaningful answer
 *     to "which database is this?". It says which target the CLIENT used.
 *   - `serverFingerprint`: a truncated SHA-256 of the address and port of the
 *     Postgres server that actually ANSWERED (inet_server_addr/port). This is
 *     the server-side corroboration. It is point-in-time: Supabase may move a
 *     project to a new host, so compare it between environments at the same
 *     moment rather than against a value recorded weeks ago.
 *
 * WHAT THE FINGERPRINT USED TO BE, AND WHY IT WAS WRONG. The first version
 * hashed the applied-migration timestamps and claimed that differed between
 * environments. It does not: drizzle stores each migration's AUTHORING time
 * from drizzle/meta/_journal.json in `created_at`, so every database migrated
 * from this repository hashed identically - production and staging both
 * reported the same value during bring-up. Postgres's `system_identifier` was
 * tested as a replacement and is ALSO identical across Supabase projects,
 * which are cloned from one base image. Those timestamps are now used for
 * what they genuinely prove instead: that the applied chain matches this
 * repository's journal exactly.
 *
 * Usage:
 *   DATABASE_URL=... node packages/db/scripts/verify-production-db.mjs
 *   DATABASE_URL=... node packages/db/scripts/verify-production-db.mjs --expect-empty
 *   DATABASE_URL=... node packages/db/scripts/verify-production-db.mjs --expect-ref=<ref>
 *
 * --expect-empty makes business-data emptiness a hard failure rather than an
 * observation. Use it for a freshly created production database, where any
 * row at all means something was copied that should not have been.
 *
 * --expect-ref=<ref> makes a wrong target a hard failure. Use it whenever the
 * intended project is known, so "pointed at the wrong database" cannot pass
 * silently.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import process from "node:process";
import postgres from "postgres";

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

/**
 * Derives the non-secret Supabase project reference and region.
 *
 * Splits on the LAST "@" rather than the first: a password may legally
 * contain an unescaped "@" (staging's does - audit P2-6), and splitting on the
 * first one would treat part of the password as the host. Nothing derived
 * from the userinfo section is returned except the portion before its first
 * ":", which is the user name, never the password.
 */
function identityFromUrl(url) {
  const rest = url.replace(/^postgres(?:ql)?:\/\//, "");
  const at = rest.lastIndexOf("@");
  if (at === -1) return { projectRef: "unknown", region: "unknown" };
  const user = rest.slice(0, at).split(":")[0];
  const host = rest.slice(at + 1).split(/[:/?]/)[0];
  const direct = /^db\.([a-z0-9]+)\.supabase\.co$/.exec(host);
  const projectRef = user.includes(".")
    ? user.slice(user.indexOf(".") + 1)
    : direct
      ? direct[1]
      : "non-supabase";
  const region =
    /^aws-\d+-([a-z0-9-]+)\.pooler\.supabase\.com$/.exec(host)?.[1] ?? (direct ? "direct" : "unknown");
  return { projectRef, region };
}

function readJournal() {
  const journal = JSON.parse(
    fs.readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"),
  );
  return journal.entries.map((entry) => String(entry.when));
}

async function main() {
  const url = process.env["DATABASE_URL"];
  if (!url) {
    console.error("DATABASE_URL is required (it is never printed by this script).");
    process.exit(2);
  }
  const expectEmpty = process.argv.includes("--expect-empty");
  const expectRef = process.argv
    .find((arg) => arg.startsWith("--expect-ref="))
    ?.slice("--expect-ref=".length);

  const identity = identityFromUrl(url);
  if (expectRef && identity.projectRef !== expectRef) {
    // Refuse before connecting: there is no reason to talk to a database the
    // operator did not intend to inspect.
    fail(`--expect-ref=${expectRef} but the connection targets project ${identity.projectRef}`);
    console.log(JSON.stringify({ status: "FAIL", identity }, null, 2));
    return;
  }

  const sql = postgres(url, { max: 1, connect_timeout: 20, idle_timeout: 5 });
  const report = { identity: { ...identity, serverFingerprint: null }, checks: {}, businessRows: {} };

  try {
    // --- C3: connected, and to which server (hashed, never raw) ---
    const [{ db, version, addr }] = await sql`
      select current_database() as db, version() as version,
             coalesce(inet_server_addr()::text, 'local') || ':' || coalesce(inet_server_port()::text, '') as addr`;
    report.identity.serverFingerprint = createHash("sha256").update(addr).digest("hex").slice(0, 16);
    report.checks.database = db;
    report.checks.postgresVersion = /PostgreSQL ([0-9.]+)/.exec(version)?.[1] ?? version.slice(0, 40);

    // --- migrations: count, and exact match against this repository's chain ---
    const expected = readJournal();
    const applied = (
      await sql`select created_at from drizzle.__drizzle_migrations order by created_at asc`
    ).map((row) => String(row.created_at));
    report.checks.migrationsApplied = applied.length;
    report.checks.migrationsInRepository = expected.length;
    report.checks.migrationsMatchRepository = JSON.stringify(applied) === JSON.stringify(expected);
    if (!report.checks.migrationsMatchRepository) {
      fail(
        `applied migration chain (${applied.length}) does not match the repository journal (${expected.length}) - ` +
          "the database is ahead of, behind, or diverged from this checkout",
      );
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

    console.log(JSON.stringify({ status: process.exitCode ? "FAIL" : "PASS", ...report }, null, 2));
    console.log(
      "\nIsolation proof: run this against production and against preview/staging at the same time.\n" +
        "`identity.projectRef` AND `identity.serverFingerprint` must BOTH differ. Either one\n" +
        "matching means both environments reach the same database - a stop condition.",
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
