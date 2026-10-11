import { describe, expect, it } from "vitest";
import {
  SEJOLI_BRIDGE_STATUS_MAP_V1,
  WIRE_EVENT_TYPE_STATUS_MAP_V1,
  normalizeCommerceEvent,
  type CommerceEventEnvelope,
} from "./canonical-event.ts";

function envelope(overrides: Partial<CommerceEventEnvelope> = {}): CommerceEventEnvelope {
  return {
    provider: "sejoli_bridge",
    site: "superlatif.id",
    eventId: "evt_1",
    type: "purchase.status_changed",
    occurredAt: "2026-08-29T00:00:00.000Z",
    order: {
      externalId: "order-1",
      status: "completed",
      currency: "IDR",
      amountMinor: 199_000,
      externalUserId: "wp-user-1",
      externalSkuId: "sku-aks-2026",
    },
    schemaVersion: 1,
    ...overrides,
  };
}

describe("required test: valid event normalization", () => {
  it("maps a recognized provider status through the provider's own status map", () => {
    const outcome = normalizeCommerceEvent(envelope(), "evt_1", SEJOLI_BRIDGE_STATUS_MAP_V1);
    expect(outcome.kind).toBe("ok");
    if (outcome.kind !== "ok") return;
    expect(outcome.event.order.status).toBe("paid");
    expect(outcome.event.eventKey).toBe("evt_1");
    expect(outcome.event.provider).toBe("sejoli_bridge");
  });

  it("the normalized event never carries the raw provider status string, only the canonical PurchaseState", () => {
    const outcome = normalizeCommerceEvent(
      envelope({ order: { ...envelope().order, status: "on-hold" } }),
      "evt_2",
      SEJOLI_BRIDGE_STATUS_MAP_V1,
    );
    expect(outcome.kind).toBe("ok");
    expect(outcome.kind === "ok" && outcome.event.order.status).toBe("pending");
  });
});

describe("required negative test: unknown event quarantine", () => {
  it("an unsupported event type is reported distinctly, never guessed at", () => {
    const outcome = normalizeCommerceEvent(
      envelope({ type: "subscription.renewed" }),
      "evt_3",
      SEJOLI_BRIDGE_STATUS_MAP_V1,
    );
    expect(outcome).toEqual({ kind: "unsupported_type", type: "subscription.renewed" });
  });

  it("a raw status the provider's map does not recognize is reported distinctly, never guessed at", () => {
    const outcome = normalizeCommerceEvent(
      envelope({ order: { ...envelope().order, status: "totally_unknown_status" } }),
      "evt_4",
      SEJOLI_BRIDGE_STATUS_MAP_V1,
    );
    expect(outcome).toEqual({
      kind: "unknown_status",
      rawStatus: "totally_unknown_status",
      provider: "sejoli_bridge",
    });
  });
});

describe("wire eventType map (M2, ADR-074)", () => {
  function wire(eventType: string): CommerceEventEnvelope {
    return envelope({ order: { ...envelope().order, status: eventType } });
  }

  it.each([
    ["order_pending", "pending"],
    ["payment_settled", "paid"],
    ["payment_failed", "failed"],
    ["order_expired", "expired"],
    ["order_cancelled", "cancelled"],
    ["refund_full", "refunded_full"],
    ["refund_partial", "refunded_partial"],
    ["chargeback_opened", "chargeback"],
  ])("maps %s to %s", (eventType, expected) => {
    const outcome = normalizeCommerceEvent(wire(eventType), "evt_1", WIRE_EVENT_TYPE_STATUS_MAP_V1);
    expect(outcome.kind).toBe("ok");
    if (outcome.kind === "ok") expect(outcome.event.order.status).toBe(expected);
  });

  it("quarantines chargeback_resolved instead of guessing its outcome", () => {
    const outcome = normalizeCommerceEvent(
      wire("chargeback_resolved"),
      "evt_1",
      WIRE_EVENT_TYPE_STATUS_MAP_V1,
    );
    expect(outcome).toEqual({
      kind: "unknown_status",
      rawStatus: "chargeback_resolved",
      provider: "sejoli_bridge",
    });
  });

  it("never accepts a raw Sejoli status as a wire event type", () => {
    for (const raw of ["completed", "on-hold", "refunded", "paid"]) {
      expect(normalizeCommerceEvent(wire(raw), "evt_1", WIRE_EVENT_TYPE_STATUS_MAP_V1).kind).toBe(
        "unknown_status",
      );
    }
  });
});
