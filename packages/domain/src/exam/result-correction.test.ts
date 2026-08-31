import { describe, expect, it } from "vitest";
import {
  assertCorrectionChangesPolicy,
  CorrectionNoOpError,
  deriveCorrectionCaseStatus,
  type CorrectionDecisionFacts,
} from "./result-correction.ts";

const NOW = new Date("2026-09-01T00:00:00Z");

function decision(overrides: Partial<CorrectionDecisionFacts> = {}): CorrectionDecisionFacts {
  return { outcome: "approved", executionStatus: "executed", occurredAt: NOW, ...overrides };
}

describe("deriveCorrectionCaseStatus", () => {
  it("is pending_approval with no decisions at all", () => {
    expect(deriveCorrectionCaseStatus([])).toBe("pending_approval");
  });

  it("is rejected when the latest decision is a rejection", () => {
    expect(deriveCorrectionCaseStatus([decision({ outcome: "rejected", executionStatus: null })])).toBe(
      "rejected",
    );
  });

  it("is executed when the latest decision is approved and execution succeeded", () => {
    expect(deriveCorrectionCaseStatus([decision()])).toBe("executed");
  });

  it("is execution_failed when approved but execution failed", () => {
    expect(deriveCorrectionCaseStatus([decision({ executionStatus: "execution_failed" })])).toBe(
      "execution_failed",
    );
  });

  it("only the LATEST decision (by occurredAt) matters", () => {
    const earlier = decision({
      outcome: "rejected",
      executionStatus: null,
      occurredAt: new Date("2026-08-01Z"),
    });
    const later = decision({ outcome: "approved", executionStatus: "executed", occurredAt: NOW });
    expect(deriveCorrectionCaseStatus([earlier, later])).toBe("executed");
    expect(deriveCorrectionCaseStatus([later, earlier])).toBe("executed"); // order-independent input
  });
});

describe("assertCorrectionChangesPolicy", () => {
  it("allows a correction that proposes a genuinely different policy version", () => {
    expect(() => assertCorrectionChangesPolicy("policy-v1", "policy-v2")).not.toThrow();
  });

  it("refuses a no-op correction proposing the SAME policy version", () => {
    expect(() => assertCorrectionChangesPolicy("policy-v1", "policy-v1")).toThrow(CorrectionNoOpError);
  });
});
