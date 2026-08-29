// Program identity persistence (PRG-001).

import { eq } from "drizzle-orm";
import type { Queryable, Schema } from "../db-types.ts";
import { programs } from "../schema/index.ts";

export interface CreateProgramInput {
  readonly code: string;
  readonly name: string;
}

export interface ProgramRow {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly status: string;
}

const PROGRAM_COLUMNS = {
  id: programs.id,
  code: programs.code,
  name: programs.name,
  status: programs.status,
};

export async function createProgram(db: Queryable<Schema>, input: CreateProgramInput): Promise<ProgramRow> {
  const [row] = await db.insert(programs).values(input).returning(PROGRAM_COLUMNS);
  if (!row) throw new Error("createProgram: insert returned no row");
  return row;
}

export async function findProgramByCode(db: Queryable<Schema>, code: string): Promise<ProgramRow | null> {
  const [row] = await db.select(PROGRAM_COLUMNS).from(programs).where(eq(programs.code, code)).limit(1);
  return row ?? null;
}

export async function listPrograms(db: Queryable<Schema>): Promise<ProgramRow[]> {
  return db.select(PROGRAM_COLUMNS).from(programs);
}

/** The `program:` target-ref convention @superlatif/domain/access's entitlement claims already use in every prior task's fixtures. */
export function programTargetRef(code: string): string {
  return `program:${code}`;
}
