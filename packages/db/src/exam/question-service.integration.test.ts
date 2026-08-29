// QST-001 integration tests - exercises the full question/stimulus
// authoring workflow against a real (pglite-backed) Postgres schema,
// covering every case the founder instruction named explicitly:
// no answer leak (domain-level, see @superlatif/domain/exam's
// student-view.test.ts), weighted_choice server-only, version
// immutability, stimulus reuse, image option/assets, invalid option key,
// and published version cannot mutate.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createUser } from "../identity/repository.ts";
import { assignRole, seedCanonicalRoles } from "../authorization/index.ts";
import { createTestDatabase, type TestDatabaseHandle } from "../test-client.ts";
import { AnswerKeyValidationError } from "@superlatif/domain/exam";
import {
  addQuestionAsset,
  addStimulusAsset,
  approveQuestionVersion,
  archiveQuestionVersion,
  createQuestionDraft,
  createStimulusDraft,
  publishQuestionVersion,
  publishStimulusVersion,
  QuestionActionNotAuthorizedError,
  setQuestionAnswerKey,
  setQuestionOptions,
  submitQuestionVersionForReview,
  submitStimulusVersionForReview,
  approveStimulusVersion,
  updateQuestionDraft,
} from "./question-service.ts";
import { QuestionAssetOwnerError } from "./question-asset-repository.ts";
import { findQuestionVersionSecret } from "./question-secret-repository.ts";
import { QuestionVersionLockedError } from "@superlatif/domain/exam";

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

describe("createQuestionDraft - authorization", () => {
  it("denies a plain student (no role) from drafting a question", async () => {
    const student = await createUser(handle.db, {
      emailNormalized: "student@superlatif.id",
      phoneE164: null,
    });
    await expect(
      createQuestionDraft(handle.db, student.userId, {
        questionCode: "Q-DENIED",
        version: 1,
        type: "single_choice",
        stemDocument: { text: "..." },
      }),
    ).rejects.toThrow(QuestionActionNotAuthorizedError);
  });
});

describe("stimulus reuse", () => {
  it("one stimulus_version is linked from multiple question_versions", async () => {
    const stimulus = await createStimulusDraft(handle.db, writerId, {
      stimulusCode: "STM-SHARED",
      version: 1,
      bodyDocument: { text: "Bacaan bersama yang panjang..." },
    });

    const q1 = await createQuestionDraft(handle.db, writerId, {
      questionCode: "Q-SHARED-1",
      version: 1,
      type: "single_choice",
      stimulusVersionId: stimulus.id,
      stemDocument: { text: "Pertanyaan 1 dari bacaan yang sama" },
    });
    const q2 = await createQuestionDraft(handle.db, writerId, {
      questionCode: "Q-SHARED-2",
      version: 1,
      type: "single_choice",
      stimulusVersionId: stimulus.id,
      stemDocument: { text: "Pertanyaan 2 dari bacaan yang sama" },
    });

    expect(q1.stimulusVersionId).toBe(stimulus.id);
    expect(q2.stimulusVersionId).toBe(stimulus.id);
    // The stimulus content itself is never duplicated - both questions
    // reference the identical version row, not a copy.
    expect(q1.stimulusVersionId).toBe(q2.stimulusVersionId);
  });
});

describe("image option / assets", () => {
  it("attaches an image asset to a specific option (placement=option)", async () => {
    const version = await createQuestionDraft(handle.db, writerId, {
      questionCode: "Q-IMG-OPTION",
      version: 1,
      type: "single_choice",
      stemDocument: { text: "Perhatikan gambar pada setiap opsi berikut." },
    });
    await setQuestionOptions(handle.db, writerId, version.id, [
      { optionCode: "A", order: 1, content: { text: "Opsi A" } },
      { optionCode: "B", order: 2, content: { text: "Opsi B" } },
    ]);

    const asset = await addQuestionAsset(handle.db, writerId, {
      questionVersionId: version.id,
      placement: "option",
      optionCode: "A",
      storageRef: "opaque-ref-does-not-resolve",
      mimeType: "image/png",
      altText: "Diagram opsi A",
      imagePurpose: "informative",
    });

    expect(asset.optionCode).toBe("A");
    expect(asset.storageRef).toBe("opaque-ref-does-not-resolve");
  });

  it("rejects an image asset attached to an option code that does not exist on the version", async () => {
    const version = await createQuestionDraft(handle.db, writerId, {
      questionCode: "Q-IMG-BAD-OPTION",
      version: 1,
      type: "single_choice",
      stemDocument: { text: "..." },
    });
    await setQuestionOptions(handle.db, writerId, version.id, [
      { optionCode: "A", order: 1, content: { text: "Opsi A" } },
    ]);

    await expect(
      addQuestionAsset(handle.db, writerId, {
        questionVersionId: version.id,
        placement: "option",
        optionCode: "Z",
        storageRef: "opaque-ref",
      }),
    ).rejects.toThrow(QuestionAssetOwnerError);
  });

  it("rejects an asset with both a question and a stimulus owner (XOR violation)", async () => {
    const stimulus = await createStimulusDraft(handle.db, writerId, {
      stimulusCode: "STM-XOR",
      version: 1,
      bodyDocument: { text: "..." },
    });
    const version = await createQuestionDraft(handle.db, writerId, {
      questionCode: "Q-XOR",
      version: 1,
      type: "single_choice",
      stemDocument: { text: "..." },
    });

    await expect(
      addQuestionAsset(handle.db, writerId, {
        questionVersionId: version.id,
        stimulusVersionId: stimulus.id,
        placement: "stem",
        storageRef: "opaque-ref",
      }),
    ).rejects.toThrow(QuestionAssetOwnerError);
  });

  it("attaches a stimulus_body image asset to a stimulus version", async () => {
    const stimulus = await createStimulusDraft(handle.db, writerId, {
      stimulusCode: "STM-IMG",
      version: 1,
      bodyDocument: { text: "Bacaan dengan gambar pendukung." },
    });
    const asset = await addStimulusAsset(handle.db, writerId, {
      stimulusVersionId: stimulus.id,
      placement: "stimulus_body",
      storageRef: "opaque-stimulus-image-ref",
      imagePurpose: "informative",
    });
    expect(asset.stimulusVersionId).toBe(stimulus.id);
    expect(asset.questionVersionId).toBeNull();
  });
});

describe("invalid option key", () => {
  it("rejects an answer key that references an option code that does not exist", async () => {
    const version = await createQuestionDraft(handle.db, writerId, {
      questionCode: "Q-BAD-KEY",
      version: 1,
      type: "single_choice",
      stemDocument: { text: "..." },
    });
    await setQuestionOptions(handle.db, writerId, version.id, [
      { optionCode: "A", order: 1, content: { text: "Opsi A" } },
      { optionCode: "B", order: 2, content: { text: "Opsi B" } },
    ]);

    await expect(
      setQuestionAnswerKey(handle.db, writerId, version.id, {
        kind: "single_choice",
        correctOptionCode: "Z",
      }),
    ).rejects.toThrow(AnswerKeyValidationError);
  });
});

describe("weighted_choice server-only", () => {
  it("stores option weights in the secret table, never on the question_versions row", async () => {
    const version = await createQuestionDraft(handle.db, writerId, {
      questionCode: "Q-WEIGHTED",
      version: 1,
      type: "weighted_choice",
      stemDocument: { text: "Pilih jawaban dengan bobot tertinggi." },
    });
    await setQuestionOptions(handle.db, writerId, version.id, [
      { optionCode: "A", order: 1, content: { text: "Opsi A" } },
      { optionCode: "B", order: 2, content: { text: "Opsi B" } },
    ]);
    await setQuestionAnswerKey(handle.db, writerId, version.id, {
      kind: "weighted_choice",
      optionWeights: { A: 1, B: 0.25 },
    });

    // question_versions itself never carries the weights - only the
    // classification/stem/explanation content fields (see
    // question-repository.ts's own column list).
    expect(Object.keys(version)).not.toContain("optionWeights");
    expect(Object.keys(version)).not.toContain("answerKey");

    // The ONLY place weights are readable is the dedicated secret
    // repository - an internal/admin/scoring-only path.
    const secret = await findQuestionVersionSecret(handle.db, version.id);
    expect(secret).toEqual({ kind: "weighted_choice", optionWeights: { A: 1, B: 0.25 } });
  });

  it("rejects a weighted_choice answer key missing a weight for a known option", async () => {
    const version = await createQuestionDraft(handle.db, writerId, {
      questionCode: "Q-WEIGHTED-INCOMPLETE",
      version: 1,
      type: "weighted_choice",
      stemDocument: { text: "..." },
    });
    await setQuestionOptions(handle.db, writerId, version.id, [
      { optionCode: "A", order: 1, content: { text: "Opsi A" } },
      { optionCode: "B", order: 2, content: { text: "Opsi B" } },
    ]);

    await expect(
      setQuestionAnswerKey(handle.db, writerId, version.id, {
        kind: "weighted_choice",
        optionWeights: { A: 1 },
      }),
    ).rejects.toThrow(AnswerKeyValidationError);
  });
});

describe("version immutability / published version cannot mutate", () => {
  async function draftReadyQuestion() {
    const version = await createQuestionDraft(handle.db, writerId, {
      questionCode: "Q-LOCK",
      version: 1,
      type: "single_choice",
      stemDocument: { text: "Soal yang akan dipublikasikan." },
    });
    await setQuestionOptions(handle.db, writerId, version.id, [
      { optionCode: "A", order: 1, content: { text: "Opsi A" } },
      { optionCode: "B", order: 2, content: { text: "Opsi B" } },
    ]);
    await setQuestionAnswerKey(handle.db, writerId, version.id, {
      kind: "single_choice",
      correctOptionCode: "A",
    });
    return version;
  }

  it("allows mutation while draft/in_review/changes_requested, and refuses once approved/published/archived", async () => {
    const version = await draftReadyQuestion();

    // Mutable while draft.
    await expect(
      updateQuestionDraft(handle.db, writerId, version.id, { stemDocument: { text: "Revisi soal." } }),
    ).resolves.toBeDefined();

    await submitQuestionVersionForReview(handle.db, writerId, version.id);
    // Still mutable in in_review (dok 15 §4's own rule).
    await expect(
      updateQuestionDraft(handle.db, writerId, version.id, { stemDocument: { text: "Revisi lagi." } }),
    ).resolves.toBeDefined();

    await approveQuestionVersion(handle.db, approverId, version.id);
    // Locked from "approved" onward - before publish even happens.
    await expect(
      updateQuestionDraft(handle.db, writerId, version.id, { stemDocument: { text: "Tidak boleh." } }),
    ).rejects.toThrow(QuestionVersionLockedError);

    await publishQuestionVersion(handle.db, approverId, version.id);
    await expect(
      updateQuestionDraft(handle.db, writerId, version.id, { stemDocument: { text: "Tidak boleh juga." } }),
    ).rejects.toThrow(QuestionVersionLockedError);
    await expect(
      setQuestionOptions(handle.db, writerId, version.id, [{ optionCode: "C", order: 1, content: {} }]),
    ).rejects.toThrow(QuestionVersionLockedError);
    await expect(
      setQuestionAnswerKey(handle.db, writerId, version.id, {
        kind: "single_choice",
        correctOptionCode: "B",
      }),
    ).rejects.toThrow(QuestionVersionLockedError);

    await archiveQuestionVersion(handle.db, approverId, version.id);
    await expect(
      updateQuestionDraft(handle.db, writerId, version.id, { stemDocument: { text: "Tetap tidak boleh." } }),
    ).rejects.toThrow(QuestionVersionLockedError);
  });

  it("refuses maker-checker: the creator cannot approve their own draft", async () => {
    const version = await draftReadyQuestion();
    await submitQuestionVersionForReview(handle.db, writerId, version.id);
    await expect(approveQuestionVersion(handle.db, writerId, version.id)).rejects.toThrow(
      QuestionActionNotAuthorizedError,
    );
  });

  it("locks a stimulus version the same way once published", async () => {
    const stimulus = await createStimulusDraft(handle.db, writerId, {
      stimulusCode: "STM-LOCK",
      version: 1,
      bodyDocument: { text: "Bacaan yang akan dipublikasikan." },
    });
    await submitStimulusVersionForReview(handle.db, writerId, stimulus.id);
    await approveStimulusVersion(handle.db, approverId, stimulus.id);
    await publishStimulusVersion(handle.db, approverId, stimulus.id);

    await expect(
      addStimulusAsset(handle.db, writerId, {
        stimulusVersionId: stimulus.id,
        placement: "stimulus_body",
        storageRef: "opaque-ref",
      }),
    ).rejects.toThrow(QuestionVersionLockedError);
  });
});
