// Golden-fixture test against test/fixtures/contracts/
// scoring-skd-synthetic.cases.json (SCR-001's required "Golden scoring
// fixtures" test) - read directly via node:fs since packages/domain
// cannot depend on @superlatif/testing (ADR-042 layering:
// scripts/check-workspace-boundaries.mjs's ALLOWED_INTERNAL only lets
// `domain` depend on `contracts`). Cases SCR-SYN-001/002/003 exercise
// computeScore's own pure component/total/threshold math directly; case
// SCR-SYN-004 ("Recompute stays pinned to snapshot policy") is a DB/
// service-layer scenario about WHICH policy version gets used, not a
// pure-function input - covered instead by packages/db/src/exam/scoring/
// scoring-service.integration.test.ts's own "Policy-version regression"
// test.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { computeScore, type GradedAnswer, type GradedOutcome } from "./score-calculation.ts";
import type { ScoringPolicyConfig, SectionScorerConfig } from "./scoring-policy.ts";

interface FixtureComponentConfig {
  readonly type: "binary" | "weighted_option";
  readonly correct?: number;
  readonly incorrect?: number;
  readonly blank: number;
}

interface FixtureAnswer {
  readonly questionId: string;
  readonly component: string;
  readonly correct?: boolean;
  readonly selectedWeight?: number | null;
}

interface FixtureCase {
  readonly id: string;
  readonly answers: readonly FixtureAnswer[];
  readonly expected: {
    readonly components?: Record<string, number>;
    readonly total: number;
    readonly thresholdsPassed?: Record<string, boolean>;
    readonly overallPassed?: boolean;
  };
}

const fixturePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../test/fixtures/contracts/scoring-skd-synthetic.cases.json",
);
const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as {
  readonly evidenceClass: string;
  readonly productionEligible: boolean;
  readonly policy: {
    readonly components: Record<string, FixtureComponentConfig>;
    readonly thresholds: Record<string, number>;
  };
  readonly cases: readonly FixtureCase[];
};

// Arbitrary, generous placeholders - "maximum attainable score" is not an
// `expected` field in this fixture set, so any positive value satisfies
// ScoringPolicyConfig's requirement without affecting any assertion below.
const SECTION_MAX_SCORES: Record<string, number> = { COGNITIVE: 100, SITUATIONAL: 100 };

function buildPolicyFromFixture(): ScoringPolicyConfig {
  const sectionScorers: Record<string, SectionScorerConfig> = {};
  for (const [code, config] of Object.entries(fixture.policy.components)) {
    sectionScorers[code] =
      config.type === "binary"
        ? {
            kind: "binary_choice",
            correctScore: config.correct!,
            incorrectScore: config.incorrect!,
            blankScore: config.blank,
          }
        : { kind: "weighted_option", blankScore: config.blank };
  }
  return {
    sectionMaxScores: SECTION_MAX_SCORES,
    thresholds: Object.entries(fixture.policy.thresholds).map(([sectionCode, value]) => ({
      kind: "section_score_gte" as const,
      sectionCode,
      value,
    })),
    sectionScorers,
  };
}

function toGradedAnswers(answers: readonly FixtureAnswer[]): GradedAnswer[] {
  return answers.map((answer): GradedAnswer => {
    let outcome: GradedOutcome;
    if (answer.correct !== undefined) {
      outcome = { kind: "binary", correct: answer.correct };
    } else if (answer.selectedWeight === null || answer.selectedWeight === undefined) {
      outcome = { kind: "blank" };
    } else {
      outcome = { kind: "weighted", weight: answer.selectedWeight };
    }
    return { sectionCode: answer.component, outcome };
  });
}

describe("computeScore - golden fixture (scoring-skd-synthetic.cases.json)", () => {
  it("the fixture set is synthetic and non-production-eligible", () => {
    // Sanity check on the fixture ITSELF before trusting it as golden data -
    // dok 17 §4/§17: fixture numbers test the engine, never claim regulation.
    expect(fixture.evidenceClass).toBe("synthetic");
    expect(fixture.productionEligible).toBe(false);
  });

  const policy = buildPolicyFromFixture();

  for (const testCase of fixture.cases.filter((c) => c.id !== "SCR-SYN-004")) {
    it(`${testCase.id}: matches the fixture's own expected component/total/threshold output`, () => {
      const result = computeScore(policy, toGradedAnswers(testCase.answers));

      if (testCase.expected.components) {
        for (const [component, expectedScore] of Object.entries(testCase.expected.components)) {
          expect(result.sectionScores[component]).toBe(expectedScore);
        }
      }
      expect(result.total).toBe(testCase.expected.total);
      if (testCase.expected.thresholdsPassed) {
        for (const [component, expectedPassed] of Object.entries(testCase.expected.thresholdsPassed)) {
          expect(result.thresholdResults[`section_score_gte:${component}`]).toBe(expectedPassed);
        }
      }
      if (testCase.expected.overallPassed !== undefined) {
        expect(result.overallPassed).toBe(testCase.expected.overallPassed);
      }
    });
  }

  it("Recompute equality: computing the SAME policy+answers twice produces byte-identical output", () => {
    const answers = toGradedAnswers(fixture.cases[0]!.answers);
    const first = computeScore(policy, answers);
    const second = computeScore(policy, answers);
    expect(second).toStrictEqual(first);
  });

  it("a section with zero graded answers still reports score 0, not omitted", () => {
    const result = computeScore(policy, []);
    expect(result.sectionScores).toStrictEqual({ COGNITIVE: 0, SITUATIONAL: 0 });
    expect(result.total).toBe(0);
    expect(result.unansweredCount).toBe(0);
  });

  it("counts blank (unanswered) outcomes and awards each its own blankScore", () => {
    const result = computeScore(policy, [
      { sectionCode: "COGNITIVE", outcome: { kind: "blank" } },
      { sectionCode: "SITUATIONAL", outcome: { kind: "blank" } },
    ]);
    expect(result.unansweredCount).toBe(2);
    expect(result.sectionScores).toStrictEqual({ COGNITIVE: 0, SITUATIONAL: 0 });
  });

  it("overallPassed is null (not false) when every threshold rule is no_threshold", () => {
    const noThresholdPolicy: ScoringPolicyConfig = { ...policy, thresholds: [{ kind: "no_threshold" }] };
    const result = computeScore(noThresholdPolicy, toGradedAnswers(fixture.cases[0]!.answers));
    expect(result.overallPassed).toBeNull();
    expect(result.thresholdResults).toStrictEqual({});
  });
});
