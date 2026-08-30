// Attempt start, snapshot, and resume orchestration (ATM-001).
//
// Composes ENT-002's effective-access/attempt-allowance resolvers,
// EXM-002's server-derived batch state, and EXM-001's published form/
// blueprint - "Start harus authorized via ENT-002/IDN-004" and this task
// invents no new access rule (the exact same discipline PRG-001's own
// `assertProgramAccess` already established for program access). Answer
// save, submit, scoring, and ranking are explicitly NOT built here -
// "Jangan bangun answer/save/submit/scoring/ranking dulu" (founder
// instruction).
//
// `startOrResumeAttempt` is the single entry point for
// `POST /batches/{id}/attempts` (dok 22 §9's own "Start/resume attempt"
// description) - it returns the user's existing non-voided attempt if one
// already exists (idempotent, DB-enforced via the partial unique index on
// `attempts`, see schema/attempts.ts), or creates exactly one new attempt
// otherwise. `getAttemptResumeView` is `GET /attempts/{id}`.

import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  assertAttemptStartEligible,
  assertSupportedPresentationPolicy,
  buildPresentedInstances,
  computeAttemptSnapshotChecksum,
  computeWriterLeaseExpiry,
  generateWriterLeaseToken,
  hashWriterLeaseToken,
  writerLeaseTokenMatchesHash,
  type AttemptStartAccessDecision,
  type BlueprintPresentation,
  type BlueprintSection,
  type FormItemInput,
} from "@superlatif/domain/exam";
import { computeChecksum, type JsonValue } from "@superlatif/domain/shared";
import type { EffectiveAccessCache } from "@superlatif/domain/access";
import type { Queryable, Schema } from "../../db-types.ts";
import { getAttemptAllowance, getEffectiveAccess } from "../../access/index.ts";
import {
  examBatchTargetRef,
  findExamBatchById,
  getExamBatchState,
  type ExamBatchRow,
} from "../batch/index.ts";
import { findExamBlueprintVersionById } from "../config/exam-blueprint-repository.ts";
import { findExamFormVersionById, listExamFormItems } from "../config/exam-form-repository.ts";
import { listQuestionOptions } from "../question-repository.ts";
import {
  countActiveAttemptsForUserBatch,
  findActiveAttemptForUserBatch,
  findAttemptById,
  findAttemptByUserAndIdempotencyKey,
  insertAttempt,
  transitionAttemptStatus,
  AttemptNotFoundError,
  type AttemptRow,
} from "./attempt-repository.ts";
import { insertPresentedInstances } from "./attempt-question-instance-repository.ts";
import {
  findActiveLease,
  issueLease,
  renewActiveLease,
  type AttemptWriterLeaseRow,
} from "./attempt-writer-lease-repository.ts";
import { assembleAttemptView, type AttemptView } from "./attempt-view.ts";

export class AttemptBatchNotFoundError extends Error {
  constructor(batchId: string) {
    super(`Batch ${batchId} not found`);
    this.name = "AttemptBatchNotFoundError";
  }
}

export class AttemptIdempotencyKeyReusedError extends Error {
  constructor(readonly startIdempotencyKey: string) {
    super(`IDEMPOTENCY_KEY_REUSED: "${startIdempotencyKey}" was already used for a different request`);
    this.name = "AttemptIdempotencyKeyReusedError";
  }
}

export class AttemptNotOwnedError extends Error {
  constructor(attemptId: string) {
    super(`Attempt ${attemptId} does not belong to this actor`);
    this.name = "AttemptNotOwnedError";
  }
}

/**
 * ENT-002's `getAttemptAllowance` returns `ownedByBatch: true` whenever no
 * product/grant contributes a numeric cap (the dok 05 §8.4 MVP default) -
 * its own module doc says the caller is "expected to read the actual limit
 * from the batch's own attempt policy" once one exists. `attempt_policies`
 * does not exist as a table anywhere in this codebase yet (EXM-002's own
 * ADR-065 deferred it) - so this task's own conservative, documented MVP
 * default is exactly ONE ranked attempt per (user, batch) until a real
 * attempt policy is built. A non-null `maxRankedAttempts` from a real
 * product/grant claim is honored as-is.
 */
const DEFAULT_ATTEMPT_ALLOWANCE_WHEN_UNSPECIFIED = 1;

function resolveAttemptAllowanceLimit(allowance: { readonly maxRankedAttempts: number | null }): number {
  return allowance.maxRankedAttempts ?? DEFAULT_ATTEMPT_ALLOWANCE_WHEN_UNSPECIFIED;
}

export interface StartOrResumeAttemptInput {
  readonly batchId: string;
  readonly idempotencyKey: string;
  readonly clientCapabilities: { readonly offlineQueue: boolean; readonly writerLease: boolean };
}

export interface StartOrResumeAttemptResult {
  /** True only when a NEW attempt row was created this call - false for every replay/resume outcome. */
  readonly created: boolean;
  readonly view: AttemptView;
}

function computeStartRequestHash(
  batchId: string,
  clientCapabilities: StartOrResumeAttemptInput["clientCapabilities"],
): string {
  return computeChecksum({ batchId, clientCapabilities } as unknown as JsonValue);
}

async function loadBatchOrThrow(db: Queryable<Schema>, batchId: string): Promise<ExamBatchRow> {
  const batch = await findExamBatchById(db, batchId);
  if (!batch) throw new AttemptBatchNotFoundError(batchId);
  return batch;
}

async function buildAttemptSectionInputs(
  db: Queryable<Schema>,
  blueprintVersionId: string,
): Promise<{
  sections: BlueprintSection[];
  sectionLockMode: string;
  presentation: BlueprintPresentation;
  lateSyncCutoffSeconds: number;
  totalDurationSeconds: number;
}> {
  const blueprintVersion = await findExamBlueprintVersionById(db, blueprintVersionId);
  if (!blueprintVersion) {
    throw new Error(`buildAttemptSectionInputs: blueprint version ${blueprintVersionId} not found`);
  }
  const config = blueprintVersion.config;
  const sections = config["sections"] as BlueprintSection[];
  const navigation = config["navigation"] as { sectionLockMode?: string } | undefined;
  const presentation = config["presentation"] as BlueprintPresentation;
  const timing = config["timing"] as { totalDurationSeconds: number; lateSyncCutoffSeconds?: number };
  return {
    sections,
    sectionLockMode: navigation?.sectionLockMode ?? "free",
    presentation,
    lateSyncCutoffSeconds: timing.lateSyncCutoffSeconds ?? 30,
    totalDurationSeconds: timing.totalDurationSeconds,
  };
}

/**
 * Creates exactly one new attempt: resolves the batch's pinned (published)
 * form/blueprint/scoring versions, generates and persists the presented
 * question/option order (dok 16 §5 steps 4-7), issues the first writer
 * lease (step 8), and returns the assembled view.
 */
async function createAttempt(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  userId: string,
  batch: ExamBatchRow,
  input: StartOrResumeAttemptInput,
  now: Date,
): Promise<StartOrResumeAttemptResult> {
  const formVersion = await findExamFormVersionById(db, batch.examFormVersionId);
  if (!formVersion) {
    throw new Error(`createAttempt: exam form version ${batch.examFormVersionId} not found`);
  }

  const { sections, presentation, lateSyncCutoffSeconds, totalDurationSeconds, sectionLockMode } =
    await buildAttemptSectionInputs(db, formVersion.blueprintVersionId);
  assertSupportedPresentationPolicy(presentation);

  const formItems = await listExamFormItems(db, formVersion.id);
  const formItemInputs: FormItemInput[] = formItems.map((item) => ({
    sectionCode: item.sectionCode,
    order: item.order,
    questionVersionId: item.questionVersionId,
  }));

  const choiceCodes = new Map<string, readonly string[] | null>();
  for (const item of formItems) {
    const options = await listQuestionOptions(db, item.questionVersionId);
    choiceCodes.set(
      item.questionVersionId,
      options.length === 0
        ? null
        : [...options].sort((a, b) => a.order - b.order).map((option) => option.optionCode),
    );
  }

  const sortedSectionCodes = [...sections].sort((a, b) => a.order - b.order).map((section) => section.code);
  const instances = buildPresentedInstances(formItemInputs, sortedSectionCodes, choiceCodes);

  const startedAt = now;
  const deadlineAt = new Date(startedAt.getTime() + totalDurationSeconds * 1000);
  const lateSyncCutoffAt = new Date(deadlineAt.getTime() + lateSyncCutoffSeconds * 1000);

  const snapshotChecksum = computeAttemptSnapshotChecksum({
    batchId: batch.id,
    examFormVersionId: formVersion.id,
    blueprintVersionId: formVersion.blueprintVersionId,
    scoringPolicyVersionId: formVersion.scoringPolicyVersionId,
    instances,
  });

  const attempt = await insertAttempt(db, {
    userId,
    batchId: batch.id,
    examFormVersionId: formVersion.id,
    blueprintVersionId: formVersion.blueprintVersionId,
    scoringPolicyVersionId: formVersion.scoringPolicyVersionId,
    startedAt,
    deadlineAt,
    lateSyncCutoffAt,
    snapshotChecksum,
    startIdempotencyKey: input.idempotencyKey,
    startRequestHash: computeStartRequestHash(batch.id, input.clientCapabilities),
  });

  await insertPresentedInstances(db, attempt.id, instances);
  await transitionAttemptStatus(db, attempt.id, "in_progress");

  const leaseToken = generateWriterLeaseToken();
  await issueLease(db, {
    attemptId: attempt.id,
    tokenHash: hashWriterLeaseToken(leaseToken),
    issuedAt: now,
    expiresAt: computeWriterLeaseExpiry(now),
  });

  const finalAttempt = await findAttemptById(db, attempt.id);
  if (!finalAttempt) throw new Error("createAttempt: attempt vanished immediately after creation");

  const view = await assembleAttemptView(db, {
    attempt: finalAttempt,
    now,
    sections,
    sectionLockMode,
    requestingLeaseTokenHash: hashWriterLeaseToken(leaseToken),
    justIssuedLeaseToken: leaseToken,
  });

  return { created: true, view };
}

export async function startOrResumeAttempt(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  cache: EffectiveAccessCache,
  userId: string,
  input: StartOrResumeAttemptInput,
  now: Date,
): Promise<StartOrResumeAttemptResult> {
  const batch = await loadBatchOrThrow(db, input.batchId);

  // Idempotency replay check FIRST (dok 22 §14): same key + different
  // content is refused before anything else is evaluated, even if an
  // active attempt already exists for another reason.
  const byKey = await findAttemptByUserAndIdempotencyKey(db, userId, input.idempotencyKey);
  if (byKey) {
    const expectedHash = computeStartRequestHash(batch.id, input.clientCapabilities);
    if (byKey.startRequestHash !== expectedHash) {
      throw new AttemptIdempotencyKeyReusedError(input.idempotencyKey);
    }
  }

  // Start-or-resume duality (dok 22 §9's own endpoint description): ANY
  // existing non-voided attempt for this (user, batch) is returned as-is,
  // regardless of which idempotency key produced it - the database's own
  // partial unique index is what makes "never a duplicate" hold even under
  // a race, not this check alone.
  const existing = await findActiveAttemptForUserBatch(db, userId, batch.id);
  if (existing) {
    const view = await buildResumeView(db, existing, null, now);
    return { created: false, view };
  }

  const query = {
    targetType: "exam_batch",
    targetRef: examBatchTargetRef(batch.code),
    action: "start_attempt",
  };
  const effectiveAccess = await getEffectiveAccess(db, cache, userId, query, now);
  const batchState = await getExamBatchState(db, batch.id, now);
  const formVersion = await findExamFormVersionById(db, batch.examFormVersionId);
  const allowance = await getAttemptAllowance(db, userId, query, now);
  const existingActiveAttemptCount = await countActiveAttemptsForUserBatch(db, userId, batch.id);

  const accessDecision: AttemptStartAccessDecision = {
    allowed: effectiveAccess.allowed,
    reasonCode: effectiveAccess.reasonCode,
    studentReason: effectiveAccess.studentReason,
  };

  assertAttemptStartEligible({
    effectiveAccess: accessDecision,
    batchState,
    formVersionStatus: formVersion?.status ?? "draft",
    existingActiveAttemptCount,
    allowanceLimit: resolveAttemptAllowanceLimit(allowance),
  });

  return createAttempt(db, userId, batch, input, now);
}

/** Builds a resume view for an attempt that already exists (no writes other than a possible expired-lease reissue, matching dok 16 §11's own resume contract - "reload mempertahankan deadline, question order, option order, dan answers"). */
async function buildResumeView(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  attempt: AttemptRow,
  requestingLeaseToken: string | null,
  now: Date,
): Promise<AttemptView> {
  const formVersion = await findExamFormVersionById(db, attempt.examFormVersionId);
  if (!formVersion)
    throw new Error(`buildResumeView: exam form version ${attempt.examFormVersionId} not found`);
  const { sections, sectionLockMode } = await buildAttemptSectionInputs(db, attempt.blueprintVersionId);

  const requestingLeaseTokenHash = requestingLeaseToken ? hashWriterLeaseToken(requestingLeaseToken) : null;

  return assembleAttemptView(db, {
    attempt,
    now,
    sections,
    sectionLockMode,
    requestingLeaseTokenHash,
  });
}

export async function getAttemptResumeView(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  userId: string,
  attemptId: string,
  requestingLeaseToken: string | null,
  now: Date,
): Promise<AttemptView> {
  const attempt = await findAttemptById(db, attemptId);
  if (!attempt) throw new AttemptNotFoundError(attemptId);
  if (attempt.userId !== userId) throw new AttemptNotOwnedError(attemptId);
  return buildResumeView(db, attempt, requestingLeaseToken, now);
}

export class WriterLeaseTokenMismatchError extends Error {
  constructor(attemptId: string) {
    super(
      `Writer lease token does not match the active lease for attempt ${attemptId} (WRITER_LEASE_REVOKED)`,
    );
    this.name = "WriterLeaseTokenMismatchError";
  }
}

/**
 * Renews the caller's OWN active lease in place (dok 16 §7 "Lease
 * diperbarui saat client aktif") - refuses if the presented token does not
 * match the currently active lease (someone else already took over, or the
 * lease already expired and this attempt needs a fresh resume instead).
 */
export async function renewWriterLease(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  userId: string,
  attemptId: string,
  leaseToken: string,
  now: Date,
): Promise<AttemptWriterLeaseRow> {
  const attempt = await findAttemptById(db, attemptId);
  if (!attempt) throw new AttemptNotFoundError(attemptId);
  if (attempt.userId !== userId) throw new AttemptNotOwnedError(attemptId);

  const activeLease = await findActiveLease(db, attemptId);
  if (!activeLease || !writerLeaseTokenMatchesHash(leaseToken, activeLease.tokenHash)) {
    throw new WriterLeaseTokenMismatchError(attemptId);
  }

  return renewActiveLease(db, activeLease.id, now, computeWriterLeaseExpiry(now));
}
