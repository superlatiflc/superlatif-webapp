import { describe, expect, it } from "vitest";
import { computeInitialSectionNavigationStates } from "./attempt-navigation.ts";

const sections = [
  { code: "TKP", order: 2 },
  { code: "TWK", order: 1 },
];

describe("computeInitialSectionNavigationStates", () => {
  it("forward_only: only the first section (by order) is current, the rest are locked", () => {
    const states = computeInitialSectionNavigationStates(sections, "forward_only");
    expect(states).toEqual([
      { code: "TWK", navigationState: "current" },
      { code: "TKP", navigationState: "locked" },
    ]);
  });

  it("free: every non-first section is available, not locked", () => {
    const states = computeInitialSectionNavigationStates(sections, "free");
    expect(states).toEqual([
      { code: "TWK", navigationState: "current" },
      { code: "TKP", navigationState: "available" },
    ]);
  });

  it("section_restricted: same initial shape as free", () => {
    const states = computeInitialSectionNavigationStates(sections, "section_restricted");
    expect(states.map((s) => s.navigationState)).toEqual(["current", "available"]);
  });
});
