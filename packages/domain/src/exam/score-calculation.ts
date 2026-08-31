// Deterministic component/total/threshold score calculation (SCR-001).
//
// dok 16 §14 "Scoring contract" output list: total/section raw scores,
// max scores, threshold evaluation, unanswered/invalid counts. dok 16
// non-negotiable #9: "Scoring deterministic dan fixture-tested" - this
// module is exactly that: a pure function over already-resolved inputs
// (no clock, no randomness, no DB), directly golden-fixture-tested
// against `test/fixtures/contracts/scoring-skd-synthetic.cases.json`
// (see score-calculation.test.ts). "Same snapshot and answers always
// produce same score" (SCR-001 acceptance) and dok 16 test invariant #6
// ("Scoring sama untuk input checksum yang sama") hold because this
// function has no side channel: the same `ScoringPolicyConfig` +
// `GradedAnswer[]` always produce byte-identical output.
//
// This module never touches an answer KEY or option WEIGHT directly.
// `GradedAnswer.outcome` is the ALREADY-GRADED shape (correct/incorrect/
// weight/blank) - close to the golden fixture's own `{correct: true}` /
// `{selectedWeight: 5}` shape by design, so this file is directly golden-
// fixture-testable without ever needing a real AnswerKey in scope.
// answer-grading.ts (the DB-adjacent bridge) is the only place that reads
// an AnswerKey/AnswerPayload and turns it into this shape; THIS file owns
// turning a graded outcome plus the policy's own `sectionScorers`
// parameters into actual points - the two responsibilities (what did the
// student get right, and what is that worth) stay in separate, separately
// testable functions.

import type { ScoringPolicyConfig, ScoringThresholdRule, SectionScorerConfig } from "./scoring-policy.ts";

export type GradedOutcome =
  | { readonly kind: "binary"; readonly correct: boolean }
  | { readonly kind: "weighted"; readonly weight: number }
  | { readonly kind: "blank" };

export interface GradedAnswer {
  readonly sectionCode: string;
  readonly outcome: GradedOutcome;
}

export interface ScoreComputationResult {
  readonly sectionScores: Readonly<Record<string, number>>;
  readonly sectionMaxScores: Readonly<Record<string, number>>;
  readonly total: number;
  /** Keyed by a stable, deterministic label per rule - see `thresholdRuleKey`. */
  readonly thresholdResults: Readonly<Record<string, boolean>>;
  /** `null` when every threshold rule is `no_threshold` (nothing evaluable) - not `false`, which would misrepresent "not applicable" as "failed". */
  readonly overallPassed: boolean | null;
  readonly unansweredCount: number;
  /** Structurally near-unreachable (every `GradedAnswer` this module receives is already known-valid by construction - see answer-grading.ts) but tracked defensively per dok 16 §14's own output list. */
  readonly invalidCount: number;
}

export class UnknownScorerSectionError extends Error {
  constructor(readonly sectionCode: string) {
    super(
      `GradedAnswer references section "${sectionCode}" which has no sectionMaxScores entry in the policy`,
    );
    this.name = "UnknownScorerSectionError";
  }
}

export class MissingSectionScorerError extends Error {
  constructor(readonly sectionCode: string) {
    super(`Policy has no sectionScorers entry for section "${sectionCode}" - cannot compute points`);
    this.name = "MissingSectionScorerError";
  }
}

export class ScorerOutcomeKindMismatchError extends Error {
  constructor(
    readonly sectionCode: string,
    readonly scorerKind: SectionScorerConfig["kind"],
    readonly outcomeKind: GradedOutcome["kind"],
  ) {
    super(
      `Section "${sectionCode}" scorer is "${scorerKind}" but received a "${outcomeKind}" graded outcome`,
    );
    this.name = "ScorerOutcomeKindMismatchError";
  }
}

/** Stable, deterministic key for one threshold rule's evaluated result - used as the `thresholdResults` map key so the SAME policy always produces the SAME key set. */
function thresholdRuleKey(rule: ScoringThresholdRule, index: number): string {
  switch (rule.kind) {
    case "section_score_gte":
      return `section_score_gte:${rule.sectionCode}`;
    case "selected_section_minimum":
      return `selected_section_minimum:${rule.sectionCode}`;
    case "total_score_gte":
      return "total_score_gte";
    case "no_threshold":
      return `no_threshold:${index}`;
  }
}

function evaluateRule(
  rule: ScoringThresholdRule,
  sectionScores: Readonly<Record<string, number>>,
  total: number,
): boolean | null {
  switch (rule.kind) {
    case "no_threshold":
      return null;
    case "total_score_gte":
      return total >= (rule.value ?? 0);
    case "section_score_gte":
      return (sectionScores[rule.sectionCode ?? ""] ?? 0) >= (rule.value ?? 0);
    case "selected_section_minimum":
      // MVP scope (dok 17 §12): treated identically to section_score_gte -
      // "selected" (elective section choice) is not modeled by any
      // blueprint this codebase builds yet. Kept as its own rule kind
      // (not merged into section_score_gte) so a future elective-section
      // feature can specialize this branch without a vocabulary change.
      return (sectionScores[rule.sectionCode ?? ""] ?? 0) >= (rule.value ?? 0);
  }
}

/** Resolves ONE graded outcome to its awarded points, using that section's own scorer parameters (dok 16 §15's own per-section adapter). */
function resolvePoints(sectionCode: string, outcome: GradedOutcome, scorer: SectionScorerConfig): number {
  if (outcome.kind === "blank") return scorer.blankScore;
  if (outcome.kind === "binary") {
    if (scorer.kind !== "binary_choice") {
      throw new ScorerOutcomeKindMismatchError(sectionCode, scorer.kind, outcome.kind);
    }
    return outcome.correct ? scorer.correctScore : scorer.incorrectScore;
  }
  // outcome.kind === "weighted"
  if (scorer.kind !== "weighted_option") {
    throw new ScorerOutcomeKindMismatchError(sectionCode, scorer.kind, outcome.kind);
  }
  return outcome.weight;
}

/**
 * Pure, deterministic computation. `gradedAnswers` may include multiple
 * entries per section (one per question) - scores accumulate per section.
 * A section present in `policy.sectionMaxScores` with NO graded answers
 * at all still appears in the output at score 0 (never omitted - a
 * caller comparing two computations structurally needs a stable key
 * set).
 */
export function computeScore(
  policy: ScoringPolicyConfig,
  gradedAnswers: readonly GradedAnswer[],
): ScoreComputationResult {
  const sectionScores: Record<string, number> = {};
  for (const code of Object.keys(policy.sectionMaxScores)) sectionScores[code] = 0;

  let unansweredCount = 0;
  const invalidCount = 0; // see ScoreComputationResult's own doc: tracked defensively, never actually incremented by this pure reducer.

  for (const answer of gradedAnswers) {
    if (!(answer.sectionCode in policy.sectionMaxScores)) {
      throw new UnknownScorerSectionError(answer.sectionCode);
    }
    const scorer = policy.sectionScorers?.[answer.sectionCode];
    if (!scorer) throw new MissingSectionScorerError(answer.sectionCode);

    if (answer.outcome.kind === "blank") unansweredCount += 1;
    const points = resolvePoints(answer.sectionCode, answer.outcome, scorer);
    sectionScores[answer.sectionCode] = (sectionScores[answer.sectionCode] ?? 0) + points;
  }

  const total = Object.values(sectionScores).reduce((sum, value) => sum + value, 0);

  const thresholdResults: Record<string, boolean> = {};
  const evaluableResults: boolean[] = [];
  policy.thresholds.forEach((rule, index) => {
    const result = evaluateRule(rule, sectionScores, total);
    if (result === null) return; // no_threshold contributes no key, no evaluable result
    thresholdResults[thresholdRuleKey(rule, index)] = result;
    evaluableResults.push(result);
  });

  const overallPassed = evaluableResults.length === 0 ? null : evaluableResults.every(Boolean);

  return {
    sectionScores,
    sectionMaxScores: policy.sectionMaxScores,
    total,
    thresholdResults,
    overallPassed,
    unansweredCount,
    invalidCount,
  };
}
