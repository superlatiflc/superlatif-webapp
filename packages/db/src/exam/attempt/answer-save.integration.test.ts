// ATM-002 integration tests - exercises the full answer-save + writer-
// lease + server-authoritative timer + offline-recovery workflow against a
// real (pglite-backed) Postgres schema. Covers the backlog's required
// tests ("Clock manipulation", "Duplicate answer request", "Two-device
// lease conflict", "Offline reconnect") plus the founder instruction's
// explicit scope: timer is server-authoritative, answer writes are
// monotonic/revision-safe with no lost update, multi-device lease conflict
// fails closed, and offline reconnect is idempotent with no duplicated
// answer.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { computeChecksum, type JsonValue } from "@superlatif/domain/shared";
import { createInMemoryEffectiveAccessCache, type EffectiveAccessCache } from "@superlatif/domain/access";
import {
  AnswerSchemaInvalidError,
  WriterLeaseRequiredError,
  WriterLeaseRevokedError,
} from "@superlatif/domain/exam";
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
import {
  AnswerMutationIdReusedError,
  AnswerRevisionConflictError,
  AttemptDeadlinePassedError,
  getAttemptResumeView,
  renewWriterLease,
  saveAnswer,
  startOrResumeAttempt,
  takeoverWriterLease,
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

function buildBlueprintConfig(scoringPolicyChecksum: string, codeSuffix: string, scoringPolicyCode: string) {
  return {
    schemaVersion: 2,
    code: `BP_ATM002_${codeSuffix}`,
    version: 1,
    examFamily: "SKD_KEDINASAN",
    activationScope: "draft_only",
    title: "ATM-002 synthetic answer-save fixture blueprint",
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
    title: "ATM-002 start_attempt fixture policy",
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
let cache: EffectiveAccessCache;

beforeEach(async () => {
  handle = await createTestDatabase();
  await seedCanonicalRoles(handle.db);
  cache = createInMemoryEffectiveAccessCache();

  const admin = await createUser(handle.db, { emailNormalized: "atm2-admin@superlatif.id", phoneE164: null });
  const reviewer = await createUser(handle.db, {
    emailNormalized: "atm2-reviewer@superlatif.id",
    phoneE164: null,
  });
  const student = await createUser(handle.db, {
    emailNormalized: "atm2-student@superlatif.id",
    phoneE164: null,
  });
  academicAdminId = admin.userId;
  reviewerId = reviewer.userId;
  studentId = student.userId;

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
    questionCode: `Q-ATM002-TWK-${code}`,
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
    questionCode: `Q-ATM002-TKP-${code}`,
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

  const scoringPolicyCode = `SP_ATM002_${codeSuffix}`;
  const scoring = await createScoringPolicyDraft(handle.db, academicAdminId, {
    scoringPolicyCode,
    version: 1,
    policyConfig: CONSISTENT_SCORING_CONFIG,
  });
  await submitScoringPolicyVersionForReview(handle.db, academicAdminId, scoring.id);
  await approveScoringPolicyVersion(handle.db, reviewerId, scoring.id);
  await publishScoringPolicyVersion(handle.db, academicAdminId, scoring.id);

  const blueprint = await createExamBlueprintDraft(handle.db, academicAdminId, {
    blueprintCode: `BP-ATM002-${codeSuffix}`,
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
    examFormCode: `FORM-ATM002-${code}`,
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
    title: "Tryout SKD Kedinasan - ATM-002 fixture",
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
  const policyCode = `ATM002_START_ATTEMPT_${batchCode.toUpperCase().replace(/[^A-Z0-9_]/g, "_")}`;
  const policy = await createPolicyDraft(handle.db, {
    code: policyCode,
    version: 1,
    title: "ATM-002 fixture policy",
    config: policyConfig(targetRef, policyCode),
  });
  await publishPolicyVersion(handle.db, policy.id, new Date("2026-08-01T00:00:00Z"));
  await issueGrant(handle.db, {
    userId,
    sourceType: "purchase",
    sourceId: `order-${batchCode}`,
    sourceKey: `order-${batchCode}`,
    accessPolicyId: policy.id,
    validFrom: new Date("2026-08-01T00:00:00Z"),
    validTo: null,
  });
}

const NOW_EXAM_OPEN = new Date("2026-09-01T01:00:00Z");
// The ATTEMPT's own deadlineAt is `startedAt + totalDurationSeconds`
// (blueprint timing.totalDurationSeconds = 600s), NOT the batch's attempt
// WINDOW end (02:00:00Z) - a batch's window only bounds when an attempt
// may START (dok 16 §5); once started, its own deadline is computed from
// the blueprint's own duration. startedAttempt() always starts at
// NOW_EXAM_OPEN (01:00:00Z), so deadlineAt = 01:10:00Z and
// lateSyncCutoffAt (+30s, blueprint's lateSyncCutoffSeconds) = 01:10:30Z.
const DEADLINE_AT = new Date("2026-09-01T01:10:00Z");
const LATE_SYNC_CUTOFF_AT = new Date("2026-09-01T01:10:30Z");

/** Starts an attempt for `studentId` on a fresh batch and returns {attemptId, instanceId (TWK), leaseToken}. */
async function startedAttempt(code: string) {
  const batch = await publishedOpenBatch(code);
  await grantStartAttempt(studentId, batch.code);
  const result = await startOrResumeAttempt(
    handle.db,
    cache,
    studentId,
    {
      batchId: batch.id,
      idempotencyKey: `idem-${code}`,
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

describe("authorized answer save - monotonic, revision-safe CAS", () => {
  it("accepts a first save, creating revision 1", async () => {
    const { attemptId, instanceId, leaseToken } = await startedAttempt("SAVE-BASIC");
    const result = await saveAnswer(
      handle.db,
      studentId,
      attemptId,
      saveInput({
        instanceId,
        clientMutationId: "11111111-1111-1111-1111-111111111111",
        leaseToken,
        expectedRevision: 0,
      }),
      NOW_EXAM_OPEN,
    );
    expect(result).toMatchObject({
      kind: "accepted",
      revision: 1,
      payload: { kind: "single_choice", optionCode: "A" },
    });

    const resumed = await getAttemptResumeView(handle.db, studentId, attemptId, leaseToken, NOW_EXAM_OPEN);
    const answer = resumed.answers.find((a) => a.instanceId === instanceId);
    expect(answer).toMatchObject({ revision: 1, payload: { kind: "single_choice", optionCode: "A" } });
  });

  it("rejects a stale expectedRevision with a genuinely different payload (ANSWER_REVISION_CONFLICT, no lost update)", async () => {
    const { attemptId, instanceId, leaseToken } = await startedAttempt("SAVE-CONFLICT");
    await saveAnswer(
      handle.db,
      studentId,
      attemptId,
      saveInput({
        instanceId,
        clientMutationId: "22222222-2222-2222-2222-222222222221",
        leaseToken,
        expectedRevision: 0,
        payload: { kind: "single_choice", optionCode: "A" },
      }),
      NOW_EXAM_OPEN,
    );
    await expect(
      saveAnswer(
        handle.db,
        studentId,
        attemptId,
        saveInput({
          instanceId,
          clientMutationId: "22222222-2222-2222-2222-222222222222",
          leaseToken,
          expectedRevision: 0,
          payload: { kind: "single_choice", optionCode: "B" },
        }),
        NOW_EXAM_OPEN,
      ),
    ).rejects.toThrow(AnswerRevisionConflictError);

    // The original answer is UNCHANGED - the conflicting write never overwrote it.
    const resumed = await getAttemptResumeView(handle.db, studentId, attemptId, leaseToken, NOW_EXAM_OPEN);
    expect(resumed.answers.find((a) => a.instanceId === instanceId)?.payload).toEqual({
      kind: "single_choice",
      optionCode: "A",
    });
  });

  it("is idempotent when a stale expectedRevision carries the SAME payload as current (dok 16 §8 step 7)", async () => {
    const { attemptId, instanceId, leaseToken } = await startedAttempt("SAVE-IDEMPOTENT-CONTENT");
    await saveAnswer(
      handle.db,
      studentId,
      attemptId,
      saveInput({
        instanceId,
        clientMutationId: "33333333-3333-3333-3333-333333333331",
        leaseToken,
        expectedRevision: 0,
        payload: { kind: "single_choice", optionCode: "A" },
      }),
      NOW_EXAM_OPEN,
    );
    const second = await saveAnswer(
      handle.db,
      studentId,
      attemptId,
      saveInput({
        instanceId,
        clientMutationId: "33333333-3333-3333-3333-333333333332",
        leaseToken,
        expectedRevision: 0,
        payload: { kind: "single_choice", optionCode: "A" },
      }),
      NOW_EXAM_OPEN,
    );
    expect(second).toMatchObject({ kind: "idempotent_replay", revision: 1 });
  });

  it("rejects an invalid answer schema (unknown option code) with ANSWER_SCHEMA_INVALID", async () => {
    const { attemptId, instanceId, leaseToken } = await startedAttempt("SAVE-SCHEMA");
    await expect(
      saveAnswer(
        handle.db,
        studentId,
        attemptId,
        saveInput({
          instanceId,
          clientMutationId: "44444444-4444-4444-4444-444444444444",
          leaseToken,
          payload: { kind: "single_choice", optionCode: "Z" },
        }),
        NOW_EXAM_OPEN,
      ),
    ).rejects.toThrow(AnswerSchemaInvalidError);
  });

  it("refuses a write with WRITER_LEASE_REQUIRED when no lease token is presented", async () => {
    const { attemptId, instanceId } = await startedAttempt("SAVE-NOLEASE");
    await expect(
      saveAnswer(
        handle.db,
        studentId,
        attemptId,
        saveInput({ instanceId, clientMutationId: "55555555-5555-5555-5555-555555555555", leaseToken: null }),
        NOW_EXAM_OPEN,
      ),
    ).rejects.toThrow(WriterLeaseRequiredError);
  });
});

describe("clock manipulation - server-authoritative timer", () => {
  it("accepts a save before the deadline, marks it a recovery candidate between deadline and cutoff, and rejects it after the cutoff", async () => {
    const { attemptId, instanceId, leaseToken } = await startedAttempt("CLOCK-WALK");
    // This test deliberately walks `now` across a ~10-minute span (attempt
    // duration) while the default writer-lease TTL is only 120s - a real
    // client heartbeats/renews well before that, so each step renews the
    // SAME token first (mirroring dok 16 §7 "Lease diperbarui saat client
    // aktif"), never re-issuing a new one.
    await renewWriterLease(
      handle.db,
      studentId,
      attemptId,
      leaseToken,
      new Date(DEADLINE_AT.getTime() - 60_000),
    );

    const normal = await saveAnswer(
      handle.db,
      studentId,
      attemptId,
      saveInput({
        instanceId,
        clientMutationId: "66666666-6666-6666-6666-666666666661",
        leaseToken,
        expectedRevision: 0,
      }),
      new Date(DEADLINE_AT.getTime() - 1),
    );
    expect(normal.kind).toBe("accepted");

    await renewWriterLease(
      handle.db,
      studentId,
      attemptId,
      leaseToken,
      new Date(DEADLINE_AT.getTime() + 5_000),
    );
    const recovery = await saveAnswer(
      handle.db,
      studentId,
      attemptId,
      saveInput({
        instanceId,
        clientMutationId: "66666666-6666-6666-6666-666666666662",
        leaseToken,
        expectedRevision: 1,
        payload: { kind: "single_choice", optionCode: "B" },
      }),
      new Date(DEADLINE_AT.getTime() + 10_000),
    );
    expect(recovery.kind).toBe("recovery_candidate");

    // The recovery-candidate mutation NEVER touched the authoritative answer state.
    const resumedDuringRecovery = await getAttemptResumeView(
      handle.db,
      studentId,
      attemptId,
      leaseToken,
      new Date(DEADLINE_AT.getTime() + 15_000),
    );
    expect(resumedDuringRecovery.answers.find((a) => a.instanceId === instanceId)?.payload).toEqual({
      kind: "single_choice",
      optionCode: "A",
    });

    await renewWriterLease(
      handle.db,
      studentId,
      attemptId,
      leaseToken,
      new Date(LATE_SYNC_CUTOFF_AT.getTime() - 1),
    );
    await expect(
      saveAnswer(
        handle.db,
        studentId,
        attemptId,
        saveInput({
          instanceId,
          clientMutationId: "66666666-6666-6666-6666-666666666663",
          leaseToken,
          expectedRevision: 1,
        }),
        new Date(LATE_SYNC_CUTOFF_AT.getTime() + 1),
      ),
    ).rejects.toThrow(AttemptDeadlinePassedError);
  });

  it("a forged client-side clock cannot influence the timing decision - only server `now` (the function argument) matters", async () => {
    const { attemptId, instanceId, leaseToken } = await startedAttempt("CLOCK-FORGE");
    // capturedAtClient claims the answer was made hours before the deadline,
    // but the SERVER's `now` argument is already past the cutoff - the save
    // must still be rejected, proving capturedAtClient has zero effect on
    // the timing decision (dok 16 §8: "captured_at_client untuk telemetry,
    // bukan ordering authority").
    await expect(
      saveAnswer(
        handle.db,
        studentId,
        attemptId,
        saveInput({
          instanceId,
          clientMutationId: "77777777-7777-7777-7777-777777777777",
          leaseToken,
          capturedAtClient: new Date("2026-08-01T00:00:00Z"),
        }),
        new Date(LATE_SYNC_CUTOFF_AT.getTime() + 1),
      ),
    ).rejects.toThrow(AttemptDeadlinePassedError);
  });
});

describe("duplicate answer request - offline-reconnect-safe idempotency", () => {
  it("replays the SAME recorded outcome for a retried mutation ID with identical content, without incrementing revision twice", async () => {
    const { attemptId, instanceId, leaseToken } = await startedAttempt("DUP-SAME");
    const mutationId = "88888888-8888-8888-8888-888888888888";
    const input = saveInput({ instanceId, clientMutationId: mutationId, leaseToken, expectedRevision: 0 });

    const first = await saveAnswer(handle.db, studentId, attemptId, input, NOW_EXAM_OPEN);
    const retry = await saveAnswer(
      handle.db,
      studentId,
      attemptId,
      input,
      new Date(NOW_EXAM_OPEN.getTime() + 5_000),
    );

    expect(first).toMatchObject({ kind: "accepted", revision: 1 });
    expect(retry).toMatchObject({ kind: "accepted", revision: 1 }); // NOT revision 2 - it is a replay, not a new write.

    const resumed = await getAttemptResumeView(handle.db, studentId, attemptId, leaseToken, NOW_EXAM_OPEN);
    expect(resumed.answers.find((a) => a.instanceId === instanceId)?.revision).toBe(1);
  });

  it("refuses a mutation ID reused with materially DIFFERENT content (IDEMPOTENCY_KEY_REUSED)", async () => {
    const { attemptId, instanceId, leaseToken } = await startedAttempt("DUP-DIFFERENT");
    const mutationId = "99999999-9999-9999-9999-999999999999";
    await saveAnswer(
      handle.db,
      studentId,
      attemptId,
      saveInput({
        instanceId,
        clientMutationId: mutationId,
        leaseToken,
        expectedRevision: 0,
        payload: { kind: "single_choice", optionCode: "A" },
      }),
      NOW_EXAM_OPEN,
    );
    await expect(
      saveAnswer(
        handle.db,
        studentId,
        attemptId,
        saveInput({
          instanceId,
          clientMutationId: mutationId,
          leaseToken,
          expectedRevision: 0,
          payload: { kind: "single_choice", optionCode: "B" },
        }),
        NOW_EXAM_OPEN,
      ),
    ).rejects.toThrow(AnswerMutationIdReusedError);
  });

  it("a retried mutation whose ORIGINAL outcome was a conflict replays that same conflict, not a fresh CAS re-evaluation", async () => {
    const { attemptId, instanceId, leaseToken } = await startedAttempt("DUP-CONFLICT-REPLAY");
    await saveAnswer(
      handle.db,
      studentId,
      attemptId,
      saveInput({
        instanceId,
        clientMutationId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1",
        leaseToken,
        expectedRevision: 0,
        payload: { kind: "single_choice", optionCode: "A" },
      }),
      NOW_EXAM_OPEN,
    );
    const conflictingMutationId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2";
    const conflictingInput = saveInput({
      instanceId,
      clientMutationId: conflictingMutationId,
      leaseToken,
      expectedRevision: 0,
      payload: { kind: "single_choice", optionCode: "B" },
    });

    await expect(
      saveAnswer(handle.db, studentId, attemptId, conflictingInput, NOW_EXAM_OPEN),
    ).rejects.toThrow(AnswerRevisionConflictError);
    // Retrying the SAME (already-conflicted) mutation ID reproduces the conflict again, deterministically.
    await expect(
      saveAnswer(handle.db, studentId, attemptId, conflictingInput, NOW_EXAM_OPEN),
    ).rejects.toThrow(AnswerRevisionConflictError);
  });
});

describe("offline reconnect - queued mutations replay in order without duplicating the answer", () => {
  it("applies a queue of offline mutations in order after reconnect, tolerating a retry of an already-acknowledged one", async () => {
    const { attemptId, instanceId, leaseToken } = await startedAttempt("OFFLINE-QUEUE");

    // Simulates a client that queued THREE local edits while offline, then
    // replays them in order once reconnected - including re-sending the
    // FIRST one again (network uncertainty: the client never got the ack).
    const queue: SaveAnswerInput[] = [
      saveInput({
        instanceId,
        clientMutationId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1",
        leaseToken,
        expectedRevision: 0,
        payload: { kind: "single_choice", optionCode: "A" },
      }),
      saveInput({
        instanceId,
        clientMutationId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2",
        leaseToken,
        expectedRevision: 1,
        payload: { kind: "single_choice", optionCode: "B" },
      }),
      saveInput({
        instanceId,
        clientMutationId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1",
        leaseToken,
        expectedRevision: 0,
        payload: { kind: "single_choice", optionCode: "A" },
      }), // retry of #1
    ];

    let last;
    for (const mutation of queue) {
      last = await saveAnswer(handle.db, studentId, attemptId, mutation, NOW_EXAM_OPEN);
    }

    // Final state reflects exactly the two DISTINCT edits (A then B) - the
    // retried #1 did not create a third revision or revert the answer.
    expect(last).toMatchObject({ kind: "accepted", revision: 1 }); // the replay of #1 - revision unchanged from when it first landed
    const resumed = await getAttemptResumeView(handle.db, studentId, attemptId, leaseToken, NOW_EXAM_OPEN);
    const answer = resumed.answers.find((a) => a.instanceId === instanceId);
    expect(answer).toMatchObject({ revision: 2, payload: { kind: "single_choice", optionCode: "B" } });
  });
});

describe("two-device lease conflict - fail closed", () => {
  it("device B's explicit takeover revokes device A's lease; A's next write is refused, B's succeeds", async () => {
    const { attemptId, instanceId, leaseToken: tokenA } = await startedAttempt("LEASE-TAKEOVER");

    const takeover = await takeoverWriterLease(handle.db, studentId, attemptId, NOW_EXAM_OPEN);
    const tokenB = takeover.leaseToken;
    expect(tokenB).not.toBe(tokenA);

    // Device A, still holding its now-superseded token, is refused.
    await expect(
      saveAnswer(
        handle.db,
        studentId,
        attemptId,
        saveInput({
          instanceId,
          clientMutationId: "cccccccc-cccc-cccc-cccc-ccccccccccc1",
          leaseToken: tokenA,
          expectedRevision: 0,
        }),
        NOW_EXAM_OPEN,
      ),
    ).rejects.toThrow(WriterLeaseRevokedError);

    // Device B, with the new token, succeeds.
    const result = await saveAnswer(
      handle.db,
      studentId,
      attemptId,
      saveInput({
        instanceId,
        clientMutationId: "cccccccc-cccc-cccc-cccc-ccccccccccc2",
        leaseToken: tokenB,
        expectedRevision: 0,
      }),
      NOW_EXAM_OPEN,
    );
    expect(result).toMatchObject({ kind: "accepted", revision: 1 });
  });

  it("resume reports held_elsewhere for the losing device and held_here for the winner", async () => {
    const { attemptId, leaseToken: tokenA } = await startedAttempt("LEASE-RESUME-STATE");
    const takeover = await takeoverWriterLease(handle.db, studentId, attemptId, NOW_EXAM_OPEN);

    const asA = await getAttemptResumeView(handle.db, studentId, attemptId, tokenA, NOW_EXAM_OPEN);
    const asB = await getAttemptResumeView(
      handle.db,
      studentId,
      attemptId,
      takeover.leaseToken,
      NOW_EXAM_OPEN,
    );
    expect(asA.writerLease.state).toBe("held_elsewhere");
    expect(asB.writerLease.state).toBe("held_here");
  });
});

describe("attempt writability guard", () => {
  it("refuses a write once the attempt has been voided", async () => {
    const { attemptId, instanceId, leaseToken } = await startedAttempt("VOIDED-ATTEMPT");
    await transitionAttemptStatus(handle.db, attemptId, "voided");

    await expect(
      saveAnswer(
        handle.db,
        studentId,
        attemptId,
        saveInput({ instanceId, clientMutationId: "dddddddd-dddd-dddd-dddd-ddddddddddd1", leaseToken }),
        NOW_EXAM_OPEN,
      ),
    ).rejects.toThrow(/ATTEMPT_NOT_RESUMABLE/);
  });
});
