// QST-003 integration tests - preview assembly, checklist-gated approval,
// and review-history preservation, exercised against a real (pglite-backed)
// Postgres schema. Covers every case the founder instruction named
// explicitly: preview never leaks answer secrets, creator cannot approve
// their own publication, and rejected revisions preserve history.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ReviewChecklist } from "@superlatif/domain/exam";
import { ReviewChecklistIncompleteError } from "@superlatif/domain/exam";
import { createUser } from "../identity/repository.ts";
import { assignRole, seedCanonicalRoles } from "../authorization/index.ts";
import { createTestDatabase, type TestDatabaseHandle } from "../test-client.ts";
import { listQuestionVersionReviewHistory } from "./question-review-repository.ts";
import { buildQuestionPreview } from "./question-preview-service.ts";
import {
  addQuestionAsset,
  approveQuestionVersion,
  createQuestionDraft,
  createStimulusDraft,
  QuestionActionNotAuthorizedError,
  requestQuestionVersionChanges,
  setQuestionAnswerKey,
  setQuestionOptions,
  submitQuestionVersionForReview,
} from "./question-service.ts";

const COMPLETE_CHECKLIST: ReviewChecklist = {
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

let handle: TestDatabaseHandle;
let writerId: string;
let approverId: string;

beforeEach(async () => {
  handle = await createTestDatabase();
  await seedCanonicalRoles(handle.db);
  const writer = await createUser(handle.db, { emailNormalized: "writer@superlatif.id", phoneE164: null });
  const approver = await createUser(handle.db, {
    emailNormalized: "approver@superlatif.id",
    phoneE164: null,
  });
  writerId = writer.userId;
  approverId = approver.userId;
  await assignRole(handle.db, {
    userId: writerId,
    role: "tutor_writer",
    grantedByUserId: writerId,
    grantedReason: "test setup",
  });
  await assignRole(handle.db, {
    userId: approverId,
    role: "academic_admin",
    grantedByUserId: writerId,
    grantedReason: "test setup",
  });
});

afterEach(async () => {
  await handle.close();
});

async function draftWeightedChoiceQuestion() {
  const stimulus = await createStimulusDraft(handle.db, writerId, {
    stimulusCode: "STM-PREVIEW",
    version: 1,
    bodyDocument: { text: "Bacaan pendukung untuk preview." },
  });
  const version = await createQuestionDraft(handle.db, writerId, {
    questionCode: "Q-PREVIEW",
    version: 1,
    type: "weighted_choice",
    stimulusVersionId: stimulus.id,
    stemDocument: { text: "Pilih jawaban dengan bobot tertinggi." },
    explanationDocument: { text: "Pembahasan: opsi A memiliki bobot tertinggi." },
  });
  await setQuestionOptions(handle.db, writerId, version.id, [
    { optionCode: "A", order: 1, content: { text: "Opsi A" } },
    { optionCode: "B", order: 2, content: { text: "Opsi B" } },
  ]);
  await setQuestionAnswerKey(handle.db, writerId, version.id, {
    kind: "weighted_choice",
    optionWeights: { A: 1, B: 0.25 },
  });
  await addQuestionAsset(handle.db, writerId, {
    questionVersionId: version.id,
    placement: "option",
    optionCode: "A",
    storageRef: "opaque-preview-ref",
    altText: "Diagram opsi A",
    imagePurpose: "informative",
  });
  return version;
}

describe("preview never leaks answer secrets", () => {
  it("toStudentFacingQuestionView's own shape is what buildQuestionPreview returns - no answerKey/optionWeights field exists to leak", async () => {
    const version = await draftWeightedChoiceQuestion();

    const preview = await buildQuestionPreview(handle.db, writerId, version.id);

    // weighted_choice must report as the single_choice student response
    // shape (CLAUDE.md's canonical rule) - proven again end-to-end here,
    // not just at the domain-unit level.
    expect(preview.responseKind).toBe("single_choice");
    expect(preview.questionCode).toBe("Q-PREVIEW");
    expect(preview.stimulus?.stimulusCode).toBe("STM-PREVIEW");
    expect(preview.options).toHaveLength(2);
    expect(preview.assets).toHaveLength(1);
    expect(preview.assets[0]?.optionCode).toBe("A");

    const serialized = JSON.stringify(preview);
    expect(serialized).not.toContain("optionWeights");
    expect(serialized).not.toContain("answerKey");
    expect(serialized).not.toContain("correctOptionCode");
    expect(serialized).not.toContain("opaque-preview-ref"); // storageRef itself never appears
  });

  it("denies preview access to an actor with no question role", async () => {
    const version = await draftWeightedChoiceQuestion();
    const student = await createUser(handle.db, {
      emailNormalized: "student@superlatif.id",
      phoneE164: null,
    });
    await expect(buildQuestionPreview(handle.db, student.userId, version.id)).rejects.toThrow(
      QuestionActionNotAuthorizedError,
    );
  });
});

describe("creator cannot approve their own publication", () => {
  it("is denied even with a complete checklist in hand", async () => {
    const version = await draftWeightedChoiceQuestion();
    await submitQuestionVersionForReview(handle.db, writerId, version.id);

    await expect(approveQuestionVersion(handle.db, writerId, version.id, COMPLETE_CHECKLIST)).rejects.toThrow(
      QuestionActionNotAuthorizedError,
    );
  });
});

describe("approval requires a complete review checklist", () => {
  it("refuses to approve when any checklist item is unchecked", async () => {
    const version = await draftWeightedChoiceQuestion();
    await submitQuestionVersionForReview(handle.db, writerId, version.id);

    await expect(
      approveQuestionVersion(handle.db, approverId, version.id, {
        ...COMPLETE_CHECKLIST,
        answerScoringCorrect: false,
      }),
    ).rejects.toThrow(ReviewChecklistIncompleteError);
  });

  it("approves once every checklist item is checked, and records the checklist in the review log", async () => {
    const version = await draftWeightedChoiceQuestion();
    await submitQuestionVersionForReview(handle.db, writerId, version.id);

    const approved = await approveQuestionVersion(handle.db, approverId, version.id, COMPLETE_CHECKLIST);
    expect(approved.status).toBe("approved");

    const history = await listQuestionVersionReviewHistory(handle.db, version.id);
    const approvalEntry = history.find((entry) => entry.action === "approved");
    expect(approvalEntry?.checklist).toEqual(COMPLETE_CHECKLIST);
  });
});

describe("rejected revisions preserve history", () => {
  it("a changes_requested cycle keeps every prior review entry, including the reason, after the version is later approved", async () => {
    const version = await draftWeightedChoiceQuestion();
    await submitQuestionVersionForReview(handle.db, writerId, version.id);

    await requestQuestionVersionChanges(
      handle.db,
      approverId,
      version.id,
      "Pembahasan kurang lengkap, tambahkan alasan bobot.",
    );

    // Writer revises and resubmits - dok 15 §4's own mutable-in-place rule
    // (already proven in QST-001) lets this happen without a new version row.
    await submitQuestionVersionForReview(handle.db, writerId, version.id);
    const approved = await approveQuestionVersion(handle.db, approverId, version.id, COMPLETE_CHECKLIST);
    expect(approved.status).toBe("approved");

    const history = await listQuestionVersionReviewHistory(handle.db, version.id);
    const actions = history.map((entry) => entry.action);
    // The FULL sequence survives - the changes_requested step is never
    // deleted or overwritten by the later approval.
    expect(actions).toEqual([
      "submitted_for_review",
      "changes_requested",
      "submitted_for_review",
      "approved",
    ]);

    const changesRequestedEntry = history.find((entry) => entry.action === "changes_requested");
    expect(changesRequestedEntry?.reason).toBe("Pembahasan kurang lengkap, tambahkan alasan bobot.");
    expect(changesRequestedEntry?.actorUserId).toBe(approverId);
  });

  it("requires a non-empty reason for changes_requested", async () => {
    const version = await draftWeightedChoiceQuestion();
    await submitQuestionVersionForReview(handle.db, writerId, version.id);
    await expect(requestQuestionVersionChanges(handle.db, approverId, version.id, "   ")).rejects.toThrow(
      /reason/i,
    );
  });
});
