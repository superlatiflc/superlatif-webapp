// Shared drizzle types (ENT-001).
//
// One canonical Schema/Queryable pair for the whole package, covering every
// table. IDN-001 originally defined a narrower, identity-only Schema type
// local to identity/repository.ts; ENT-001 needed a second, structurally-
// similar-but-nominally-different Schema type for access/*.ts, and passing
// one module's `db` handle into the other's functions would have failed to
// typecheck for the same reason GOV-002/GOV-003 already hit once with
// drizzle's generics (see ADR-044's near-miss note) - two declarations of
// "the same shape" are not the same type. Centralizing avoids that class of
// bug outright rather than fixing it per pair of modules.

import type { PgDatabase, PgQueryResultHKT, PgTransaction } from "drizzle-orm/pg-core";
import type * as fullSchema from "./schema/index.ts";

export type Schema = typeof fullSchema;

/** Anything that can run drizzle queries: a top-level db handle or an open transaction. */
export type Queryable<TSchema extends Record<string, unknown> = Schema> =
  PgDatabase<PgQueryResultHKT, TSchema> | PgTransaction<PgQueryResultHKT, TSchema>;
