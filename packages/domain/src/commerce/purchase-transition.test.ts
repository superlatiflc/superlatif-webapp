import { describe, expect, it } from "vitest";
import { resolvePurchaseTransition } from "./purchase-transition.ts";

const T0 = new Date("2026-08-29T00:00:00.000Z");
const T1 = new Date("2026-08-29T01:00:00.000Z");

describe("resolvePurchaseTransition", () => {
  it("applies a legal forward transition (pending -> paid)", () => {
    const outcome = resolvePurchaseTransition({
      currentStatus: "pending",
      currentOccurredAt: T0,
      incomingStatus: "paid",
      incomingOccurredAt: T1,
    });
    expect(outcome).toEqual({ kind: "apply", newStatus: "paid" });
  });

  it("applies paid -> refunded_full", () => {
    const outcome = resolvePurchaseTransition({
      currentStatus: "paid",
      currentOccurredAt: T0,
      incomingStatus: "refunded_full",
      incomingOccurredAt: T1,
    });
    expect(outcome).toEqual({ kind: "apply", newStatus: "refunded_full" });
  });

  it("recognizes a same-status re-delivery as a duplicate, not an error", () => {
    const outcome = resolvePurchaseTransition({
      currentStatus: "paid",
      currentOccurredAt: T0,
      incomingStatus: "paid",
      incomingOccurredAt: T1,
    });
    expect(outcome).toEqual({ kind: "duplicate" });
  });

  describe("required negative test: out-of-order event", () => {
    it("dok 22 §18's own example - paid -> pending is rejected as illegal, never applied", () => {
      const outcome = resolvePurchaseTransition({
        currentStatus: "paid",
        currentOccurredAt: T0,
        incomingStatus: "pending",
        incomingOccurredAt: T1, // even with a LATER timestamp, this edge does not exist
      });
      expect(outcome.kind).toBe("illegal_regression");
    });

    it("a stale event (earlier occurredAt) is rejected even if the target status would otherwise be legal", () => {
      const outcome = resolvePurchaseTransition({
        currentStatus: "pending",
        currentOccurredAt: T1,
        incomingStatus: "paid",
        incomingOccurredAt: T0, // precedes the purchase's current state
      });
      expect(outcome.kind).toBe("stale");
    });

    it("reopening a terminal state (refunded_full) is always illegal, regardless of timing", () => {
      const outcome = resolvePurchaseTransition({
        currentStatus: "refunded_full",
        currentOccurredAt: T0,
        incomingStatus: "paid",
        incomingOccurredAt: T1,
      });
      expect(outcome.kind).toBe("illegal_regression");
    });

    it("a delayed retry CAN succeed after an earlier failure (failed -> paid stays open)", () => {
      const outcome = resolvePurchaseTransition({
        currentStatus: "failed",
        currentOccurredAt: T0,
        incomingStatus: "paid",
        incomingOccurredAt: T1,
      });
      expect(outcome).toEqual({ kind: "apply", newStatus: "paid" });
    });
  });
});
