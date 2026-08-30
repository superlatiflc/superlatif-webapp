// Initial section navigation state (ATM-001).
//
// dok 16 §12: "Navigation policy: free, section_restricted, atau
// forward_only." `contracts/openapi.yaml`'s own `AttemptSection.
// navigationState` enum (`available|current|completed|locked`) is
// transcribed verbatim. This module computes the INITIAL state at
// start/resume for an attempt with no recorded answers yet (this task
// builds no answer-save path) - `completed` never appears here, since
// nothing about "answered" exists for this task to consult; a future
// answer-save task recomputes this same shape once section-completion
// state actually exists.

export type SectionNavigationState = "available" | "current" | "completed" | "locked";

export interface BlueprintSectionInput {
  readonly code: string;
  readonly order: number;
}

export interface AttemptSectionNavigationView {
  readonly code: string;
  readonly navigationState: SectionNavigationState;
}

/**
 * `forward_only`: only the first (lowest-order) section is reachable yet -
 * every other section is `locked` until this task's future answer-save/
 * navigation counterpart advances it. `free`/`section_restricted`: every
 * section is at least `available` from the start (their difference is a
 * navigation-ACTION rule for a later task, not an initial-state rule this
 * function needs to encode).
 */
export function computeInitialSectionNavigationStates(
  sections: readonly BlueprintSectionInput[],
  sectionLockMode: string,
): readonly AttemptSectionNavigationView[] {
  const sorted = [...sections].sort((a, b) => a.order - b.order);
  return sorted.map((section, index) => {
    if (index === 0) return { code: section.code, navigationState: "current" };
    if (sectionLockMode === "forward_only") return { code: section.code, navigationState: "locked" };
    return { code: section.code, navigationState: "available" };
  });
}
