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
  assertAnswerPayloadMatchesQuestionType,
  assertAttemptStartEligible,
  assertAttemptSubmittable,
  assertAttemptWritable,
  assertSubmitRevisionCurrent,
  assertSupportedPresentationPolicy,
  assertWriterLeaseValidForWrite,
  buildPresentedInstances,
  computeAnswerSetChecksum,
  computeAttemptSnapshotChecksum,
  computeWriterLeaseExpiry,
  evaluateAnswerTimingWindow,
  generateWriterLeaseToken,
  hashWriterLeaseToken,
  resolveAnswerSaveOutcome,
  writerLeaseTokenMatchesHash,
  type AnswerPayload,
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
import { findQuestionVersionById, listQuestionOptions } from "../question-repository.ts";
import {
  countActiveAttemptsForUserBatch,
  findActiveAttemptForUserBatch,
  findAttemptById,
  findAttemptByUserAndIdempotencyKey,
  incrementAttemptRevision,
  insertAttempt,
  transitionAttemptStatus,
  AttemptNotFoundError,
  type AttemptRow,
} from "./attempt-repository.ts";
import { findInstanceById, insertPresentedInstances } from "./attempt-question-instance-repository.ts";
import {
  findActiveLease,
  issueLease,
  renewActiveLease,
  revokeActiveLease,
  type AttemptWriterLeaseRow,
} from "./attempt-writer-lease-repository.ts";
import { findAnswerState, listAnswerStatesForAttempt, upsertAnswerState } from "./answer-state-repository.ts";
import {
  findMutationByClientId,
  hasRecoveryCandidateMutations,
  insertAnswerMutation,
  type AnswerMutationOutcome,
} from "./answer-mutation-repository.ts";
import {
  findSubmissionByAttemptId,
  insertSubmission,
  type AttemptSubmissionRow,
} from "./attempt-submission-repository.ts";
import { enqueueScoringJob } from "./scoring-outbox-repository.ts";
import {
  insertAuditEvent,
  listAuditEventsForAttempt,
  type AttemptAuditEventRow,
} from "./attempt-audit-repository.ts";
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

/**
 * Explicit takeover (dok 16 §7: "Perangkat kedua dapat... melakukan
 * explicit takeover. Takeover membatalkan lease lama dan dicatat.") -
 * revokes whatever lease is currently active (if any - a takeover is also
 * how a device reclaims write access after its OWN lease expired) and
 * issues a brand new one to the caller. Any device still holding the OLD
 * token is refused on its next write by `assertWriterLeaseValidForWrite`
 * (`WRITER_LEASE_REVOKED`) - this is the other half of "Lease conflicts...
 * resolve without silent answer loss": the loser learns immediately, on
 * its very next write attempt, rather than silently overwriting or being
 * silently overwritten.
 */
/** `leaseToken` is the raw, one-time-visible bearer token - only ever returned here, at the instant of issuance, exactly like `createAttempt`'s own `AttemptView.writerLease.leaseToken`. `lease` is the stored row (hash only). */
export interface WriterLeaseTakeoverResult {
  readonly lease: AttemptWriterLeaseRow;
  readonly leaseToken: string;
}

export async function takeoverWriterLease(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  userId: string,
  attemptId: string,
  now: Date,
): Promise<WriterLeaseTakeoverResult> {
  const attempt = await findAttemptById(db, attemptId);
  if (!attempt) throw new AttemptNotFoundError(attemptId);
  if (attempt.userId !== userId) throw new AttemptNotOwnedError(attemptId);

  const activeLease = await findActiveLease(db, attemptId);
  if (activeLease) await revokeActiveLease(db, activeLease.id, now, "explicit_takeover");

  const leaseToken = generateWriterLeaseToken();
  const lease = await issueLease(db, {
    attemptId,
    tokenHash: hashWriterLeaseToken(leaseToken),
    issuedAt: now,
    expiresAt: computeWriterLeaseExpiry(now),
  });
  return { lease, leaseToken };
}

// ---------------------------------------------------------------------------
// ATM-002: answer save (server-authoritative timer, monotonic CAS, offline-
// reconnect-safe idempotency, fail-closed lease enforcement).
// ---------------------------------------------------------------------------

export class AttemptInstanceNotFoundError extends Error {
  constructor(instanceId: string) {
    super(`Question instance ${instanceId} not found on this attempt`);
    this.name = "AttemptInstanceNotFoundError";
  }
}

export class AnswerMutationIdReusedError extends Error {
  constructor(readonly clientMutationId: string) {
    super(`IDEMPOTENCY_KEY_REUSED: mutation "${clientMutationId}" was already used for a different request`);
    this.name = "AnswerMutationIdReusedError";
  }
}

export class AttemptDeadlinePassedError extends Error {
  constructor() {
    super(
      "ATTEMPT_DEADLINE_PASSED: past the late-sync recovery cutoff, this attempt no longer accepts writes",
    );
    this.name = "AttemptDeadlinePassedError";
  }
}

export class AnswerRevisionConflictError extends Error {
  constructor(
    readonly currentRevision: number,
    readonly currentPayload: AnswerPayload | null,
  ) {
    super(`ANSWER_REVISION_CONFLICT: current revision is ${currentRevision}`);
    this.name = "AnswerRevisionConflictError";
  }
}

export interface SaveAnswerInput {
  readonly instanceId: string;
  readonly clientMutationId: string;
  readonly leaseToken: string | null;
  readonly expectedRevision: number;
  readonly payload: AnswerPayload | null;
  readonly capturedAtClient: Date | null;
}

export type SaveAnswerResult =
  | {
      readonly kind: "accepted";
      readonly revision: number;
      readonly payload: AnswerPayload | null;
      readonly attemptRevision: number;
      readonly serverSavedAt: Date;
    }
  | {
      readonly kind: "idempotent_replay";
      readonly revision: number;
      readonly payload: AnswerPayload | null;
      readonly attemptRevision: number;
      readonly serverSavedAt: Date;
    }
  | { readonly kind: "recovery_candidate"; readonly serverSavedAt: Date };

function toJsonbPayload(payload: AnswerPayload | null): Record<string, unknown> | null {
  return payload === null ? null : (payload as unknown as Record<string, unknown>);
}
function fromJsonbPayload(payload: Record<string, unknown> | null): AnswerPayload | null {
  return payload === null ? null : (payload as unknown as AnswerPayload);
}

/**
 * dok 16 §8's full processing pipeline. Order matters and mirrors that
 * section exactly: attempt ownership/writability, mutation-ID dedup
 * (returns the ORIGINALLY recorded outcome verbatim on any retry - this
 * is the entire mechanism behind "Offline reconnect harus idempotent dan
 * tidak menggandakan answer" and "Duplicate answer request"), the
 * server-authoritative timing window (§10), the writer lease (§7, fail-
 * closed on ANY state other than `held_here`), answer schema validation
 * against the snapshotted question type (§8's own mapping table), and
 * finally the CAS decision (answer-save-cas.ts).
 */
export async function saveAnswer(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  userId: string,
  attemptId: string,
  input: SaveAnswerInput,
  now: Date,
): Promise<SaveAnswerResult> {
  const attempt = await findAttemptById(db, attemptId);
  if (!attempt) throw new AttemptNotFoundError(attemptId);
  if (attempt.userId !== userId) throw new AttemptNotOwnedError(attemptId);
  assertAttemptWritable(attempt.status);

  const instance = await findInstanceById(db, input.instanceId);
  if (!instance || instance.attemptId !== attemptId) throw new AttemptInstanceNotFoundError(input.instanceId);

  // Deduplicate client_mutation_id BEFORE anything else (dok 16 §8 step 3 /
  // dok 22 §14): a retry (offline reconnect, or plain network-uncertainty
  // retry) with the SAME id must get back the SAME recorded outcome,
  // never re-run the CAS decision against whatever the current state has
  // since become.
  const existingMutation = await findMutationByClientId(
    db,
    attemptId,
    input.instanceId,
    input.clientMutationId,
  );
  if (existingMutation) {
    const samePayload =
      JSON.stringify(existingMutation.payload) === JSON.stringify(toJsonbPayload(input.payload));
    if (existingMutation.expectedRevision !== input.expectedRevision || !samePayload) {
      throw new AnswerMutationIdReusedError(input.clientMutationId);
    }
    if (existingMutation.outcome === "conflict") {
      const current = await findAnswerState(db, attemptId, input.instanceId);
      throw new AnswerRevisionConflictError(
        current?.revision ?? 0,
        fromJsonbPayload(current?.payload ?? null),
      );
    }
    if (existingMutation.outcome === "late_sync_recovery_candidate") {
      return { kind: "recovery_candidate", serverSavedAt: existingMutation.serverReceivedAt };
    }
    return {
      kind: existingMutation.outcome,
      revision: existingMutation.resultingRevision ?? 0,
      payload: fromJsonbPayload(existingMutation.payload),
      attemptRevision: attempt.attemptRevision,
      serverSavedAt: existingMutation.serverReceivedAt,
    };
  }

  const timingWindow = evaluateAnswerTimingWindow(now, attempt.deadlineAt, attempt.lateSyncCutoffAt);
  if (timingWindow === "rejected") throw new AttemptDeadlinePassedError();

  const activeLease = await findActiveLease(db, attemptId);
  const presentedTokenHash = input.leaseToken ? hashWriterLeaseToken(input.leaseToken) : null;
  assertWriterLeaseValidForWrite(activeLease, presentedTokenHash, now);
  const leaseTokenHash = presentedTokenHash as string; // non-null: assertWriterLeaseValidForWrite already refused null.

  const questionVersion = await findQuestionVersionById(db, instance.questionVersionId);
  if (!questionVersion) {
    throw new Error(`saveAnswer: question version ${instance.questionVersionId} not found`);
  }
  const knownCodes = instance.presentedOptionOrder ?? [];
  assertAnswerPayloadMatchesQuestionType(questionVersion.type, input.payload, knownCodes);

  if (timingWindow === "late_sync_recovery_candidate") {
    await insertAnswerMutation(db, {
      attemptId,
      instanceId: input.instanceId,
      clientMutationId: input.clientMutationId,
      leaseTokenHash,
      expectedRevision: input.expectedRevision,
      payload: toJsonbPayload(input.payload),
      outcome: "late_sync_recovery_candidate",
      resultingRevision: null,
      capturedAtClient: input.capturedAtClient,
      serverReceivedAt: now,
    });
    return { kind: "recovery_candidate", serverSavedAt: now };
  }

  const txResult = await db.transaction(async (tx) => {
    const currentState = await findAnswerState(tx, attemptId, input.instanceId);
    const casOutcome = resolveAnswerSaveOutcome({
      currentRevision: currentState?.revision ?? 0,
      currentPayload: fromJsonbPayload(currentState?.payload ?? null),
      expectedRevision: input.expectedRevision,
      newPayload: input.payload,
    });

    const insertMutationRow = (outcome: AnswerMutationOutcome, resultingRevision: number | null) =>
      insertAnswerMutation(tx, {
        attemptId,
        instanceId: input.instanceId,
        clientMutationId: input.clientMutationId,
        leaseTokenHash,
        expectedRevision: input.expectedRevision,
        payload: toJsonbPayload(input.payload),
        outcome,
        resultingRevision,
        capturedAtClient: input.capturedAtClient,
        serverReceivedAt: now,
      });

    if (casOutcome.kind === "accepted") {
      await upsertAnswerState(
        tx,
        attemptId,
        input.instanceId,
        casOutcome.newRevision,
        toJsonbPayload(input.payload),
        now,
      );
      const updatedAttempt = await incrementAttemptRevision(tx, attemptId);
      await insertMutationRow("accepted", casOutcome.newRevision);
      return {
        kind: "accepted" as const,
        revision: casOutcome.newRevision,
        payload: input.payload,
        attemptRevision: updatedAttempt.attemptRevision,
      };
    }
    if (casOutcome.kind === "idempotent_replay") {
      await insertMutationRow("idempotent_replay", casOutcome.revision);
      return {
        kind: "idempotent_replay" as const,
        revision: casOutcome.revision,
        payload: casOutcome.payload,
        attemptRevision: attempt.attemptRevision,
      };
    }
    // conflict - the mutation row is still committed (not thrown from
    // inside the transaction) so a future retry of this SAME mutation ID
    // finds it and replays this exact outcome, rather than re-running the
    // CAS against whatever the state has become by then.
    await insertMutationRow("conflict", casOutcome.currentRevision);
    return {
      kind: "conflict" as const,
      currentRevision: casOutcome.currentRevision,
      currentPayload: casOutcome.currentPayload,
    };
  });

  if (txResult.kind === "conflict") {
    throw new AnswerRevisionConflictError(txResult.currentRevision, txResult.currentPayload);
  }
  return { ...txResult, serverSavedAt: now };
}

// ---------------------------------------------------------------------------
// ATM-003: final submit, timeout auto-submit, and audit telemetry.
// ---------------------------------------------------------------------------

/**
 * Distinguishes a user-initiated final submit from a scheduler/worker-
 * initiated timeout finalization (dok 16 §13: both paths "dapat memicu
 * finalization"). Only the "user" variant carries writer-lease and
 * expected-revision fields to validate - a timeout finalization has no
 * device lease to check and no specific calling user to own it against; it
 * simply locks whatever `answer_states` currently holds for the attempt.
 */
export type SubmitTrigger =
  | {
      readonly kind: "user";
      readonly userId: string;
      readonly mutationId: string;
      readonly leaseToken: string;
      readonly expectedAttemptRevision: number;
      readonly acknowledgedUnansweredCount?: number;
    }
  | { readonly kind: "timeout" };

/**
 * Mirrors `SubmissionEnvelope.data.recoveryState` (contracts/openapi.yaml).
 * This task builds no adjudication workflow, so only `none` and
 * `candidate_stored` are ever produced here - `under_adjudication`,
 * `accepted`, and `rejected` belong to a future adjudication feature.
 */
export type SubmissionRecoveryState =
  "none" | "candidate_stored" | "under_adjudication" | "accepted" | "rejected";

export interface SubmitAttemptResult {
  readonly submission: AttemptSubmissionRow;
  /** True only when THIS call's own insert created the row - false for every replay (double submit, worker retry after an apparent failure, or the losing side of a genuine user-submit/timeout race). */
  readonly created: boolean;
  /** Always "processing": no `results` table exists yet (SCR-series territory) - a scoring job now sits in the outbox, but nothing in this task ever consumes it. */
  readonly resultState: "processing";
  readonly recoveryState: SubmissionRecoveryState;
}

async function freezeAnswerSetChecksum(db: Queryable<Schema>, attemptId: string): Promise<string> {
  const rows = await listAnswerStatesForAttempt(db, attemptId);
  return computeAnswerSetChecksum(
    rows.map((row) => ({
      instanceId: row.instanceId,
      revision: row.revision,
      payload: fromJsonbPayload(row.payload),
    })),
  );
}

async function resolveRecoveryState(
  db: Queryable<Schema>,
  attemptId: string,
): Promise<SubmissionRecoveryState> {
  return (await hasRecoveryCandidateMutations(db, attemptId)) ? "candidate_stored" : "none";
}

/** Sentinel thrown INSIDE the submit transaction on a unique-violation race loss, then caught OUTSIDE it - see `submitAttempt`'s own comment on why the recovery re-query cannot reuse the same (now-aborted) transaction handle. */
class SubmissionRaceLostError extends Error {}

/** Postgres SQLSTATE for a unique-constraint violation. Checked narrowly (not a blanket catch) so an unrelated failure - a genuine bug, a dropped connection - is never silently reinterpreted as "someone else already submitted". */
/**
 * drizzle-orm wraps every driver error in its own `DrizzleQueryError`,
 * with the raw postgres error (the one that actually carries `.code`)
 * attached as `.cause` (ES2022 error-cause chaining) - checked one level
 * deep so this still matches, not just a bare driver error.
 */
function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "23505") return true;
  const cause = (error as { cause?: unknown } | null)?.cause;
  return typeof cause === "object" && cause !== null && (cause as { code?: unknown }).code === "23505";
}

/**
 * dok 16 §13 submit contract + §22 test #8 ("Submit dan timeout race
 * menghasilkan satu snapshot"). One function serves BOTH triggers - see
 * `SubmitTrigger`'s own doc - so the race-safety argument holds for a
 * user-submit racing a timeout-submit exactly as it does for two ordinary
 * retries: both funnel through the same check-existing-first sequence
 * (mirrors `startOrResumeAttempt`'s own duality), with the unique index on
 * `attempt_submissions.attempt_id` (schema/submissions.ts) as the actual
 * arbiter of a genuine simultaneous race.
 *
 * A double call for the SAME attempt - a user double-click, a worker retry
 * after a transient failure, or a real user-submit/timeout race - is
 * always a safe, idempotent no-op returning the ALREADY-recorded
 * submission (`created: false`). Submit carries no client-dictated content
 * to conflict over (unlike answer-save's CAS): it just freezes whatever
 * `answer_states` currently holds, so a replay can never diverge from the
 * first winner's snapshot.
 */
export async function submitAttempt(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  attemptId: string,
  trigger: SubmitTrigger,
  now: Date,
): Promise<SubmitAttemptResult> {
  const attempt = await findAttemptById(db, attemptId);
  if (!attempt) throw new AttemptNotFoundError(attemptId);
  if (trigger.kind === "user" && attempt.userId !== trigger.userId) throw new AttemptNotOwnedError(attemptId);

  const existing = await findSubmissionByAttemptId(db, attemptId);
  if (existing) {
    await insertAuditEvent(db, {
      attemptId,
      eventType: "submission_replayed",
      triggeredBy: trigger.kind,
      actorUserId: trigger.kind === "user" ? trigger.userId : null,
      attemptRevisionAtEvent: attempt.attemptRevision,
      answerSetChecksum: existing.answerSetChecksum,
      recoveryState: null,
      occurredAt: now,
    });
    return {
      submission: existing,
      created: false,
      resultState: "processing",
      recoveryState: await resolveRecoveryState(db, attemptId),
    };
  }

  assertAttemptSubmittable(attempt.status);

  if (trigger.kind === "user") {
    const activeLease = await findActiveLease(db, attemptId);
    const presentedTokenHash = hashWriterLeaseToken(trigger.leaseToken);
    assertWriterLeaseValidForWrite(activeLease, presentedTokenHash, now);
    assertSubmitRevisionCurrent(trigger.expectedAttemptRevision, attempt.attemptRevision);
  }

  const answerSetChecksum = await freezeAnswerSetChecksum(db, attemptId);
  const actorUserId = trigger.kind === "user" ? trigger.userId : null;

  let txResult: { readonly submission: AttemptSubmissionRow; readonly created: boolean };
  try {
    txResult = await db.transaction(async (tx) => {
      let submission: AttemptSubmissionRow;
      try {
        submission = await insertSubmission(tx, {
          attemptId,
          mutationId: trigger.kind === "user" ? trigger.mutationId : null,
          triggeredBy: trigger.kind,
          answerSetChecksum,
          attemptRevisionAtSubmit: attempt.attemptRevision,
          acknowledgedUnansweredCount:
            trigger.kind === "user" ? (trigger.acknowledgedUnansweredCount ?? null) : null,
          submittedAt: now,
        });
      } catch (error) {
        if (isUniqueViolation(error)) throw new SubmissionRaceLostError();
        throw error;
      }

      // Two hops, not one - the attempt status machine only allows one
      // transition at a time (@superlatif/domain/exam's own
      // `assertValidAttemptStatusTransition`).
      await transitionAttemptStatus(tx, attemptId, "submitting");
      await transitionAttemptStatus(tx, attemptId, "submitted");
      await enqueueScoringJob(tx, submission.id, attemptId);
      await insertAuditEvent(tx, {
        attemptId,
        eventType: "submitted",
        triggeredBy: trigger.kind,
        actorUserId,
        attemptRevisionAtEvent: attempt.attemptRevision,
        answerSetChecksum,
        recoveryState: null,
        occurredAt: now,
      });
      await insertAuditEvent(tx, {
        attemptId,
        eventType: "scoring_job_enqueued",
        triggeredBy: trigger.kind,
        actorUserId,
        attemptRevisionAtEvent: attempt.attemptRevision,
        answerSetChecksum,
        recoveryState: null,
        occurredAt: now,
      });

      return { submission, created: true };
    });
  } catch (error) {
    if (!(error instanceof SubmissionRaceLostError)) throw error;
    // The transaction above rolled back in full - re-query with the plain
    // (non-aborted) `db` handle, never the poisoned `tx` from inside it.
    const winner = await findSubmissionByAttemptId(db, attemptId);
    if (!winner) throw error; // genuinely unexpected: a violation just occurred, so a row must exist.
    await insertAuditEvent(db, {
      attemptId,
      eventType: "submission_replayed",
      triggeredBy: trigger.kind,
      actorUserId,
      attemptRevisionAtEvent: attempt.attemptRevision,
      answerSetChecksum: winner.answerSetChecksum,
      recoveryState: null,
      occurredAt: now,
    });
    txResult = { submission: winner, created: false };
  }

  return {
    submission: txResult.submission,
    created: txResult.created,
    resultState: "processing",
    recoveryState: await resolveRecoveryState(db, attemptId),
  };
}

/**
 * Timeout / scheduler-triggered finalization (dok 16 §13: "Scheduler/worker
 * DAN request path dapat memicu finalization"). Fires at
 * `attempt.lateSyncCutoffAt`, not `deadlineAt` - deliberately later than
 * the deadline. Recovery-candidate mutations (ATM-002) never touch
 * `answer_states` regardless of when they arrive, so the frozen snapshot
 * this produces is already stable by `deadlineAt`; waiting for the FULL
 * cutoff instead simply respects the entire late-sync recovery grace
 * window dok 16 intends before an attempt is declared closed, rather than
 * cutting that window short. See the ATM-003 ADR for the full reasoning.
 *
 * Returns `null` only when there is genuinely nothing to do: no submission
 * exists yet AND (the attempt is not `in_progress` - e.g. voided, never
 * started - OR it is not yet due). Once a submission exists (from this
 * same timeout path on an earlier call, or from a user-submit that won a
 * race against it), every subsequent call - a worker retry after a
 * transient failure, or a speculative re-scan - delegates to
 * `submitAttempt`'s own idempotent-replay path and returns that SAME real
 * result, never `null` and never a second row ("Worker retry tidak boleh
 * membuat submit ganda"). Safe for a worker to call speculatively on every
 * attempt it scans.
 */
export async function finalizeExpiredAttemptIfDue(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  attemptId: string,
  now: Date,
): Promise<SubmitAttemptResult | null> {
  const attempt = await findAttemptById(db, attemptId);
  if (!attempt) throw new AttemptNotFoundError(attemptId);

  // A submission already exists (from this same timeout path on an
  // earlier call, or from a user-submit that won a race against it) -
  // delegate to `submitAttempt`'s own idempotent-replay path so a worker
  // retry gets back the SAME real result every time, rather than an
  // ambiguous `null` that would conflate "already done" with "not due
  // yet". This is what makes "Worker retry tidak boleh membuat submit
  // ganda" hold with a genuinely useful return value, not just an absence
  // of a second row.
  if (await findSubmissionByAttemptId(db, attemptId)) {
    return submitAttempt(db, attemptId, { kind: "timeout" }, now);
  }
  if (attempt.status !== "in_progress") return null; // nothing this function can finalize (e.g. voided)
  if (now.getTime() < attempt.lateSyncCutoffAt.getTime()) return null; // not due yet
  return submitAttempt(db, attemptId, { kind: "timeout" }, now);
}

/** Read path for "Audit reconstruction" (required test): reconstructs what happened to an attempt's submission - who/what triggered it, at which revision, with which checksum - without ever touching `answer_states`/`answer_mutations`. */
export async function getAttemptAuditTrail(
  db: Queryable<Schema>,
  attemptId: string,
): Promise<readonly AttemptAuditEventRow[]> {
  return listAuditEventsForAttempt(db, attemptId);
}
