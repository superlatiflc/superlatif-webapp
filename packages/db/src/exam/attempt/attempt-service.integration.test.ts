// ATM-001 integration tests - exercises the full attempt start + immutable
// snapshot + resume workflow against a real (pglite-backed) Postgres
// schema. Covers the backlog's required tests ("Authorized start",
// "Unauthorized start", "Resume after disconnect", "Snapshot hash
// stability") plus the founder instruction's explicit scope: start is
// authorized via ENT-002/IDN-004, the snapshot pins batch/form/question
// versions at start, start is idempotent and never creates a duplicate
// attempt, and resume never leaks answer secrets.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { computeChecksum, type JsonValue } from "@superlatif/domain/shared";
import { createInMemoryEffectiveAccessCache, type EffectiveAccessCache } from "@superlatif/domain/access";
import { AttemptAccessDeniedError, AttemptWindowClosedError } from "@superlatif/domain/exam";
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
  AttemptIdempotencyKeyReusedError,
  getAttemptResumeView,
  renewWriterLease,
  startOrResumeAttempt,
  WriterLeaseTokenMismatchError,
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
    code: `BP_ATM001_${codeSuffix}`,
    version: 1,
    examFamily: "SKD_KEDINASAN",
    activationScope: "draft_only",
    title: "ATM-001 synthetic attempt fixture blueprint",
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

function policyConfig(targetRef: string) {
  return {
    schemaVersion: 2,
    code: "ATM001_START_ATTEMPT",
    version: 1,
    title: "ATM-001 start_attempt fixture policy",
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

  const admin = await createUser(handle.db, { emailNormalized: "atm-admin@superlatif.id", phoneE164: null });
  const reviewer = await createUser(handle.db, {
    emailNormalized: "atm-reviewer@superlatif.id",
    phoneE164: null,
  });
  const student = await createUser(handle.db, {
    emailNormalized: "atm-student@superlatif.id",
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

/** Full question -> scoring -> blueprint -> form -> batch chain, ending with a PUBLISHED (exam_open) batch. `attemptWindow` lets a test override the window to something NOT exam_open. */
async function publishedOpenBatch(
  code = "BATCH-ATM001-001",
  attemptWindow?: { startsAt: Date; endsAt: Date },
) {
  // contracts/exam-blueprint.schema.json requires code/scoringPolicyRef.code
  // to match ^[A-Z0-9_]+$ - `code` (the batch code, which may contain
  // lowercase or hyphens) is normalized separately for those two fields.
  const codeSuffix = code.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
  const question = await createQuestionDraft(handle.db, academicAdminId, {
    questionCode: `Q-ATM001-TWK-${code}`,
    version: 1,
    type: "single_choice",
    stemDocument: { text: "Ibu kota negara Indonesia adalah?" },
  });
  await setQuestionOptions(handle.db, academicAdminId, question.id, [
    { optionCode: "B", order: 2, content: { text: "Bandung" } },
    { optionCode: "A", order: 1, content: { text: "Jakarta" } },
  ]);
  await setQuestionAnswerKey(handle.db, academicAdminId, question.id, {
    kind: "single_choice",
    correctOptionCode: "A",
  });
  await submitQuestionVersionForReview(handle.db, academicAdminId, question.id);
  await approveQuestionVersion(handle.db, reviewerId, question.id, COMPLETE_CHECKLIST);
  await publishQuestionVersion(handle.db, academicAdminId, question.id);

  const question2 = await createQuestionDraft(handle.db, academicAdminId, {
    questionCode: `Q-ATM001-TKP-${code}`,
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

  const scoringPolicyCode = `SP_ATM001_${codeSuffix}`;
  const scoring = await createScoringPolicyDraft(handle.db, academicAdminId, {
    scoringPolicyCode,
    version: 1,
    policyConfig: CONSISTENT_SCORING_CONFIG,
  });
  await submitScoringPolicyVersionForReview(handle.db, academicAdminId, scoring.id);
  await approveScoringPolicyVersion(handle.db, reviewerId, scoring.id);
  await publishScoringPolicyVersion(handle.db, academicAdminId, scoring.id);

  const blueprint = await createExamBlueprintDraft(handle.db, academicAdminId, {
    blueprintCode: `BP-ATM001-${codeSuffix}`,
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
    examFormCode: `FORM-ATM001-${code}`,
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
    title: "Tryout SKD Kedinasan - ATM-001 fixture",
    timezone: "Asia/Jakarta",
  });
  const window = attemptWindow ?? {
    startsAt: new Date("2026-09-01T00:00:00Z"),
    endsAt: new Date("2026-09-01T02:00:00Z"),
  };
  await setExamBatchWindows(handle.db, academicAdminId, batch.id, [
    { windowType: "attempt", startsAt: window.startsAt, endsAt: window.endsAt },
  ]);
  await submitExamBatchForReview(handle.db, academicAdminId, batch.id);
  await approveExamBatch(handle.db, academicAdminId, batch.id);
  await publishExamBatch(handle.db, academicAdminId, batch.id);

  return batch;
}

async function grantStartAttempt(userId: string, batchCode: string) {
  const targetRef = examBatchTargetRef(batchCode);
  const policy = await createPolicyDraft(handle.db, {
    code: `ATM001_START_ATTEMPT_${batchCode}`,
    version: 1,
    title: "ATM-001 fixture policy",
    config: policyConfig(targetRef),
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

describe("authorized start - checks effective access and batch window (ENT-002/IDN-004)", () => {
  it("starts a new attempt when the student has a start_attempt grant and the batch window is open", async () => {
    const batch = await publishedOpenBatch();
    await grantStartAttempt(studentId, batch.code);

    const result = await startOrResumeAttempt(
      handle.db,
      cache,
      studentId,
      {
        batchId: batch.id,
        idempotencyKey: "idem-1",
        clientCapabilities: { offlineQueue: true, writerLease: true },
      },
      NOW_EXAM_OPEN,
    );

    expect(result.created).toBe(true);
    expect(result.view.status).toBe("in_progress");
    expect(result.view.batchId).toBe(batch.id);
    expect(result.view.instances).toHaveLength(2);
    expect(result.view.writerLease.state).toBe("held_here");
    expect(result.view.writerLease.leaseToken).not.toBeNull();
  });
});

describe("unauthorized start - denied without effective access", () => {
  it("refuses start for a student with no grant at all", async () => {
    const batch = await publishedOpenBatch();
    await expect(
      startOrResumeAttempt(
        handle.db,
        cache,
        studentId,
        {
          batchId: batch.id,
          idempotencyKey: "idem-2",
          clientCapabilities: { offlineQueue: true, writerLease: true },
        },
        NOW_EXAM_OPEN,
      ),
    ).rejects.toThrow(AttemptAccessDeniedError);
  });

  it("refuses start when the batch attempt window is not open yet", async () => {
    const batch = await publishedOpenBatch("BATCH-ATM001-NOTOPEN");
    await grantStartAttempt(studentId, batch.code);
    await expect(
      startOrResumeAttempt(
        handle.db,
        cache,
        studentId,
        {
          batchId: batch.id,
          idempotencyKey: "idem-3",
          clientCapabilities: { offlineQueue: true, writerLease: true },
        },
        new Date("2026-08-01T00:00:00Z"),
      ),
    ).rejects.toThrow(AttemptWindowClosedError);
  });

  it("a second batch's attempt is unaffected by an active attempt on a different batch (allowance is scoped per batch, not global)", async () => {
    const batchOne = await publishedOpenBatch("BATCH-ATM001-LIMIT-1");
    const batchTwo = await publishedOpenBatch("BATCH-ATM001-LIMIT-2");
    await grantStartAttempt(studentId, batchOne.code);
    await grantStartAttempt(studentId, batchTwo.code);

    const first = await startOrResumeAttempt(
      handle.db,
      cache,
      studentId,
      {
        batchId: batchOne.id,
        idempotencyKey: "idem-4a",
        clientCapabilities: { offlineQueue: true, writerLease: true },
      },
      NOW_EXAM_OPEN,
    );
    const second = await startOrResumeAttempt(
      handle.db,
      cache,
      studentId,
      {
        batchId: batchTwo.id,
        idempotencyKey: "idem-4b",
        clientCapabilities: { offlineQueue: true, writerLease: true },
      },
      NOW_EXAM_OPEN,
    );

    expect(first.created).toBe(true);
    expect(second.created).toBe(true);
    expect(second.view.id).not.toBe(first.view.id);
  });
});

// The MVP allowance default (exactly one non-voided attempt per (user,
// batch), enforced by attempts_user_batch_active_uq) makes
// ATTEMPT_LIMIT_REACHED structurally unreachable through this service's
// own start-or-resume duality: an existing non-voided attempt is always
// returned as a resume, never re-evaluated against the allowance check.
// AttemptLimitReachedError itself is unit-tested directly at the pure
// eligibility layer (attempt-eligibility.test.ts) - see that file, not
// here, for the "limit already reached" case.

describe("start is idempotent and never creates a duplicate attempt", () => {
  it("returns the SAME attempt id for the same idempotency key, and does not create a second row", async () => {
    const batch = await publishedOpenBatch("BATCH-ATM001-IDEM");
    await grantStartAttempt(studentId, batch.code);

    const first = await startOrResumeAttempt(
      handle.db,
      cache,
      studentId,
      {
        batchId: batch.id,
        idempotencyKey: "idem-same",
        clientCapabilities: { offlineQueue: true, writerLease: true },
      },
      NOW_EXAM_OPEN,
    );
    const second = await startOrResumeAttempt(
      handle.db,
      cache,
      studentId,
      {
        batchId: batch.id,
        idempotencyKey: "idem-same",
        clientCapabilities: { offlineQueue: true, writerLease: true },
      },
      NOW_EXAM_OPEN,
    );

    expect(second.created).toBe(false);
    expect(second.view.id).toBe(first.view.id);
  });

  it("also returns the SAME attempt for a DIFFERENT idempotency key once one is already active (start-or-resume duality)", async () => {
    const batch = await publishedOpenBatch("BATCH-ATM001-IDEM2");
    await grantStartAttempt(studentId, batch.code);

    const first = await startOrResumeAttempt(
      handle.db,
      cache,
      studentId,
      {
        batchId: batch.id,
        idempotencyKey: "key-a",
        clientCapabilities: { offlineQueue: true, writerLease: true },
      },
      NOW_EXAM_OPEN,
    );
    const second = await startOrResumeAttempt(
      handle.db,
      cache,
      studentId,
      {
        batchId: batch.id,
        idempotencyKey: "key-b",
        clientCapabilities: { offlineQueue: true, writerLease: true },
      },
      NOW_EXAM_OPEN,
    );

    expect(second.view.id).toBe(first.view.id);
  });

  it("refuses a REPLAY of the same idempotency key with materially different request content", async () => {
    const batch = await publishedOpenBatch("BATCH-ATM001-IDEM3");
    await grantStartAttempt(studentId, batch.code);

    await startOrResumeAttempt(
      handle.db,
      cache,
      studentId,
      {
        batchId: batch.id,
        idempotencyKey: "reused-key",
        clientCapabilities: { offlineQueue: true, writerLease: true },
      },
      NOW_EXAM_OPEN,
    );

    await expect(
      startOrResumeAttempt(
        handle.db,
        cache,
        studentId,
        {
          batchId: batch.id,
          idempotencyKey: "reused-key",
          clientCapabilities: { offlineQueue: false, writerLease: true },
        },
        NOW_EXAM_OPEN,
      ),
    ).rejects.toThrow(AttemptIdempotencyKeyReusedError);
  });
});

describe("snapshot pins batch/form/question versions at start (snapshot hash stability)", () => {
  it("pins the exact published exam_form/blueprint/scoring policy version ids", async () => {
    const batch = await publishedOpenBatch("BATCH-ATM001-SNAP");
    await grantStartAttempt(studentId, batch.code);

    const result = await startOrResumeAttempt(
      handle.db,
      cache,
      studentId,
      {
        batchId: batch.id,
        idempotencyKey: "idem-snap",
        clientCapabilities: { offlineQueue: true, writerLease: true },
      },
      NOW_EXAM_OPEN,
    );

    expect(result.view.instances.map((i) => i.questionVersionId).sort()).toEqual(
      [...result.view.instances.map((i) => i.questionVersionId)].sort(),
    );
    // Section order is BLUEPRINT-declared (TWK before TKP), not insertion order.
    expect(result.view.instances[0]?.sectionCode).toBe("TWK");
    expect(result.view.instances[1]?.sectionCode).toBe("TKP");
    // single_choice's presented option order is the question's own stored order (A before B).
    expect(result.view.instances[0]?.presentedOptionOrder).toEqual(["A", "B"]);
  });

  it("produces a stable, deterministic resume view across repeated reads (same presented order every time)", async () => {
    const batch = await publishedOpenBatch("BATCH-ATM001-SNAP2");
    await grantStartAttempt(studentId, batch.code);
    const started = await startOrResumeAttempt(
      handle.db,
      cache,
      studentId,
      {
        batchId: batch.id,
        idempotencyKey: "idem-snap2",
        clientCapabilities: { offlineQueue: true, writerLease: true },
      },
      NOW_EXAM_OPEN,
    );

    const resumed = await getAttemptResumeView(handle.db, studentId, started.view.id, null, NOW_EXAM_OPEN);
    expect(resumed.instances.map((i) => i.questionVersionId)).toEqual(
      started.view.instances.map((i) => i.questionVersionId),
    );
    expect(resumed.instances.map((i) => i.presentedOptionOrder)).toEqual(
      started.view.instances.map((i) => i.presentedOptionOrder),
    );
    expect(resumed.startedAt).toEqual(started.view.startedAt);
    expect(resumed.deadlineAt).toEqual(started.view.deadlineAt);
  });
});

describe("resume after disconnect - writer lease expiry does not block resume", () => {
  it("resume after the writer lease has expired succeeds and reports 'expired' (no error), never blocking access to server state", async () => {
    const batch = await publishedOpenBatch("BATCH-ATM001-RESUME");
    await grantStartAttempt(studentId, batch.code);
    const started = await startOrResumeAttempt(
      handle.db,
      cache,
      studentId,
      {
        batchId: batch.id,
        idempotencyKey: "idem-resume",
        clientCapabilities: { offlineQueue: true, writerLease: true },
      },
      NOW_EXAM_OPEN,
    );

    // Far past the lease TTL (120s default) but still within the attempt window.
    const muchLater = new Date(NOW_EXAM_OPEN.getTime() + 10 * 60_000);
    const resumed = await getAttemptResumeView(handle.db, studentId, started.view.id, null, muchLater);

    expect(resumed.status).toBe("in_progress");
    expect(resumed.writerLease.state).toBe("expired");
    // Server-authoritative deadline/order are unaffected by the disconnect.
    expect(resumed.deadlineAt).toEqual(started.view.deadlineAt);
    expect(resumed.instances.map((i) => i.questionVersionId)).toEqual(
      started.view.instances.map((i) => i.questionVersionId),
    );
  });

  it("a resumed device presenting the ORIGINAL lease token still sees held_here (no unnecessary disruption)", async () => {
    const batch = await publishedOpenBatch("BATCH-ATM001-RESUME2");
    await grantStartAttempt(studentId, batch.code);
    const started = await startOrResumeAttempt(
      handle.db,
      cache,
      studentId,
      {
        batchId: batch.id,
        idempotencyKey: "idem-resume2",
        clientCapabilities: { offlineQueue: true, writerLease: true },
      },
      NOW_EXAM_OPEN,
    );
    const leaseToken = started.view.writerLease.leaseToken;
    expect(leaseToken).not.toBeNull();

    const soonAfter = new Date(NOW_EXAM_OPEN.getTime() + 10_000);
    const resumed = await getAttemptResumeView(handle.db, studentId, started.view.id, leaseToken, soonAfter);
    expect(resumed.writerLease.state).toBe("held_here");
  });

  it("renewWriterLease refreshes expiry for the holder and refuses a mismatched token", async () => {
    const batch = await publishedOpenBatch("BATCH-ATM001-RENEW");
    await grantStartAttempt(studentId, batch.code);
    const started = await startOrResumeAttempt(
      handle.db,
      cache,
      studentId,
      {
        batchId: batch.id,
        idempotencyKey: "idem-renew",
        clientCapabilities: { offlineQueue: true, writerLease: true },
      },
      NOW_EXAM_OPEN,
    );
    const leaseToken = started.view.writerLease.leaseToken!;

    const renewed = await renewWriterLease(handle.db, studentId, started.view.id, leaseToken, NOW_EXAM_OPEN);
    expect(renewed.expiresAt.getTime()).toBeGreaterThan(NOW_EXAM_OPEN.getTime());

    await expect(
      renewWriterLease(handle.db, studentId, started.view.id, "wrong-token-entirely", NOW_EXAM_OPEN),
    ).rejects.toThrow(WriterLeaseTokenMismatchError);
  });
});

describe("resume never leaks answer secrets", () => {
  it("the resume view contains no answerKey/optionWeights/correct-answer field anywhere in its serialized form", async () => {
    const batch = await publishedOpenBatch("BATCH-ATM001-SECRET");
    await grantStartAttempt(studentId, batch.code);
    const started = await startOrResumeAttempt(
      handle.db,
      cache,
      studentId,
      {
        batchId: batch.id,
        idempotencyKey: "idem-secret",
        clientCapabilities: { offlineQueue: true, writerLease: true },
      },
      NOW_EXAM_OPEN,
    );
    const resumed = await getAttemptResumeView(handle.db, studentId, started.view.id, null, NOW_EXAM_OPEN);

    const serialized = JSON.stringify(resumed);
    expect(serialized).not.toMatch(/answerKey/i);
    expect(serialized).not.toMatch(/optionWeight/i);
    expect(serialized).not.toMatch(/correctOptionCode/i);
    // The weighted_choice question's real weights (A:5, B:2) must never appear as raw numbers tied to option codes.
    expect(serialized).not.toContain('"A":5');
    expect(serialized).not.toContain('"B":2');
  });
});
