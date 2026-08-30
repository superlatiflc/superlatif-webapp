// Student-facing question preview assembly (QST-003).
//
// dok 12 §29 "A06 — Manual Question Editor" section 8 ("Preview desktop/
// mobile") and dok 12 §31 "A09 — Review Queue" ("Student preview di
// tengah"): a moderator must see EXACTLY what a student would see before
// approving. This module assembles that view by composing QST-001's own
// read functions (question/stimulus/option/asset repositories) and its
// EXISTING serializer, `toStudentFacingQuestionView` - it is the only
// function in this file that ever touches `question_version_secrets`-
// adjacent data, and it never does: this file does not import
// question-secret-repository.ts at all, the same structural guarantee
// QST-001 established for its own student-facing path. "Preview wajib
// pakai toStudentFacingQuestionView" (founder instruction) is met by
// construction - there is no second serializer here, only assembly of that
// one function's input.

import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { toStudentFacingQuestionView, type StudentFacingQuestionView } from "@superlatif/domain/exam";
import type { Schema } from "../db-types.ts";
import {
  listAssetsForQuestionVersion,
  listAssetsForStimulusVersion,
  type QuestionAssetRow,
} from "./question-asset-repository.ts";
import { assertQuestionPermission } from "./question-service.ts";
import { findQuestionById, findQuestionVersionById, listQuestionOptions } from "./question-repository.ts";
import { findStimulusById, findStimulusVersionById } from "./stimulus-repository.ts";

export class QuestionVersionNotFoundForPreviewError extends Error {
  constructor(versionId: string) {
    super(`Question version ${versionId} not found`);
    this.name = "QuestionVersionNotFoundForPreviewError";
  }
}

function toPreviewAsset(asset: QuestionAssetRow) {
  return {
    placement: asset.placement,
    optionCode: asset.optionCode,
    altText: asset.altText,
    imagePurpose: asset.imagePurpose,
    // The asset's own row ID, never `storageRef` - see @superlatif/domain/
    // exam's student-view.ts module doc: `assetId` is deliberately one
    // indirection short of a real, resolvable object-storage reference.
    assetId: asset.id,
  };
}

/**
 * Requires `question.draft.write` - the broadest of the three question
 * permissions, granted to the creator, moderator/reviewer, and admin roles
 * alike (dok 12 A06's preview section belongs to the editor ANY of them can
 * open; A09's center-panel preview is the same read for a reviewer).
 */
export async function buildQuestionPreview(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  actorUserId: string,
  versionId: string,
): Promise<StudentFacingQuestionView> {
  await assertQuestionPermission(db, actorUserId, "question.draft.write");

  const version = await findQuestionVersionById(db, versionId);
  if (!version) throw new QuestionVersionNotFoundForPreviewError(versionId);

  const question = await findQuestionById(db, version.questionId);
  if (!question) throw new QuestionVersionNotFoundForPreviewError(versionId);

  const options = await listQuestionOptions(db, versionId);
  const questionAssets = await listAssetsForQuestionVersion(db, versionId);

  let stimulus: StudentFacingQuestionView["stimulus"] = null;
  let stimulusAssets: readonly QuestionAssetRow[] = [];
  if (version.stimulusVersionId) {
    const stimulusVersion = await findStimulusVersionById(db, version.stimulusVersionId);
    if (stimulusVersion) {
      const stimulusRow = await findStimulusById(db, stimulusVersion.stimulusId);
      if (stimulusRow) {
        stimulus = {
          stimulusCode: stimulusRow.code,
          version: stimulusVersion.version,
          bodyDocument: stimulusVersion.bodyDocument,
        };
        stimulusAssets = await listAssetsForStimulusVersion(db, version.stimulusVersionId);
      }
    }
  }

  return toStudentFacingQuestionView({
    questionCode: question.code,
    version: version.version,
    type: version.type,
    stemDocument: version.stemDocument,
    options: options.map((option) => ({
      optionCode: option.optionCode,
      order: option.order,
      content: option.content,
    })),
    stimulus,
    assets: [...questionAssets, ...stimulusAssets].map(toPreviewAsset),
  });
}
