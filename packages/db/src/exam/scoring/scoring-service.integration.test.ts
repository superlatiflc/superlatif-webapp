// SCR-001 integration tests - exercises the deterministic scorer +
// scoring_job_outbox drain against a real (pglite-backed) Postgres
// schema. Covers the backlog's required tests ("Golden scoring fixtures"
// is covered at the domain layer, score-calculation.test.ts; this file
// covers "Recompute equality" and "Policy-version regression" at the
// service layer) plus the founder instruction's explicit scope: the
// scorer reads the ATM-003 submitted immutable snapshot, the scoring
// policy is versioned/deterministic, and the internal outbox-drain path
// works without ever building a real worker.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
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
import {
  startOrResumeAttempt,
  saveAnswer,
  submitAttempt,
  type SaveAnswerInput,
} from "../attempt/attempt-service.ts";
import { findPendingScoringJobs, findScoringJobById } from "../attempt/scoring-outbox-repository.ts";
import { attemptSubmissions } from "../../schema/index.ts";
import {
  drainAllPendingScoringJobs,
  drainScoringJob,
  scoreSubmission,
  ScoringInputChecksumMismatchError,
  ScoringSubmissionNotFoundError,
  SCORING_ENGINE_VERSION,
} from "./scoring-service.ts";
import { findCurrentResultByAttemptId } from "./result-repository.ts";

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
    code: `BP_SCR001_${codeSuffix}`,
    version: 1,
    examFamily: "SKD_KEDINASAN",
    activationScope: "draft_only",
    title: "SCR-001 synthetic scoring fixture blueprint",
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
    title: "SCR-001 start_attempt fixture policy",
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

  const admin = await createUser(handle.db, { emailNormalized: "scr1-admin@superlatif.id", phoneE164: null });
  const reviewer = await createUser(handle.db, {
    emailNormalized: "scr1-reviewer@superlatif.id",
    phoneE164: null,
  });
  const student = await createUser(handle.db, {
    emailNormalized: "scr1-student@superlatif.id",
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

/** Full question -> scoring -> blueprint -> form -> batch chain, ending PUBLISHED. TWK correct option is "A" (binary_choice, correctScore configurable per case); TKP option weights are A=5, B=2 (weighted_option). */
async function publishedOpenBatch(code: string, correctScore: number) {
  const codeSuffix = code.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
  const question = await createQuestionDraft(handle.db, academicAdminId, {
    questionCode: `Q-SCR001-TWK-${code}`,
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
    questionCode: `Q-SCR001-TKP-${code}`,
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

  const scoringPolicyCode = `SP_SCR001_${codeSuffix}`;
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
    blueprintCode: `BP-SCR001-${codeSuffix}`,
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
    examFormCode: `FORM-SCR001-${code}`,
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
    title: "Tryout SKD Kedinasan - SCR-001 fixture",
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

  return { batch, scoringPolicyId: scoring.scoringPolicyId, scoringPolicyCode };
}

async function grantStartAttempt(userId: string, batchCode: string) {
  const targetRef = examBatchTargetRef(batchCode);
  const policyCode = `SCR001_START_ATTEMPT_${batchCode.toUpperCase().replace(/[^A-Z0-9_]/g, "_")}`;
  const policy = await createPolicyDraft(handle.db, {
    code: policyCode,
    version: 1,
    title: "SCR-001 fixture policy",
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
const SUBMIT_NOW = new Date("2026-09-01T01:01:00Z"); // within the 120s writer-lease TTL from NOW_EXAM_OPEN

async function startedAttempt(code: string, correctScore = 5) {
  const { batch, scoringPolicyId, scoringPolicyCode } = await publishedOpenBatch(code, correctScore);
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
  return {
    attemptId: result.view.id,
    twkInstanceId: twkInstance.instanceId,
    tkpInstanceId: tkpInstance.instanceId,
    leaseToken: result.view.writerLease.leaseToken!,
    scoringPolicyId,
    scoringPolicyCode,
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

/** Starts an attempt, saves TWK=A (correct) and TKP=A (weight 5), submits, and returns the ids needed to score it. */
async function fullySubmittedAttempt(code: string, correctScore = 5) {
  const started = await startedAttempt(code, correctScore);
  await saveAnswer(
    handle.db,
    studentId,
    started.attemptId,
    saveInput({
      instanceId: started.twkInstanceId,
      clientMutationId: "10000000-0000-0000-0000-000000000001",
      leaseToken: started.leaseToken,
      expectedRevision: 0,
      payload: { kind: "single_choice", optionCode: "A" },
    }),
    NOW_EXAM_OPEN,
  );
  await saveAnswer(
    handle.db,
    studentId,
    started.attemptId,
    saveInput({
      instanceId: started.tkpInstanceId,
      clientMutationId: "10000000-0000-0000-0000-000000000002",
      leaseToken: started.leaseToken,
      expectedRevision: 0,
      payload: { kind: "single_choice", optionCode: "A" },
    }),
    NOW_EXAM_OPEN,
  );
  const submission = await submitAttempt(
    handle.db,
    started.attemptId,
    {
      kind: "user",
      userId: studentId,
      mutationId: "20000000-0000-0000-0000-000000000001",
      leaseToken: started.leaseToken,
      expectedAttemptRevision: 2,
    },
    SUBMIT_NOW,
  );
  return { ...started, submission };
}

describe("scoreSubmission - deterministic component/total/threshold scoring", () => {
  it("computes and persists a result version from the submitted immutable snapshot", async () => {
    const { attemptId } = await fullySubmittedAttempt("SCORE-BASIC");
    const result = await scoreSubmission(handle.db, attemptId, new Date("2026-09-01T01:02:00Z"));

    expect(result.attemptId).toBe(attemptId);
    expect(result.version).toBe(1);
    expect(result.isCurrent).toBe(true);
    expect(result.state).toBe("provisional");
    expect(result.scoringEngineVersion).toBe(SCORING_ENGINE_VERSION);
    // TWK correct (5) + TKP weight A=5 -> total 10.
    expect(result.totalScore).toBe(10);
    expect(result.scores["sectionScores"]).toStrictEqual({ TWK: 5, TKP: 5 });
    expect(result.overallPassed).toBe(true);
    expect(result.releasedAt).toBeNull();
    expect(result.correctedAt).toBeNull();
  });

  it("Recompute equality: scoring the same attempt twice returns the SAME row, not a duplicate", async () => {
    const { attemptId } = await fullySubmittedAttempt("SCORE-RECOMPUTE");
    const first = await scoreSubmission(handle.db, attemptId, new Date("2026-09-01T01:02:00Z"));
    const second = await scoreSubmission(handle.db, attemptId, new Date("2026-09-01T01:03:00Z"));

    expect(second.id).toBe(first.id);
    expect(second).toStrictEqual(first);
    const current = await findCurrentResultByAttemptId(handle.db, attemptId);
    expect(current?.id).toBe(first.id);
  });

  it("Policy-version regression: recompute stays pinned to the snapshot scoring policy, not a newer published one", async () => {
    const { attemptId, scoringPolicyCode } = await fullySubmittedAttempt("SCORE-POLICY-PIN", 5);

    // Publish v2 of the SAME scoring policy (same code -> same
    // scoringPolicyId via findOrCreateScoringPolicy) with a materially
    // different correctScore - if the scorer ever resolved "current"
    // instead of the attempt's own pinned FK (set once at start, ATM-001),
    // this would silently change the total.
    const v2 = await createScoringPolicyDraft(handle.db, academicAdminId, {
      scoringPolicyCode,
      version: 2,
      policyConfig: scoringConfig(999),
    });
    await submitScoringPolicyVersionForReview(handle.db, academicAdminId, v2.id);
    await approveScoringPolicyVersion(handle.db, reviewerId, v2.id);
    await publishScoringPolicyVersion(handle.db, academicAdminId, v2.id);

    const result = await scoreSubmission(handle.db, attemptId, new Date("2026-09-01T01:02:00Z"));
    // TWK correct = 5 (the ORIGINAL, pinned correctScore), never 999.
    expect(result.scores["sectionScores"]).toStrictEqual({ TWK: 5, TKP: 5 });
    expect(result.totalScore).toBe(10);
  });

  it("refuses to score an attempt with no submission yet", async () => {
    const { attemptId } = await startedAttempt("SCORE-NO-SUBMISSION");
    await expect(scoreSubmission(handle.db, attemptId, new Date("2026-09-01T01:02:00Z"))).rejects.toThrow(
      ScoringSubmissionNotFoundError,
    );
  });

  it("refuses to score when the current answer_states no longer matches the pinned submission checksum", async () => {
    const { attemptId } = await fullySubmittedAttempt("SCORE-CHECKSUM-MISMATCH");
    // Simulate a tampered/stale pin by directly corrupting the stored
    // checksum - assertAttemptWritable already makes this unreachable via
    // any normal application code path once an attempt is submitted; this
    // is a defensive integrity check, exercised here via direct SQL.
    await handle.db
      .update(attemptSubmissions)
      .set({ answerSetChecksum: "0".repeat(64) })
      .where(eq(attemptSubmissions.attemptId, attemptId));

    await expect(scoreSubmission(handle.db, attemptId, new Date("2026-09-01T01:02:00Z"))).rejects.toThrow(
      ScoringInputChecksumMismatchError,
    );
  });

  it("counts an unanswered question as blank (zero points), not invalid or a crash", async () => {
    const started = await startedAttempt("SCORE-UNANSWERED");
    // Only TWK is answered - TKP is left blank.
    await saveAnswer(
      handle.db,
      studentId,
      started.attemptId,
      saveInput({
        instanceId: started.twkInstanceId,
        clientMutationId: "10000000-0000-0000-0000-000000000003",
        leaseToken: started.leaseToken,
        expectedRevision: 0,
        payload: { kind: "single_choice", optionCode: "A" },
      }),
      NOW_EXAM_OPEN,
    );
    const submission = await submitAttempt(
      handle.db,
      started.attemptId,
      {
        kind: "user",
        userId: studentId,
        mutationId: "20000000-0000-0000-0000-000000000002",
        leaseToken: started.leaseToken,
        expectedAttemptRevision: 1,
      },
      SUBMIT_NOW,
    );
    void submission;

    const result = await scoreSubmission(handle.db, started.attemptId, new Date("2026-09-01T01:02:00Z"));
    expect(result.scores["sectionScores"]).toStrictEqual({ TWK: 5, TKP: 0 });
    expect(result.scores["unansweredCount"]).toBe(1);
  });

  it("never persists the raw answer key/weight map shape in the stored result row", async () => {
    const { attemptId } = await fullySubmittedAttempt("SCORE-NO-SECRET-LEAK");
    const result = await scoreSubmission(handle.db, attemptId, new Date("2026-09-01T01:02:00Z"));
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("correctOptionCode");
    expect(serialized).not.toContain("optionWeights");
  });
});

/** `submitAttempt` (ATM-003) already enqueues a scoring job transactionally as part of submit itself (dok 16 §13 step 5) - every test below finds THAT auto-created job rather than enqueuing a second, redundant one for the same submission. */
async function findPendingJobForAttempt(attemptId: string) {
  const pending = await findPendingScoringJobs(handle.db);
  const job = pending.find((candidate) => candidate.attemptId === attemptId);
  if (!job) throw new Error(`no pending scoring job found for attempt ${attemptId}`);
  return job;
}

describe("scoring_job_outbox drain - internal path only, idempotent under retry", () => {
  it("drainScoringJob scores the job's attempt and marks it delivered", async () => {
    const { attemptId } = await fullySubmittedAttempt("SCORE-DRAIN-BASIC");
    const job = await findPendingJobForAttempt(attemptId);

    const result = await drainScoringJob(handle.db, job.id, new Date("2026-09-01T01:02:00Z"));
    expect(result?.attemptId).toBe(attemptId);

    const updatedJob = await findScoringJobById(handle.db, job.id);
    expect(updatedJob?.status).toBe("delivered");
  });

  it("Worker retry: draining the SAME job twice never creates a second result", async () => {
    const { attemptId } = await fullySubmittedAttempt("SCORE-DRAIN-RETRY");
    const job = await findPendingJobForAttempt(attemptId);

    const first = await drainScoringJob(handle.db, job.id, new Date("2026-09-01T01:02:00Z"));
    const retry = await drainScoringJob(handle.db, job.id, new Date("2026-09-01T01:03:00Z"));

    expect(retry?.id).toBe(first?.id);
    const current = await findCurrentResultByAttemptId(handle.db, attemptId);
    expect(current?.id).toBe(first?.id);
  });

  it("drainAllPendingScoringJobs drains every pending job", async () => {
    const first = await fullySubmittedAttempt("SCORE-DRAIN-ALL-1");
    const second = await fullySubmittedAttempt("SCORE-DRAIN-ALL-2");

    const results = await drainAllPendingScoringJobs(handle.db, new Date("2026-09-01T01:02:00Z"));
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.attemptId).sort()).toStrictEqual([first.attemptId, second.attemptId].sort());
  });

  it("draining an unknown job id is a safe no-op", async () => {
    const result = await drainScoringJob(handle.db, "00000000-0000-0000-0000-000000000000", new Date());
    expect(result).toBeNull();
  });
});
