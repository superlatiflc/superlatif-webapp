// Scoring policy shape and structure cross-reference (EXM-001; `kind`
// "binary_choice"/"weighted_option" scorer vocabulary and its own
// structure cross-check added by SCR-001).
//
// dok 17 §12 "Threshold engine": "Rule divalidasi terhadap section IDs dan
// maximum scores." This module is that validator - it never invents a
// passing-grade NUMBER (dok 17 §17 "Prohibited implementation": "Hardcode
// passing grade in UI... Reuse previous-year threshold automatically"), it
// only checks that whatever numbers a specific policy VERSION happens to
// carry as synthetic/draft data are structurally consistent with the
// blueprint structure it will be paired with - every section a threshold
// or a maximum-score entry references must actually exist.
//
// `sectionScorers` (SCR-001) is OPTIONAL and additive: every scoring
// policy config written before this task (EXM-001/ATM-002/ATM-003's own
// test fixtures) has no such field and remains fully valid - only a
// config that actually declares scorers gets the new consistency check.
// dok 17 §11's own "Scorer types" table lists seven kinds; SCR-004's own
// requirement scope ("SKD mendukung binary cognitive score dan weighted
// situational option") narrows what THIS task implements to exactly two -
// multiple_choice/true_false/numeric/negative-marking/external-scaled
// scorers stay future work, deliberately not stubbed out here.

import type { BlueprintStructure } from "./blueprint-structure.ts";

export type ScoringThresholdKind =
  "section_score_gte" | "total_score_gte" | "selected_section_minimum" | "no_threshold";

export interface ScoringThresholdRule {
  readonly kind: ScoringThresholdKind;
  /** Required for "section_score_gte" and "selected_section_minimum". */
  readonly sectionCode?: string;
  /** Required for "section_score_gte" and "total_score_gte". */
  readonly value?: number;
}

/**
 * Per-section scorer parameters (dok 17 §2 "scorer per section/question
 * type", dok 16 §15 "SKD scoring adapter"). Uniform across every question
 * in the section - the golden fixture (`test/fixtures/contracts/
 * scoring-skd-synthetic.cases.json`) models exactly this shape
 * (`components.COGNITIVE`/`components.SITUATIONAL`, one flat config per
 * component, not per question). The actual correct-option/option-weight
 * DATA never lives here - it stays in `question_version_secrets`
 * (QST-001) and is read only by the scorer at compute time; this is
 * purely the point-value/behavior parameters.
 */
export type SectionScorerConfig =
  | {
      readonly kind: "binary_choice";
      readonly correctScore: number;
      readonly incorrectScore: number;
      readonly blankScore: number;
    }
  | {
      readonly kind: "weighted_option";
      /** The selected option's own weight (question_version_secrets' `optionWeights`) is what's awarded - this only supplies the unanswered fallback. */
      readonly blankScore: number;
    };

export interface ScoringPolicyConfig {
  /** Section code -> maximum attainable score for that section (dok 17 §2 "maximum/minimum"). Synthetic/draft numbers only in this task - see module doc. */
  readonly sectionMaxScores: Readonly<Record<string, number>>;
  readonly thresholds: readonly ScoringThresholdRule[];
  /** Section code -> scorer parameters (SCR-001). Optional for backward compatibility with pre-SCR-001 policy configs that never intended to be scored by this engine. */
  readonly sectionScorers?: Readonly<Record<string, SectionScorerConfig>>;
}

export class ScoringPolicyInconsistentError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(
      `Scoring policy is inconsistent with the blueprint structure:\n${issues.map((issue) => `  - ${issue}`).join("\n")}`,
    );
    this.name = "ScoringPolicyInconsistentError";
  }
}

export function assertScoringPolicyConsistentWithStructure(
  policy: ScoringPolicyConfig,
  structure: BlueprintStructure,
): void {
  const issues: string[] = [];
  const sectionCodes = new Set(structure.sections.map((section) => section.code));

  for (const section of structure.sections) {
    if (!(section.code in policy.sectionMaxScores)) {
      issues.push(`section "${section.code}" has no maximum score in the scoring policy`);
    }
  }
  for (const code of Object.keys(policy.sectionMaxScores)) {
    if (!sectionCodes.has(code)) {
      issues.push(`scoring policy names maximum score for unknown section "${code}"`);
    }
    if (policy.sectionMaxScores[code]! <= 0) {
      issues.push(`section "${code}" maximum score must be positive`);
    }
  }

  for (const rule of policy.thresholds) {
    if (
      (rule.kind === "section_score_gte" || rule.kind === "selected_section_minimum") &&
      !rule.sectionCode
    ) {
      issues.push(`threshold rule "${rule.kind}" requires a sectionCode`);
    } else if (rule.sectionCode && !sectionCodes.has(rule.sectionCode)) {
      issues.push(`threshold rule references unknown section "${rule.sectionCode}"`);
    }
    if ((rule.kind === "section_score_gte" || rule.kind === "total_score_gte") && rule.value === undefined) {
      issues.push(`threshold rule "${rule.kind}" requires a value`);
    }
  }

  if (policy.sectionScorers) {
    for (const code of Object.keys(policy.sectionScorers)) {
      if (!sectionCodes.has(code)) {
        issues.push(`scoring policy declares a scorer for unknown section "${code}"`);
      }
    }
    for (const section of structure.sections) {
      const scorer = policy.sectionScorers[section.code];
      if (!scorer) continue; // a section may legitimately have no scorer wired yet (draft policy)
      if (scorer.kind === "binary_choice" && !section.allowedQuestionTypes.includes("single_choice")) {
        issues.push(
          `section "${section.code}" is configured with a binary_choice scorer but does not allow single_choice questions`,
        );
      }
      if (scorer.kind === "weighted_option" && !section.allowedQuestionTypes.includes("weighted_choice")) {
        issues.push(
          `section "${section.code}" is configured with a weighted_option scorer but does not allow weighted_choice questions`,
        );
      }
    }
  }

  if (issues.length > 0) throw new ScoringPolicyInconsistentError(issues);
}
