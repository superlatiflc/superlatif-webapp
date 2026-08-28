import { describe, expect, it } from "vitest";
import { deriveManualChangeStatus, type ManualChangeDecisionFacts } from "./manual-change.ts";

const NOW = new Date("2026-08-29T00:00:00.000Z");

function decision(overrides: Partial<ManualChangeDecisionFacts> = {}): ManualChangeDecisionFacts {
  return { outcome: "approved", executionStatus: "executed", occurredAt: NOW, ...overrides };
}

describe("deriveManualChangeStatus", () => {
  it("is pending_approval with no decisions at all", () => {
    expect(deriveManualChangeStatus([])).toBe("pending_approval");
  });

  it("is rejected when the latest decision is a rejection", () => {
    expect(deriveManualChangeStatus([decision({ outcome: "rejected", executionStatus: null })])).toBe(
      "rejected",
    );
  });

  it("is executed when the latest decision is approved and execution succeeded", () => {
    expect(deriveManualChangeStatus([decision({ outcome: "approved", executionStatus: "executed" })])).toBe(
      "executed",
    );
  });

  it("is execution_failed when approved but execution failed", () => {
    expect(
      deriveManualChangeStatus([decision({ outcome: "approved", executionStatus: "execution_failed" })]),
    ).toBe("execution_failed");
  });

  it("uses only the LATEST decision by occurredAt, regardless of array order", () => {
    const rejected = decision({
      outcome: "rejected",
      executionStatus: null,
      occurredAt: new Date("2026-08-01T00:00:00.000Z"),
    });
    const approved = decision({
      outcome: "approved",
      executionStatus: "executed",
      occurredAt: new Date("2026-08-02T00:00:00.000Z"),
    });
    expect(deriveManualChangeStatus([approved, rejected])).toBe("executed");
    expect(deriveManualChangeStatus([rejected, approved])).toBe("executed");
  });
});
