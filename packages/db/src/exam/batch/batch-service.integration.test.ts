// EXM-002 integration tests - exercises the full tryout batch + independent
// window authoring workflow against a real (pglite-backed) Postgres schema.
// Covers the backlog's required tests ("Window boundary matrix", "Batch
// state transitions", "Historical attempt preservation") plus the founder
// instruction's explicit scope: batch pins an exact PUBLISHED
// exam_form_version, state is server-derived (never a stored column), and
// a locked (approved-or-later) batch's windows can never be edited in
// place - the structural guarantee behind "Changing offer windows tidak
// boleh mengubah attempt/batch history".

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { computeChecksum, type JsonValue } from "@superlatif/domain/shared";
import { ExamConfigVersionLockedError } from "@superlatif/domain/exam";
import { createUser } from "../../identity/repository.ts";
import { assignRole, seedCanonicalRoles } from "../../authorization/index.ts";
import { createTestDatabase, type TestDatabaseHandle } from "../../test-client.ts";
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
  archiveExamBatch,
  BatchActionNotAuthorizedError,
  BatchFormVersionNotPublishedError,
  BatchReasonRequiredError,
  createExamBatchDraft,
  getExamBatchState,
  publishExamBatch,
  requestExamBatchChanges,
  setExamBatchWindows,
  submitExamBatchForReview,
  voidExamBatch,
} from "./batch-service.ts";
import { BatchWindowsInvalidError } from "@superlatif/domain/exam";

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
  sectionMaxScores: { TWK: 1 },
  thresholds: [{ kind: "no_threshold" }],
};

function buildBlueprintConfig(
  scoringPolicyChecksum: string,
  scoringPolicyCode: string = "SP_EXM002_SYNTH",
  blueprintCode: string = "BP_EXM002_SYNTH",
) {
  return {
    schemaVersion: 2,
    code: blueprintCode,
    version: 1,
    examFamily: "SKD_KEDINASAN",
    activationScope: "draft_only",
    title: "EXM-002 synthetic batch fixture blueprint",
    sections: [
      {
        code: "TWK",
        title: "Tes Wawasan Kebangsaan",
        order: 1,
        questionCount: 1,
        durationSeconds: 300,
        allowedQuestionTypes: ["single_choice"],
      },
    ],
    timing: {
      mode: "global",
      totalDurationSeconds: 300,
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

let handle: TestDatabaseHandle;
let academicAdminId: string; // academic_admin: full "granted" batch.publish (dok 24 §6's batch.publish row has no separate maker/checker tiers, unlike question.*/exam.blueprint.* - a single actor may create, approve, and publish a batch)
let reviewerId: string; // moderator_reviewer: only "scoped_nuance" batch.publish (not a full grant, ADR-049 fail-closed) - used here for question/blueprint/scoring/form's OWN maker-checker steps, which DO require a non-creator approver
let writerId: string; // tutor_writer: no batch.publish grant at all

beforeEach(async () => {
  handle = await createTestDatabase();
  await seedCanonicalRoles(handle.db);

  const admin = await createUser(handle.db, {
    emailNormalized: "batch-admin@superlatif.id",
    phoneE164: null,
  });
  const reviewer = await createUser(handle.db, {
    emailNormalized: "batch-reviewer@superlatif.id",
    phoneE164: null,
  });
  const writer = await createUser(handle.db, {
    emailNormalized: "batch-writer@superlatif.id",
    phoneE164: null,
  });
  academicAdminId = admin.userId;
  reviewerId = reviewer.userId;
  writerId = writer.userId;

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
  await assignRole(handle.db, {
    userId: writerId,
    role: "tutor_writer",
    grantedByUserId: academicAdminId,
    grantedReason: "test setup",
  });
});

afterEach(async () => {
  await handle.close();
});

/** Full question -> scoring -> blueprint -> form chain, ending with a PUBLISHED exam_form_version - the only kind of form version a batch may pin. */
async function publishedExamFormVersion() {
  const question = await createQuestionDraft(handle.db, academicAdminId, {
    questionCode: "Q-EXM002-TWK-001",
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
  // question.first_approve is "requiresNonCreator" for academic_admin (QST-003's
  // maker-checker rule) - approve with a DIFFERENT actor than the creator.
  await approveQuestionVersion(handle.db, reviewerId, question.id, COMPLETE_CHECKLIST);
  await publishQuestionVersion(handle.db, academicAdminId, question.id);

  const scoring = await createScoringPolicyDraft(handle.db, academicAdminId, {
    scoringPolicyCode: "SP_EXM002_SYNTH",
    version: 1,
    policyConfig: CONSISTENT_SCORING_CONFIG,
  });
  await submitScoringPolicyVersionForReview(handle.db, academicAdminId, scoring.id);
  await approveScoringPolicyVersion(handle.db, reviewerId, scoring.id);
  await publishScoringPolicyVersion(handle.db, academicAdminId, scoring.id);

  const blueprint = await createExamBlueprintDraft(handle.db, academicAdminId, {
    blueprintCode: "BP-EXM002-SYNTH",
    examFamilyCode: "SKD_KEDINASAN",
    examFamilyTitle: "SKD Sekolah Kedinasan",
    version: 1,
    config: buildBlueprintConfig(computeChecksum(CONSISTENT_SCORING_CONFIG as JsonValue)),
  });
  await submitExamBlueprintVersionForReview(handle.db, academicAdminId, blueprint.id);
  await approveExamBlueprintVersion(handle.db, reviewerId, blueprint.id);
  await publishExamBlueprintVersion(handle.db, academicAdminId, blueprint.id);

  const form = await createExamFormDraft(handle.db, academicAdminId, {
    examFormCode: "FORM-EXM002-SYNTH",
    version: 1,
    blueprintVersionId: blueprint.id,
  });
  await setExamFormItems(handle.db, academicAdminId, form.id, [
    { sectionCode: "TWK", order: 1, questionVersionId: question.id },
  ]);
  await submitExamFormVersionForReview(handle.db, academicAdminId, form.id);
  await approveExamFormVersion(handle.db, reviewerId, form.id);
  return publishExamFormVersion(handle.db, academicAdminId, form.id);
}

const ATTEMPT_STARTS_AT = new Date("2026-09-01T00:00:00Z");
const ATTEMPT_ENDS_AT = new Date("2026-09-01T02:00:00Z");

function coherentWindows() {
  return [
    { windowType: "attempt", startsAt: ATTEMPT_STARTS_AT, endsAt: ATTEMPT_ENDS_AT },
    { windowType: "provisional_result_release", startsAt: new Date("2026-09-02T00:00:00Z") },
    { windowType: "final_result_release", startsAt: new Date("2026-09-05T00:00:00Z") },
  ];
}

/** Publishes a blueprint (via its own SP_EXM002_DRAFT-coded scoring policy) and returns a still-DRAFT exam_form_version pinning it - the one shape createExamBatchDraft must refuse. */
async function draftExamFormVersion() {
  const scoring = await createScoringPolicyDraft(handle.db, academicAdminId, {
    scoringPolicyCode: "SP_EXM002_DRAFT",
    version: 1,
    policyConfig: CONSISTENT_SCORING_CONFIG,
  });
  await submitScoringPolicyVersionForReview(handle.db, academicAdminId, scoring.id);
  await approveScoringPolicyVersion(handle.db, reviewerId, scoring.id);
  await publishScoringPolicyVersion(handle.db, academicAdminId, scoring.id);

  const blueprint = await createExamBlueprintDraft(handle.db, academicAdminId, {
    blueprintCode: "BP-EXM002-DRAFT",
    examFamilyCode: "SKD_KEDINASAN",
    examFamilyTitle: "SKD Sekolah Kedinasan",
    version: 1,
    config: buildBlueprintConfig(
      computeChecksum(CONSISTENT_SCORING_CONFIG as JsonValue),
      "SP_EXM002_DRAFT",
      "BP_EXM002_DRAFT",
    ),
  });
  await submitExamBlueprintVersionForReview(handle.db, academicAdminId, blueprint.id);
  await approveExamBlueprintVersion(handle.db, reviewerId, blueprint.id);
  await publishExamBlueprintVersion(handle.db, academicAdminId, blueprint.id);

  return createExamFormDraft(handle.db, academicAdminId, {
    examFormCode: "FORM-EXM002-DRAFT",
    version: 1,
    blueprintVersionId: blueprint.id,
  });
}

describe("batch pins an exact PUBLISHED exam_form_version", () => {
  it("refuses to create a batch pinning a still-draft form version", async () => {
    const form = await draftExamFormVersion();

    await expect(
      createExamBatchDraft(handle.db, academicAdminId, {
        code: "BATCH-EXM002-DRAFT-FORM",
        examFormVersionId: form.id,
        title: "Synthetic batch on a draft form",
        timezone: "Asia/Jakarta",
      }),
    ).rejects.toThrow(BatchFormVersionNotPublishedError);
  });

  it("creates a batch pinning a published form version", async () => {
    const form = await publishedExamFormVersion();
    const batch = await createExamBatchDraft(handle.db, academicAdminId, {
      code: "BATCH-EXM002-001",
      examFormVersionId: form.id,
      title: "Tryout SKD Kedinasan - Batch 1",
      timezone: "Asia/Jakarta",
    });
    expect(batch.examFormVersionId).toBe(form.id);
    expect(batch.status).toBe("draft");
    expect(batch.rankingAttemptRule).toBe("first");
    expect(batch.leaderboardEnabled).toBe(true);
  });
});

describe("permission - reuses the single existing batch.publish permission code", () => {
  it("refuses batch creation for an actor without any batch.publish grant (tutor_writer)", async () => {
    const form = await publishedExamFormVersion();
    await expect(
      createExamBatchDraft(handle.db, writerId, {
        code: "BATCH-EXM002-DENIED",
        examFormVersionId: form.id,
        title: "Should be denied",
        timezone: "Asia/Jakarta",
      }),
    ).rejects.toThrow(BatchActionNotAuthorizedError);
  });
});

describe("window boundary matrix (service-level, end-to-end through setExamBatchWindows)", () => {
  it("accepts a fully coherent window set", async () => {
    const form = await publishedExamFormVersion();
    const batch = await createExamBatchDraft(handle.db, academicAdminId, {
      code: "BATCH-EXM002-WIN-OK",
      examFormVersionId: form.id,
      title: "Window boundary - coherent",
      timezone: "Asia/Jakarta",
    });
    const windows = await setExamBatchWindows(handle.db, academicAdminId, batch.id, coherentWindows());
    expect(windows).toHaveLength(3);
  });

  it("rejects an attempt window whose end is not after its start", async () => {
    const form = await publishedExamFormVersion();
    const batch = await createExamBatchDraft(handle.db, academicAdminId, {
      code: "BATCH-EXM002-WIN-BAD",
      examFormVersionId: form.id,
      title: "Window boundary - incoherent",
      timezone: "Asia/Jakarta",
    });
    await expect(
      setExamBatchWindows(handle.db, academicAdminId, batch.id, [
        { windowType: "attempt", startsAt: ATTEMPT_ENDS_AT, endsAt: ATTEMPT_STARTS_AT },
      ]),
    ).rejects.toThrow(BatchWindowsInvalidError);
  });

  it("rejects a catalogue/sale window - those belong to COM-001's offer, not the batch", async () => {
    const form = await publishedExamFormVersion();
    const batch = await createExamBatchDraft(handle.db, academicAdminId, {
      code: "BATCH-EXM002-WIN-SALE",
      examFormVersionId: form.id,
      title: "Window boundary - sale rejected",
      timezone: "Asia/Jakarta",
    });
    await expect(
      setExamBatchWindows(handle.db, academicAdminId, batch.id, [
        { windowType: "attempt", startsAt: ATTEMPT_STARTS_AT, endsAt: ATTEMPT_ENDS_AT },
        { windowType: "sale", startsAt: new Date("2026-08-01T00:00:00Z") },
      ]),
    ).rejects.toThrow(/offer/);
  });
});

describe("historical attempt preservation - a locked (approved) batch's windows can never be edited in place", () => {
  it("approveExamBatch runs the fail-closed publication validator and locks the batch", async () => {
    const form = await publishedExamFormVersion();
    const batch = await createExamBatchDraft(handle.db, academicAdminId, {
      code: "BATCH-EXM002-LOCK",
      examFormVersionId: form.id,
      title: "Lock discipline",
      timezone: "Asia/Jakarta",
    });
    await setExamBatchWindows(handle.db, academicAdminId, batch.id, coherentWindows());
    await submitExamBatchForReview(handle.db, academicAdminId, batch.id);
    const approved = await approveExamBatch(handle.db, academicAdminId, batch.id);
    expect(approved.status).toBe("approved");

    await expect(
      setExamBatchWindows(handle.db, academicAdminId, batch.id, coherentWindows()),
    ).rejects.toThrow(ExamConfigVersionLockedError);

    const published = await publishExamBatch(handle.db, academicAdminId, batch.id);
    expect(published.status).toBe("published");
  });

  it("refuses to approve a batch with no windows set at all (attempt window is required)", async () => {
    const form = await publishedExamFormVersion();
    const batch = await createExamBatchDraft(handle.db, academicAdminId, {
      code: "BATCH-EXM002-NOWIN",
      examFormVersionId: form.id,
      title: "No windows set",
      timezone: "Asia/Jakarta",
    });
    await submitExamBatchForReview(handle.db, academicAdminId, batch.id);
    // No window rows exist at all - assembling a BatchWindowSet fails before
    // the publication validator even runs (the "attempt" window is
    // mandatory), so this throws a generic assembly error rather than
    // BatchNotPublishableError specifically. Either way, approval is
    // refused.
    await expect(approveExamBatch(handle.db, academicAdminId, batch.id)).rejects.toThrow(/attempt/);
  });

  it("requestExamBatchChanges and voidExamBatch both require a non-empty reason", async () => {
    const form = await publishedExamFormVersion();
    const batch = await createExamBatchDraft(handle.db, academicAdminId, {
      code: "BATCH-EXM002-REASON",
      examFormVersionId: form.id,
      title: "Reason required",
      timezone: "Asia/Jakarta",
    });
    await setExamBatchWindows(handle.db, academicAdminId, batch.id, coherentWindows());
    await submitExamBatchForReview(handle.db, academicAdminId, batch.id);
    await expect(requestExamBatchChanges(handle.db, reviewerId, batch.id, "")).rejects.toThrow(
      BatchReasonRequiredError,
    );
    await expect(voidExamBatch(handle.db, academicAdminId, batch.id, "   ")).rejects.toThrow(
      BatchReasonRequiredError,
    );
  });
});

describe("batch state transitions - server-derived, never a stored column", () => {
  it("walks the full window-driven timeline end-to-end through getExamBatchState", async () => {
    const form = await publishedExamFormVersion();
    const batch = await createExamBatchDraft(handle.db, academicAdminId, {
      code: "BATCH-EXM002-STATE",
      examFormVersionId: form.id,
      title: "State transitions",
      timezone: "Asia/Jakarta",
    });
    await setExamBatchWindows(handle.db, academicAdminId, batch.id, coherentWindows());
    await submitExamBatchForReview(handle.db, academicAdminId, batch.id);
    await approveExamBatch(handle.db, academicAdminId, batch.id);
    await publishExamBatch(handle.db, academicAdminId, batch.id);

    expect(await getExamBatchState(handle.db, batch.id, new Date("2026-08-01T00:00:00Z"))).toBe("scheduled");
    expect(await getExamBatchState(handle.db, batch.id, new Date("2026-09-01T01:00:00Z"))).toBe("exam_open");
    expect(await getExamBatchState(handle.db, batch.id, new Date("2026-09-01T12:00:00Z"))).toBe("scoring");
    expect(await getExamBatchState(handle.db, batch.id, new Date("2026-09-03T00:00:00Z"))).toBe(
      "provisional_released",
    );
    expect(await getExamBatchState(handle.db, batch.id, new Date("2026-09-06T00:00:00Z"))).toBe(
      "final_released",
    );
  });

  it("is 'draft' before publish regardless of what the windows say", async () => {
    const form = await publishedExamFormVersion();
    const batch = await createExamBatchDraft(handle.db, academicAdminId, {
      code: "BATCH-EXM002-PREDRAFT",
      examFormVersionId: form.id,
      title: "Still draft",
      timezone: "Asia/Jakarta",
    });
    await setExamBatchWindows(handle.db, academicAdminId, batch.id, coherentWindows());
    expect(await getExamBatchState(handle.db, batch.id, new Date("2026-09-01T01:00:00Z"))).toBe("draft");
  });

  it("is 'voided' the instant voidExamBatch is called, overriding the window-derived state", async () => {
    const form = await publishedExamFormVersion();
    const batch = await createExamBatchDraft(handle.db, academicAdminId, {
      code: "BATCH-EXM002-VOID",
      examFormVersionId: form.id,
      title: "Voided mid-exam",
      timezone: "Asia/Jakarta",
    });
    await setExamBatchWindows(handle.db, academicAdminId, batch.id, coherentWindows());
    await submitExamBatchForReview(handle.db, academicAdminId, batch.id);
    await approveExamBatch(handle.db, academicAdminId, batch.id);
    await publishExamBatch(handle.db, academicAdminId, batch.id);

    await voidExamBatch(handle.db, academicAdminId, batch.id, "Duplicate batch created by mistake");
    expect(await getExamBatchState(handle.db, batch.id, new Date("2026-09-01T01:00:00Z"))).toBe("voided");
  });

  it("is 'archived' once archived, and archiving a batch is possible after publish", async () => {
    const form = await publishedExamFormVersion();
    const batch = await createExamBatchDraft(handle.db, academicAdminId, {
      code: "BATCH-EXM002-ARCHIVE",
      examFormVersionId: form.id,
      title: "Archived batch",
      timezone: "Asia/Jakarta",
    });
    await setExamBatchWindows(handle.db, academicAdminId, batch.id, coherentWindows());
    await submitExamBatchForReview(handle.db, academicAdminId, batch.id);
    await approveExamBatch(handle.db, academicAdminId, batch.id);
    await publishExamBatch(handle.db, academicAdminId, batch.id);
    const archived = await archiveExamBatch(handle.db, academicAdminId, batch.id);
    expect(archived.status).toBe("archived");
    expect(await getExamBatchState(handle.db, batch.id, new Date("2026-09-01T01:00:00Z"))).toBe("archived");
  });
});
