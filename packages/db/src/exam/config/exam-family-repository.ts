// exam_families persistence (EXM-001).
//
// dok 21 §9: "Stable code, name, activation state" - a simple line-level
// lifecycle, mirroring questions.status/stimuli.status's own two-tier
// split (QST-001). The versioned regulatory/structural content lives on
// exam_blueprint_versions, not here.

import { eq } from "drizzle-orm";
import type { Queryable, Schema } from "../../db-types.ts";
import { examFamilies } from "../../schema/index.ts";

export interface ExamFamilyRow {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly status: string;
}

const EXAM_FAMILY_COLUMNS = {
  id: examFamilies.id,
  code: examFamilies.code,
  title: examFamilies.title,
  status: examFamilies.status,
};

export async function findExamFamilyByCode(
  db: Queryable<Schema>,
  code: string,
): Promise<ExamFamilyRow | null> {
  const [row] = await db
    .select(EXAM_FAMILY_COLUMNS)
    .from(examFamilies)
    .where(eq(examFamilies.code, code))
    .limit(1);
  return row ?? null;
}

export async function findOrCreateExamFamily(
  db: Queryable<Schema>,
  input: { code: string; title: string },
): Promise<ExamFamilyRow> {
  const existing = await findExamFamilyByCode(db, input.code);
  if (existing) return existing;
  const [row] = await db
    .insert(examFamilies)
    .values({ code: input.code, title: input.title })
    .returning(EXAM_FAMILY_COLUMNS);
  if (!row) throw new Error("findOrCreateExamFamily: insert returned no row");
  return row;
}
