// @superlatif/db
//
// Drizzle schema and reviewed SQL migrations (IDN-001, BD-05). Production
// client uses postgres.js; a pglite-backed test client exists for fast,
// Docker-free tests (test-client.ts) and is never imported by production code.

export {
  createDatabaseClient,
  type CreateDatabaseClientOptions,
  type Database,
  type DatabaseHandle,
} from "./client.ts";
export { createTestDatabase, type TestDatabase, type TestDatabaseHandle } from "./test-client.ts";
export * as schema from "./schema/index.ts";
export * as identity from "./identity/index.ts";
