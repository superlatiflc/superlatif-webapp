import { describe, expect, it } from "vitest";
import { assertExamConfigVersionMutable, ExamConfigVersionLockedError } from "./exam-config-lifecycle.ts";

describe("assertExamConfigVersionMutable - reuses QST-001's own lock rule", () => {
  it("allows draft/in_review/changes_requested", () => {
    expect(() => assertExamConfigVersionMutable("blueprint_version", "draft")).not.toThrow();
    expect(() => assertExamConfigVersionMutable("scoring_policy_version", "in_review")).not.toThrow();
    expect(() => assertExamConfigVersionMutable("exam_form_version", "changes_requested")).not.toThrow();
  });

  it("refuses approved/published/archived, naming the correct artifact kind", () => {
    for (const status of ["approved", "published", "archived"] as const) {
      try {
        assertExamConfigVersionMutable("blueprint_version", status);
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(ExamConfigVersionLockedError);
        expect((error as ExamConfigVersionLockedError).artifactKind).toBe("blueprint_version");
        expect((error as Error).message).toContain("blueprint_version");
      }
    }
  });
});
