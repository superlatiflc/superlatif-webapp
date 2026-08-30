// ATM-003 integration tests - exercises final submit, timeout auto-submit,
// and audit telemetry against a real (pglite-backed) Postgres schema.
// Covers the founder instruction's required tests ("Double submit",
// "Expiry race", "Worker retry", "Audit reconstruction") plus the explicit
// scope invariants: submit is idempotent, a user-submit/timeout-submit
// race produces exactly one submitted snapshot, a worker retry never
// double-submits, the submitted snapshot pins the answer state/revision at
// submit time, and audit telemetry never carries an answer payload or
// secret.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { computeChecksum, type JsonValue } from "@superlatif/domain/shared";
import { createInMemoryEffectiveAccessCache, type EffectiveAccessCache } from "@superlatif/domain/access";
import { AttemptNotSubmittableError, SubmitRevisionConflictError } from "@superlatif/domain/exam";
import { createUser } from "../../identity/repository.ts";
import { assignRole, seedCanonicalRoles } from "../../authorization/index.ts";
import { createTestDatabase, type TestDatabaseHandle } from "../../test-client.ts";
import { createPolicyDraft, publishPolicyVersion } from "../../access/policy-repository.ts";
import { issueGrant } from "../../access/grant-repository.ts";
import {
  approveQuestionVersion,
  createQuestionDraft,
  publishQuestionVersion,
  setQuestionAnswerKey,
  setQuestionOptions,
  submitQuestionVersionForReview,
} from "../question-service.ts";
import {
  approveExamBlueprintVersion,
  approveExamFormVersion,
  approveScoringPolicyVersion,
  createExamBlueprintDraft,
  createExamFormDraft,
  createScoringPolicyDraft,
  publishExamBlueprintVersion,
  publishExamFormVersion,
  publishScoringPolicyVersion,
  setExamFormItems,
  submitExamBlueprintVersionForReview,
  submitExamFormVersionForReview,
  submitScoringPolicyVersionForReview,
} from "../config/exam-config-service.ts";
import {
  approveExamBatch,
  createExamBatchDraft,
  examBatchTargetRef,
  publishExamBatch,
  setExamBatchWindows,
  submitExamBatchForReview,
} from "../batch/index.ts";
import { transitionAttemptStatus } from "./attempt-repository.ts";
import { findSubmissionByAttemptId } from "./attempt-submission-repository.ts";
import {
  AttemptNotOwnedError,
  finalizeExpiredAttemptIfDue,
  getAttemptAuditTrail,
  renewWriterLease,
  saveAnswer,
  startOrResumeAttempt,
  submitAttempt,
  type SaveAnswerInput,
} from "./attempt-service.ts";

const COMPLETE_CHECKLIST = {
  classificationCorrect: true,
  stemClear: true,
  optionsComplete: true,
  answerScoringCorrect: true,
  explanationAdequate: true,
  mediaReadable: true,
  sourceAndRightsOk: true,
  accessibilityMetadataOk: true,
  notDuplicate: true,
};

const CONSISTENT_SCORING_CONFIG = {
  sectionMaxScores: { TWK: 1, TKP: 5 },
  thresholds: [{ kind: "no_threshold" }],
};

// The literal correct-answer / weight values used by the fixture below -
// asserted ABSENT from every audit row's serialized form, in addition to
// the structural "no payload column exists" guarantee.
const SECRET_OPTION_WEIGHT_MARKER = '"weight":5';
const SECRET_ANSWER_KEY_MARKER = "correctOptionCode";

function buildBlueprintConfig(scoringPolicyChecksum: string, codeSuffix: string, scoringPolicyCode: string) {
  return {
    schemaVersion: 2,
    code: `BP_ATM003_${codeSuffix}`,
    version: 1,
    examFamily: "SKD_KEDINASAN",
    activationScope: "draft_only",
    title: "ATM-003 synthetic submit fixture blueprint",
    sections: [
      {
        code: "TWK",
        title: "Tes Wawasan Kebangsaan",
        order: 1,
        questionCount: 1,
        durationSeconds: 300,
        allowedQuestionTypes: ["single_choice"],
      },
      {
        code: "TKP",
        title: "Tes Karakteristik Pribadi",
        order: 2,
        questionCount: 1,
        durationSeconds: 300,
        allowedQuestionTypes: ["weighted_choice"],
      },
    ],
    timing: {
      mode: "per_section",
      totalDurationSeconds: 600,
      serverAuthoritative: true,
      autoSubmitAtDeadline: true,
      lateSyncCutoffSeconds: 30,
      policyPrecedence: ["attempt_accommodation", "batch_attempt_policy", "blueprint_default"],
    },
    navigation: { allowBack: true, allowFlag: true, allowJump: false, sectionLockMode: "forward_only" },
    presentation: {
      questionOrder: "fixed",
      optionOrder: "fixed",
      persistPresentedOrder: true,
      watermarkMode: "learner_id",
    },
    scoringPolicyRef: { code: scoringPolicyCode, version: 1, checksum: scoringPolicyChecksum },
    resultPolicy: {
      releaseMode: "scheduled_after_review",
      rankingMode: "batch",
      humanReviewRequired: true,
      showSectionScores: true,
      showExplanations: "with_result",
    },
    approval: {
      status: "draft",
      academicApproval: { state: "pending" },
      technicalApproval: { state: "pending" },
      regulatoryCheck: { state: "pending" },
    },
  };
}

function policyConfig(targetRef: string, code: string) {
  return {
    schemaVersion: 2,
    code,
    version: 1,
    title: "ATM-003 start_attempt fixture policy",
    validity: { mode: "lifetime", timezone: "Asia/Jakarta" },
    claims: [
      {
        targetType: "exam_batch",
        targetRef: { code: targetRef },
        actions: ["start_attempt"],
        includeDescendants: false,
      },
    ],
    attemptAllowance: {
      mode: "inherit_batch",
      maxRankedAttempts: null,
      maxPracticeAttempts: 0,
      rankingRuleSource: "batch",
    },
    postExpiry: { mode: "read_only_history" },
    stacking: {
      mode: "additive",
      expiryResolution: "latest_supporting_grant",
      attemptResolution: "batch_policy_only",
    },
    lifecycle: {
      refundAction: "revoke_source_grant",
      expiryAction: "expire_source_grant",
      manualChangeRequiresReason: true,
      retainAttemptHistory: true,
      retainResultHistory: true,
      retainRankingSnapshot: true,
    },
  };
}

let handle: TestDatabaseHandle;
let academicAdminId: string;
let reviewerId: string;
let studentId: string;
let otherStudentId: string;
let cache: EffectiveAccessCache;

beforeEach(async () => {
  handle = await createTestDatabase();
  await seedCanonicalRoles(handle.db);
  cache = createInMemoryEffectiveAccessCache();

  const admin = await createUser(handle.db, { emailNormalized: "atm3-admin@superlatif.id", phoneE164: null });
  const reviewer = await createUser(handle.db, {
    emailNormalized: "atm3-reviewer@superlatif.id",
    phoneE164: null,
  });
  const student = await createUser(handle.db, {
    emailNormalized: "atm3-student@superlatif.id",
    phoneE164: null,
  });
  const otherStudent = await createUser(handle.db, {
    emailNormalized: "atm3-other-student@superlatif.id",
    phoneE164: null,
  });
  academicAdminId = admin.userId;
  reviewerId = reviewer.userId;
  studentId = student.userId;
  otherStudentId = otherStudent.userId;

  await assignRole(handle.db, {
    userId: academicAdminId,
    role: "academic_admin",
    grantedByUserId: academicAdminId,
    grantedReason: "test setup",
  });
  await assignRole(handle.db, {
    userId: reviewerId,
    role: "moderator_reviewer",
    grantedByUserId: academicAdminId,
    grantedReason: "test setup",
  });
});

afterEach(async () => {
  await handle.close();
});

/** Full question -> scoring -> blueprint -> form -> batch chain, ending with a PUBLISHED batch whose attempt window is exactly [00:00, 02:00) on 2026-09-01Z and late_sync_cutoff_at 30s after that. */
async function publishedOpenBatch(code: string) {
  const codeSuffix = code.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
  const question = await createQuestionDraft(handle.db, academicAdminId, {
    questionCode: `Q-ATM003-TWK-${code}`,
    version: 1,
    type: "single_choice",
    stemDocument: { text: "Ibu kota negara Indonesia adalah?" },
  });
  await setQuestionOptions(handle.db, academicAdminId, question.id, [
    { optionCode: "A", order: 1, content: { text: "Jakarta" } },
    { optionCode: "B", order: 2, content: { text: "Bandung" } },
  ]);
  await setQuestionAnswerKey(handle.db, academicAdminId, question.id, {
    kind: "single_choice",
    correctOptionCode: "A",
  });
  await submitQuestionVersionForReview(handle.db, academicAdminId, question.id);
  await approveQuestionVersion(handle.db, reviewerId, question.id, COMPLETE_CHECKLIST);
  await publishQuestionVersion(handle.db, academicAdminId, question.id);

  const question2 = await createQuestionDraft(handle.db, academicAdminId, {
    questionCode: `Q-ATM003-TKP-${code}`,
    version: 1,
    type: "weighted_choice",
    stemDocument: { text: "Situasi X terjadi, apa responsmu?" },
  });
  await setQuestionOptions(handle.db, academicAdminId, question2.id, [
    { optionCode: "A", order: 1, content: { text: "Respons A" } },
    { optionCode: "B", order: 2, content: { text: "Respons B" } },
  ]);
  await setQuestionAnswerKey(handle.db, academicAdminId, question2.id, {
    kind: "weighted_choice",
    optionWeights: { A: 5, B: 2 },
  });
  await submitQuestionVersionForReview(handle.db, academicAdminId, question2.id);
  await approveQuestionVersion(handle.db, reviewerId, question2.id, COMPLETE_CHECKLIST);
  await publishQuestionVersion(handle.db, academicAdminId, question2.id);

  const scoringPolicyCode = `SP_ATM003_${codeSuffix}`;
  const scoring = await createScoringPolicyDraft(handle.db, academicAdminId, {
    scoringPolicyCode,
    version: 1,
    policyConfig: CONSISTENT_SCORING_CONFIG,
  });
  await submitScoringPolicyVersionForReview(handle.db, academicAdminId, scoring.id);
  await approveScoringPolicyVersion(handle.db, reviewerId, scoring.id);
  await publishScoringPolicyVersion(handle.db, academicAdminId, scoring.id);

  const blueprint = await createExamBlueprintDraft(handle.db, academicAdminId, {
    blueprintCode: `BP-ATM003-${codeSuffix}`,
    examFamilyCode: "SKD_KEDINASAN",
    examFamilyTitle: "SKD Sekolah Kedinasan",
    version: 1,
    config: buildBlueprintConfig(
      computeChecksum(CONSISTENT_SCORING_CONFIG as JsonValue),
      codeSuffix,
      scoringPolicyCode,
    ),
  });
  await submitExamBlueprintVersionForReview(handle.db, academicAdminId, blueprint.id);
  await approveExamBlueprintVersion(handle.db, reviewerId, blueprint.id);
  await publishExamBlueprintVersion(handle.db, academicAdminId, blueprint.id);

  const form = await createExamFormDraft(handle.db, academicAdminId, {
    examFormCode: `FORM-ATM003-${code}`,
    version: 1,
    blueprintVersionId: blueprint.id,
  });
  await setExamFormItems(handle.db, academicAdminId, form.id, [
    { sectionCode: "TWK", order: 1, questionVersionId: question.id },
    { sectionCode: "TKP", order: 1, questionVersionId: question2.id },
  ]);
  await submitExamFormVersionForReview(handle.db, academicAdminId, form.id);
  await approveExamFormVersion(handle.db, reviewerId, form.id);
  const publishedForm = await publishExamFormVersion(handle.db, academicAdminId, form.id);

  const batch = await createExamBatchDraft(handle.db, academicAdminId, {
    code,
    examFormVersionId: publishedForm.id,
    title: "Tryout SKD Kedinasan - ATM-003 fixture",
    timezone: "Asia/Jakarta",
  });
  await setExamBatchWindows(handle.db, academicAdminId, batch.id, [
    {
      windowType: "attempt",
      startsAt: new Date("2026-09-01T00:00:00Z"),
      endsAt: new Date("2026-09-01T02:00:00Z"),
    },
  ]);
  await submitExamBatchForReview(handle.db, academicAdminId, batch.id);
  await approveExamBatch(handle.db, academicAdminId, batch.id);
  await publishExamBatch(handle.db, academicAdminId, batch.id);

  return batch;
}

async function grantStartAttempt(userId: string, batchCode: string) {
  const targetRef = examBatchTargetRef(batchCode);
  const userSuffix = userId
    .slice(0, 8)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "X");
  const policyCode = `ATM003_START_ATTEMPT_${batchCode.toUpperCase().replace(/[^A-Z0-9_]/g, "_")}_${userSuffix}`;
  const policy = await createPolicyDraft(handle.db, {
    code: policyCode,
    version: 1,
    title: "ATM-003 fixture policy",
    config: policyConfig(targetRef, policyCode),
  });
  await publishPolicyVersion(handle.db, policy.id, new Date("2026-08-01T00:00:00Z"));
  await issueGrant(handle.db, {
    userId,
    sourceType: "purchase",
    sourceId: `order-${batchCode}-${userId.slice(0, 8)}`,
    sourceKey: `order-${batchCode}-${userId.slice(0, 8)}`,
    accessPolicyId: policy.id,
    validFrom: new Date("2026-08-01T00:00:00Z"),
    validTo: null,
  });
}

const NOW_EXAM_OPEN = new Date("2026-09-01T01:00:00Z");
// deadlineAt = startedAt (01:00:00Z) + totalDurationSeconds (600s) =
// 01:10:00Z; lateSyncCutoffAt = deadlineAt + lateSyncCutoffSeconds (30s) =
// 01:10:30Z (same reasoning as ATM-002's own fixture - see that file's
// module doc for why this is NOT the batch's own attempt window end).
const DEADLINE_AT = new Date("2026-09-01T01:10:00Z");
const LATE_SYNC_CUTOFF_AT = new Date("2026-09-01T01:10:30Z");

/** Starts an attempt for the given user on a fresh batch and returns {attemptId, instanceId (TWK), leaseToken}. */
async function startedAttemptFor(userId: string, code: string) {
  const batch = await publishedOpenBatch(code);
  await grantStartAttempt(userId, batch.code);
  const result = await startOrResumeAttempt(
    handle.db,
    cache,
    userId,
    {
      batchId: batch.id,
      idempotencyKey: `idem-${code}-${userId.slice(0, 8)}`,
      clientCapabilities: { offlineQueue: true, writerLease: true },
    },
    NOW_EXAM_OPEN,
  );
  const twkInstance = result.view.instances.find((i) => i.sectionCode === "TWK")!;
  return {
    attemptId: result.view.id,
    instanceId: twkInstance.instanceId,
    leaseToken: result.view.writerLease.leaseToken!,
  };
}

function saveInput(
  overrides: Partial<SaveAnswerInput> & { instanceId: string; clientMutationId: string },
): SaveAnswerInput {
  return {
    leaseToken: null,
    expectedRevision: 0,
    payload: { kind: "single_choice", optionCode: "A" },
    capturedAtClient: null,
    ...overrides,
  };
}

describe("final submit - idempotent, snapshot-pinning", () => {
  it("accepts a first submit, freezing the current answer state and revision", async () => {
    const { attemptId, instanceId, leaseToken } = await startedAttemptFor(studentId, "SUBMIT-BASIC");
    const saved = await saveAnswer(
      handle.db,
      studentId,
      attemptId,
      saveInput({
        instanceId,
        clientMutationId: "10000000-0000-0000-0000-000000000001",
        leaseToken,
        expectedRevision: 0,
      }),
      NOW_EXAM_OPEN,
    );
    expect(saved.kind).toBe("accepted");

    const result = await submitAttempt(
      handle.db,
      attemptId,
      {
        kind: "user",
        userId: studentId,
        mutationId: "20000000-0000-0000-0000-000000000001",
        leaseToken,
        expectedAttemptRevision: 1, // bumped by the single accepted save above
      },
      new Date("2026-09-01T01:01:00Z"),
    );

    expect(result.created).toBe(true);
    expect(result.resultState).toBe("processing");
    expect(result.recoveryState).toBe("none");
    expect(result.submission.attemptId).toBe(attemptId);
    expect(result.submission.triggeredBy).toBe("user");
    expect(result.submission.attemptRevisionAtSubmit).toBe(1);
    // Pinned checksum matches a freshly recomputed checksum of the exact
    // frozen answer set - "Submitted snapshot harus pin answer state/
    // revision saat submit".
    expect(result.submission.answerSetChecksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it("Double submit: a second user-triggered submit for an already-submitted attempt is a safe no-op returning the SAME submission", async () => {
    const { attemptId, leaseToken } = await startedAttemptFor(studentId, "SUBMIT-DOUBLE");
    const trigger = {
      kind: "user" as const,
      userId: studentId,
      mutationId: "20000000-0000-0000-0000-000000000002",
      leaseToken,
      expectedAttemptRevision: 0,
    };
    const first = await submitAttempt(handle.db, attemptId, trigger, new Date("2026-09-01T01:01:00Z"));
    const second = await submitAttempt(
      handle.db,
      attemptId,
      { ...trigger, mutationId: "20000000-0000-0000-0000-000000000003" },
      new Date("2026-09-01T01:01:05Z"),
    );

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.submission.id).toBe(first.submission.id);

    const stored = await findSubmissionByAttemptId(handle.db, attemptId);
    expect(stored?.id).toBe(first.submission.id);
  });

  it("Worker retry: repeated timeout-triggered finalization calls never create a second submission", async () => {
    const { attemptId } = await startedAttemptFor(studentId, "SUBMIT-WORKER-RETRY");
    const timeoutNow = new Date("2026-09-01T01:10:31Z"); // past lateSyncCutoffAt

    const first = await finalizeExpiredAttemptIfDue(handle.db, attemptId, timeoutNow);
    const retry = await finalizeExpiredAttemptIfDue(handle.db, attemptId, timeoutNow);
    const secondRetry = await finalizeExpiredAttemptIfDue(handle.db, attemptId, timeoutNow);

    expect(first?.created).toBe(true);
    expect(retry?.created).toBe(false);
    expect(secondRetry?.created).toBe(false);
    expect(retry?.submission.id).toBe(first?.submission.id);
    expect(secondRetry?.submission.id).toBe(first?.submission.id);
  });

  it("Expiry race: a concurrent user-submit and timeout-submit for the SAME attempt produce exactly one submitted snapshot", async () => {
    const { attemptId, leaseToken } = await startedAttemptFor(studentId, "SUBMIT-RACE");
    const raceNow = new Date("2026-09-01T01:10:31Z"); // past lateSyncCutoffAt, still "in_progress"
    // The writer lease's 120s TTL (from the 01:00:00Z start) has long
    // expired by raceNow - renew it first so the USER side of the race
    // exercises the real submit-revision/lease path instead of failing on
    // an unrelated WRITER_LEASE_REVOKED before the race is even reached.
    await renewWriterLease(handle.db, studentId, attemptId, leaseToken, new Date(raceNow.getTime() - 1000));

    const [userResult, timeoutResult] = await Promise.all([
      submitAttempt(
        handle.db,
        attemptId,
        {
          kind: "user",
          userId: studentId,
          mutationId: "20000000-0000-0000-0000-000000000004",
          leaseToken,
          expectedAttemptRevision: 0,
        },
        raceNow,
      ),
      finalizeExpiredAttemptIfDue(handle.db, attemptId, raceNow),
    ]);

    // Exactly one of the two calls created the row; the other observed it.
    const createdFlags = [userResult.created, timeoutResult?.created ?? false];
    expect(createdFlags.filter(Boolean)).toHaveLength(1);
    expect(timeoutResult?.submission.id).toBe(userResult.submission.id);

    const stored = await findSubmissionByAttemptId(handle.db, attemptId);
    expect(stored).not.toBeNull();
    expect(stored?.id).toBe(userResult.submission.id);
  });

  it("finalizeExpiredAttemptIfDue does nothing before the late-sync cutoff", async () => {
    const { attemptId } = await startedAttemptFor(studentId, "SUBMIT-NOT-DUE");
    const result = await finalizeExpiredAttemptIfDue(handle.db, attemptId, DEADLINE_AT);
    expect(result).toBeNull();
    expect(await findSubmissionByAttemptId(handle.db, attemptId)).toBeNull();
  });

  it("finalizeExpiredAttemptIfDue replays the existing submission (not null) once the attempt is already submitted - a worker re-scan never creates a second row", async () => {
    const { attemptId, leaseToken } = await startedAttemptFor(studentId, "SUBMIT-ALREADY-DONE");
    const userSubmit = await submitAttempt(
      handle.db,
      attemptId,
      {
        kind: "user",
        userId: studentId,
        mutationId: "30000000-0000-0000-0000-000000000001",
        leaseToken,
        expectedAttemptRevision: 0,
      },
      new Date("2026-09-01T01:01:00Z"),
    );
    const result = await finalizeExpiredAttemptIfDue(handle.db, attemptId, LATE_SYNC_CUTOFF_AT);
    expect(result?.created).toBe(false);
    expect(result?.submission.id).toBe(userSubmit.submission.id);

    const stored = await findSubmissionByAttemptId(handle.db, attemptId);
    expect(stored?.id).toBe(userSubmit.submission.id);
  });

  it("refuses a submit with a stale expectedAttemptRevision (ANSWER_REVISION_CONFLICT)", async () => {
    const { attemptId, instanceId, leaseToken } = await startedAttemptFor(studentId, "SUBMIT-STALE-REV");
    await saveAnswer(
      handle.db,
      studentId,
      attemptId,
      saveInput({
        instanceId,
        clientMutationId: "30000000-0000-0000-0000-000000000001",
        leaseToken,
        expectedRevision: 0,
      }),
      NOW_EXAM_OPEN,
    );
    await expect(
      submitAttempt(
        handle.db,
        attemptId,
        {
          kind: "user",
          userId: studentId,
          mutationId: "20000000-0000-0000-0000-000000000005",
          leaseToken,
          expectedAttemptRevision: 0, // stale - actual attemptRevision is now 1
        },
        new Date("2026-09-01T01:01:00Z"),
      ),
    ).rejects.toThrow(SubmitRevisionConflictError);
  });

  it("refuses a submit for an attempt that is not in_progress (SUBMISSION_ALREADY_FINALIZED)", async () => {
    const { attemptId, leaseToken } = await startedAttemptFor(studentId, "SUBMIT-NOT-SUBMITTABLE");
    await transitionAttemptStatus(handle.db, attemptId, "voided");
    await expect(
      submitAttempt(
        handle.db,
        attemptId,
        {
          kind: "user",
          userId: studentId,
          mutationId: "20000000-0000-0000-0000-000000000006",
          leaseToken,
          expectedAttemptRevision: 0,
        },
        new Date("2026-09-01T01:01:00Z"),
      ),
    ).rejects.toThrow(AttemptNotSubmittableError);
  });

  it("refuses a submit attempt from a user who does not own the attempt", async () => {
    const { attemptId, leaseToken } = await startedAttemptFor(studentId, "SUBMIT-NOT-OWNED");
    await expect(
      submitAttempt(
        handle.db,
        attemptId,
        {
          kind: "user",
          userId: otherStudentId,
          mutationId: "20000000-0000-0000-0000-000000000007",
          leaseToken,
          expectedAttemptRevision: 0,
        },
        new Date("2026-09-01T01:01:00Z"),
      ),
    ).rejects.toThrow(AttemptNotOwnedError);
  });

  it("locks the attempt against further answer writes once submitted", async () => {
    const { attemptId, instanceId, leaseToken } = await startedAttemptFor(studentId, "SUBMIT-LOCKS-WRITES");
    await submitAttempt(
      handle.db,
      attemptId,
      {
        kind: "user",
        userId: studentId,
        mutationId: "30000000-0000-0000-0000-000000000001",
        leaseToken,
        expectedAttemptRevision: 0,
      },
      new Date("2026-09-01T01:01:00Z"),
    );
    await expect(
      saveAnswer(
        handle.db,
        studentId,
        attemptId,
        saveInput({
          instanceId,
          clientMutationId: "10000000-0000-0000-0000-000000000002",
          leaseToken,
          expectedRevision: 0,
        }),
        new Date("2026-09-01T01:01:05Z"),
      ),
    ).rejects.toThrow(/SUBMISSION_ALREADY_FINALIZED/);
  });
});

describe("audit telemetry - reconstructable, secret-free", () => {
  it("Audit reconstruction: records a full, ordered trail for a submitted attempt without any answer payload or secret", async () => {
    const { attemptId, instanceId, leaseToken } = await startedAttemptFor(studentId, "SUBMIT-AUDIT");
    await saveAnswer(
      handle.db,
      studentId,
      attemptId,
      saveInput({
        instanceId,
        clientMutationId: "30000000-0000-0000-0000-000000000001",
        leaseToken,
        expectedRevision: 0,
      }),
      NOW_EXAM_OPEN,
    );
    const submitTime = new Date("2026-09-01T01:01:00Z");
    const result = await submitAttempt(
      handle.db,
      attemptId,
      {
        kind: "user",
        userId: studentId,
        mutationId: "20000000-0000-0000-0000-000000000008",
        leaseToken,
        expectedAttemptRevision: 1,
      },
      submitTime,
    );

    const trail = await getAttemptAuditTrail(handle.db, attemptId);
    const eventTypes = trail.map((event) => event.eventType);
    expect(eventTypes).toEqual(["submitted", "scoring_job_enqueued"]);

    const submittedEvent = trail.find((event) => event.eventType === "submitted")!;
    expect(submittedEvent.triggeredBy).toBe("user");
    expect(submittedEvent.actorUserId).toBe(studentId);
    expect(submittedEvent.attemptRevisionAtEvent).toBe(1);
    expect(submittedEvent.answerSetChecksum).toBe(result.submission.answerSetChecksum);
    expect(submittedEvent.occurredAt.getTime()).toBe(submitTime.getTime());

    // Structural + literal secret-leak scan (mirrors ATM-001/002's own
    // pattern): reconstructing the incident from these rows must never
    // require - or accidentally expose - the answer payload or the
    // correct-answer key/weight fixture data set up above.
    const serialized = JSON.stringify(trail);
    expect(serialized).not.toContain(SECRET_OPTION_WEIGHT_MARKER);
    expect(serialized).not.toContain(SECRET_ANSWER_KEY_MARKER);
    expect(serialized).not.toContain("optionCode");
    for (const event of trail) {
      expect(Object.keys(event)).not.toContain("payload");
      expect(Object.keys(event)).not.toContain("metadata");
    }
  });

  it("records a submission_replayed event for a double submit, keeping the trail reconstructable", async () => {
    const { attemptId, leaseToken } = await startedAttemptFor(studentId, "SUBMIT-AUDIT-REPLAY");
    const trigger = {
      kind: "user" as const,
      userId: studentId,
      mutationId: "30000000-0000-0000-0000-000000000001",
      leaseToken,
      expectedAttemptRevision: 0,
    };
    await submitAttempt(handle.db, attemptId, trigger, new Date("2026-09-01T01:01:00Z"));
    await submitAttempt(
      handle.db,
      attemptId,
      { ...trigger, mutationId: "30000000-0000-0000-0000-000000000002" },
      new Date("2026-09-01T01:01:05Z"),
    );

    const trail = await getAttemptAuditTrail(handle.db, attemptId);
    expect(trail.map((event) => event.eventType)).toEqual([
      "submitted",
      "scoring_job_enqueued",
      "submission_replayed",
    ]);
  });
});
