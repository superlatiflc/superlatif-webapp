// Exam family/blueprint/scoring-policy/form authoring orchestration
// (EXM-001).
//
// Composes @superlatif/domain/authorization's authorize() with the
// repositories in this folder, the SAME structural pattern QST-001's own
// question-service.ts already uses (assertExamConfigPermission mirrors
// assertQuestionPermission exactly). New permission codes
// (`exam.blueprint.draft.write`/`first_approve`/`publish`) were added to
// permissions.ts for this task - see that file's own module doc for why
// dok 24 §6's table has no pre-existing row to reuse here, unlike
// question.* (QST-001) or live.occurrence.manage (SCH-001).
//
// A blueprint version's own `config.scoringPolicyRef` (code+version+
// checksum, contracts/exam-blueprint.schema.json) is what actually pairs a
// blueprint to a scoring policy - not an independently caller-supplied ID.
// `approveExamBlueprintVersion` RESOLVES that reference against a real,
// published scoring_policy_versions row (verifying its checksum matches,
// referential integrity AJV alone cannot check) and runs the full
// publication validator, including the scoring/structure cross-reference,
// at that point - the earliest point the two are actually linked.
// `createExamFormDraft` reuses that same resolution to DERIVE the form's
// scoring policy pairing from the blueprint it pins, rather than trusting
// an independent caller-supplied value that could disagree with what the
// blueprint itself declares.

import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { authorize } from "@superlatif/domain/authorization";
import {
  assertBlueprintVersionPublishable,
  assertExamFormComposable,
  type BlueprintScoringPolicyRef,
  type BlueprintStructure,
  type RecordStatus,
  type ResolvedExamFormItem,
  type ScoringPolicyConfig,
} from "@superlatif/domain/exam";
import type { Schema } from "../../db-types.ts";
import { listActiveRoleHoldings } from "../../authorization/index.ts";
import { findQuestionVersionById } from "../question-repository.ts";
import { findOrCreateExamFamily, type ExamFamilyRow } from "./exam-family-repository.ts";
import {
  createExamBlueprintVersionDraft,
  findExamBlueprintVersionById,
  findOrCreateExamBlueprint,
  transitionExamBlueprintVersionStatus,
  updateExamBlueprintVersionDraft,
  type ExamBlueprintVersionRow,
} from "./exam-blueprint-repository.ts";
import {
  createScoringPolicyVersionDraft,
  findOrCreateScoringPolicy,
  findScoringPolicyByCode,
  findScoringPolicyVersionByPolicyAndVersion,
  transitionScoringPolicyVersionStatus,
  updateScoringPolicyVersionDraft,
  type ScoringPolicyVersionRow,
} from "./scoring-policy-repository.ts";
import {
  createExamFormVersionDraft,
  findExamFormVersionById,
  findOrCreateExamForm,
  listExamFormItems,
  replaceExamFormItems,
  transitionExamFormVersionStatus,
  type ExamFormVersionRow,
  type ReplaceExamFormItemInput,
} from "./exam-form-repository.ts";

export class ExamConfigActionNotAuthorizedError extends Error {
  constructor(readonly reasonCode: string) {
    super(`Exam configuration action not authorized: ${reasonCode}`);
    this.name = "ExamConfigActionNotAuthorizedError";
  }
}

export class ExamConfigReasonRequiredError extends Error {
  constructor() {
    super("A non-empty reason is required for this action");
    this.name = "ExamConfigReasonRequiredError";
  }
}

export class ExamFormPrerequisiteNotPublishedError extends Error {
  constructor(
    readonly artifactKind: "blueprint_version" | "scoring_policy_version",
    readonly status: string,
  ) {
    super(`An exam form can only pair a PUBLISHED ${artifactKind} (found status "${status}")`);
    this.name = "ExamFormPrerequisiteNotPublishedError";
  }
}

export class ScoringPolicyRefUnresolvedError extends Error {
  constructor(
    readonly ref: BlueprintScoringPolicyRef,
    readonly reason: "not_found" | "not_published" | "checksum_mismatch",
  ) {
    super(`Blueprint's scoringPolicyRef (${ref.code} v${ref.version}) could not be resolved: ${reason}`);
    this.name = "ScoringPolicyRefUnresolvedError";
  }
}

type ExamConfigPermission =
  "exam.blueprint.draft.write" | "exam.blueprint.first_approve" | "exam.blueprint.publish";

async function assertExamConfigPermission(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  actorUserId: string,
  permission: ExamConfigPermission,
  creatorUserId?: string,
): Promise<void> {
  const roles = await listActiveRoleHoldings(db, actorUserId);
  const decision = authorize({
    actor: { userId: actorUserId, roles },
    action: { type: permission, permission },
    ...(creatorUserId !== undefined ? { object: { creatorUserId } } : {}),
  });
  if (!decision.allowed) throw new ExamConfigActionNotAuthorizedError(decision.reasonCode);
}

/** Resolves a blueprint's embedded `scoringPolicyRef` against a real, PUBLISHED scoring_policy_versions row, verifying the checksum actually matches - the one piece of referential integrity AJV's string-pattern check on `checksum` cannot provide. */
async function resolvePublishedScoringPolicyRef(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  ref: BlueprintScoringPolicyRef,
): Promise<ScoringPolicyVersionRow> {
  const policy = await findScoringPolicyByCode(db, ref.code);
  const version = policy
    ? await findScoringPolicyVersionByPolicyAndVersion(db, policy.id, ref.version)
    : null;
  if (!version) throw new ScoringPolicyRefUnresolvedError(ref, "not_found");
  if (version.status !== "published") throw new ScoringPolicyRefUnresolvedError(ref, "not_published");
  if (version.checksum !== ref.checksum) throw new ScoringPolicyRefUnresolvedError(ref, "checksum_mismatch");
  return version;
}

function structureFromConfig(config: Record<string, unknown>): BlueprintStructure {
  return { sections: config["sections"], timing: config["timing"] } as unknown as BlueprintStructure;
}

// ---------------------------------------------------------------------------
// Exam family (dok 21 §9: stable code/name/activation state - no version).
// ---------------------------------------------------------------------------

export async function ensureExamFamily(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  actorUserId: string,
  input: { code: string; title: string },
): Promise<ExamFamilyRow> {
  await assertExamConfigPermission(db, actorUserId, "exam.blueprint.draft.write");
  return findOrCreateExamFamily(db, input);
}

// ---------------------------------------------------------------------------
// Blueprint.
// ---------------------------------------------------------------------------

export interface CreateExamBlueprintDraftInput {
  readonly blueprintCode: string;
  readonly examFamilyCode: string;
  readonly examFamilyTitle: string;
  readonly version: number;
  /** The FULL document defined by contracts/exam-blueprint.schema.json - validated by AJV inside createExamBlueprintVersionDraft, not by this function. */
  readonly config: Record<string, unknown>;
}

export async function createExamBlueprintDraft(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  actorUserId: string,
  input: CreateExamBlueprintDraftInput,
): Promise<ExamBlueprintVersionRow> {
  await assertExamConfigPermission(db, actorUserId, "exam.blueprint.draft.write");
  const family = await findOrCreateExamFamily(db, {
    code: input.examFamilyCode,
    title: input.examFamilyTitle,
  });
  const blueprint = await findOrCreateExamBlueprint(db, {
    code: input.blueprintCode,
    examFamilyId: family.id,
  });
  return createExamBlueprintVersionDraft(db, {
    blueprintId: blueprint.id,
    version: input.version,
    activationScope: input.config["activationScope"] as never,
    title: input.config["title"] as string,
    config: input.config,
    createdByUserId: actorUserId,
  });
}

export async function updateExamBlueprintDraft(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  actorUserId: string,
  versionId: string,
  config: Record<string, unknown>,
): Promise<ExamBlueprintVersionRow> {
  await assertExamConfigPermission(db, actorUserId, "exam.blueprint.draft.write");
  return updateExamBlueprintVersionDraft(db, versionId, config);
}

export async function submitExamBlueprintVersionForReview(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  actorUserId: string,
  versionId: string,
): Promise<ExamBlueprintVersionRow> {
  await assertExamConfigPermission(db, actorUserId, "exam.blueprint.draft.write");
  return transitionExamBlueprintVersionStatus(db, versionId, "in_review", new Date());
}

export async function requestExamBlueprintVersionChanges(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  actorUserId: string,
  versionId: string,
  reason: string,
): Promise<ExamBlueprintVersionRow> {
  if (!reason.trim()) throw new ExamConfigReasonRequiredError();
  await assertExamConfigPermission(db, actorUserId, "exam.blueprint.first_approve");
  return transitionExamBlueprintVersionStatus(db, versionId, "changes_requested", new Date());
}

/**
 * Resolves `config.scoringPolicyRef` against a real, published scoring
 * policy version and runs the FULL fail-closed publication check
 * (structure/timing/activation-scope/scoring cross-reference) - the
 * earliest point the blueprint and its scoring policy are actually linked,
 * since the blueprint's own document is what carries that reference.
 */
export async function approveExamBlueprintVersion(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  actorUserId: string,
  versionId: string,
): Promise<ExamBlueprintVersionRow> {
  const version = await findExamBlueprintVersionById(db, versionId);
  if (!version) throw new Error(`approveExamBlueprintVersion: exam blueprint version ${versionId} not found`);
  await assertExamConfigPermission(
    db,
    actorUserId,
    "exam.blueprint.first_approve",
    version.createdByUserId ?? undefined,
  );

  const scoringPolicyRef = version.config["scoringPolicyRef"] as BlueprintScoringPolicyRef;
  const scoringPolicyVersion = await resolvePublishedScoringPolicyRef(db, scoringPolicyRef);

  assertBlueprintVersionPublishable({
    structure: structureFromConfig(version.config),
    scoringPolicy: scoringPolicyVersion.policyConfig as unknown as ScoringPolicyConfig,
    activationScope: version.activationScope,
  });

  return transitionExamBlueprintVersionStatus(db, versionId, "approved", new Date());
}

export async function publishExamBlueprintVersion(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  actorUserId: string,
  versionId: string,
): Promise<ExamBlueprintVersionRow> {
  await assertExamConfigPermission(db, actorUserId, "exam.blueprint.publish");
  return transitionExamBlueprintVersionStatus(db, versionId, "published", new Date());
}

export async function archiveExamBlueprintVersion(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  actorUserId: string,
  versionId: string,
): Promise<ExamBlueprintVersionRow> {
  await assertExamConfigPermission(db, actorUserId, "exam.blueprint.publish");
  return transitionExamBlueprintVersionStatus(db, versionId, "archived", new Date());
}

// ---------------------------------------------------------------------------
// Scoring policy.
// ---------------------------------------------------------------------------

export interface CreateScoringPolicyDraftInput {
  readonly scoringPolicyCode: string;
  readonly version: number;
  readonly policyConfig: Record<string, unknown>;
}

export async function createScoringPolicyDraft(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  actorUserId: string,
  input: CreateScoringPolicyDraftInput,
): Promise<ScoringPolicyVersionRow> {
  await assertExamConfigPermission(db, actorUserId, "exam.blueprint.draft.write");
  const policy = await findOrCreateScoringPolicy(db, input.scoringPolicyCode);
  return createScoringPolicyVersionDraft(db, {
    scoringPolicyId: policy.id,
    version: input.version,
    policyConfig: input.policyConfig,
    createdByUserId: actorUserId,
  });
}

export async function updateScoringPolicyDraft(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  actorUserId: string,
  versionId: string,
  policyConfig: Record<string, unknown>,
): Promise<ScoringPolicyVersionRow> {
  await assertExamConfigPermission(db, actorUserId, "exam.blueprint.draft.write");
  return updateScoringPolicyVersionDraft(db, versionId, policyConfig);
}

export async function submitScoringPolicyVersionForReview(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  actorUserId: string,
  versionId: string,
): Promise<ScoringPolicyVersionRow> {
  await assertExamConfigPermission(db, actorUserId, "exam.blueprint.draft.write");
  return transitionScoringPolicyVersionStatus(db, versionId, "in_review", new Date());
}

export async function approveScoringPolicyVersion(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  actorUserId: string,
  versionId: string,
): Promise<ScoringPolicyVersionRow> {
  await assertExamConfigPermission(db, actorUserId, "exam.blueprint.first_approve");
  return transitionScoringPolicyVersionStatus(db, versionId, "approved", new Date());
}

export async function publishScoringPolicyVersion(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  actorUserId: string,
  versionId: string,
): Promise<ScoringPolicyVersionRow> {
  await assertExamConfigPermission(db, actorUserId, "exam.blueprint.publish");
  return transitionScoringPolicyVersionStatus(db, versionId, "published", new Date());
}

export async function archiveScoringPolicyVersion(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  actorUserId: string,
  versionId: string,
): Promise<ScoringPolicyVersionRow> {
  await assertExamConfigPermission(db, actorUserId, "exam.blueprint.publish");
  return transitionScoringPolicyVersionStatus(db, versionId, "archived", new Date());
}

// ---------------------------------------------------------------------------
// Exam form.
// ---------------------------------------------------------------------------

export interface CreateExamFormDraftInput {
  readonly examFormCode: string;
  readonly version: number;
  readonly blueprintVersionId: string;
}

/**
 * Requires the blueprint version to already be `published`, and DERIVES
 * the form's scoring-policy pairing from that blueprint's own
 * `config.scoringPolicyRef` (re-resolved and re-verified here, not merely
 * trusted from approval time) - a form can never pair a scoring policy
 * independent of what its own blueprint declares.
 */
export async function createExamFormDraft(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  actorUserId: string,
  input: CreateExamFormDraftInput,
): Promise<ExamFormVersionRow> {
  await assertExamConfigPermission(db, actorUserId, "exam.blueprint.draft.write");

  const blueprintVersion = await findExamBlueprintVersionById(db, input.blueprintVersionId);
  if (!blueprintVersion)
    throw new Error(`createExamFormDraft: blueprint version ${input.blueprintVersionId} not found`);
  if (blueprintVersion.status !== "published") {
    throw new ExamFormPrerequisiteNotPublishedError("blueprint_version", blueprintVersion.status);
  }

  const scoringPolicyRef = blueprintVersion.config["scoringPolicyRef"] as BlueprintScoringPolicyRef;
  const scoringPolicyVersion = await resolvePublishedScoringPolicyRef(db, scoringPolicyRef);

  const form = await findOrCreateExamForm(db, input.examFormCode);
  return createExamFormVersionDraft(db, {
    examFormId: form.id,
    version: input.version,
    blueprintVersionId: input.blueprintVersionId,
    scoringPolicyVersionId: scoringPolicyVersion.id,
    createdByUserId: actorUserId,
  });
}

export async function setExamFormItems(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  actorUserId: string,
  examFormVersionId: string,
  items: readonly ReplaceExamFormItemInput[],
) {
  await assertExamConfigPermission(db, actorUserId, "exam.blueprint.draft.write");
  return replaceExamFormItems(db, examFormVersionId, items);
}

export async function submitExamFormVersionForReview(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  actorUserId: string,
  versionId: string,
): Promise<ExamFormVersionRow> {
  await assertExamConfigPermission(db, actorUserId, "exam.blueprint.draft.write");
  return transitionExamFormVersionStatus(db, versionId, "in_review", new Date());
}

export async function requestExamFormVersionChanges(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  actorUserId: string,
  versionId: string,
  reason: string,
): Promise<ExamFormVersionRow> {
  if (!reason.trim()) throw new ExamConfigReasonRequiredError();
  await assertExamConfigPermission(db, actorUserId, "exam.blueprint.first_approve");
  return transitionExamFormVersionStatus(db, versionId, "changes_requested", new Date());
}

/**
 * Form composition ONLY (every item's section/type/PUBLISHED status,
 * per-section counts) - the blueprint/scoring cross-reference already ran
 * at `approveExamBlueprintVersion` time and cannot have changed since
 * (the blueprint is published/immutable by the time any form can
 * reference it).
 */
export async function approveExamFormVersion(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  actorUserId: string,
  versionId: string,
): Promise<ExamFormVersionRow> {
  const formVersion = await findExamFormVersionById(db, versionId);
  if (!formVersion) throw new Error(`approveExamFormVersion: exam form version ${versionId} not found`);
  await assertExamConfigPermission(db, actorUserId, "exam.blueprint.first_approve");

  const blueprintVersion = await findExamBlueprintVersionById(db, formVersion.blueprintVersionId);
  if (!blueprintVersion)
    throw new Error(`approveExamFormVersion: blueprint version ${formVersion.blueprintVersionId} not found`);

  const structure = structureFromConfig(blueprintVersion.config);
  const items = await listExamFormItems(db, versionId);
  const resolvedItems: ResolvedExamFormItem[] = [];
  for (const item of items) {
    const questionVersion = await findQuestionVersionById(db, item.questionVersionId);
    if (!questionVersion) {
      throw new Error(`approveExamFormVersion: question version ${item.questionVersionId} not found`);
    }
    resolvedItems.push({
      sectionCode: item.sectionCode,
      order: item.order,
      questionVersionId: item.questionVersionId,
      questionType: questionVersion.type,
      questionVersionStatus: questionVersion.status,
    });
  }
  assertExamFormComposable(resolvedItems, structure);

  return transitionExamFormVersionStatus(db, versionId, "approved", new Date());
}

export async function publishExamFormVersion(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  actorUserId: string,
  versionId: string,
): Promise<ExamFormVersionRow> {
  await assertExamConfigPermission(db, actorUserId, "exam.blueprint.publish");
  return transitionExamFormVersionStatus(db, versionId, "published", new Date());
}

export async function archiveExamFormVersion(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  actorUserId: string,
  versionId: string,
): Promise<ExamFormVersionRow> {
  await assertExamConfigPermission(db, actorUserId, "exam.blueprint.publish");
  return transitionExamFormVersionStatus(db, versionId, "archived", new Date());
}

export type { RecordStatus };
