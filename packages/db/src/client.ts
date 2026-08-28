// Production database client (IDN-001, BD-05).
//
// postgres.js driver, chosen for standard Postgres deployments (dok 20
// "Database: PostgreSQL managed; Supabase Postgres provisional") without a
// vendor-specific SDK. Connection is constructed explicitly from a caller-
// supplied URL, never read from process.env internally: CLAUDE.md "Inject
// clock, ID generation, and provider interfaces" - the caller (an app/worker
// entry point, or a script) is responsible for validating DATABASE_URL via
// @superlatif/contracts before calling this.

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import * as schema from "./schema/index.ts";

export type Database = PostgresJsDatabase<typeof schema>;

export interface DatabaseHandle {
  readonly db: Database;
  close(): Promise<void>;
}

export interface CreateDatabaseClientOptions {
  /** Statement timeout in milliseconds. Matches DB_STATEMENT_TIMEOUT_MS's unit (ms). */
  readonly statementTimeoutMs?: number;
  /** Maximum pooled connections. Conservative default for a small P0 deployment. */
  readonly maxConnections?: number;
}

/** Creates a real Postgres connection + drizzle instance. Caller owns lifecycle and must call close(). */
export function createDatabaseClient(
  databaseUrl: string,
  options: CreateDatabaseClientOptions = {},
): DatabaseHandle {
  if (databaseUrl.trim() === "") {
    throw new Error("createDatabaseClient requires a non-empty databaseUrl");
  }
  const client: Sql = postgres(databaseUrl, {
    max: options.maxConnections ?? 5,
    connect_timeout: 10,
    idle_timeout: 20,
    // postgres.js applies this per-connection via SET statement_timeout;
    // matches DB_STATEMENT_TIMEOUT_MS's contract in env-spec.ts (milliseconds).
    ...(options.statementTimeoutMs !== undefined
      ? { connection: { statement_timeout: options.statementTimeoutMs } }
      : {}),
  });
  const db = drizzle(client, { schema });
  return {
    db,
    close: () => client.end({ timeout: 5 }),
  };
}
