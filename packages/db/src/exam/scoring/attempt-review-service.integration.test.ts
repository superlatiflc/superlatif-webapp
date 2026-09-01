// Production tryout core slice - review/pembahasan integration tests.
//
// Exercises `getAttemptReviewView` against a real (pglite-backed) schema
// through the FULL governance chain the production flow actually uses:
// question -> answer key -> scoring policy -> blueprint -> form -> batch ->
// grant -> start -> save -> submit -> score -> review.
//
// The security-relevant assertions here are the reason this file exists:
// the review projection must expose no answer key, no option weight, and no
// explanation until the batch's own `explanation_release` window has been
// reached, and never for an attempt belonging to someone else.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { computeChecksum, type JsonValue } from "@superlatif/domain/shared";
import { createInMemoryEffectiveAccessCache, type EffectiveAccessCache } from "@superlatif/domain/access";
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
import { saveAnswer, startOrResumeAttempt, submitAttempt } from "../attempt/attempt-service.ts";
import { scoreSubmission } from "./scoring-service.ts";
import { getStudentResultView } from "./result-release-service.ts";
import { getAttemptReviewView } from "./attempt-review-service.ts";

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

// TWK correct option is "A"; TKP weights are A=5, B=2 (so "A" is the single best).
const SCORING_CONFIG = {
  sectionMaxScores: { TWK: 100, TKP: 100 },
  thresholds: [{ kind: "section_score_gte", sectionCode: "TWK", value: 1 }],
  sectionScorers: {
    TWK: { kind: "binary_choice", correctScore: 5, incorrectScore: 0, blankScore: 0 },
    TKP: { kind: "weighted_option", blankScore: 0 },
  },
};

const ATTEMPT_STARTS_AT = new Date("2026-09-01T00:00:00Z");
const ATTEMPT_ENDS_AT = new Date("2026-09-01T02:00:00Z");
const PROVISIONAL_AT = new Date("2026-09-01T03:00:00Z");
const FINAL_AT = new Date("2026-09-01T04:00:00Z");
const EXPLANATION_AT = new Date("2026-09-01T05:00:00Z");

const NOW_EXAM_OPEN = new Date("2026-09-01T01:00:00Z");
const NOW_SUBMIT = new Date("2026-09-01T01:01:00Z");
/** Result released, explanation NOT yet - batch state is `provisional_released`. */
const NOW_RESULT_ONLY = new Date("2026-09-01T03:30:00Z");
/** Explanation window reached - batch state is `review_open`. */
const NOW_REVIEW_OPEN = new Date("2026-09-01T05:30:00Z");

function buildBlueprintConfig(scoringPolicyChecksum: string, suffix: string, scoringPolicyCode: string) {
  return {
    schemaVersion: 2,
    code: `BP_REVIEW_${suffix}`,
    version: 1,
    examFamily: "SKD_KEDINASAN",
    activationScope: "draft_only",
    title: "Review slice fixture blueprint",
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
    title: "Review slice fixture policy",
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
let adminId: string;
let reviewerId: string;
let studentId: string;
let otherStudentId: string;
let cache: EffectiveAccessCache;

beforeEach(async () => {
  handle = await createTestDatabase();
  await seedCanonicalRoles(handle.db);
  cache = createInMemoryEffectiveAccessCache();

  adminId = (await createUser(handle.db, { emailNormalized: "rev-admin@superlatif.id", phoneE164: null }))
    .userId;
  reviewerId = (await createUser(handle.db, { emailNormalized: "rev-rev@superlatif.id", phoneE164: null }))
    .userId;
  studentId = (await createUser(handle.db, { emailNormalized: "rev-student@superlatif.id", phoneE164: null }))
    .userId;
  otherStudentId = (
    await createUser(handle.db, { emailNormalized: "rev-other@superlatif.id", phoneE164: null })
  ).userId;

  await assignRole(handle.db, {
    userId: adminId,
    role: "academic_admin",
    grantedByUserId: adminId,
    grantedReason: "test setup",
  });
  await assignRole(handle.db, {
    userId: reviewerId,
    role: "moderator_reviewer",
    grantedByUserId: adminId,
    grantedReason: "test setup",
  });
});

afterEach(async () => {
  await handle.close();
});

/** Publishes the full chain, ending with an open batch whose release windows include explanation_release. */
async function publishedBatch(code: string) {
  const suffix = code.toUpperCase().replace(/[^A-Z0-9_]/g, "_");

  const twk = await createQuestionDraft(handle.db, adminId, {
    questionCode: `Q-REV-TWK-${code}`,
    version: 1,
    type: "single_choice",
    stemDocument: { text: "Ibu kota negara Indonesia adalah?" },
    explanationDocument: { text: "Jakarta adalah ibu kota negara sesuai UU yang berlaku saat soal disusun." },
  });
  await setQuestionOptions(handle.db, adminId, twk.id, [
    { optionCode: "A", order: 1, content: { text: "Jakarta" } },
    { optionCode: "B", order: 2, content: { text: "Bandung" } },
  ]);
  await setQuestionAnswerKey(handle.db, adminId, twk.id, { kind: "single_choice", correctOptionCode: "A" });
  await submitQuestionVersionForReview(handle.db, adminId, twk.id);
  await approveQuestionVersion(handle.db, reviewerId, twk.id, COMPLETE_CHECKLIST);
  await publishQuestionVersion(handle.db, adminId, twk.id);

  const tkp = await createQuestionDraft(handle.db, adminId, {
    questionCode: `Q-REV-TKP-${code}`,
    version: 1,
    type: "weighted_choice",
    stemDocument: { text: "Rekan kerjamu melakukan kesalahan. Sikapmu?" },
    explanationDocument: { text: "Opsi A memiliki bobot tertinggi karena paling kolaboratif." },
  });
  await setQuestionOptions(handle.db, adminId, tkp.id, [
    { optionCode: "A", order: 1, content: { text: "Bicarakan langsung dan cari solusi bersama" } },
    { optionCode: "B", order: 2, content: { text: "Diamkan saja" } },
  ]);
  await setQuestionAnswerKey(handle.db, adminId, tkp.id, {
    kind: "weighted_choice",
    optionWeights: { A: 5, B: 2 },
  });
  await submitQuestionVersionForReview(handle.db, adminId, tkp.id);
  await approveQuestionVersion(handle.db, reviewerId, tkp.id, COMPLETE_CHECKLIST);
  await publishQuestionVersion(handle.db, adminId, tkp.id);

  const scoringPolicyCode = `SP_REV_${suffix}`;
  const scoring = await createScoringPolicyDraft(handle.db, adminId, {
    scoringPolicyCode,
    version: 1,
    policyConfig: SCORING_CONFIG,
  });
  await submitScoringPolicyVersionForReview(handle.db, adminId, scoring.id);
  await approveScoringPolicyVersion(handle.db, reviewerId, scoring.id);
  await publishScoringPolicyVersion(handle.db, adminId, scoring.id);

  const blueprint = await createExamBlueprintDraft(handle.db, adminId, {
    blueprintCode: `BP-REV-${suffix}`,
    examFamilyCode: "SKD_KEDINASAN",
    examFamilyTitle: "SKD Sekolah Kedinasan",
    version: 1,
    config: buildBlueprintConfig(
      computeChecksum(SCORING_CONFIG as unknown as JsonValue),
      suffix,
      scoringPolicyCode,
    ),
  });
  await submitExamBlueprintVersionForReview(handle.db, adminId, blueprint.id);
  await approveExamBlueprintVersion(handle.db, reviewerId, blueprint.id);
  await publishExamBlueprintVersion(handle.db, adminId, blueprint.id);

  const form = await createExamFormDraft(handle.db, adminId, {
    examFormCode: `FORM-REV-${code}`,
    version: 1,
    blueprintVersionId: blueprint.id,
  });
  await setExamFormItems(handle.db, adminId, form.id, [
    { sectionCode: "TWK", order: 1, questionVersionId: twk.id },
    { sectionCode: "TKP", order: 1, questionVersionId: tkp.id },
  ]);
  await submitExamFormVersionForReview(handle.db, adminId, form.id);
  await approveExamFormVersion(handle.db, reviewerId, form.id);
  const publishedForm = await publishExamFormVersion(handle.db, adminId, form.id);

  const batch = await createExamBatchDraft(handle.db, adminId, {
    code,
    examFormVersionId: publishedForm.id,
    title: "Tryout SKD - review slice fixture",
    timezone: "Asia/Jakarta",
  });
  await setExamBatchWindows(handle.db, adminId, batch.id, [
    { windowType: "attempt", startsAt: ATTEMPT_STARTS_AT, endsAt: ATTEMPT_ENDS_AT },
    { windowType: "provisional_result_release", startsAt: PROVISIONAL_AT },
    { windowType: "final_result_release", startsAt: FINAL_AT },
    { windowType: "explanation_release", startsAt: EXPLANATION_AT },
  ]);
  await submitExamBatchForReview(handle.db, adminId, batch.id);
  await approveExamBatch(handle.db, adminId, batch.id);
  await publishExamBatch(handle.db, adminId, batch.id);
  return batch;
}

async function grantStartAttempt(userId: string, batchCode: string) {
  // `entitlement-policy.schema.json` requires ^[A-Z0-9_]+$ - uppercase and
  // sanitize the WHOLE string, including the (lowercase hex) user suffix.
  const policyCode = `REV_START_${batchCode}_${userId.slice(0, 8)}`.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
  const policy = await createPolicyDraft(handle.db, {
    code: policyCode,
    version: 1,
    title: "Review slice fixture policy",
    config: policyConfig(examBatchTargetRef(batchCode), policyCode),
  });
  await publishPolicyVersion(handle.db, policy.id, new Date("2026-08-01T00:00:00Z"));
  await issueGrant(handle.db, {
    userId,
    sourceType: "purchase",
    sourceId: `order-${policyCode}`,
    sourceKey: `order-${policyCode}`,
    accessPolicyId: policy.id,
    validFrom: new Date("2026-08-01T00:00:00Z"),
    validTo: null,
  });
}

/** Starts, answers (TWK correct "A"; TKP best "A" unless overridden), submits, and scores. */
async function submittedAndScoredAttempt(
  code: string,
  options: { readonly twk?: string | null; readonly tkp?: string | null } = {},
) {
  const batch = await publishedBatch(code);
  await grantStartAttempt(studentId, batch.code);

  const started = await startOrResumeAttempt(
    handle.db,
    cache,
    studentId,
    {
      batchId: batch.id,
      idempotencyKey: `idem-${code}`,
      clientCapabilities: { offlineQueue: false, writerLease: true },
    },
    NOW_EXAM_OPEN,
  );
  const attemptId = started.view.id;
  const leaseToken = started.view.writerLease.leaseToken!;
  const twkInstance = started.view.instances.find((i) => i.sectionCode === "TWK")!;
  const tkpInstance = started.view.instances.find((i) => i.sectionCode === "TKP")!;

  const twkChoice = options.twk === undefined ? "A" : options.twk;
  const tkpChoice = options.tkp === undefined ? "A" : options.tkp;
  let revisionCount = 0;

  if (twkChoice !== null) {
    await saveAnswer(
      handle.db,
      studentId,
      attemptId,
      {
        instanceId: twkInstance.instanceId,
        clientMutationId: "30000000-0000-0000-0000-000000000001",
        leaseToken,
        expectedRevision: 0,
        payload: { kind: "single_choice", optionCode: twkChoice },
        capturedAtClient: null,
      },
      NOW_EXAM_OPEN,
    );
    revisionCount += 1;
  }
  if (tkpChoice !== null) {
    await saveAnswer(
      handle.db,
      studentId,
      attemptId,
      {
        instanceId: tkpInstance.instanceId,
        clientMutationId: "30000000-0000-0000-0000-000000000002",
        leaseToken,
        expectedRevision: 0,
        payload: { kind: "single_choice", optionCode: tkpChoice },
        capturedAtClient: null,
      },
      NOW_EXAM_OPEN,
    );
    revisionCount += 1;
  }

  await submitAttempt(
    handle.db,
    attemptId,
    {
      kind: "user",
      userId: studentId,
      mutationId: "40000000-0000-0000-0000-000000000001",
      leaseToken,
      expectedAttemptRevision: revisionCount,
    },
    NOW_SUBMIT,
  );
  await scoreSubmission(handle.db, attemptId, NOW_SUBMIT);
  return { attemptId, batch, leaseToken, twkInstance, tkpInstance };
}

describe("getAttemptReviewView - release gating", () => {
  it("withholds the answer key while the result is released but explanation is not", async () => {
    const { attemptId } = await submittedAndScoredAttempt("REV-GATE-1");

    // The score itself IS visible at this instant...
    const result = await getStudentResultView(handle.db, studentId, attemptId, NOW_RESULT_ONLY);
    expect(result.scoreSummary).not.toBeNull();

    // ...but the explanation/answer key is not.
    const review = await getAttemptReviewView(handle.db, studentId, attemptId, NOW_RESULT_ONLY);
    expect(review.available).toBe(false);
    expect(review.items).toEqual([]);
    // Nothing key-shaped anywhere in the serialized payload.
    expect(JSON.stringify(review)).not.toContain("correctOptionCode");
    expect(JSON.stringify(review)).not.toContain("optionWeights");
    expect(JSON.stringify(review)).not.toContain("Jakarta adalah ibu kota");
  });

  it("withholds review before submission, when no result exists at all", async () => {
    const batch = await publishedBatch("REV-GATE-2");
    await grantStartAttempt(studentId, batch.code);
    const started = await startOrResumeAttempt(
      handle.db,
      cache,
      studentId,
      {
        batchId: batch.id,
        idempotencyKey: "idem-REV-GATE-2",
        clientCapabilities: { offlineQueue: false, writerLease: true },
      },
      NOW_EXAM_OPEN,
    );

    // Even at an instant well past the explanation window, an unsubmitted /
    // unscored attempt has nothing to review.
    const review = await getAttemptReviewView(handle.db, studentId, started.view.id, NOW_REVIEW_OPEN);
    expect(review.available).toBe(false);
    expect(review.items).toEqual([]);
  });

  it("reveals review once the explanation window is reached", async () => {
    const { attemptId } = await submittedAndScoredAttempt("REV-GATE-3");
    const review = await getAttemptReviewView(handle.db, studentId, attemptId, NOW_REVIEW_OPEN);

    expect(review.available).toBe(true);
    expect(review.items).toHaveLength(2);
    expect(review.state).toBe("provisional");
  });
});

describe("getAttemptReviewView - answer comparison", () => {
  it("reports binary correctness for single_choice and weight-based status for weighted_choice", async () => {
    const { attemptId } = await submittedAndScoredAttempt("REV-CMP-1", { twk: "A", tkp: "B" });
    const review = await getAttemptReviewView(handle.db, studentId, attemptId, NOW_REVIEW_OPEN);

    const twk = review.items.find((item) => item.sectionCode === "TWK")!;
    expect(twk.review).toMatchObject({ kind: "binary", status: "correct", correctOptionCode: "A" });

    const tkp = review.items.find((item) => item.sectionCode === "TKP")!;
    expect(tkp.review).toMatchObject({
      kind: "weighted",
      status: "not_best",
      selectedWeight: 2,
      maxWeight: 5,
    });
    // TKP must never be described in correct/incorrect terms.
    expect(JSON.stringify(tkp.review)).not.toContain("correct");
  });

  it("represents unanswered questions as blank rather than wrong", async () => {
    const { attemptId } = await submittedAndScoredAttempt("REV-CMP-2", { twk: null, tkp: null });
    const review = await getAttemptReviewView(handle.db, studentId, attemptId, NOW_REVIEW_OPEN);

    for (const item of review.items) {
      expect(item.review.status).toBe("blank");
      expect(item.review.selectedOptionCode).toBeNull();
    }
  });

  it("carries each question's own explanation document once released", async () => {
    const { attemptId } = await submittedAndScoredAttempt("REV-CMP-3");
    const review = await getAttemptReviewView(handle.db, studentId, attemptId, NOW_REVIEW_OPEN);

    const twk = review.items.find((item) => item.sectionCode === "TWK")!;
    expect(twk.explanationDocument).toMatchObject({ text: expect.stringContaining("Jakarta") });
  });

  it("serves the same student-safe question content the attempt itself presented", async () => {
    const { attemptId, twkInstance } = await submittedAndScoredAttempt("REV-CMP-4");
    const review = await getAttemptReviewView(handle.db, studentId, attemptId, NOW_REVIEW_OPEN);

    const twk = review.items.find((item) => item.instanceId === twkInstance.instanceId)!;
    expect(twk.content.options.map((option) => option.optionCode)).toEqual(
      twkInstance.content.options.map((option) => option.optionCode),
    );
  });
});

/**
 * The full production route sequence, exercised through exactly the
 * functions apps/web's Server Components and Server Actions call, in the
 * same order. This stands in for a browser click-through of
 * /tryouts/[batchCode] -> /attempts/[attemptId] -> .../submit ->
 * .../result -> .../review, covering the server half of every step.
 */
describe("production tryout core flow - start, resume, submit, score, result, review", () => {
  it("preserves answers and the presented paper across a resume (refresh)", async () => {
    const batch = await publishedBatch("REV-FLOW-1");
    await grantStartAttempt(studentId, batch.code);

    const started = await startOrResumeAttempt(
      handle.db,
      cache,
      studentId,
      {
        batchId: batch.id,
        idempotencyKey: "idem-REV-FLOW-1",
        clientCapabilities: { offlineQueue: false, writerLease: true },
      },
      NOW_EXAM_OPEN,
    );
    const attemptId = started.view.id;
    const leaseToken = started.view.writerLease.leaseToken!;
    const twk = started.view.instances.find((i) => i.sectionCode === "TWK")!;

    await saveAnswer(
      handle.db,
      studentId,
      attemptId,
      {
        instanceId: twk.instanceId,
        clientMutationId: "60000000-0000-0000-0000-000000000001",
        leaseToken,
        expectedRevision: 0,
        payload: { kind: "single_choice", optionCode: "A" },
        capturedAtClient: null,
      },
      NOW_EXAM_OPEN,
    );

    // "Refresh": a second start-or-resume call is what the attempt page does
    // on every load. It must return the SAME attempt, the SAME paper, and
    // the answer already saved.
    const resumed = await startOrResumeAttempt(
      handle.db,
      cache,
      studentId,
      {
        batchId: batch.id,
        idempotencyKey: "idem-REV-FLOW-1-again",
        clientCapabilities: { offlineQueue: false, writerLease: true },
      },
      NOW_EXAM_OPEN,
    );

    expect(resumed.created).toBe(false);
    expect(resumed.view.id).toBe(attemptId);
    expect(resumed.view.instances.map((i) => i.instanceId)).toEqual(
      started.view.instances.map((i) => i.instanceId),
    );
    expect(resumed.view.instances.map((i) => i.presentedOptionOrder)).toEqual(
      started.view.instances.map((i) => i.presentedOptionOrder),
    );
    const resumedAnswer = resumed.view.answers.find((a) => a.instanceId === twk.instanceId);
    expect(resumedAnswer?.payload).toEqual({ kind: "single_choice", optionCode: "A" });
    // The deadline is the server's, and a reload does not move it.
    expect(resumed.view.deadlineAt.toISOString()).toBe(started.view.deadlineAt.toISOString());
  });

  it("produces a server-computed result whose score comes only from persisted answers", async () => {
    // TWK correct (5) + TKP best option A (weight 5) = 10.
    const { attemptId } = await submittedAndScoredAttempt("REV-FLOW-2", { twk: "A", tkp: "A" });

    const result = await getStudentResultView(handle.db, studentId, attemptId, NOW_RESULT_ONLY);
    expect(result.scoreSummary).toMatchObject({ total: 10 });

    // Partial answers score strictly lower - the score tracks what was
    // actually persisted, nothing the caller supplies.
    const partial = await submittedAndScoredAttempt("REV-FLOW-3", { twk: "B", tkp: null });
    const partialResult = await getStudentResultView(
      handle.db,
      studentId,
      partial.attemptId,
      NOW_RESULT_ONLY,
    );
    expect(partialResult.scoreSummary).toMatchObject({ total: 0 });
  });

  it("hides the result entirely before its release window", async () => {
    const { attemptId } = await submittedAndScoredAttempt("REV-FLOW-4");

    // Immediately after submit, long before provisional_result_release.
    const early = await getStudentResultView(handle.db, studentId, attemptId, NOW_SUBMIT);
    expect(early.scoreSummary).toBeNull();
    expect(early.resultId).toBeNull();
  });
});

describe("getAttemptReviewView - authorization", () => {
  it("refuses another user's attempt, revealing nothing about it", async () => {
    const { attemptId } = await submittedAndScoredAttempt("REV-AUTH-1");

    await expect(getAttemptReviewView(handle.db, otherStudentId, attemptId, NOW_REVIEW_OPEN)).rejects.toThrow(
      /does not belong to this actor/i,
    );
  });

  it("refuses an attempt id that does not exist", async () => {
    await expect(
      getAttemptReviewView(handle.db, studentId, "00000000-0000-0000-0000-000000000000", NOW_REVIEW_OPEN),
    ).rejects.toThrow(/not found/i);
  });
});

/**
 * The one case in this slice's security matrix with no pre-existing
 * coverage: answer-save already tests unknown OPTION codes, stale
 * revisions, leases, and forged client clocks (answer-save.integration.
 * test.ts), but not an `instanceId` that is real and owned by the same
 * learner while belonging to a DIFFERENT attempt.
 */
describe("saveAnswer - question instance must belong to the target attempt", () => {
  it("refuses an instance id that belongs to another attempt", async () => {
    const first = await submittedAndScoredAttempt("REV-XATT-1");

    const secondBatch = await publishedBatch("REV-XATT-2");
    await grantStartAttempt(studentId, secondBatch.code);
    const second = await startOrResumeAttempt(
      handle.db,
      cache,
      studentId,
      {
        batchId: secondBatch.id,
        idempotencyKey: "idem-REV-XATT-2",
        clientCapabilities: { offlineQueue: false, writerLease: true },
      },
      NOW_EXAM_OPEN,
    );

    // A real instance, owned by the same learner - but on the other attempt.
    await expect(
      saveAnswer(
        handle.db,
        studentId,
        second.view.id,
        {
          instanceId: first.twkInstance.instanceId,
          clientMutationId: "50000000-0000-0000-0000-000000000001",
          leaseToken: second.view.writerLease.leaseToken!,
          expectedRevision: 0,
          payload: { kind: "single_choice", optionCode: "A" },
          capturedAtClient: null,
        },
        NOW_EXAM_OPEN,
      ),
    ).rejects.toThrow(/not found on this attempt/i);
  });
});
