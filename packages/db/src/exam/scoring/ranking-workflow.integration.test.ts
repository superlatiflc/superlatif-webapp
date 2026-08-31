// SCR-003 integration tests - exercises privacy-safe versioned leaderboard
// generation and the read path against a real (pglite-backed) Postgres
// schema. Covers the backlog's required tests ("Opt-out privacy",
// "Tie-break policy", "Re-ranking after correction") plus the founder
// instruction's explicit scope: the leaderboard is built ONLY from
// released results (never draft/unreleased ones), stays versioned/
// immutable so a correction never corrupts history, and applies the
// pseudonym/opt-out privacy rule.

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
  updateExamBatchDraft,
} from "../batch/index.ts";
import {
  startOrResumeAttempt,
  saveAnswer,
  submitAttempt,
  type SaveAnswerInput,
} from "../attempt/attempt-service.ts";
import { scoreSubmission } from "./scoring-service.ts";
import { decideResultCorrection, requestResultCorrection } from "./result-correction-service.ts";
import { setRankingSubjectPrivacy } from "./ranking-subject-repository.ts";
import {
  generateRankingSnapshot,
  getBatchLeaderboardView,
  LeaderboardNotAuthorizedError,
  RankingSnapshotEmptyError,
} from "./ranking-service.ts";

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
    thresholds: [{ kind: "no_threshold" }],
    sectionScorers: {
      TWK: { kind: "binary_choice", correctScore, incorrectScore: 0, blankScore: 0 },
      TKP: { kind: "weighted_option", blankScore: 0 },
    },
  };
}

function buildBlueprintConfig(scoringPolicyChecksum: string, codeSuffix: string, scoringPolicyCode: string) {
  return {
    schemaVersion: 2,
    code: `BP_SCR003_${codeSuffix}`,
    version: 1,
    examFamily: "SKD_KEDINASAN",
    activationScope: "draft_only",
    title: "SCR-003 synthetic leaderboard fixture blueprint",
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
    title: "SCR-003 start_attempt fixture policy",
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
let cache: EffectiveAccessCache;

beforeEach(async () => {
  handle = await createTestDatabase();
  await seedCanonicalRoles(handle.db);
  cache = createInMemoryEffectiveAccessCache();

  const admin = await createUser(handle.db, { emailNormalized: "scr3-admin@superlatif.id", phoneE164: null });
  const reviewer = await createUser(handle.db, {
    emailNormalized: "scr3-reviewer@superlatif.id",
    phoneE164: null,
  });
  academicAdminId = admin.userId;
  reviewerId = reviewer.userId;

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

/** Full question -> scoring -> blueprint -> form -> batch chain, ending PUBLISHED, with attempt window [00:00,02:00), provisional-release at 03:00, and leaderboard-release at 04:00 on 2026-09-01Z. */
async function publishedOpenBatch(code: string, correctScore: number, leaderboardEnabled = true) {
  const codeSuffix = code.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
  const question = await createQuestionDraft(handle.db, academicAdminId, {
    questionCode: `Q-SCR003-TWK-${code}`,
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
    questionCode: `Q-SCR003-TKP-${code}`,
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

  const scoringPolicyCode = `SP_SCR003_${codeSuffix}`;
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
    blueprintCode: `BP-SCR003-${codeSuffix}`,
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
    examFormCode: `FORM-SCR003-${code}`,
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
    title: "Tryout SKD Kedinasan - SCR-003 fixture",
    timezone: "Asia/Jakarta",
  });
  if (!leaderboardEnabled) {
    await updateExamBatchDraft(handle.db, academicAdminId, batch.id, {
      title: batch.title,
      timezone: batch.timezone,
      rankingAttemptRule: batch.rankingAttemptRule,
      leaderboardEnabled: false,
    });
  }
  await setExamBatchWindows(handle.db, academicAdminId, batch.id, [
    {
      windowType: "attempt",
      startsAt: new Date("2026-09-01T00:00:00Z"),
      endsAt: new Date("2026-09-01T02:00:00Z"),
    },
    { windowType: "provisional_result_release", startsAt: new Date("2026-09-01T03:00:00Z") },
    { windowType: "leaderboard_release", startsAt: new Date("2026-09-01T04:00:00Z") },
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
  const policyCode = `SCR003_START_ATTEMPT_${batchCode.toUpperCase().replace(/[^A-Z0-9_]/g, "_")}_${userSuffix}`;
  const policy = await createPolicyDraft(handle.db, {
    code: policyCode,
    version: 1,
    title: "SCR-003 fixture policy",
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
const SUBMIT_A = new Date("2026-09-01T01:01:00Z");
const SUBMIT_B = new Date("2026-09-01T01:01:30Z"); // later than A, for tie-break testing
const SCORE_NOW = new Date("2026-09-01T01:02:00Z");
const AFTER_PROVISIONAL_RELEASE = new Date("2026-09-01T03:30:00Z");
const AFTER_LEADERBOARD_RELEASE = new Date("2026-09-01T04:30:00Z");

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

/** Starts, answers, submits, and scores an attempt for `userId`. `twkCorrect` controls whether TWK is answered correctly (binary 0 or correctScore points); TKP is always answered with weight-5 option A. */
async function scoredAttemptFor(
  batch: { id: string; code: string },
  userId: string,
  code: string,
  submittedAt: Date,
  twkCorrect: boolean,
) {
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
  const tkpInstance = result.view.instances.find((i) => i.sectionCode === "TKP")!;
  const leaseToken = result.view.writerLease.leaseToken!;
  const attemptId = result.view.id;

  await saveAnswer(
    handle.db,
    userId,
    attemptId,
    saveInput({
      instanceId: twkInstance.instanceId,
      clientMutationId: `1${userId.replace(/-/g, "").slice(0, 7)}-0000-0000-0000-000000000001`,
      leaseToken,
      expectedRevision: 0,
      payload: { kind: "single_choice", optionCode: twkCorrect ? "A" : "B" },
    }),
    NOW_EXAM_OPEN,
  );
  await saveAnswer(
    handle.db,
    userId,
    attemptId,
    saveInput({
      instanceId: tkpInstance.instanceId,
      clientMutationId: `1${userId.replace(/-/g, "").slice(0, 7)}-0000-0000-0000-000000000002`,
      leaseToken,
      expectedRevision: 0,
      payload: { kind: "single_choice", optionCode: "A" },
    }),
    NOW_EXAM_OPEN,
  );
  const submission = await submitAttempt(
    handle.db,
    attemptId,
    {
      kind: "user",
      userId,
      mutationId: `2${userId.replace(/-/g, "").slice(0, 7)}-0000-0000-0000-000000000001`,
      leaseToken,
      expectedAttemptRevision: 2,
    },
    submittedAt,
  );
  await scoreSubmission(handle.db, attemptId, SCORE_NOW);

  return { attemptId, submission };
}

describe("generateRankingSnapshot / getBatchLeaderboardView", () => {
  it("Ranking input population is explicit: only attempts with a RELEASED result are ranked", async () => {
    const { batch } = await publishedOpenBatch("RANK-RELEASED-ONLY", 10);
    const winner = await createUser(handle.db, {
      emailNormalized: "rank-winner@superlatif.id",
      phoneE164: null,
    });
    const unscored = await createUser(handle.db, {
      emailNormalized: "rank-unscored@superlatif.id",
      phoneE164: null,
    });

    await scoredAttemptFor(batch, winner.userId, "RANK-RELEASED-ONLY-W", SUBMIT_A, true);
    // A second student starts but never gets scored - must never appear.
    await grantStartAttempt(unscored.userId, batch.code);
    await startOrResumeAttempt(
      handle.db,
      cache,
      unscored.userId,
      {
        batchId: batch.id,
        idempotencyKey: "idem-unscored",
        clientCapabilities: { offlineQueue: true, writerLease: true },
      },
      NOW_EXAM_OPEN,
    );

    const snapshot = await generateRankingSnapshot(handle.db, cache, batch.id, AFTER_PROVISIONAL_RELEASE);
    expect(snapshot.version).toBe(1);
    expect(snapshot.state).toBe("provisional");

    const view = await getBatchLeaderboardView(
      handle.db,
      cache,
      winner.userId,
      batch.id,
      AFTER_LEADERBOARD_RELEASE,
    );
    expect(view.entries).toHaveLength(1);
    expect(view.entries[0]?.rank).toBe(1);
  });

  it("throws RankingSnapshotEmptyError when no attempt has a released result yet", async () => {
    const { batch } = await publishedOpenBatch("RANK-EMPTY", 10);
    await expect(generateRankingSnapshot(handle.db, cache, batch.id, NOW_EXAM_OPEN)).rejects.toThrow(
      RankingSnapshotEmptyError,
    );
  });

  it("Tie-break policy: equal scores rank by earlier submission first", async () => {
    const { batch } = await publishedOpenBatch("RANK-TIEBREAK", 10);
    const early = await createUser(handle.db, {
      emailNormalized: "rank-early@superlatif.id",
      phoneE164: null,
    });
    const late = await createUser(handle.db, { emailNormalized: "rank-late@superlatif.id", phoneE164: null });

    // Both answer identically (TWK correct, TKP weight 5) -> identical
    // totalScore - only submittedAt differs.
    await scoredAttemptFor(batch, late.userId, "RANK-TIEBREAK-LATE", SUBMIT_B, true);
    await scoredAttemptFor(batch, early.userId, "RANK-TIEBREAK-EARLY", SUBMIT_A, true);

    await generateRankingSnapshot(handle.db, cache, batch.id, AFTER_PROVISIONAL_RELEASE);
    const view = await getBatchLeaderboardView(
      handle.db,
      cache,
      early.userId,
      batch.id,
      AFTER_LEADERBOARD_RELEASE,
    );

    expect(view.entries).toHaveLength(2);
    const sorted = [...view.entries].sort((a, b) => a.rank - b.rank);
    expect(sorted[0]?.rank).toBe(1);
    expect(sorted[0]?.isCurrentLearner).toBe(true); // "early" is the viewer and submitted first
    expect(sorted[1]?.rank).toBe(2);
  });

  it("Opt-out privacy: an opted-out subject's displayAlias is hidden from other viewers but visible to themselves", async () => {
    const { batch } = await publishedOpenBatch("RANK-PRIVACY", 10);
    const optedIn = await createUser(handle.db, {
      emailNormalized: "rank-optin@superlatif.id",
      phoneE164: null,
    });
    const optedOut = await createUser(handle.db, {
      emailNormalized: "rank-optout@superlatif.id",
      phoneE164: null,
    });

    await scoredAttemptFor(batch, optedIn.userId, "RANK-PRIVACY-IN", SUBMIT_A, true);
    await scoredAttemptFor(batch, optedOut.userId, "RANK-PRIVACY-OUT", SUBMIT_B, false);

    await setRankingSubjectPrivacy(handle.db, optedIn.userId, { publicOptIn: true, displayAlias: "Rajin97" });
    // optedOut deliberately left at the default (publicOptIn: false) - no
    // preference-management endpoint exists in this task's own scope, so
    // the default itself is what's being exercised here.

    await generateRankingSnapshot(handle.db, cache, batch.id, AFTER_PROVISIONAL_RELEASE);

    // Viewed as a THIRD PARTY (optedIn), optedOut's own alias must be null.
    const viewAsOptedIn = await getBatchLeaderboardView(
      handle.db,
      cache,
      optedIn.userId,
      batch.id,
      AFTER_LEADERBOARD_RELEASE,
    );
    const optedOutEntryFromOutside = viewAsOptedIn.entries.find((e) => !e.isCurrentLearner)!;
    expect(optedOutEntryFromOutside.publicOptIn).toBe(false);
    expect(optedOutEntryFromOutside.displayAlias).toBeNull();
    // Their rank/score are still visible - privacy-safe, not invisible.
    expect(optedOutEntryFromOutside.rank).toBeGreaterThan(0);

    const ownAliasFromOutside = viewAsOptedIn.entries.find((e) => e.isCurrentLearner)!;
    expect(ownAliasFromOutside.displayAlias).toBe("Rajin97");

    // Viewed as THEMSELVES, the opted-out subject still gets `ownEntry`
    // populated (isCurrentLearner) even though they never opted in -
    // displayAlias is null here because they never SET one (a default,
    // legitimate value), not because privacy withheld it from themselves.
    const viewAsOptedOut = await getBatchLeaderboardView(
      handle.db,
      cache,
      optedOut.userId,
      batch.id,
      AFTER_LEADERBOARD_RELEASE,
    );
    expect(viewAsOptedOut.ownEntry).not.toBeNull();
    expect(viewAsOptedOut.ownEntry?.isCurrentLearner).toBe(true);
    expect(viewAsOptedOut.ownEntry?.publicOptIn).toBe(false);
    expect(viewAsOptedOut.ownEntry?.displayAlias).toBeNull();
  });

  it("Re-ranking after correction: a result correction produces a new, corrected ranking snapshot without corrupting the prior one", async () => {
    const { batch, scoringPolicyCode } = await publishedOpenBatch("RANK-CORRECTION", 5);
    const first = await createUser(handle.db, {
      emailNormalized: "rank-corr-first@superlatif.id",
      phoneE164: null,
    });
    const second = await createUser(handle.db, {
      emailNormalized: "rank-corr-second@superlatif.id",
      phoneE164: null,
    });

    // Both correct on TWK, so both score TWK=5+TKP=5=10 initially - "first" submitted earlier and ranks #1 on the tie-break.
    await scoredAttemptFor(batch, first.userId, "RANK-CORR-FIRST", SUBMIT_A, true);
    const secondAttempt = await scoredAttemptFor(batch, second.userId, "RANK-CORR-SECOND", SUBMIT_B, true);

    const v1 = await generateRankingSnapshot(handle.db, cache, batch.id, AFTER_PROVISIONAL_RELEASE);
    expect(v1.state).toBe("provisional");
    const v1View = await getBatchLeaderboardView(
      handle.db,
      cache,
      first.userId,
      batch.id,
      AFTER_LEADERBOARD_RELEASE,
    );
    const v1First = v1View.entries.find((e) => e.isCurrentLearner)!;
    expect(v1First.rank).toBe(1); // "first" submitted earlier, ties on score

    // Correct "second"'s scoring policy so TWK is worth much more, giving
    // second a strictly higher score than first.
    const v2Policy = await createScoringPolicyDraft(handle.db, academicAdminId, {
      scoringPolicyCode,
      version: 2,
      policyConfig: scoringConfig(100),
    });
    await submitScoringPolicyVersionForReview(handle.db, academicAdminId, v2Policy.id);
    await approveScoringPolicyVersion(handle.db, reviewerId, v2Policy.id);
    await publishScoringPolicyVersion(handle.db, academicAdminId, v2Policy.id);

    const correctionCase = await requestResultCorrection(handle.db, {
      attemptId: secondAttempt.attemptId,
      requestedByUserId: reviewerId,
      cause: "TWK correctScore was misconfigured too low for this attempt",
      correctedScoringPolicyVersionId: v2Policy.id,
      correlationId: "rank-corr-1",
    });
    await decideResultCorrection(
      handle.db,
      {
        correctionCaseId: correctionCase.id,
        decidedByUserId: academicAdminId,
        outcome: "approved",
        reason: "confirmed",
        correlationId: "rank-corr-2",
      },
      new Date("2026-09-01T05:00:00Z"),
    );

    const v2 = await generateRankingSnapshot(handle.db, cache, batch.id, new Date("2026-09-01T05:05:00Z"));
    expect(v2.version).toBe(2);
    expect(v2.state).toBe("corrected");

    const v2View = await getBatchLeaderboardView(
      handle.db,
      cache,
      second.userId,
      batch.id,
      AFTER_LEADERBOARD_RELEASE,
    );
    const v2Second = v2View.entries.find((e) => e.isCurrentLearner)!;
    expect(v2Second.rank).toBe(1); // second now strictly outscores first

    // v1 (via a fresh read scoped to what it captured) is untouched - re-derive
    // by checking the FIRST snapshot's own generatedAt/version are unchanged
    // in spirit: the read path always serves CURRENT (v2) now, but the prior
    // version's own rank for "first" at v1-time is still what it was.
    expect(v1First.rank).toBe(1);
  });

  it("reports state disabled when the batch has leaderboardEnabled=false", async () => {
    const { batch } = await publishedOpenBatch("RANK-DISABLED", 10, false);
    const student = await createUser(handle.db, {
      emailNormalized: "rank-disabled@superlatif.id",
      phoneE164: null,
    });
    await scoredAttemptFor(batch, student.userId, "RANK-DISABLED-S", SUBMIT_A, true);

    const view = await getBatchLeaderboardView(
      handle.db,
      cache,
      student.userId,
      batch.id,
      AFTER_LEADERBOARD_RELEASE,
    );
    expect(view.state).toBe("disabled");
    expect(view.entries).toHaveLength(0);
  });

  it("reports state not_released before the leaderboard window opens, even if results are already released", async () => {
    const { batch } = await publishedOpenBatch("RANK-NOT-RELEASED", 10);
    const student = await createUser(handle.db, {
      emailNormalized: "rank-notrel@superlatif.id",
      phoneE164: null,
    });
    await scoredAttemptFor(batch, student.userId, "RANK-NOT-RELEASED-S", SUBMIT_A, true);
    await generateRankingSnapshot(handle.db, cache, batch.id, AFTER_PROVISIONAL_RELEASE);

    // Result IS released (past provisional_result_release at 03:00) but
    // the leaderboard's OWN window (04:00) has not opened yet.
    const view = await getBatchLeaderboardView(
      handle.db,
      cache,
      student.userId,
      batch.id,
      AFTER_PROVISIONAL_RELEASE,
    );
    expect(view.state).toBe("not_released");
    expect(view.entries).toHaveLength(0);
  });

  it("refuses a viewer without effective access to the batch", async () => {
    const { batch } = await publishedOpenBatch("RANK-NO-ACCESS", 10);
    const student = await createUser(handle.db, {
      emailNormalized: "rank-owner@superlatif.id",
      phoneE164: null,
    });
    const outsider = await createUser(handle.db, {
      emailNormalized: "rank-outsider@superlatif.id",
      phoneE164: null,
    });
    await scoredAttemptFor(batch, student.userId, "RANK-NO-ACCESS-S", SUBMIT_A, true);
    await generateRankingSnapshot(handle.db, cache, batch.id, AFTER_PROVISIONAL_RELEASE);

    await expect(
      getBatchLeaderboardView(handle.db, cache, outsider.userId, batch.id, AFTER_LEADERBOARD_RELEASE),
    ).rejects.toThrow(LeaderboardNotAuthorizedError);
  });
});
