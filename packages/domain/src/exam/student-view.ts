// Student-facing question serialization (QST-001).
//
// dok 21 §8: "question_version_secrets memisahkan kunci/bobot dari konten
// yang dapat diserialisasi ke siswa." `StudentFacingQuestionInput` below is
// the structural half of that boundary: it has no field an AnswerKey
// (answer-key.ts) or a raw secrets row could ever be assigned to, so a
// caller cannot pass one in even by mistake - the leak this guards against
// is a type error, not a discipline failure the code review has to catch by
// eye.
//
// `assetId` is deliberately an OPAQUE identifier, not the asset's own
// `storageRef` - this task does not build the delivery/resolve mechanism
// (that is later ATM-series scope), so the safest shape to hand a client now
// is one indirection short of the real object-storage reference, matching
// LRN-001/SCH-001's own "never a directly resolvable URL" discipline.

import { toStudentResponseKind, type QuestionType, type StudentResponseKind } from "./question-types.ts";

export interface StudentFacingOption {
  readonly optionCode: string;
  readonly order: number;
  readonly content: Record<string, unknown>;
}

export interface StudentFacingAsset {
  readonly placement: string;
  readonly optionCode: string | null;
  readonly altText: string | null;
  readonly imagePurpose: string;
  readonly assetId: string;
}

export interface StudentFacingStimulus {
  readonly stimulusCode: string;
  readonly version: number;
  readonly bodyDocument: Record<string, unknown>;
}

export interface StudentFacingQuestionView {
  readonly questionCode: string;
  readonly version: number;
  readonly responseKind: StudentResponseKind;
  readonly stimulus: StudentFacingStimulus | null;
  readonly stemDocument: Record<string, unknown>;
  readonly options: readonly StudentFacingOption[];
  readonly assets: readonly StudentFacingAsset[];
}

/**
 * No `answerKey`, `optionWeights`, `checksum`-of-secrets, or any other
 * secret-shaped field exists on this type - see module doc. Everything here
 * is content a student is already allowed to see once an attempt presents
 * this question.
 */
export interface StudentFacingQuestionInput {
  readonly questionCode: string;
  readonly version: number;
  readonly type: QuestionType;
  readonly stemDocument: Record<string, unknown>;
  readonly options: readonly StudentFacingOption[];
  readonly stimulus: StudentFacingStimulus | null;
  readonly assets: readonly StudentFacingAsset[];
}

export function toStudentFacingQuestionView(input: StudentFacingQuestionInput): StudentFacingQuestionView {
  return {
    questionCode: input.questionCode,
    version: input.version,
    responseKind: toStudentResponseKind(input.type),
    stimulus: input.stimulus,
    stemDocument: input.stemDocument,
    options: input.options.map((option) => ({
      optionCode: option.optionCode,
      order: option.order,
      content: option.content,
    })),
    assets: input.assets.map((asset) => ({
      placement: asset.placement,
      optionCode: asset.optionCode,
      altText: asset.altText,
      imagePurpose: asset.imagePurpose,
      assetId: asset.assetId,
    })),
  };
}
