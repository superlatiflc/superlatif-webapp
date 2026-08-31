// Deterministic scorer orchestration + scoring_job_outbox drain (SCR-001).
//
// dok 16 §14 "Scoring input hanya: submission answer snapshot; question
// versions; scoring policy snapshot; blueprint/form snapshot; approved
// corrections/accommodations." `scoreSubmission` reads exactly that list
// (via the attempt's own pinned FKs, ATM-001) and nothing else - no
// "current" question/policy lookup anywhere in this file.
//
// `scoreSubmission` checks for an existing CURRENT result FIRST (the same
// "check existing first, DB constraint as the real race arbiter" shape
// `startOrResumeAttempt`/`submitAttempt` already established) and does
// NOT catch-and-refetch a genuine concurrent-insert race the way ATM-003's
// own `submitAttempt` does - unlike "User-submit vs timeout-submit race",
// no required test in this task's scope demands a graceful outcome for
// two truly simultaneous `scoreSubmission` calls (the only caller in this
// task is the internal drain path, which this task also controls end to
// end), so a genuine race surfaces as a raw unique-violation to the
// loser, matching ATM-001's own `insertAttempt` precedent rather than
// ATM-003's stricter one. A future task with a real concurrent-drain
// requirement can upgrade this the same way ATM-003 upgraded ATM-001's
// pattern, if that requirement ever actually exists.

import { computeChecksum, type JsonValue } from "@superlatif/domain/shared";
import {
  assertScorerMatchesQuestionType,
  computeAnswerSetChecksum,
  computeScore,
  gradeAnswer,
  type AnswerPayload,
  type GradedAnswer,
  type ScoringPolicyConfig,
} from "@superlatif/domain/exam";
import type { Queryable, Schema } from "../../db-types.ts";
import { AttemptNotFoundError, findAttemptById } from "../attempt/attempt-repository.ts";
import {
  findSubmissionByAttemptId,
  type AttemptSubmissionRow,
} from "../attempt/attempt-submission-repository.ts";
import { listAnswerStatesForAttempt } from "../attempt/answer-state-repository.ts";
import { listPresentedInstances } from "../attempt/attempt-question-instance-repository.ts";
import {
  findPendingScoringJobs,
  findScoringJobById,
  markScoringJobDelivered,
  type ScoringJobOutboxRow,
} from "../attempt/scoring-outbox-repository.ts";
import { findQuestionVersionById } from "../question-repository.ts";
import { requireQuestionVersionSecret } from "../question-secret-repository.ts";
import {
  findScoringPolicyVersionById,
  ScoringPolicyVersionNotFoundError,
} from "../config/scoring-policy-repository.ts";
import {
  findCurrentResultByAttemptId,
  insertResultVersion,
  type ResultVersionRow,
} from "./result-repository.ts";

/** dok 16 §14 "scoring engine version" - bump only when the actual scoring MATH changes, so a stored result stays a faithful record of what computed it. */
export const SCORING_ENGINE_VERSION = "scr-001-v1";

export class ScoringSubmissionNotFoundError extends Error {
  constructor(readonly attemptId: string) {
    super(`Attempt ${attemptId} has no submission to score`);
    this.name = "ScoringSubmissionNotFoundError";
  }
}

export class ScoringQuestionVersionNotFoundError extends Error {
  constructor(readonly questionVersionId: string) {
    super(`Question version ${questionVersionId} not found while scoring`);
    this.name = "ScoringQuestionVersionNotFoundError";
  }
}

/**
 * The frozen answer snapshot (`answer_states`, ATM-002) is re-read and
 * re-checksummed here, then compared against the PINNED checksum
 * `attempt_submissions.answer_set_checksum` recorded at submit time
 * (ATM-003) - "Same snapshot and answers always produce same score"
 * (acceptance) is not just an aspiration this integrity check makes it a
 * VERIFIED property: if `answer_states` were ever mutated after
 * submission (which `assertAttemptWritable` should already make
 * impossible), scoring refuses rather than silently scoring a state that
 * no longer matches what the student actually submitted.
 */
export class ScoringInputChecksumMismatchError extends Error {
  constructor(
    readonly attemptId: string,
    readonly expectedChecksum: string,
    readonly actualChecksum: string,
  ) {
    super(
      `Attempt ${attemptId}: current answer_states checksum does not match the pinned submission checksum - refusing to score a snapshot that may have changed since submit`,
    );
    this.name = "ScoringInputChecksumMismatchError";
  }
}

function computeInputChecksum(input: {
  readonly submissionId: string;
  readonly answerSetChecksum: string;
  readonly scoringPolicyVersionId: string;
  readonly scoringEngineVersion: string;
}): string {
  return computeChecksum(input as unknown as JsonValue);
}

export interface ComputedScorePayload {
  readonly scores: Record<string, unknown>;
  readonly evaluation: Record<string, unknown>;
  readonly totalScore: number;
  readonly overallPassed: boolean | null;
  readonly scoringEngineVersion: string;
  readonly inputChecksum: string;
}

/**
 * The shared core both `scoreSubmission` (always the attempt's own pinned
 * policy) and SCR-002's `decideResultCorrection` (an explicitly-approved,
 * DIFFERENT policy version) call - "what did the student get right, and
 * what is that worth" against WHATEVER `scoringPolicyVersionId` the
 * caller supplies. The answer-snapshot integrity check (re-verify against
 * the pinned submission checksum) always runs regardless of which policy
 * is used - it is about the ANSWER data never having drifted since
 * submit, not about the scoring formula, so a correction gets the exact
 * same integrity guarantee the original score did.
 */
export async function computeScorePayload(
  db: Queryable<Schema>,
  attemptId: string,
  submission: AttemptSubmissionRow,
  scoringPolicyVersionId: string,
): Promise<ComputedScorePayload> {
  const scoringPolicyVersion = await findScoringPolicyVersionById(db, scoringPolicyVersionId);
  if (!scoringPolicyVersion) throw new ScoringPolicyVersionNotFoundError(scoringPolicyVersionId);
  const policy = scoringPolicyVersion.policyConfig as unknown as ScoringPolicyConfig;

  const answerStates = await listAnswerStatesForAttempt(db, attemptId);
  const recomputedChecksum = computeAnswerSetChecksum(
    answerStates.map((row) => ({
      instanceId: row.instanceId,
      revision: row.revision,
      payload: row.payload as unknown as AnswerPayload | null,
    })),
  );
  if (recomputedChecksum !== submission.answerSetChecksum) {
    throw new ScoringInputChecksumMismatchError(attemptId, submission.answerSetChecksum, recomputedChecksum);
  }

  const answerByInstanceId = new Map(answerStates.map((row) => [row.instanceId, row]));
  const instances = await listPresentedInstances(db, attemptId);

  const gradedAnswers: GradedAnswer[] = [];
  for (const instance of instances) {
    const questionVersion = await findQuestionVersionById(db, instance.questionVersionId);
    if (!questionVersion) throw new ScoringQuestionVersionNotFoundError(instance.questionVersionId);

    const scorer = policy.sectionScorers?.[instance.sectionCode];
    if (!scorer) {
      throw new Error(
        `Section "${instance.sectionCode}" has no sectionScorers entry in the pinned scoring policy`,
      );
    }
    assertScorerMatchesQuestionType(scorer, questionVersion.type);

    const answerKey = await requireQuestionVersionSecret(db, instance.questionVersionId);
    const answerRow = answerByInstanceId.get(instance.id);
    const payload = answerRow ? (answerRow.payload as unknown as AnswerPayload | null) : null;

    gradedAnswers.push({
      sectionCode: instance.sectionCode,
      outcome: gradeAnswer(questionVersion.type, answerKey, payload),
    });
  }

  const computation = computeScore(policy, gradedAnswers);
  const inputChecksum = computeInputChecksum({
    submissionId: submission.id,
    answerSetChecksum: submission.answerSetChecksum,
    scoringPolicyVersionId,
    scoringEngineVersion: SCORING_ENGINE_VERSION,
  });

  return {
    scores: {
      sectionScores: computation.sectionScores,
      sectionMaxScores: computation.sectionMaxScores,
      unansweredCount: computation.unansweredCount,
      invalidCount: computation.invalidCount,
    },
    evaluation: { thresholdResults: computation.thresholdResults },
    totalScore: computation.total,
    overallPassed: computation.overallPassed,
    scoringEngineVersion: SCORING_ENGINE_VERSION,
    inputChecksum,
  };
}

/**
 * Computes and persists the (first, and in this task's scope ONLY)
 * result version for an attempt's submission. Idempotent: a second call
 * for an attempt that already has a current result returns that SAME
 * row, never recomputing or duplicating - this is what makes "Recompute
 * equality" hold at the service layer, mirroring the pure
 * `computeScore`'s own determinism at the domain layer.
 */
export async function scoreSubmission(
  db: Queryable<Schema>,
  attemptId: string,
  now: Date,
): Promise<ResultVersionRow> {
  const existing = await findCurrentResultByAttemptId(db, attemptId);
  if (existing) return existing;

  const attempt = await findAttemptById(db, attemptId);
  if (!attempt) throw new AttemptNotFoundError(attemptId);

  const submission = await findSubmissionByAttemptId(db, attemptId);
  if (!submission) throw new ScoringSubmissionNotFoundError(attemptId);

  // The PINNED version (attempt.scoringPolicyVersionId, set once at start
  // - ATM-001) is dereferenced directly, never "the current published
  // version for this batch/family" - this is the entire mechanism behind
  // "Recompute stays pinned to snapshot policy" (required test).
  const payload = await computeScorePayload(db, attemptId, submission, attempt.scoringPolicyVersionId);

  return insertResultVersion(db, {
    attemptId,
    submissionId: submission.id,
    scoringPolicyVersionId: attempt.scoringPolicyVersionId,
    version: 1,
    isCurrent: true,
    state: "provisional",
    ...payload,
    computedAt: now,
  });
}

/**
 * Drains exactly ONE pending job. Not itself a scheduler/worker loop -
 * "Drain/use scoring_job_outbox boleh dibuat sebatas jalur scoring
 * internal yang diperlukan task ini" (founder instruction): this is the
 * callable internal path, ready for a FUTURE real worker to invoke on a
 * timer/queue trigger this task does not build.
 *
 * Idempotent under retry ("Worker retry" discipline, matching ATM-003's
 * own `finalizeExpiredAttemptIfDue`): a job already `delivered` replays
 * whatever result already exists for its attempt rather than
 * recomputing; `scoreSubmission` itself is separately idempotent if a
 * result already exists. `markScoringJobDelivered`'s own `WHERE status =
 * 'pending'` guard means a crash between the two statements below just
 * leaves the job `pending` for a future retry to pick up cleanly - no
 * explicit transaction wraps them (see module doc: this task keeps that
 * simpler, since both steps are independently idempotent).
 */
export async function drainScoringJob(
  db: Queryable<Schema>,
  jobId: string,
  now: Date,
): Promise<ResultVersionRow | null> {
  const job = await findScoringJobById(db, jobId);
  if (!job) return null;
  if (job.status !== "pending") {
    return findCurrentResultByAttemptId(db, job.attemptId);
  }
  const result = await scoreSubmission(db, job.attemptId, now);
  await markScoringJobDelivered(db, jobId, now);
  return result;
}

/** Convenience "worker tick" - drains every currently-pending job. Still not a scheduler: nothing calls this on an interval in this task. */
export async function drainAllPendingScoringJobs(
  db: Queryable<Schema>,
  now: Date,
): Promise<readonly ResultVersionRow[]> {
  const jobs: readonly ScoringJobOutboxRow[] = await findPendingScoringJobs(db);
  const results: ResultVersionRow[] = [];
  for (const job of jobs) {
    const result = await drainScoringJob(db, job.id, now);
    if (result) results.push(result);
  }
  return results;
}
