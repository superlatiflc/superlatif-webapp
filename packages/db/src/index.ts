// @superlatif/db
//
// Drizzle schema and reviewed SQL migrations (IDN-001, BD-05; ENT-001 adds
// the second migration). Production client uses postgres.js; a pglite-
// backed test client exists for fast, Docker-free tests (test-client.ts)
// and is never imported by production code.

export {
  createDatabaseClient,
  type CreateDatabaseClientOptions,
  type Database,
  type DatabaseHandle,
} from "./client.ts";
export { createTestDatabase, type TestDatabase, type TestDatabaseHandle } from "./test-client.ts";
export type { Queryable, Schema } from "./db-types.ts";
export * as schema from "./schema/index.ts";
export * as identity from "./identity/index.ts";
export * as access from "./access/index.ts";
export * as commerce from "./commerce/index.ts";
export * as authorization from "./authorization/index.ts";
export * as program from "./program/index.ts";
export * as exam from "./exam/index.ts";
