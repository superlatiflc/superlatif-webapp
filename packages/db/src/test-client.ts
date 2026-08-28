// In-process test database client (IDN-001).
//
// PGlite (embedded WASM Postgres) applies the SAME generated migration SQL
// as production, so this exercises real constraint/FK/unique-index behaviour
// without Docker or a live Postgres connection - verified during design by
// generating against dialect:"postgresql" and confirming the SQL is
// standard, driver-independent Postgres DDL.
//
// Test-only: never imported by apps/web, apps/worker, or any production code
// path. A real Postgres service container still verifies migrations apply
// cleanly to production-representative Postgres in CI (dok 27 §4 staging
// parity; ci.yml's "Apply migrations to a real Postgres" step) - this client
// is for fast, Docker-free domain/persistence tests only.

import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "./schema/index.ts";

const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "drizzle");

export type TestDatabase = PgliteDatabase<typeof schema>;

export interface TestDatabaseHandle {
  readonly db: TestDatabase;
  close(): Promise<void>;
}

/** Creates a fresh, migrated, isolated in-memory database for one test. */
export async function createTestDatabase(): Promise<TestDatabaseHandle> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  return { db, close: () => client.close() };
}
