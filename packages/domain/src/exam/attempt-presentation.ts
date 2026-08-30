// Deterministic presented question/option order (ATM-001).
//
// dok 16 §6 "Deterministic presentation": "Ranked MVP tidak memilih
// question dari pool" - question order is exactly the pinned form's own
// (sectionCode, order) sequence, never reshuffled or resampled.
// `contracts/exam-blueprint.schema.json`'s own `presentation.questionOrder`
// is a JSON Schema CONST "fixed" (not even an enum with alternatives) -
// this module transcribes that as a hard requirement, not a policy choice.
//
// `presentation.optionOrder` DOES have two contract values, `"fixed"` and
// `"question_policy"` - only `"fixed"` is implemented here.
// `"question_policy"` would mean a PER-QUESTION shuffle flag/seed, and no
// such field has ever been defined anywhere in this codebase's
// `question_versions.classification` (QST-001's own free-form JSONB) or
// any later task - rather than guess at an undefined shape, this module
// fails closed with `UnsupportedOptionOrderPolicyError`. The HMAC/secure-
// seed shuffle mechanism dok 16 §6 describes is consequently NOT built
// here either; it has nothing to seed yet.

export class UnsupportedOptionOrderPolicyError extends Error {
  constructor(readonly optionOrder: string) {
    super(
      `optionOrder "${optionOrder}" is not supported - only "fixed" is implemented (no per-question shuffle policy shape is defined anywhere in this codebase yet)`,
    );
    this.name = "UnsupportedOptionOrderPolicyError";
  }
}

export interface PresentationPolicy {
  readonly questionOrder: string;
  readonly optionOrder: string;
}

/** Fails closed on anything this module cannot faithfully implement - see module doc. Call this BEFORE generating a presentation, not after. */
export function assertSupportedPresentationPolicy(policy: PresentationPolicy): void {
  if (policy.questionOrder !== "fixed") {
    throw new Error(
      `questionOrder "${policy.questionOrder}" is not supported - contracts/exam-blueprint.schema.json only allows "fixed"`,
    );
  }
  if (policy.optionOrder !== "fixed") {
    throw new UnsupportedOptionOrderPolicyError(policy.optionOrder);
  }
}

export interface FormItemInput {
  readonly sectionCode: string;
  readonly order: number;
  readonly questionVersionId: string;
}

/** A question's own stored option/statement codes, in their STORED order - the source `presentedOptionOrder` is built from under `optionOrder="fixed"`. `null` for question types with neither (numeric). */
export interface QuestionChoiceCodesInput {
  readonly questionVersionId: string;
  readonly codes: readonly string[] | null;
}

export interface PresentedInstance {
  readonly sequence: number;
  readonly sectionCode: string;
  readonly order: number;
  readonly questionVersionId: string;
  readonly presentedOptionOrder: readonly string[] | null;
}

/**
 * Builds the full presented-instance list for one attempt. `formItems` MUST
 * already be the pinned form's own full item set - this function does not
 * select a subset or a pool; every item becomes exactly one instance,
 * ordered by `sectionCodesInOrder` (the BLUEPRINT's own declared section
 * sequence - e.g. TWK before TKP - since `exam_form_items` only stores a
 * position WITHIN each section, not a cross-section sequence number) and
 * then by each item's own `order` within its section. This matches dok 16
 * §6's "Same attempt always resumes the same presentation" (this function
 * is called exactly once, at start, and its output is persisted - never
 * recomputed at resume).
 */
export function buildPresentedInstances(
  formItems: readonly FormItemInput[],
  sectionCodesInOrder: readonly string[],
  choiceCodesByQuestionVersionId: ReadonlyMap<string, readonly string[] | null>,
): readonly PresentedInstance[] {
  const sectionRank = new Map(sectionCodesInOrder.map((code, index) => [code, index]));
  const rankOf = (sectionCode: string): number => sectionRank.get(sectionCode) ?? Number.MAX_SAFE_INTEGER;

  const sorted = [...formItems].sort((a, b) => {
    const rankDiff = rankOf(a.sectionCode) - rankOf(b.sectionCode);
    if (rankDiff !== 0) return rankDiff;
    return a.order - b.order;
  });

  return sorted.map((item, index) => {
    const codes = choiceCodesByQuestionVersionId.get(item.questionVersionId) ?? null;
    return {
      sequence: index + 1,
      sectionCode: item.sectionCode,
      order: item.order,
      questionVersionId: item.questionVersionId,
      presentedOptionOrder: codes,
    };
  });
}
