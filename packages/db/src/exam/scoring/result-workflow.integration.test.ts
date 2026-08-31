// SCR-002 integration tests - exercises result release (scheduled by
// batch policy) and the correction workflow (request -> peer decision ->
// re-score -> new result version) against a real (pglite-backed) Postgres
// schema. Covers the backlog's required tests ("Scheduled release",
// "Result correction", "Correction approval separation") plus the
// founder instruction's explicit scope: release follows the canonical
// ResultState lifecycle via the batch's own server-derived state,
// correction preserves old values/cause/approver/affected scope, approval
// uses IDN-004's existing maker-checker discipline, and student
// visibility never leaks an unreleased result.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { computeChecksum, type JsonValue } from "@superlatif/domain/shared";
import { createInMemoryEffectiveAccessCache, type EffectiveAccessCache } from "@superlatif/domain/access";
import { CorrectionNoOpError } from "@superlatif/domain/exam";
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
import {
  startOrResumeAttempt,
  saveAnswer,
  submitAttempt,
  type SaveAnswerInput,
} from "../attempt/attempt-service.ts";
import { scoreSubmission } from "./scoring-service.ts";
import { findCurrentResultByAttemptId } from "./result-repository.ts";
import { getStudentResultView, releaseResult, ResultNotOwnedError } from "./result-release-service.ts";
import {
  CorrectionCaseAlreadyDecidedError,
  CorrectionCaseStaleError,
  CorrectionNotAuthorizedError,
  CorrectionResultNotFoundError,
  decideResultCorrection,
  getCorrectionCase,
  requestResultCorrection,
} from "./result-correction-service.ts";

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

function scoringConfig(correctScore: number) {
  return {
    sectionMaxScores: { TWK: 100, TKP: 100 },
    thresholds: [{ kind: "section_score_gte", sectionCode: "TWK", value: 1 }],
    sectionScorers: {
      TWK: { kind: "binary_choice", correctScore, incorrectScore: 0, blankScore: 0 },
      TKP: { kind: "weighted_option", blankScore: 0 },
    },
  };
}

function buildBlueprintConfig(scoringPolicyChecksum: string, codeSuffix: string, scoringPolicyCode: string) {
  return {
    schemaVersion: 2,
    code: `BP_SCR002_${codeSuffix}`,
    version: 1,
    examFamily: "SKD_KEDINASAN",
    activationScope: "draft_only",
    title: "SCR-002 synthetic release/correction fixture blueprint",
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
    title: "SCR-002 start_attempt fixture policy",
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
let academicAdminId: string; // academic_admin role - correction requester OR approver
let reviewerId: string; // moderator_reviewer role - correction requester OR approver
let studentId: string;
let otherStudentId: string;
let cache: EffectiveAccessCache;

beforeEach(async () => {
  handle = await createTestDatabase();
  await seedCanonicalRoles(handle.db);
  cache = createInMemoryEffectiveAccessCache();

  const admin = await createUser(handle.db, { emailNormalized: "scr2-admin@superlatif.id", phoneE164: null });
  const reviewer = await createUser(handle.db, {
    emailNormalized: "scr2-reviewer@superlatif.id",
    phoneE164: null,
  });
  const student = await createUser(handle.db, {
    emailNormalized: "scr2-student@superlatif.id",
    phoneE164: null,
  });
  const otherStudent = await createUser(handle.db, {
    emailNormalized: "scr2-other-student@superlatif.id",
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

/** Full question -> scoring -> blueprint -> form -> batch chain, ending PUBLISHED, with an attempt window [00:00,02:00) and a provisional-release window at 03:00 on 2026-09-01Z - no final/explanation release window configured, so the batch stays "provisional_released" (never "final_released"/"review_open") from 03:00 onward. */
async function publishedOpenBatch(code: string, correctScore: number) {
  const codeSuffix = code.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
  const question = await createQuestionDraft(handle.db, academicAdminId, {
    questionCode: `Q-SCR002-TWK-${code}`,
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
    questionCode: `Q-SCR002-TKP-${code}`,
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

  const scoringPolicyCode = `SP_SCR002_${codeSuffix}`;
  const scoringConfigDoc = scoringConfig(correctScore);
  const scoring = await createScoringPolicyDraft(handle.db, academicAdminId, {
    scoringPolicyCode,
    version: 1,
    policyConfig: scoringConfigDoc,
  });
  await submitScoringPolicyVersionForReview(handle.db, academicAdminId, scoring.id);
  await approveScoringPolicyVersion(handle.db, reviewerId, scoring.id);
  await publishScoringPolicyVersion(handle.db, academicAdminId, scoring.id);

  const blueprint = await createExamBlueprintDraft(handle.db, academicAdminId, {
    blueprintCode: `BP-SCR002-${codeSuffix}`,
    examFamilyCode: "SKD_KEDINASAN",
    examFamilyTitle: "SKD Sekolah Kedinasan",
    version: 1,
    config: buildBlueprintConfig(
      computeChecksum(scoringConfigDoc as unknown as JsonValue),
      codeSuffix,
      scoringPolicyCode,
    ),
  });
  await submitExamBlueprintVersionForReview(handle.db, academicAdminId, blueprint.id);
  await approveExamBlueprintVersion(handle.db, reviewerId, blueprint.id);
  await publishExamBlueprintVersion(handle.db, academicAdminId, blueprint.id);

  const form = await createExamFormDraft(handle.db, academicAdminId, {
    examFormCode: `FORM-SCR002-${code}`,
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
    title: "Tryout SKD Kedinasan - SCR-002 fixture",
    timezone: "Asia/Jakarta",
  });
  await setExamBatchWindows(handle.db, academicAdminId, batch.id, [
    {
      windowType: "attempt",
      startsAt: new Date("2026-09-01T00:00:00Z"),
      endsAt: new Date("2026-09-01T02:00:00Z"),
    },
    { windowType: "provisional_result_release", startsAt: new Date("2026-09-01T03:00:00Z") },
  ]);
  await submitExamBatchForReview(handle.db, academicAdminId, batch.id);
  await approveExamBatch(handle.db, academicAdminId, batch.id);
  await publishExamBatch(handle.db, academicAdminId, batch.id);

  return { batch, scoringPolicyCode };
}

async function grantStartAttempt(userId: string, batchCode: string) {
  const targetRef = examBatchTargetRef(batchCode);
  const userSuffix = userId
    .slice(0, 8)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "X");
  const policyCode = `SCR002_START_ATTEMPT_${batchCode.toUpperCase().replace(/[^A-Z0-9_]/g, "_")}_${userSuffix}`;
  const policy = await createPolicyDraft(handle.db, {
    code: policyCode,
    version: 1,
    title: "SCR-002 fixture policy",
    config: policyConfig(targetRef, policyCode),
  });
  await publishPolicyVersion(handle.db, policy.id, new Date("2026-08-01T00:00:00Z"));
  await issueGrant(handle.db, {
    userId,
    sourceType: "purchase",
    sourceId: `order-${batchCode}-${userSuffix}`,
    sourceKey: `order-${batchCode}-${userSuffix}`,
    accessPolicyId: policy.id,
    validFrom: new Date("2026-08-01T00:00:00Z"),
    validTo: null,
  });
}

const NOW_EXAM_OPEN = new Date("2026-09-01T01:00:00Z");
const SUBMIT_NOW = new Date("2026-09-01T01:01:00Z"); // within the 120s writer-lease TTL from NOW_EXAM_OPEN
const DURING_SCORING = new Date("2026-09-01T02:30:00Z"); // after attempt end (02:00), before provisional release (03:00)
const AFTER_PROVISIONAL_RELEASE = new Date("2026-09-01T03:30:00Z");

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

/** Starts, answers (TWK=A correct, TKP=A weight 5), submits, and scores an attempt for `studentId`. Returns the attemptId and the batch's own scoringPolicyCode. */
async function scoredAttempt(code: string, correctScore = 5) {
  const { batch, scoringPolicyCode } = await publishedOpenBatch(code, correctScore);
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
  const tkpInstance = result.view.instances.find((i) => i.sectionCode === "TKP")!;
  const leaseToken = result.view.writerLease.leaseToken!;
  const attemptId = result.view.id;

  await saveAnswer(
    handle.db,
    studentId,
    attemptId,
    saveInput({
      instanceId: twkInstance.instanceId,
      clientMutationId: "10000000-0000-0000-0000-000000000001",
      leaseToken,
      expectedRevision: 0,
      payload: { kind: "single_choice", optionCode: "A" },
    }),
    NOW_EXAM_OPEN,
  );
  await saveAnswer(
    handle.db,
    studentId,
    attemptId,
    saveInput({
      instanceId: tkpInstance.instanceId,
      clientMutationId: "10000000-0000-0000-0000-000000000002",
      leaseToken,
      expectedRevision: 0,
      payload: { kind: "single_choice", optionCode: "A" },
    }),
    NOW_EXAM_OPEN,
  );
  await submitAttempt(
    handle.db,
    attemptId,
    {
      kind: "user",
      userId: studentId,
      mutationId: "20000000-0000-0000-0000-000000000001",
      leaseToken,
      expectedAttemptRevision: 2,
    },
    SUBMIT_NOW,
  );
  await scoreSubmission(handle.db, attemptId, new Date("2026-09-01T01:02:00Z"));

  return { attemptId, batchId: batch.id, scoringPolicyCode };
}

describe("releaseResult / getStudentResultView - Scheduled release", () => {
  it("hides the result before the batch's provisional-release window opens", async () => {
    const { attemptId } = await scoredAttempt("REL-BEFORE");
    const view = await getStudentResultView(handle.db, studentId, attemptId, DURING_SCORING);
    expect(view.state).toBe("processing");
    expect(view.resultId).toBeNull();
    expect(view.scoreSummary).toBeNull();
  });

  it("Scheduled release: reveals the real score once the batch reaches provisional_released", async () => {
    const { attemptId } = await scoredAttempt("REL-AFTER");
    const view = await getStudentResultView(handle.db, studentId, attemptId, AFTER_PROVISIONAL_RELEASE);
    expect(view.state).toBe("provisional");
    expect(view.resultId).not.toBeNull();
    expect(view.version).toBe(1);
    expect(view.scoreSummary).toStrictEqual({
      total: 10,
      sectionScores: { TWK: 5, TKP: 5 },
      sectionMaxScores: { TWK: 100, TKP: 100 },
      overallPassed: true,
    });
  });

  it("releaseResult records releasedAt once eligible, and is idempotent on retry", async () => {
    const { attemptId } = await scoredAttempt("REL-RECORD");
    const before = await releaseResult(handle.db, attemptId, DURING_SCORING);
    expect(before?.releasedAt).toBeNull(); // not yet eligible

    const first = await releaseResult(handle.db, attemptId, AFTER_PROVISIONAL_RELEASE);
    expect(first?.releasedAt?.getTime()).toBe(AFTER_PROVISIONAL_RELEASE.getTime());

    const retry = await releaseResult(handle.db, attemptId, new Date("2026-09-01T04:00:00Z"));
    expect(retry?.releasedAt?.getTime()).toBe(AFTER_PROVISIONAL_RELEASE.getTime()); // unchanged, not overwritten
  });

  it("refuses to show a result to a user who does not own the attempt", async () => {
    const { attemptId } = await scoredAttempt("REL-NOT-OWNED");
    await expect(
      getStudentResultView(handle.db, otherStudentId, attemptId, AFTER_PROVISIONAL_RELEASE),
    ).rejects.toThrow(ResultNotOwnedError);
  });
});

describe("result correction workflow - Result correction / Correction approval separation", () => {
  it("Correction approval separation: the requester cannot also approve their own correction case", async () => {
    const { attemptId, scoringPolicyCode } = await scoredAttempt("CORR-SELF-APPROVE");
    const v2 = await createScoringPolicyDraft(handle.db, academicAdminId, {
      scoringPolicyCode,
      version: 2,
      policyConfig: scoringConfig(999),
    });
    await submitScoringPolicyVersionForReview(handle.db, academicAdminId, v2.id);
    await approveScoringPolicyVersion(handle.db, reviewerId, v2.id);
    await publishScoringPolicyVersion(handle.db, academicAdminId, v2.id);

    const correctionCase = await requestResultCorrection(handle.db, {
      attemptId,
      requestedByUserId: academicAdminId,
      cause: "Scoring policy correctScore was wrong for TWK",
      correctedScoringPolicyVersionId: v2.id,
      correlationId: "corr-self-approve-1",
    });

    await expect(
      decideResultCorrection(
        handle.db,
        {
          correctionCaseId: correctionCase.id,
          decidedByUserId: academicAdminId, // SAME actor as requestedByUserId
          outcome: "approved",
          reason: "confirmed",
          correlationId: "corr-self-approve-2",
        },
        new Date("2026-09-01T05:00:00Z"),
      ),
    ).rejects.toThrow(CorrectionNotAuthorizedError);
  });

  it("Result correction: an approved correction by a DIFFERENT actor appends a new result version, preserving the old one", async () => {
    const { attemptId, scoringPolicyCode } = await scoredAttempt("CORR-APPROVED", 5);
    const original = await findCurrentResultByAttemptId(handle.db, attemptId);
    expect(original?.totalScore).toBe(10);

    const v2 = await createScoringPolicyDraft(handle.db, academicAdminId, {
      scoringPolicyCode,
      version: 2,
      policyConfig: scoringConfig(20), // TWK correct now worth 20 instead of 5
    });
    await submitScoringPolicyVersionForReview(handle.db, academicAdminId, v2.id);
    await approveScoringPolicyVersion(handle.db, reviewerId, v2.id);
    await publishScoringPolicyVersion(handle.db, academicAdminId, v2.id);

    const correctionCase = await requestResultCorrection(handle.db, {
      attemptId,
      requestedByUserId: reviewerId,
      cause: "TWK correctScore was misconfigured at 5, should be 20",
      evidenceRef: "QR-ABC123",
      correctedScoringPolicyVersionId: v2.id,
      correlationId: "corr-approved-1",
    });
    expect(correctionCase.cause).toContain("misconfigured");

    const decisionNow = new Date("2026-09-01T05:00:00Z");
    const decisionRow = await decideResultCorrection(
      handle.db,
      {
        correctionCaseId: correctionCase.id,
        decidedByUserId: academicAdminId, // DIFFERENT actor
        outcome: "approved",
        reason: "Confirmed policy bug, correction approved",
        correlationId: "corr-approved-2",
      },
      decisionNow,
    );

    expect(decisionRow.outcome).toBe("approved");
    expect(decisionRow.executionStatus).toBe("executed");
    expect(decisionRow.newResultVersionId).not.toBeNull();

    // Old result version is PRESERVED, unchanged, no longer current.
    const oldResult = original!;
    expect(oldResult.totalScore).toBe(10);

    const newCurrent = await findCurrentResultByAttemptId(handle.db, attemptId);
    expect(newCurrent?.id).toBe(decisionRow.newResultVersionId);
    expect(newCurrent?.id).not.toBe(oldResult.id);
    expect(newCurrent?.version).toBe(2);
    expect(newCurrent?.state).toBe("corrected");
    expect(newCurrent?.totalScore).toBe(25); // TWK 20 (corrected) + TKP 5
    expect(newCurrent?.scoringPolicyVersionId).toBe(v2.id);

    // Full traceability via the case + decision.
    const caseWithStatus = await getCorrectionCase(handle.db, correctionCase.id);
    expect(caseWithStatus?.status).toBe("executed");
    expect(caseWithStatus?.correctionCase.requestedByUserId).toBe(reviewerId);
    expect(caseWithStatus?.decisions[0]?.decidedByUserId).toBe(academicAdminId);
    expect(caseWithStatus?.decisions[0]?.newResultVersionId).toBe(newCurrent?.id);
  });

  it("refuses a request that would be a no-op (same scoring policy version as the current result)", async () => {
    const { attemptId } = await scoredAttempt("CORR-NOOP");
    const original = await findCurrentResultByAttemptId(handle.db, attemptId);
    await expect(
      requestResultCorrection(handle.db, {
        attemptId,
        requestedByUserId: reviewerId,
        cause: "trying to correct with the same policy",
        correctedScoringPolicyVersionId: original!.scoringPolicyVersionId,
        correlationId: "corr-noop-1",
      }),
    ).rejects.toThrow(CorrectionNoOpError);
  });

  it("refuses a correction request from an actor without result.correction.request (a plain student)", async () => {
    const { attemptId, scoringPolicyCode } = await scoredAttempt("CORR-UNAUTHORIZED");
    const v2 = await createScoringPolicyDraft(handle.db, academicAdminId, {
      scoringPolicyCode,
      version: 2,
      policyConfig: scoringConfig(20),
    });
    await expect(
      requestResultCorrection(handle.db, {
        attemptId,
        requestedByUserId: studentId,
        cause: "student trying to self-correct",
        correctedScoringPolicyVersionId: v2.id,
        correlationId: "corr-unauthorized-1",
      }),
    ).rejects.toThrow(CorrectionNotAuthorizedError);
  });

  it("refuses to request a correction when the attempt has no current result yet", async () => {
    const { batch } = await publishedOpenBatch("CORR-NO-RESULT", 5);
    await grantStartAttempt(studentId, batch.code);
    const started = await startOrResumeAttempt(
      handle.db,
      cache,
      studentId,
      {
        batchId: batch.id,
        idempotencyKey: "idem-no-result",
        clientCapabilities: { offlineQueue: true, writerLease: true },
      },
      NOW_EXAM_OPEN,
    );
    await expect(
      requestResultCorrection(handle.db, {
        attemptId: started.view.id,
        requestedByUserId: reviewerId,
        cause: "no result exists yet",
        correctedScoringPolicyVersionId: "00000000-0000-0000-0000-000000000000",
        correlationId: "corr-no-result-1",
      }),
    ).rejects.toThrow(CorrectionResultNotFoundError);
  });

  it("refuses to decide the SAME correction case twice", async () => {
    const { attemptId, scoringPolicyCode } = await scoredAttempt("CORR-DOUBLE-DECIDE");
    const v2 = await createScoringPolicyDraft(handle.db, academicAdminId, {
      scoringPolicyCode,
      version: 2,
      policyConfig: scoringConfig(20),
    });
    await submitScoringPolicyVersionForReview(handle.db, academicAdminId, v2.id);
    await approveScoringPolicyVersion(handle.db, reviewerId, v2.id);
    await publishScoringPolicyVersion(handle.db, academicAdminId, v2.id);

    const correctionCase = await requestResultCorrection(handle.db, {
      attemptId,
      requestedByUserId: reviewerId,
      cause: "double-decide test",
      correctedScoringPolicyVersionId: v2.id,
      correlationId: "corr-double-1",
    });
    await decideResultCorrection(
      handle.db,
      {
        correctionCaseId: correctionCase.id,
        decidedByUserId: academicAdminId,
        outcome: "approved",
        reason: "ok",
        correlationId: "corr-double-2",
      },
      new Date("2026-09-01T05:00:00Z"),
    );
    await expect(
      decideResultCorrection(
        handle.db,
        {
          correctionCaseId: correctionCase.id,
          decidedByUserId: academicAdminId,
          outcome: "approved",
          reason: "again",
          correlationId: "corr-double-3",
        },
        new Date("2026-09-01T05:05:00Z"),
      ),
    ).rejects.toThrow(CorrectionCaseAlreadyDecidedError);
  });

  it("a rejected correction records the decision but creates no new result version", async () => {
    const { attemptId, scoringPolicyCode } = await scoredAttempt("CORR-REJECTED");
    const original = await findCurrentResultByAttemptId(handle.db, attemptId);
    const v2 = await createScoringPolicyDraft(handle.db, academicAdminId, {
      scoringPolicyCode,
      version: 2,
      policyConfig: scoringConfig(20),
    });
    await submitScoringPolicyVersionForReview(handle.db, academicAdminId, v2.id);
    await approveScoringPolicyVersion(handle.db, reviewerId, v2.id);
    await publishScoringPolicyVersion(handle.db, academicAdminId, v2.id);

    const correctionCase = await requestResultCorrection(handle.db, {
      attemptId,
      requestedByUserId: reviewerId,
      cause: "disputed, needs rejection",
      correctedScoringPolicyVersionId: v2.id,
      correlationId: "corr-rejected-1",
    });
    const decision = await decideResultCorrection(
      handle.db,
      {
        correctionCaseId: correctionCase.id,
        decidedByUserId: academicAdminId,
        outcome: "rejected",
        reason: "not a genuine policy bug",
        correlationId: "corr-rejected-2",
      },
      new Date("2026-09-01T05:00:00Z"),
    );

    expect(decision.outcome).toBe("rejected");
    expect(decision.executionStatus).toBeNull();
    expect(decision.newResultVersionId).toBeNull();
    const current = await findCurrentResultByAttemptId(handle.db, attemptId);
    expect(current?.id).toBe(original?.id); // unchanged
  });

  it("refuses a stale correction case whose current result already changed since it was requested", async () => {
    const { attemptId, scoringPolicyCode } = await scoredAttempt("CORR-STALE");
    const v2 = await createScoringPolicyDraft(handle.db, academicAdminId, {
      scoringPolicyCode,
      version: 2,
      policyConfig: scoringConfig(20),
    });
    await submitScoringPolicyVersionForReview(handle.db, academicAdminId, v2.id);
    await approveScoringPolicyVersion(handle.db, reviewerId, v2.id);
    await publishScoringPolicyVersion(handle.db, academicAdminId, v2.id);

    // Two independent correction requests against the SAME original result.
    const caseA = await requestResultCorrection(handle.db, {
      attemptId,
      requestedByUserId: reviewerId,
      cause: "first correction attempt",
      correctedScoringPolicyVersionId: v2.id,
      correlationId: "corr-stale-a-1",
    });
    const caseB = await requestResultCorrection(handle.db, {
      attemptId,
      requestedByUserId: reviewerId,
      cause: "second correction attempt, same original result",
      correctedScoringPolicyVersionId: v2.id,
      correlationId: "corr-stale-b-1",
    });

    // Approve A first - it wins and creates version 2.
    await decideResultCorrection(
      handle.db,
      {
        correctionCaseId: caseA.id,
        decidedByUserId: academicAdminId,
        outcome: "approved",
        reason: "ok",
        correlationId: "corr-stale-a-2",
      },
      new Date("2026-09-01T05:00:00Z"),
    );

    // B is now stale - its own currentResultVersionId no longer matches
    // the attempt's actual current result. Approving it does not throw
    // (the decision is still recorded, matching manual-change-service.ts's
    // own "human decision still happened" discipline) but execution fails.
    const decisionB = await decideResultCorrection(
      handle.db,
      {
        correctionCaseId: caseB.id,
        decidedByUserId: academicAdminId,
        outcome: "approved",
        reason: "ok",
        correlationId: "corr-stale-b-2",
      },
      new Date("2026-09-01T05:05:00Z"),
    );
    expect(decisionB.outcome).toBe("approved");
    expect(decisionB.executionStatus).toBe("execution_failed");
    expect(decisionB.executionResult?.["errorType"]).toBe(CorrectionCaseStaleError.name);
  });
});
