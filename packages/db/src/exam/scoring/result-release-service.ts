// Result release + student-safe projection (SCR-002).
//
// "Release follows batch policy" (acceptance): the ONLY authority for
// "has the release window opened" is EXM-002's own `getExamBatchState`
// (server-derived from the batch's `provisional_result_release`/
// `final_result_release` windows, "Batch state harus server-derived,
// jangan simpan status mutable") - this file adds NO new release-
// scheduling mechanism, it composes the one that already exists.
//
// `getStudentResultView` is the SAFE READ PATH - it recomputes batch
// state FRESH on every call rather than trusting `result_versions.
// releasedAt` alone, so a bug in `releaseResult`'s write path (or that
// function simply never having been called yet) can never accidentally
// reveal an unreleased result. "Student visibility harus aman: hasil
// belum release tidak boleh terlihat" (founder instruction) holds by
// this dual-check construction: @superlatif/domain/exam#resolveResultVisibility
// is consulted here with a FRESH batch state, not a cached/stored one.
// `releaseResult` itself only ever WRITES `releasedAt` as an informational
// audit timestamp ("the first moment this was observed released") - never
// the access-control gate.

import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { ResultState } from "@superlatif/domain/exam";
import { resolveResultVisibility } from "@superlatif/domain/exam";
import type { Schema } from "../../db-types.ts";
import { AttemptNotFoundError, findAttemptById } from "../attempt/attempt-repository.ts";
import { getExamBatchState } from "../batch/index.ts";
import {
  findCurrentResultByAttemptId,
  markResultVersionReleased,
  type ResultVersionRow,
} from "./result-repository.ts";

export class ResultNotOwnedError extends Error {
  constructor(readonly attemptId: string) {
    super(`Attempt ${attemptId} does not belong to this actor`);
    this.name = "ResultNotOwnedError";
  }
}

/**
 * Idempotent: a no-op if the batch's release window has not opened yet
 * (returns the row unchanged, `releasedAt` still null), and a no-op if
 * `releasedAt` was already recorded (returns the row unchanged) - safe to
 * call speculatively, exactly like ATM-003's own
 * `finalizeExpiredAttemptIfDue`/SCR-001's own `drainScoringJob` idiom.
 * Still not a real scheduler: nothing calls this on an interval in this
 * task.
 */
export async function releaseResult(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  attemptId: string,
  now: Date,
): Promise<ResultVersionRow | null> {
  const attempt = await findAttemptById(db, attemptId);
  if (!attempt) throw new AttemptNotFoundError(attemptId);

  const result = await findCurrentResultByAttemptId(db, attemptId);
  if (!result) return null;

  const batchState = await getExamBatchState(db, attempt.batchId, now);
  if (!resolveResultVisibility(result.state as ResultState, batchState)) return result;
  if (result.releasedAt !== null) return result;

  await markResultVersionReleased(db, result.id, now);
  return { ...result, releasedAt: now };
}

export interface StudentResultView {
  readonly state: ResultState;
  readonly resultId: string | null;
  readonly version: number | null;
  /** Allowlisted projection only - total/section scores and pass evaluation. Never the internal `evaluation.thresholdResults`/`inputChecksum`/`scoringEngineVersion` fields, matching this codebase's own "serializer allowlist" discipline (student-view.ts, attempt-view.ts). */
  readonly scoreSummary: Record<string, unknown> | null;
  readonly releasedAt: Date | null;
}

const UNRELEASED_VIEW: StudentResultView = {
  state: "processing",
  resultId: null,
  version: null,
  scoreSummary: null,
  releasedAt: null,
};

/**
 * dok 24 §23 acceptance #1 ("User cannot access another user's attempt/
 * result by changing UUID") is checked here, unconditionally, before
 * anything about the result itself is even loaded.
 */
export async function getStudentResultView(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  userId: string,
  attemptId: string,
  now: Date,
): Promise<StudentResultView> {
  const attempt = await findAttemptById(db, attemptId);
  if (!attempt) throw new AttemptNotFoundError(attemptId);
  if (attempt.userId !== userId) throw new ResultNotOwnedError(attemptId);

  const result = await findCurrentResultByAttemptId(db, attemptId);
  const batchState = await getExamBatchState(db, attempt.batchId, now);
  const visible = resolveResultVisibility(result ? (result.state as ResultState) : null, batchState);
  if (!visible || !result) return UNRELEASED_VIEW;

  const scores = result.scores as { sectionScores?: unknown; sectionMaxScores?: unknown };
  return {
    state: result.state as ResultState,
    resultId: result.id,
    version: result.version,
    scoreSummary: {
      total: result.totalScore,
      sectionScores: scores.sectionScores ?? {},
      sectionMaxScores: scores.sectionMaxScores ?? {},
      overallPassed: result.overallPassed,
    },
    releasedAt: result.releasedAt,
  };
}
