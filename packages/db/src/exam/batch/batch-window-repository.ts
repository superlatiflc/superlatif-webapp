// batch_windows persistence (EXM-002).
//
// Mirrors exam-form-repository.ts's `replaceExamFormItems` exactly:
// whole-set replace in one transaction, refused once the parent batch is
// locked (assertExamConfigVersionMutable("exam_batch", ...)) - this is what
// makes "Changing offer windows tidak boleh mengubah attempt/batch history"
// hold structurally, the same way a locked exam_form_version can never have
// its items replaced.
//
// Every row is validated through `assertBatchOwnsWindowType` before it ever
// reaches the insert - `catalogue`/`sale` are refused here, not merely by
// convention (see @superlatif/domain/exam's batch-windows.ts module doc).
// The assembled set is then re-validated as a WHOLE via
// `assertBatchWindowsCoherent` before the transaction commits, so a
// partially-coherent write (e.g. only `late_sync_cutoff` without `attempt`)
// can never land in the database.

import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  assertBatchOwnsWindowType,
  assertBatchWindowsCoherent,
  assertExamConfigVersionMutable,
  type BatchWindowSet,
  type BatchWindowType,
} from "@superlatif/domain/exam";
import type { Queryable, Schema } from "../../db-types.ts";
import { batchWindows } from "../../schema/index.ts";
import { ExamBatchNotFoundError, findExamBatchById } from "./batch-repository.ts";

export interface BatchWindowRow {
  readonly id: string;
  readonly examBatchId: string;
  readonly windowType: BatchWindowType;
  readonly startsAt: Date;
  readonly endsAt: Date | null;
}

const BATCH_WINDOW_COLUMNS = {
  id: batchWindows.id,
  examBatchId: batchWindows.examBatchId,
  windowType: batchWindows.windowType,
  startsAt: batchWindows.startsAt,
  endsAt: batchWindows.endsAt,
};

export interface ReplaceBatchWindowInput {
  readonly windowType: string;
  readonly startsAt: Date;
  /** Required for `registration`/`attempt`, must be omitted/null for every other type - see @superlatif/domain/exam's batch-windows.ts. */
  readonly endsAt?: Date | null;
}

/** windowType (snake_case, matches the pg enum) -> BatchWindowSet key (camelCase). */
const WINDOW_SET_KEY: Readonly<Record<BatchWindowType, keyof BatchWindowSet>> = {
  registration: "registration",
  attempt: "attempt",
  late_sync_cutoff: "lateSyncCutoff",
  provisional_result_release: "provisionalResultRelease",
  final_result_release: "finalResultRelease",
  leaderboard_release: "leaderboardRelease",
  explanation_release: "explanationRelease",
  access_end: "accessEnd",
};

/** Assembles raw rows into the shape @superlatif/domain/exam's `deriveBatchState`/`assertBatchWindowsCoherent` expect. Throws if `attempt` is missing (both functions require it). */
export function toBatchWindowSet(rows: readonly BatchWindowRow[]): BatchWindowSet {
  const set: Record<string, { startsAt: Date; endsAt?: Date }> = {};
  for (const row of rows) {
    const key = WINDOW_SET_KEY[row.windowType];
    set[key] =
      row.endsAt !== null ? { startsAt: row.startsAt, endsAt: row.endsAt } : { startsAt: row.startsAt };
  }
  if (!set["attempt"]) {
    throw new Error("toBatchWindowSet: batch has no 'attempt' window - every batch must own exactly one");
  }
  return set as unknown as BatchWindowSet;
}

export async function listBatchWindows(
  db: Queryable<Schema>,
  examBatchId: string,
): Promise<readonly BatchWindowRow[]> {
  const rows = await db
    .select(BATCH_WINDOW_COLUMNS)
    .from(batchWindows)
    .where(eq(batchWindows.examBatchId, examBatchId));
  return rows as BatchWindowRow[];
}

export async function replaceBatchWindows(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  examBatchId: string,
  windows: readonly ReplaceBatchWindowInput[],
): Promise<readonly BatchWindowRow[]> {
  const batch = await findExamBatchById(db, examBatchId);
  if (!batch) throw new ExamBatchNotFoundError(examBatchId);
  assertExamConfigVersionMutable("exam_batch", batch.status);

  for (const window of windows) assertBatchOwnsWindowType(window.windowType);

  const rowsForValidation: BatchWindowRow[] = windows.map((window) => ({
    id: "",
    examBatchId,
    windowType: window.windowType as BatchWindowType,
    startsAt: window.startsAt,
    endsAt: window.endsAt ?? null,
  }));
  assertBatchWindowsCoherent(toBatchWindowSet(rowsForValidation));

  return db.transaction(async (tx) => {
    await tx.delete(batchWindows).where(eq(batchWindows.examBatchId, examBatchId));
    if (windows.length === 0) return [];
    const inserted = await tx
      .insert(batchWindows)
      .values(
        windows.map((window) => ({
          examBatchId,
          windowType: window.windowType as BatchWindowType,
          startsAt: window.startsAt,
          endsAt: window.endsAt ?? null,
        })),
      )
      .returning(BATCH_WINDOW_COLUMNS);
    return inserted as BatchWindowRow[];
  });
}
