// Staging fixture seed for the production tryout core flow.
//
// DEVELOPMENT/STAGING ONLY. Refuses to run when APP_ENV=production. Creates
// only synthetic fixture data and never deletes or modifies anything it did
// not create - re-running is safe because every object is keyed by a stable
// code and the underlying services are idempotent or fail loudly on
// duplicates.
//
// Everything below goes through the SAME published-governance chain the real
// product uses (question -> answer key -> scoring policy -> blueprint ->
// form -> batch -> windows -> grant). Nothing is inserted straight into a
// table, so a fixture that the domain would consider invalid simply cannot
// be created here.
//
// TWO batches are seeded on purpose, because a batch's release windows are
// absolute instants and `assertBatchWindowsCoherent` requires
// explanation_release >= final >= provisional >= attempt end. A single batch
// therefore cannot be both "open for answering" and "review released" at the
// same wall-clock moment:
//
//   TO-LIVE  - attempt window open NOW. Used for the live browser E2E
//              (start -> answer -> refresh -> submit). Its result and review
//              are correctly still hidden, which is what makes the
//              "result/review before release" checks meaningful.
//   TO-PAST  - every window already elapsed, so the batch derives as
//              `review_open` right now. An attempt for it is seeded
//              programmatically with a past clock (the services all take an
//              explicit `now`), so the released result and review pages can
//              be exercised in a browser today.
//
// Run: node packages/db/scripts/seed-staging.ts   (DATABASE_URL required)

import { createDatabaseClient } from "../src/client.ts";
import { createUser, linkExternalIdentity } from "../src/identity/repository.ts";
import { assignRole, seedCanonicalRoles } from "../src/authorization/index.ts";
import { createPolicyDraft, publishPolicyVersion } from "../src/access/policy-repository.ts";
import { issueGrant } from "../src/access/grant-repository.ts";
import { computeChecksum, type JsonValue } from "@superlatif/domain/shared";
import { createInMemoryEffectiveAccessCache } from "@superlatif/domain/access";
import {
  approveQuestionVersion,
  createQuestionDraft,
  publishQuestionVersion,
  setQuestionAnswerKey,
  setQuestionOptions,
  submitQuestionVersionForReview,
} from "../src/exam/question-service.ts";
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
} from "../src/exam/config/exam-config-service.ts";
import {
  approveExamBatch,
  createExamBatchDraft,
  examBatchTargetRef,
  publishExamBatch,
  setExamBatchWindows,
  submitExamBatchForReview,
} from "../src/exam/batch/index.ts";
import { saveAnswer, startOrResumeAttempt, submitAttempt } from "../src/exam/attempt/attempt-service.ts";
import { scoreSubmission } from "../src/exam/scoring/scoring-service.ts";

if (process.env["APP_ENV"] === "production") {
  throw new Error("seed-staging refuses to run with APP_ENV=production");
}
const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl) throw new Error("DATABASE_URL is required");

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

/** TWK: correct option is "A" (binary). TKP: weights A=5, B=3, C=1 (weighted; "A" scores highest). */
const SCORING_CONFIG = {
  sectionMaxScores: { TWK: 100, TKP: 100 },
  thresholds: [{ kind: "section_score_gte", sectionCode: "TWK", value: 1 }],
  sectionScorers: {
    TWK: { kind: "binary_choice", correctScore: 5, incorrectScore: 0, blankScore: 0 },
    TKP: { kind: "weighted_option", blankScore: 0 },
  },
};

const HOUR = 60 * 60 * 1000;
const NOW = new Date();
const at = (offsetHours: number) => new Date(NOW.getTime() + offsetHours * HOUR);

const handle = createDatabaseClient(databaseUrl, { maxConnections: 3 });
const db = handle.db;
const cache = createInMemoryEffectiveAccessCache();

function blueprintConfig(scoringPolicyChecksum: string, suffix: string, scoringPolicyCode: string) {
  return {
    schemaVersion: 2,
    code: `BP_${suffix}`,
    version: 1,
    examFamily: "SKD_KEDINASAN",
    activationScope: "staging",
    title: "SKD Kedinasan - staging fixture blueprint",
    sections: [
      {
        code: "TWK",
        title: "Tes Wawasan Kebangsaan",
        order: 1,
        questionCount: 1,
        durationSeconds: 1800,
        allowedQuestionTypes: ["single_choice"],
      },
      {
        code: "TKP",
        title: "Tes Karakteristik Pribadi",
        order: 2,
        questionCount: 1,
        durationSeconds: 1800,
        allowedQuestionTypes: ["weighted_choice"],
      },
    ],
    timing: {
      mode: "per_section",
      totalDurationSeconds: 3600,
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
    title: "Staging fixture entitlement policy",
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

async function seedStudent(handleName: string, email: string): Promise<string> {
  const user = await createUser(db, { emailNormalized: email, phoneE164: null });
  // The link the sign-in page's `performDeterministicLogin` resolves: signing
  // in with this handle attaches to THIS user, so the grants below apply.
  await linkExternalIdentity(db, {
    userId: user.userId,
    provider: "dev_fixture",
    externalSubject: handleName,
    linkReason: "staging_seed",
  });
  return user.userId;
}

/** One published question pair + scoring policy + blueprint + form, shared by both batches. */
async function seedFormChain(adminId: string, reviewerId: string) {
  const twk = await createQuestionDraft(db, adminId, {
    questionCode: "Q-STG-TWK-01",
    version: 1,
    type: "single_choice",
    stemDocument: {
      text: "Lembaga negara yang berwenang menguji undang-undang terhadap UUD 1945 adalah...",
    },
    explanationDocument: {
      text: "Mahkamah Konstitusi berwenang menguji undang-undang terhadap UUD 1945 (judicial review). Mahkamah Agung menangani kasasi dan peninjauan kembali, bukan pengujian undang-undang.",
    },
  });
  await setQuestionOptions(db, adminId, twk.id, [
    { optionCode: "A", order: 1, content: { text: "Mahkamah Konstitusi" } },
    { optionCode: "B", order: 2, content: { text: "Mahkamah Agung" } },
    { optionCode: "C", order: 3, content: { text: "Komisi Yudisial" } },
  ]);
  await setQuestionAnswerKey(db, adminId, twk.id, { kind: "single_choice", correctOptionCode: "A" });
  await submitQuestionVersionForReview(db, adminId, twk.id);
  await approveQuestionVersion(db, reviewerId, twk.id, COMPLETE_CHECKLIST);
  await publishQuestionVersion(db, adminId, twk.id);

  const tkp = await createQuestionDraft(db, adminId, {
    questionCode: "Q-STG-TKP-01",
    version: 1,
    type: "weighted_choice",
    stemDocument: {
      text: "Rekan satu timmu membuat kesalahan yang berdampak pada hasil kerja bersama. Sikapmu adalah...",
    },
    explanationDocument: {
      text: "Menyelesaikan masalah secara langsung dan kolaboratif paling selaras dengan nilai kerja sama yang diukur TKP. Pada TKP semua pilihan bernilai - yang membedakan hanya besar skornya.",
    },
  });
  await setQuestionOptions(db, adminId, tkp.id, [
    { optionCode: "A", order: 1, content: { text: "Membicarakannya berdua dan mencari solusi bersama" } },
    { optionCode: "B", order: 2, content: { text: "Melaporkannya ke atasan tanpa berdiskusi dulu" } },
    { optionCode: "C", order: 3, content: { text: "Membiarkannya karena bukan tanggung jawabku" } },
  ]);
  await setQuestionAnswerKey(db, adminId, tkp.id, {
    kind: "weighted_choice",
    optionWeights: { A: 5, B: 3, C: 1 },
  });
  await submitQuestionVersionForReview(db, adminId, tkp.id);
  await approveQuestionVersion(db, reviewerId, tkp.id, COMPLETE_CHECKLIST);
  await publishQuestionVersion(db, adminId, tkp.id);

  const scoringPolicyCode = "SP_STG_01";
  const scoring = await createScoringPolicyDraft(db, adminId, {
    scoringPolicyCode,
    version: 1,
    policyConfig: SCORING_CONFIG,
  });
  await submitScoringPolicyVersionForReview(db, adminId, scoring.id);
  await approveScoringPolicyVersion(db, reviewerId, scoring.id);
  await publishScoringPolicyVersion(db, adminId, scoring.id);

  const blueprint = await createExamBlueprintDraft(db, adminId, {
    blueprintCode: "BP-STG-01",
    examFamilyCode: "SKD_KEDINASAN",
    examFamilyTitle: "SKD Sekolah Kedinasan",
    version: 1,
    config: blueprintConfig(
      computeChecksum(SCORING_CONFIG as unknown as JsonValue),
      "STG_01",
      scoringPolicyCode,
    ),
  });
  await submitExamBlueprintVersionForReview(db, adminId, blueprint.id);
  await approveExamBlueprintVersion(db, reviewerId, blueprint.id);
  await publishExamBlueprintVersion(db, adminId, blueprint.id);

  const form = await createExamFormDraft(db, adminId, {
    examFormCode: "FORM-STG-01",
    version: 1,
    blueprintVersionId: blueprint.id,
  });
  await setExamFormItems(db, adminId, form.id, [
    { sectionCode: "TWK", order: 1, questionVersionId: twk.id },
    { sectionCode: "TKP", order: 1, questionVersionId: tkp.id },
  ]);
  await submitExamFormVersionForReview(db, adminId, form.id);
  await approveExamFormVersion(db, reviewerId, form.id);
  const published = await publishExamFormVersion(db, adminId, form.id);
  return published.id;
}

interface WindowSpec {
  readonly attemptStart: Date;
  readonly attemptEnd: Date;
  readonly provisional: Date;
  readonly final: Date;
  readonly explanation: Date;
}

async function seedBatch(adminId: string, code: string, title: string, formVersionId: string, w: WindowSpec) {
  const batch = await createExamBatchDraft(db, adminId, {
    code,
    examFormVersionId: formVersionId,
    title,
    timezone: "Asia/Jakarta",
  });
  await setExamBatchWindows(db, adminId, batch.id, [
    { windowType: "attempt", startsAt: w.attemptStart, endsAt: w.attemptEnd },
    { windowType: "provisional_result_release", startsAt: w.provisional },
    { windowType: "final_result_release", startsAt: w.final },
    { windowType: "explanation_release", startsAt: w.explanation },
  ]);
  await submitExamBatchForReview(db, adminId, batch.id);
  await approveExamBatch(db, adminId, batch.id);
  await publishExamBatch(db, adminId, batch.id);
  return batch;
}

async function grantAccess(userId: string, batchCode: string, label: string) {
  const policyCode = `STG_START_${label}`.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
  const policy = await createPolicyDraft(db, {
    code: policyCode,
    version: 1,
    title: `Staging grant - ${label}`,
    config: policyConfig(examBatchTargetRef(batchCode), policyCode),
  });
  await publishPolicyVersion(db, policy.id, at(-24));
  await issueGrant(db, {
    userId,
    sourceType: "purchase",
    sourceId: `stg-order-${label}`,
    sourceKey: `stg-order-${label}`,
    accessPolicyId: policy.id,
    validFrom: at(-24),
    validTo: null,
  });
}

async function main() {
  await seedCanonicalRoles(db);

  const adminId = (await createUser(db, { emailNormalized: "stg-admin@superlatif.id", phoneE164: null }))
    .userId;
  const reviewerId = (
    await createUser(db, { emailNormalized: "stg-reviewer@superlatif.id", phoneE164: null })
  ).userId;
  await assignRole(db, {
    userId: adminId,
    role: "academic_admin",
    grantedByUserId: adminId,
    grantedReason: "staging seed",
  });
  await assignRole(db, {
    userId: reviewerId,
    role: "moderator_reviewer",
    grantedByUserId: adminId,
    grantedReason: "staging seed",
  });

  const studentA = await seedStudent("siswa-01", "stg-siswa-01@superlatif.id");
  const studentB = await seedStudent("siswa-02", "stg-siswa-02@superlatif.id");

  const formVersionId = await seedFormChain(adminId, reviewerId);

  const live = await seedBatch(adminId, "TO-STG-LIVE", "Tryout SKD Kedinasan - Sesi Live", formVersionId, {
    attemptStart: at(-1),
    attemptEnd: at(3),
    provisional: at(4),
    final: at(5),
    explanation: at(6),
  });
  const past = await seedBatch(adminId, "TO-STG-PAST", "Tryout SKD Kedinasan - Sesi Selesai", formVersionId, {
    attemptStart: at(-6),
    attemptEnd: at(-4),
    provisional: at(-3),
    final: at(-2),
    explanation: at(-1),
  });

  await grantAccess(studentA, live.code, "A_LIVE");
  await grantAccess(studentB, live.code, "B_LIVE");
  await grantAccess(studentA, past.code, "A_PAST");
  await grantAccess(studentB, past.code, "B_PAST");

  // A completed attempt on the already-released batch, so the browser can
  // exercise the released result and review pages at today's wall clock.
  // Uses the real services with a past `now`, never a direct table insert.
  const pastAttemptAt = at(-5);
  const started = await startOrResumeAttempt(
    db,
    cache,
    studentA,
    {
      batchId: past.id,
      idempotencyKey: "stg-seed-past-attempt",
      clientCapabilities: { offlineQueue: false, writerLease: true },
    },
    pastAttemptAt,
  );
  const leaseToken = started.view.writerLease.leaseToken!;
  const twkInstance = started.view.instances.find((i) => i.sectionCode === "TWK")!;
  const tkpInstance = started.view.instances.find((i) => i.sectionCode === "TKP")!;

  // TWK "A" is correct; TKP "B" is deliberately NOT the highest-weight option,
  // so the review page shows both a correct binary answer and a
  // not-highest-score weighted answer.
  await saveAnswer(
    db,
    studentA,
    started.view.id,
    {
      instanceId: twkInstance.instanceId,
      clientMutationId: crypto.randomUUID(),
      leaseToken,
      expectedRevision: 0,
      payload: { kind: "single_choice", optionCode: "A" },
      capturedAtClient: null,
    },
    pastAttemptAt,
  );
  await saveAnswer(
    db,
    studentA,
    started.view.id,
    {
      instanceId: tkpInstance.instanceId,
      clientMutationId: crypto.randomUUID(),
      leaseToken,
      expectedRevision: 0,
      payload: { kind: "single_choice", optionCode: "B" },
      capturedAtClient: null,
    },
    pastAttemptAt,
  );
  await submitAttempt(
    db,
    started.view.id,
    {
      kind: "user",
      userId: studentA,
      mutationId: crypto.randomUUID(),
      leaseToken,
      expectedAttemptRevision: 2,
    },
    pastAttemptAt,
  );
  await scoreSubmission(db, started.view.id, pastAttemptAt);

  console.log(
    JSON.stringify(
      {
        ok: true,
        signInHandles: { studentA: "siswa-01", studentB: "siswa-02" },
        studentAUserId: studentA,
        studentBUserId: studentB,
        liveBatchCode: live.code,
        pastBatchCode: past.code,
        seededPastAttemptId: started.view.id,
        urls: {
          signin: "/signin",
          startLive: `/tryouts/${live.code}`,
          releasedResult: `/attempts/${started.view.id}/result`,
          releasedReview: `/attempts/${started.view.id}/review`,
        },
      },
      null,
      2,
    ),
  );
}

try {
  await main();
} finally {
  await handle.close();
}
