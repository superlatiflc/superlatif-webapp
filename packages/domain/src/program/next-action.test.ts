import { describe, expect, it } from "vitest";
import { resolveNextAction, type NextActionCandidate } from "./next-action.ts";

function candidate(
  overrides: Partial<NextActionCandidate> & Pick<NextActionCandidate, "id" | "reasonCode">,
): NextActionCandidate {
  return {
    title: overrides.id,
    programId: "program-1",
    deadlineOrStartAt: null,
    isRequired: true,
    roadmapOrder: null,
    ...overrides,
  };
}

describe("resolveNextAction", () => {
  it("returns null for an empty candidate list - the caller must show the achieved-milestones fallback, never a blank page", () => {
    expect(resolveNextAction([])).toBeNull();
  });

  it("picks the single candidate when there is only one", () => {
    const only = candidate({ id: "a", reasonCode: "ROADMAP_NEXT" });
    expect(resolveNextAction([only])).toEqual({ candidate: only, reasonCode: "ROADMAP_NEXT" });
  });

  it("follows dok 09 §5's priority order regardless of input order", () => {
    const live = candidate({ id: "live", reasonCode: "LIVE_NOW" });
    const deadline = candidate({ id: "deadline", reasonCode: "DEADLINE_SOON" });
    const resume = candidate({ id: "resume", reasonCode: "RESUME_IN_PROGRESS" });
    const required24h = candidate({ id: "required24h", reasonCode: "REQUIRED_WITHIN_24H" });
    const roadmap = candidate({ id: "roadmap", reasonCode: "ROADMAP_NEXT" });
    const remediation = candidate({ id: "remediation", reasonCode: "RESULT_REMEDIATION" });
    const optional = candidate({ id: "optional", reasonCode: "OPTIONAL_RECOMMENDATION" });

    const all = [optional, remediation, roadmap, required24h, resume, deadline, live];
    expect(resolveNextAction(all)?.reasonCode).toBe("LIVE_NOW");
    expect(resolveNextAction(all.filter((c) => c.reasonCode !== "LIVE_NOW"))?.reasonCode).toBe(
      "DEADLINE_SOON",
    );
    expect(resolveNextAction([resume, required24h, roadmap, remediation, optional])?.reasonCode).toBe(
      "RESUME_IN_PROGRESS",
    );
    expect(resolveNextAction([required24h, roadmap, remediation, optional])?.reasonCode).toBe(
      "REQUIRED_WITHIN_24H",
    );
    expect(resolveNextAction([roadmap, remediation, optional])?.reasonCode).toBe("ROADMAP_NEXT");
    expect(resolveNextAction([remediation, optional])?.reasonCode).toBe("RESULT_REMEDIATION");
    expect(resolveNextAction([optional])?.reasonCode).toBe("OPTIONAL_RECOMMENDATION");
  });

  it("tie-break 1: within the same priority, nearest deadline/start wins", () => {
    const soon = candidate({
      id: "soon",
      reasonCode: "DEADLINE_SOON",
      deadlineOrStartAt: new Date("2026-08-29T10:00:00Z"),
    });
    const later = candidate({
      id: "later",
      reasonCode: "DEADLINE_SOON",
      deadlineOrStartAt: new Date("2026-08-29T18:00:00Z"),
    });
    expect(resolveNextAction([later, soon])?.candidate.id).toBe("soon");
  });

  it("a candidate with a deadline beats one without, at the same priority", () => {
    const withDeadline = candidate({
      id: "with",
      reasonCode: "DEADLINE_SOON",
      deadlineOrStartAt: new Date("2026-08-29T10:00:00Z"),
    });
    const withoutDeadline = candidate({
      id: "without",
      reasonCode: "DEADLINE_SOON",
      deadlineOrStartAt: null,
    });
    expect(resolveNextAction([withoutDeadline, withDeadline])?.candidate.id).toBe("with");
  });

  it("tie-break 2: required beats optional when deadlines are equal", () => {
    const required = candidate({ id: "required", reasonCode: "ROADMAP_NEXT", isRequired: true });
    const optional = candidate({ id: "optional", reasonCode: "ROADMAP_NEXT", isRequired: false });
    expect(resolveNextAction([optional, required])?.candidate.id).toBe("required");
  });

  it("tie-break 3: roadmap order ascending, unknown order sorts last", () => {
    const later = candidate({ id: "later", reasonCode: "ROADMAP_NEXT", roadmapOrder: 5 });
    const earlier = candidate({ id: "earlier", reasonCode: "ROADMAP_NEXT", roadmapOrder: 1 });
    const unknown = candidate({ id: "unknown", reasonCode: "ROADMAP_NEXT", roadmapOrder: null });
    expect(resolveNextAction([later, unknown, earlier])?.candidate.id).toBe("earlier");
  });

  it("tie-break 4: stable ID ascending as the final tie-break", () => {
    const b = candidate({ id: "b", reasonCode: "ROADMAP_NEXT" });
    const a = candidate({ id: "a", reasonCode: "ROADMAP_NEXT" });
    expect(resolveNextAction([b, a])?.candidate.id).toBe("a");
  });
});
