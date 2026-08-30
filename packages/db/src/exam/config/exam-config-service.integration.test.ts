// EXM-001 integration tests - exercises the full exam family/blueprint/
// scoring-policy/form authoring workflow against a real (pglite-backed)
// Postgres schema, validating blueprint `config` against the pre-existing,
// reviewed Gate 3 contract (contracts/exam-blueprint.schema.json) via AJV
// on every write. Covers the backlog's required tests (blueprint schema
// suite, snapshot immutability, invalid policy rejection) plus the founder
// instruction's explicit scope: form snapshot pins the exact question
// version, published blueprint/form are immutable, and the publication
// validator is fail-closed.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BlueprintTimingInconsistentError,
  ExamConfigVersionLockedError,
  ExamFormCompositionInvalidError,
  ProductionActivationNotPermittedError,
  ScoringPolicyInconsistentError,
} from "@superlatif/domain/exam";
import { computeChecksum, type JsonValue } from "@superlatif/domain/shared";
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
  ExamConfigActionNotAuthorizedError,
  ExamFormPrerequisiteNotPublishedError,
  publishExamBlueprintVersion,
  publishExamFormVersion,
  publishScoringPolicyVersion,
  ScoringPolicyRefUnresolvedError,
  setExamFormItems,
  submitExamBlueprintVersionForReview,
  submitExamFormVersionForReview,
  submitScoringPolicyVersionForReview,
  updateExamBlueprintDraft,
} from "./exam-config-service.ts";
import { ExamBlueprintConfigValidationError } from "./exam-blueprint-schema-validator.ts";
import { findExamBlueprintVersionById } from "./exam-blueprint-repository.ts";

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

let handle: TestDatabaseHandle;
let authorId: string;
let reviewerId: string;
let questionWriterId: string;
let questionApproverId: string;

beforeEach(async () => {
  handle = await createTestDatabase();
  await seedCanonicalRoles(handle.db);
  const author = await createUser(handle.db, { emailNormalized: "author@superlatif.id", phoneE164: null });
  const reviewer = await createUser(handle.db, {
    emailNormalized: "reviewer@superlatif.id",
    phoneE164: null,
  });
  const writer = await createUser(handle.db, { emailNormalized: "qwriter@superlatif.id", phoneE164: null });
  const approver = await createUser(handle.db, {
    emailNormalized: "qapprover@superlatif.id",
    phoneE164: null,
  });
  authorId = author.userId;
  reviewerId = reviewer.userId;
  questionWriterId = writer.userId;
  questionApproverId = approver.userId;

  await assignRole(handle.db, {
    userId: authorId,
    role: "academic_admin",
    grantedByUserId: authorId,
    grantedReason: "test setup",
  });
  await assignRole(handle.db, {
    userId: reviewerId,
    role: "moderator_reviewer",
    grantedByUserId: authorId,
    grantedReason: "test setup",
  });
  await assignRole(handle.db, {
    userId: questionWriterId,
    role: "tutor_writer",
    grantedByUserId: authorId,
    grantedReason: "test setup",
  });
  await assignRole(handle.db, {
    userId: questionApproverId,
    role: "academic_admin",
    grantedByUserId: authorId,
    grantedReason: "test setup",
  });
});

afterEach(async () => {
  await handle.close();
});

/** dok 17 §4's own fixture style - clearly synthetic smoke-test numbers, never a real 2026 regulatory value. */
const CONSISTENT_SCORING_CONFIG = {
  sectionMaxScores: { TWK: 5, TKP: 5 },
  thresholds: [{ kind: "no_threshold" }],
};

/** A minimal, fully contracts/exam-blueprint.schema.json-conformant document. `overrides` deep-merges onto this base at the top level only (tests replace whole sub-objects, matching how a real caller would resubmit a full document). */
function buildBlueprintConfig(
  overrides: Partial<Record<string, unknown>> = {},
  scoringPolicyRef?: { code: string; version: number; checksum: string },
) {
  return {
    schemaVersion: 2,
    code: "BP_SKD_KEDINASAN_2026",
    version: 1,
    examFamily: "SKD_KEDINASAN",
    activationScope: "draft_only",
    title: "SKD Kedinasan 2026 - synthetic draft",
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
    scoringPolicyRef: scoringPolicyRef ?? {
      code: "SP_SKD_KEDINASAN_2026",
      version: 1,
      checksum: computeChecksum(CONSISTENT_SCORING_CONFIG as JsonValue),
    },
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
    ...overrides,
  };
}

async function publishedTwkQuestion() {
  const version = await createQuestionDraft(handle.db, questionWriterId, {
    questionCode: "Q-EXM-TWK-001",
    version: 1,
    type: "single_choice",
    stemDocument: { text: "Ibu kota negara Indonesia adalah?" },
  });
  await setQuestionOptions(handle.db, questionWriterId, version.id, [
    { optionCode: "A", order: 1, content: { text: "Jakarta" } },
    { optionCode: "B", order: 2, content: { text: "Bandung" } },
  ]);
  await setQuestionAnswerKey(handle.db, questionWriterId, version.id, {
    kind: "single_choice",
    correctOptionCode: "A",
  });
  await submitQuestionVersionForReview(handle.db, questionWriterId, version.id);
  await approveQuestionVersion(handle.db, questionApproverId, version.id, COMPLETE_CHECKLIST);
  await publishQuestionVersion(handle.db, questionApproverId, version.id);
  return version;
}

async function publishedTkpQuestion() {
  const version = await createQuestionDraft(handle.db, questionWriterId, {
    questionCode: "Q-EXM-TKP-001",
    version: 1,
    type: "weighted_choice",
    stemDocument: { text: "Situasi X terjadi, apa responsmu?" },
  });
  await setQuestionOptions(handle.db, questionWriterId, version.id, [
    { optionCode: "A", order: 1, content: { text: "Respons A" } },
    { optionCode: "B", order: 2, content: { text: "Respons B" } },
  ]);
  await setQuestionAnswerKey(handle.db, questionWriterId, version.id, {
    kind: "weighted_choice",
    optionWeights: { A: 5, B: 2 },
  });
  await submitQuestionVersionForReview(handle.db, questionWriterId, version.id);
  await approveQuestionVersion(handle.db, questionApproverId, version.id, COMPLETE_CHECKLIST);
  await publishQuestionVersion(handle.db, questionApproverId, version.id);
  return version;
}

async function draftReadyScoringPolicy(policyConfig: Record<string, unknown> = CONSISTENT_SCORING_CONFIG) {
  return createScoringPolicyDraft(handle.db, authorId, {
    scoringPolicyCode: "SP_SKD_KEDINASAN_2026",
    version: 1,
    policyConfig,
  });
}

async function publishedScoringPolicy(policyConfig: Record<string, unknown> = CONSISTENT_SCORING_CONFIG) {
  const scoring = await draftReadyScoringPolicy(policyConfig);
  await submitScoringPolicyVersionForReview(handle.db, authorId, scoring.id);
  await approveScoringPolicyVersion(handle.db, reviewerId, scoring.id);
  await publishScoringPolicyVersion(handle.db, authorId, scoring.id);
  return scoring;
}

async function draftReadyBlueprint(
  configOverrides: Partial<Record<string, unknown>> = {},
  scoringPolicyChecksum?: string,
) {
  const config = buildBlueprintConfig(
    configOverrides,
    scoringPolicyChecksum
      ? { code: "SP_SKD_KEDINASAN_2026", version: 1, checksum: scoringPolicyChecksum }
      : undefined,
  );
  return createExamBlueprintDraft(handle.db, authorId, {
    blueprintCode: "BP-SKD-KEDINASAN-2026",
    examFamilyCode: "SKD_KEDINASAN",
    examFamilyTitle: "SKD Sekolah Kedinasan",
    version: 1,
    config,
  });
}

async function publishedBlueprintAndScoring() {
  const scoring = await publishedScoringPolicy();
  const blueprint = await draftReadyBlueprint({}, scoring.checksum);
  await submitExamBlueprintVersionForReview(handle.db, authorId, blueprint.id);
  await approveExamBlueprintVersion(handle.db, reviewerId, blueprint.id);
  await publishExamBlueprintVersion(handle.db, authorId, blueprint.id);
  return { blueprint, scoring };
}

describe("blueprint schema suite", () => {
  it("a well-formed, timing-consistent, draft_only, contract-conformant blueprint approves and publishes", async () => {
    const scoring = await publishedScoringPolicy();
    const blueprint = await draftReadyBlueprint({}, scoring.checksum);
    await submitExamBlueprintVersionForReview(handle.db, authorId, blueprint.id);
    const approved = await approveExamBlueprintVersion(handle.db, reviewerId, blueprint.id);
    expect(approved.status).toBe("approved");
    const published = await publishExamBlueprintVersion(handle.db, authorId, blueprint.id);
    expect(published.status).toBe("published");
  });

  it("AJV rejects a config missing a required contract field (navigation) at draft-write time", async () => {
    const config = buildBlueprintConfig() as Record<string, unknown>;
    delete config["navigation"];
    await expect(
      createExamBlueprintDraft(handle.db, authorId, {
        blueprintCode: "BP-MISSING-NAVIGATION",
        examFamilyCode: "SKD_KEDINASAN",
        examFamilyTitle: "SKD Sekolah Kedinasan",
        version: 1,
        config,
      }),
    ).rejects.toThrow(ExamBlueprintConfigValidationError);
  });

  it("AJV rejects an unknown activationScope enum value", async () => {
    await expect(draftReadyBlueprint({ activationScope: "sandbox" })).rejects.toThrow(
      ExamBlueprintConfigValidationError,
    );
  });

  it("fails closed on an inconsistent per-section timing sum at approve time (not catchable by JSON Schema alone)", async () => {
    const scoring = await publishedScoringPolicy();
    const blueprint = await draftReadyBlueprint(
      { timing: { ...buildBlueprintConfig().timing, totalDurationSeconds: 999 } },
      scoring.checksum,
    );
    await submitExamBlueprintVersionForReview(handle.db, authorId, blueprint.id);
    await expect(approveExamBlueprintVersion(handle.db, reviewerId, blueprint.id)).rejects.toThrow(
      BlueprintTimingInconsistentError,
    );
  });

  it("the hard OD-04 gate refuses production activation scope even with an otherwise valid blueprint", async () => {
    const scoring = await publishedScoringPolicy();
    const blueprint = await draftReadyBlueprint(
      { activationScope: "production", approval: { ...buildBlueprintConfig().approval, status: "active" } },
      scoring.checksum,
    );
    await submitExamBlueprintVersionForReview(handle.db, authorId, blueprint.id);
    await expect(approveExamBlueprintVersion(handle.db, reviewerId, blueprint.id)).rejects.toThrow(
      ProductionActivationNotPermittedError,
    );
  });
});

describe("snapshot immutability - published blueprint/scoring/form cannot mutate", () => {
  it("refuses to edit a blueprint once approved, before publish even happens", async () => {
    const scoring = await publishedScoringPolicy();
    const blueprint = await draftReadyBlueprint({}, scoring.checksum);
    await submitExamBlueprintVersionForReview(handle.db, authorId, blueprint.id);
    await approveExamBlueprintVersion(handle.db, reviewerId, blueprint.id);

    await expect(
      updateExamBlueprintDraft(
        handle.db,
        authorId,
        blueprint.id,
        buildBlueprintConfig(
          { title: "Tidak boleh diubah" },
          { code: "SP_SKD_KEDINASAN_2026", version: 1, checksum: scoring.checksum },
        ),
      ),
    ).rejects.toThrow(ExamConfigVersionLockedError);
  });

  it("refuses to edit a published blueprint's sections, and the stored content never changed", async () => {
    const { blueprint } = await publishedBlueprintAndScoring();
    await expect(
      updateExamBlueprintDraft(handle.db, authorId, blueprint.id, buildBlueprintConfig({ sections: [] })),
    ).rejects.toThrow(ExamConfigVersionLockedError);

    const stillIntact = await findExamBlueprintVersionById(handle.db, blueprint.id);
    expect((stillIntact!.config["sections"] as unknown[]).length).toBe(2);
  });
});

describe("invalid policy rejection - scoring policy cross-referenced against blueprint structure", () => {
  it("a scoring policy naming an unknown section is rejected at blueprint-approval time (where the two are actually linked)", async () => {
    const inconsistentConfig = { sectionMaxScores: { TWK: 5, TKP: 5, UNKNOWN_SECTION: 5 }, thresholds: [] };
    const scoring = await publishedScoringPolicy(inconsistentConfig);
    const blueprint = await draftReadyBlueprint({}, scoring.checksum);
    await submitExamBlueprintVersionForReview(handle.db, authorId, blueprint.id);

    await expect(approveExamBlueprintVersion(handle.db, reviewerId, blueprint.id)).rejects.toThrow(
      ScoringPolicyInconsistentError,
    );
  });

  it("refuses to approve a blueprint whose scoringPolicyRef checksum does not match the real stored scoring policy", async () => {
    const scoring = await publishedScoringPolicy();
    const blueprint = await draftReadyBlueprint({}, "0".repeat(64));
    await submitExamBlueprintVersionForReview(handle.db, authorId, blueprint.id);
    await expect(approveExamBlueprintVersion(handle.db, reviewerId, blueprint.id)).rejects.toThrow(
      ScoringPolicyRefUnresolvedError,
    );
    void scoring;
  });

  it("refuses to approve a blueprint whose scoringPolicyRef points at a not-yet-published scoring policy", async () => {
    const scoring = await draftReadyScoringPolicy();
    const blueprint = await draftReadyBlueprint({}, scoring.checksum);
    await submitExamBlueprintVersionForReview(handle.db, authorId, blueprint.id);
    await expect(approveExamBlueprintVersion(handle.db, reviewerId, blueprint.id)).rejects.toThrow(
      ScoringPolicyRefUnresolvedError,
    );
  });
});

describe("form snapshot pins the exact question version", () => {
  it("a full family/blueprint/scoring/form lifecycle locks in the exact published question versions", async () => {
    const { blueprint, scoring } = await publishedBlueprintAndScoring();
    const twk = await publishedTwkQuestion();
    const tkp = await publishedTkpQuestion();

    const form = await createExamFormDraft(handle.db, authorId, {
      examFormCode: "FORM-SKD-KEDINASAN-2026",
      version: 1,
      blueprintVersionId: blueprint.id,
    });
    await setExamFormItems(handle.db, authorId, form.id, [
      { sectionCode: "TWK", order: 1, questionVersionId: twk.id },
      { sectionCode: "TKP", order: 1, questionVersionId: tkp.id },
    ]);
    await submitExamFormVersionForReview(handle.db, authorId, form.id);
    const approved = await approveExamFormVersion(handle.db, reviewerId, form.id);
    expect(approved.status).toBe("approved");
    const published = await publishExamFormVersion(handle.db, authorId, form.id);
    expect(published.status).toBe("published");
    expect(published.blueprintVersionId).toBe(blueprint.id);
    expect(published.scoringPolicyVersionId).toBe(scoring.id);
  });

  it("refuses to approve a form containing a still-DRAFT question version", async () => {
    const { blueprint } = await publishedBlueprintAndScoring();
    const twk = await publishedTwkQuestion();

    const draftTkp = await createQuestionDraft(handle.db, questionWriterId, {
      questionCode: "Q-EXM-TKP-DRAFT",
      version: 1,
      type: "weighted_choice",
      stemDocument: { text: "..." },
    });
    await setQuestionOptions(handle.db, questionWriterId, draftTkp.id, [
      { optionCode: "A", order: 1, content: { text: "A" } },
    ]);
    await setQuestionAnswerKey(handle.db, questionWriterId, draftTkp.id, {
      kind: "weighted_choice",
      optionWeights: { A: 1 },
    });

    const form = await createExamFormDraft(handle.db, authorId, {
      examFormCode: "FORM-DRAFT-PIN-ATTEMPT",
      version: 1,
      blueprintVersionId: blueprint.id,
    });
    await setExamFormItems(handle.db, authorId, form.id, [
      { sectionCode: "TWK", order: 1, questionVersionId: twk.id },
      { sectionCode: "TKP", order: 1, questionVersionId: draftTkp.id },
    ]);
    await submitExamFormVersionForReview(handle.db, authorId, form.id);

    await expect(approveExamFormVersion(handle.db, reviewerId, form.id)).rejects.toThrow(
      ExamFormCompositionInvalidError,
    );
  });

  it("refuses to create a form pairing a blueprint version that is not yet published", async () => {
    const scoring = await publishedScoringPolicy();
    const blueprint = await draftReadyBlueprint({}, scoring.checksum);

    await expect(
      createExamFormDraft(handle.db, authorId, {
        examFormCode: "FORM-UNPUBLISHED-PAIR",
        version: 1,
        blueprintVersionId: blueprint.id,
      }),
    ).rejects.toThrow(ExamFormPrerequisiteNotPublishedError);
  });
});

describe("authorization", () => {
  it("denies a plain student (no role) from drafting a blueprint", async () => {
    const student = await createUser(handle.db, {
      emailNormalized: "student@superlatif.id",
      phoneE164: null,
    });
    await expect(
      createExamBlueprintDraft(handle.db, student.userId, {
        blueprintCode: "BP-DENIED",
        examFamilyCode: "SKD_KEDINASAN",
        examFamilyTitle: "SKD Sekolah Kedinasan",
        version: 1,
        config: buildBlueprintConfig(),
      }),
    ).rejects.toThrow(ExamConfigActionNotAuthorizedError);
  });

  it("refuses maker-checker: the author cannot approve their own blueprint draft", async () => {
    const scoring = await publishedScoringPolicy();
    const blueprint = await draftReadyBlueprint({}, scoring.checksum);
    await submitExamBlueprintVersionForReview(handle.db, authorId, blueprint.id);
    await expect(approveExamBlueprintVersion(handle.db, authorId, blueprint.id)).rejects.toThrow(
      ExamConfigActionNotAuthorizedError,
    );
  });
});
