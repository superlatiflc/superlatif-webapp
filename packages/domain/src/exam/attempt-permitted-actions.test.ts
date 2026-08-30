import { describe, expect, it } from "vitest";
import { computePermittedActions } from "./attempt-permitted-actions.ts";

describe("computePermittedActions", () => {
  it("in_progress + held_here: full write actions, no takeover", () => {
    const actions = computePermittedActions("in_progress", "held_here");
    expect(actions).toContain("answer");
    expect(actions).toContain("flag");
    expect(actions).toContain("submit");
    expect(actions).toContain("navigate");
    expect(actions).toContain("report_question");
    expect(actions).not.toContain("takeover_writer");
    expect(actions).not.toContain("view_result");
  });

  it("in_progress + held_elsewhere: no write actions, takeover offered instead", () => {
    const actions = computePermittedActions("in_progress", "held_elsewhere");
    expect(actions).not.toContain("answer");
    expect(actions).not.toContain("submit");
    expect(actions).toContain("takeover_writer");
    expect(actions).toContain("navigate");
  });

  it("in_progress + expired: treated the same as held_elsewhere - takeover offered, no write actions", () => {
    const actions = computePermittedActions("in_progress", "expired");
    expect(actions).not.toContain("answer");
    expect(actions).toContain("takeover_writer");
  });

  it("scored: only view_result, nothing else", () => {
    expect(computePermittedActions("scored", "expired")).toEqual(["view_result"]);
  });

  it("voided: no permitted actions at all", () => {
    expect(computePermittedActions("voided", "expired")).toEqual([]);
  });
});
