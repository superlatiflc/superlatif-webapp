// Scoring policy shape and structure cross-reference (EXM-001).
//
// dok 17 §12 "Threshold engine": "Rule divalidasi terhadap section IDs dan
// maximum scores." This module is that validator - it never invents a
// passing-grade NUMBER (dok 17 §17 "Prohibited implementation": "Hardcode
// passing grade in UI... Reuse previous-year threshold automatically"), it
// only checks that whatever numbers a specific policy VERSION happens to
// carry as synthetic/draft data are structurally consistent with the
// blueprint structure it will be paired with - every section a threshold
// or a maximum-score entry references must actually exist.

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

export interface ScoringPolicyConfig {
  /** Section code -> maximum attainable score for that section (dok 17 §2 "maximum/minimum"). Synthetic/draft numbers only in this task - see module doc. */
  readonly sectionMaxScores: Readonly<Record<string, number>>;
  readonly thresholds: readonly ScoringThresholdRule[];
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

  if (issues.length > 0) throw new ScoringPolicyInconsistentError(issues);
}
