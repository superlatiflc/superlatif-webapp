// Server-only database + effective-access cache singleton (PRG-001).
//
// `/home` is this repository's first route that actually reads the
// database - previous tasks deliberately stopped at "no HTTP route calls
// this layer yet" (ADR-046/047/048/049/050/051 all say so explicitly).
// This module is that first wiring: a module-level singleton so Next.js's
// dev-mode module reloads and serverless/edge-adjacent invocations don't
// open a fresh connection pool per request. `DATABASE_URL` stays
// "optional-no-default" (GOV-003, packages/contracts/src/env-spec.ts) - a
// deployment with no database configured can still start; only requests
// that reach this module fail, with a clear, caught error, not a crashed
// process.
//
// The in-process effective-access cache (ENT-002) is also a singleton here
// deliberately - it needs to survive across requests within one server
// process to be useful at all, and ENT-002's own `issueGrantAndInvalidate`/
// `recordGrantEventAndInvalidate` are the only functions that ever
// invalidate it, so nothing in this module needs to manage that itself.

import { createDatabaseClient, type Database } from "@superlatif/db";
import { createInMemoryEffectiveAccessCache, type EffectiveAccessCache } from "@superlatif/domain/access";

let dbSingleton: Database | undefined;
let cacheSingleton: EffectiveAccessCache | undefined;

export function getDb(): Database {
  if (dbSingleton) return dbSingleton;
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is not configured. This deployment can start without it (GOV-003), but /home needs a database to resolve program access.",
    );
  }
  const handle = createDatabaseClient(databaseUrl);
  dbSingleton = handle.db;
  return dbSingleton;
}

export function getEffectiveAccessCache(): EffectiveAccessCache {
  if (!cacheSingleton) cacheSingleton = createInMemoryEffectiveAccessCache();
  return cacheSingleton;
}
