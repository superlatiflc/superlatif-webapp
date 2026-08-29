import { describe, expect, it } from "vitest";
import {
  SEJOLI_BRIDGE_STATUS_MAP_V1,
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
