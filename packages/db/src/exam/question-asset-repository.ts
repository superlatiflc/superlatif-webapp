// question_assets persistence (QST-001).
//
// dok 21 §8's XOR owner constraint - exactly one of questionVersionId /
// stimulusVersionId - is enforced HERE, at the application layer, matching
// reconciliation_cases' own multiple-optional-FK precedent (COM-003/
// COM-006) rather than a database CHECK constraint. `storageRef` is never
// resolved against a real object-storage/CDN provider anywhere in this
// module - it is stored and returned exactly as opaque as it arrives,
// mirroring assets.ts's (LRN-001) own discipline.

import { and, eq } from "drizzle-orm";
import { assertQuestionVersionMutable } from "@superlatif/domain/exam";
import type { Queryable, Schema } from "../db-types.ts";
import { questionAssets, questionOptions, questionVersions, stimulusVersions } from "../schema/index.ts";

export type QuestionAssetPlacement = "stem" | "option" | "explanation" | "stimulus_body";

export class QuestionAssetOwnerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuestionAssetOwnerError";
  }
}

export interface QuestionAssetRow {
  readonly id: string;
  readonly questionVersionId: string | null;
  readonly stimulusVersionId: string | null;
  readonly placement: string;
  readonly optionCode: string | null;
  readonly storageRef: string;
  readonly mimeType: string | null;
  readonly checksum: string | null;
  readonly altText: string | null;
  readonly imagePurpose: string;
  readonly malwareScanClean: boolean;
}

const QUESTION_ASSET_COLUMNS = {
  id: questionAssets.id,
  questionVersionId: questionAssets.questionVersionId,
  stimulusVersionId: questionAssets.stimulusVersionId,
  placement: questionAssets.placement,
  optionCode: questionAssets.optionCode,
  storageRef: questionAssets.storageRef,
  mimeType: questionAssets.mimeType,
  checksum: questionAssets.checksum,
  altText: questionAssets.altText,
  imagePurpose: questionAssets.imagePurpose,
  malwareScanClean: questionAssets.malwareScanClean,
};

export interface AddQuestionAssetInput {
  readonly questionVersionId?: string | null;
  readonly stimulusVersionId?: string | null;
  readonly placement: QuestionAssetPlacement;
  readonly optionCode?: string | null;
  readonly storageRef: string;
  readonly mimeType?: string | null;
  readonly checksum?: string | null;
  readonly altText?: string | null;
  readonly imagePurpose?: "informative" | "decorative";
}

/**
 * Validates the XOR owner rule, that `optionCode` is set only for
 * `placement = "option"` and (when set) actually references an existing
 * option row on the SAME question version, and that the owning version is
 * still mutable - then inserts. "Image option/assets" required test
 * exercises the `placement = "option"` + `optionCode` path directly.
 */
export async function insertQuestionAsset(
  db: Queryable<Schema>,
  input: AddQuestionAssetInput,
): Promise<QuestionAssetRow> {
  const hasQuestionOwner = input.questionVersionId != null;
  const hasStimulusOwner = input.stimulusVersionId != null;
  if (hasQuestionOwner === hasStimulusOwner) {
    throw new QuestionAssetOwnerError(
      "question_assets must have exactly one owner: questionVersionId XOR stimulusVersionId",
    );
  }
  if (input.optionCode != null && input.placement !== "option") {
    throw new QuestionAssetOwnerError('optionCode may only be set when placement is "option"');
  }

  if (hasQuestionOwner) {
    const versionId = input.questionVersionId as string;
    const [version] = await db
      .select({ status: questionVersions.status })
      .from(questionVersions)
      .where(eq(questionVersions.id, versionId))
      .limit(1);
    if (!version) throw new QuestionAssetOwnerError(`question version ${versionId} not found`);
    assertQuestionVersionMutable(version.status);

    if (input.placement === "option") {
      if (!input.optionCode) {
        throw new QuestionAssetOwnerError('optionCode is required when placement is "option"');
      }
      const [matchingOption] = await db
        .select({ id: questionOptions.id })
        .from(questionOptions)
        .where(
          and(
            eq(questionOptions.questionVersionId, versionId),
            eq(questionOptions.optionCode, input.optionCode),
          ),
        )
        .limit(1);
      if (!matchingOption) {
        throw new QuestionAssetOwnerError(
          `option code "${input.optionCode}" does not exist on question version ${versionId}`,
        );
      }
    }
  } else {
    const versionId = input.stimulusVersionId as string;
    const [version] = await db
      .select({ status: stimulusVersions.status })
      .from(stimulusVersions)
      .where(eq(stimulusVersions.id, versionId))
      .limit(1);
    if (!version) throw new QuestionAssetOwnerError(`stimulus version ${versionId} not found`);
    assertQuestionVersionMutable(version.status);
  }

  const [row] = await db
    .insert(questionAssets)
    .values({
      questionVersionId: input.questionVersionId ?? null,
      stimulusVersionId: input.stimulusVersionId ?? null,
      placement: input.placement,
      optionCode: input.optionCode ?? null,
      storageRef: input.storageRef,
      mimeType: input.mimeType ?? null,
      checksum: input.checksum ?? null,
      altText: input.altText ?? null,
      imagePurpose: input.imagePurpose ?? "informative",
    })
    .returning(QUESTION_ASSET_COLUMNS);
  if (!row) throw new Error("insertQuestionAsset: insert returned no row");
  return row as QuestionAssetRow;
}

export async function listAssetsForQuestionVersion(
  db: Queryable<Schema>,
  questionVersionId: string,
): Promise<readonly QuestionAssetRow[]> {
  const rows = await db
    .select(QUESTION_ASSET_COLUMNS)
    .from(questionAssets)
    .where(eq(questionAssets.questionVersionId, questionVersionId));
  return rows as QuestionAssetRow[];
}

export async function listAssetsForStimulusVersion(
  db: Queryable<Schema>,
  stimulusVersionId: string,
): Promise<readonly QuestionAssetRow[]> {
  const rows = await db
    .select(QUESTION_ASSET_COLUMNS)
    .from(questionAssets)
    .where(eq(questionAssets.stimulusVersionId, stimulusVersionId));
  return rows as QuestionAssetRow[];
}
