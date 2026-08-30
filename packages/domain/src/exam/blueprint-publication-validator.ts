// The blueprint publication validator (EXM-001) - "Publication validator
// harus fail-closed kalau policy tidak konsisten" (founder instruction).
//
// By the time this runs, `config` has ALREADY passed AJV validation
// against contracts/exam-blueprint.schema.json (every draft write is
// validated - packages/db/src/exam/config/exam-blueprint-repository.ts),
// so structural shape, required fields, enums, patterns, and consts are
// already guaranteed. This function checks ONLY what that schema's own
// annotation says JSON Schema cannot express portably: section-code
// uniqueness, the per-section timing sum, and (optionally) the scoring
// policy cross-reference - plus the ONE hard, code-level ceiling nothing
// in the schema can express at all: `activationScope` may never reach
// `production` through this task's code paths. Any single failing check
// throws immediately - fail-closed, no "warn and continue" path.

import { assertActivationScopeNotProduction, type ActivationScope } from "./activation-scope.ts";
import { assertSectionCodesUnique, type BlueprintStructure } from "./blueprint-structure.ts";
import { assertBlueprintTimingConsistent } from "./blueprint-timing-validator.ts";
import { assertScoringPolicyConsistentWithStructure, type ScoringPolicyConfig } from "./scoring-policy.ts";

export interface AssertBlueprintPublishableInput {
  readonly structure: BlueprintStructure;
  /**
   * Optional: a blueprint version's own `config.scoringPolicyRef` names a
   * scoring policy by code+version+checksum, but this function is never
   * the place that RESOLVES that reference against a real database row
   * (it is pure, no I/O) - the service layer resolves the referenced
   * scoring policy version and passes its config in here once resolved.
   * Omit to run the blueprint-only checks (no scoring cross-reference).
   */
  readonly scoringPolicy?: ScoringPolicyConfig;
  readonly activationScope: ActivationScope;
}

export function assertBlueprintVersionPublishable(input: AssertBlueprintPublishableInput): void {
  assertActivationScopeNotProduction(input.activationScope);
  assertSectionCodesUnique(input.structure.sections);
  assertBlueprintTimingConsistent(input.structure);
  if (input.scoringPolicy) {
    assertScoringPolicyConsistentWithStructure(input.scoringPolicy, input.structure);
  }
}
