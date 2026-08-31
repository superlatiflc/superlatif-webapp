// ranking_subjects persistence (SCR-003) - the restricted user<->subject
// mapping. No function here is ever called from a student-facing read
// path with anything beyond `publicOptIn`/`displayAlias` forwarded out -
// `userId`/`subjectToken` never leave this file's own return shape into a
// leaderboard response (see ranking-service.ts's own privacy projection).

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Queryable, Schema } from "../../db-types.ts";
import { rankingSubjects } from "../../schema/index.ts";

export interface RankingSubjectRow {
  readonly id: string;
  readonly userId: string;
  readonly subjectToken: string;
  readonly publicOptIn: boolean;
  readonly displayAlias: string | null;
}

const RANKING_SUBJECT_COLUMNS = {
  id: rankingSubjects.id,
  userId: rankingSubjects.userId,
  subjectToken: rankingSubjects.subjectToken,
  publicOptIn: rankingSubjects.publicOptIn,
  displayAlias: rankingSubjects.displayAlias,
};

export async function findRankingSubjectByUserId(
  db: Queryable<Schema>,
  userId: string,
): Promise<RankingSubjectRow | null> {
  const [row] = await db
    .select(RANKING_SUBJECT_COLUMNS)
    .from(rankingSubjects)
    .where(eq(rankingSubjects.userId, userId))
    .limit(1);
  return (row as RankingSubjectRow | undefined) ?? null;
}

/** Lazily creates the subject the first time a user's result is ever eligible for ranking - default `publicOptIn: false` (private until the user explicitly opts in), mirroring `findOrCreateScoringPolicy`'s own (EXM-001) find-or-create shape. */
export async function findOrCreateRankingSubject(
  db: Queryable<Schema>,
  userId: string,
): Promise<RankingSubjectRow> {
  const existing = await findRankingSubjectByUserId(db, userId);
  if (existing) return existing;
  const [row] = await db
    .insert(rankingSubjects)
    .values({ userId, subjectToken: randomUUID() })
    .returning(RANKING_SUBJECT_COLUMNS);
  if (!row) throw new Error("findOrCreateRankingSubject: insert returned no row");
  return row as RankingSubjectRow;
}

export async function listRankingSubjectsByIds(
  db: Queryable<Schema>,
  subjectIds: readonly string[],
): Promise<readonly RankingSubjectRow[]> {
  if (subjectIds.length === 0) return [];
  const rows = await db.select(RANKING_SUBJECT_COLUMNS).from(rankingSubjects);
  const wanted = new Set(subjectIds);
  return (rows as RankingSubjectRow[]).filter((row) => wanted.has(row.id));
}

/**
 * No student-facing endpoint calls this in this task ("Jangan bangun UI
 * leaderboard penuh") - exists so "User dapat memilih privacy display
 * sesuai policy" (dok 18 §15) has a real, testable data-layer primitive
 * ready for whichever future task builds the actual preference UI/route.
 */
export async function setRankingSubjectPrivacy(
  db: Queryable<Schema>,
  userId: string,
  privacy: { readonly publicOptIn: boolean; readonly displayAlias: string | null },
): Promise<RankingSubjectRow> {
  const existing = await findOrCreateRankingSubject(db, userId);
  const [row] = await db
    .update(rankingSubjects)
    .set({ publicOptIn: privacy.publicOptIn, displayAlias: privacy.displayAlias })
    .where(eq(rankingSubjects.id, existing.id))
    .returning(RANKING_SUBJECT_COLUMNS);
  if (!row) throw new Error("setRankingSubjectPrivacy: update returned no row");
  return row as RankingSubjectRow;
}
