// Commerce webhook wire protocol (M2, ADR-074). The signing vector is shared
// with the WordPress plugin's PHP tests (tests/vectors.json).

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { requestSigningInput, signBridgeMessage } from "../wordpress-bridge/protocol.ts";
import { toCommerceEventEnvelope } from "./envelope.ts";
import {
  commerceWebhookSignatureMatches,
  commerceWebhookSigningInput,
  isCommerceWebhookTimestampFresh,
  parseWireCommerceEvent,
  signCommerceWebhook,
} from "./protocol.ts";

/** A nested object of a mutable test event. */
function sub(event: Record<string, unknown>, key: string): Record<string, unknown> {
  return event[key] as Record<string, unknown>;
}

interface Vectors {
  readonly hmacKey: string;
  readonly commerce: {
    readonly keyId: string;
    readonly timestamp: string;
    readonly eventId: string;
    readonly body: string;
    readonly signature: string;
  };
}

const vectors = JSON.parse(
  readFileSync(
    path.join(import.meta.dirname, "../../../../wordpress-plugins/superlatif-app-bridge/tests/vectors.json"),
    "utf8",
  ),
) as Vectors;
const v = vectors.commerce;

describe("cross-language commerce signing vector (shared with the PHP plugin)", () => {
  it("signs the vector exactly as the plugin does", () => {
    expect(signCommerceWebhook(vectors.hmacKey, v.keyId, v.timestamp, v.eventId, v.body)).toBe(v.signature);
  });

  it("verifies the vector and rejects any change to key ID, timestamp, event ID, or body", () => {
    expect(
      commerceWebhookSignatureMatches(vectors.hmacKey, v.keyId, v.timestamp, v.eventId, v.body, v.signature),
    ).toBe(true);
    const tampered = [
      [v.keyId + "x", v.timestamp, v.eventId, v.body],
      [v.keyId, String(Number(v.timestamp) + 1), v.eventId, v.body],
      [v.keyId, v.timestamp, v.eventId + "x", v.body],
      [v.keyId, v.timestamp, v.eventId, v.body.replace("149000", "1")],
      [v.keyId, v.timestamp, v.eventId, `${v.body} `],
    ] as const;
    for (const [keyId, timestamp, eventId, body] of tampered) {
      expect(
        commerceWebhookSignatureMatches(vectors.hmacKey, keyId, timestamp, eventId, body, v.signature),
      ).toBe(false);
    }
  });

  it("rejects a malformed or wrong-key signature without throwing", () => {
    for (const bad of [undefined, null, "", "zz", v.signature.toUpperCase(), v.signature.slice(1)]) {
      expect(
        commerceWebhookSignatureMatches(vectors.hmacKey, v.keyId, v.timestamp, v.eventId, v.body, bad),
      ).toBe(false);
    }
    expect(
      commerceWebhookSignatureMatches(
        "another-key".repeat(4),
        v.keyId,
        v.timestamp,
        v.eventId,
        v.body,
        v.signature,
      ),
    ).toBe(false);
  });

  it("lives in its own signing domain: a sign-in request signature never verifies as a webhook", () => {
    const signInSignature = signBridgeMessage(vectors.hmacKey, requestSigningInput(v.timestamp, v.body));
    expect(
      commerceWebhookSignatureMatches(
        vectors.hmacKey,
        v.keyId,
        v.timestamp,
        v.eventId,
        v.body,
        signInSignature,
      ),
    ).toBe(false);
    expect(commerceWebhookSigningInput("k", "1", "e", "b")).toBe("commerce.v1\nk\n1\ne\nb");
  });
});

describe("timestamp window", () => {
  const now = new Date(Number(v.timestamp) * 1000);
  it("accepts ±300 s and refuses beyond it or malformed values", () => {
    expect(isCommerceWebhookTimestampFresh(v.timestamp, now)).toBe(true);
    expect(isCommerceWebhookTimestampFresh(String(Number(v.timestamp) - 300), now)).toBe(true);
    expect(isCommerceWebhookTimestampFresh(String(Number(v.timestamp) - 301), now)).toBe(false);
    expect(isCommerceWebhookTimestampFresh(String(Number(v.timestamp) + 301), now)).toBe(false);
    for (const bad of [null, "", "-1", "1e9", " 1767225600", "17672256000000"]) {
      expect(isCommerceWebhookTimestampFresh(bad, now)).toBe(false);
    }
  });
});

describe("parseWireCommerceEvent (contracts/openapi.yaml CanonicalCommerceEvent)", () => {
  const valid = JSON.parse(v.body) as Record<string, unknown>;

  it("accepts the vector body and defaults refundedMinor", () => {
    expect(parseWireCommerceEvent(valid)).toMatchObject({
      eventType: "payment_settled",
      order: { externalUserId: "4821" },
    });
    const noRefund = structuredClone(valid) as { amounts: Record<string, unknown> };
    delete noRefund.amounts["refundedMinor"];
    expect(parseWireCommerceEvent(noRefund)?.amounts.refundedMinor).toBe(0);
  });

  it("accepts a guest order (null buyer)", () => {
    const guest = structuredClone(valid) as { order: Record<string, unknown> };
    guest.order["externalUserId"] = null;
    expect(parseWireCommerceEvent(guest)?.order.externalUserId).toBeNull();
  });

  const mutations: Array<[string, (e: Record<string, unknown>) => void]> = [
    ["unknown top-level key", (e) => (e["status"] = "completed")],
    ["unknown order key", (e) => (sub(e, "order")["email"] = "a@b.c")],
    ["unknown customer key", (e) => (sub(e, "customer")["email"] = "a@b.c")],
    ["unknown amounts key", (e) => (sub(e, "amounts")["tax"] = 1)],
    ["schemaVersion 2", (e) => (e["schemaVersion"] = 2)],
    ["unknown eventType", (e) => (e["eventType"] = "completed")],
    ["empty eventId", (e) => (e["eventId"] = "")],
    ["long eventId", (e) => (e["eventId"] = "x".repeat(256))],
    ["date without offset", (e) => (e["occurredAt"] = "2026-01-01T00:00:00")],
    ["not a date", (e) => (e["occurredAt"] = "yesterday")],
    ["negative amount", (e) => (sub(e, "amounts")["grossMinor"] = -1)],
    ["fractional amount", (e) => (sub(e, "amounts")["netSettledMinor"] = 1.5)],
    ["lowercase currency", (e) => (sub(e, "amounts")["currency"] = "idr")],
    ["bad checksum", (e) => (e["rawPayloadChecksum"] = "abc")],
    ["plaintext email hash", (e) => (sub(e, "customer")["emailHash"] = "student@example.com")],
    ["missing sku", (e) => delete sub(e, "order")["externalSkuId"]],
    ["numeric user id", (e) => (sub(e, "order")["externalUserId"] = 4821)],
    ["missing amounts", (e) => delete e["amounts"]],
  ];
  it.each(mutations)("rejects: %s", (_name, mutate) => {
    const event = structuredClone(valid) as Record<string, unknown>;
    mutate(event);
    expect(parseWireCommerceEvent(event)).toBeNull();
  });

  it("rejects non-objects", () => {
    for (const bad of [null, [], "x", 1]) expect(parseWireCommerceEvent(bad)).toBeNull();
  });
});

describe("toCommerceEventEnvelope", () => {
  it("carries the eventType as the status to normalize and takes site from configuration", () => {
    const wire = parseWireCommerceEvent(JSON.parse(v.body));
    if (!wire) throw new Error("vector must parse");
    expect(toCommerceEventEnvelope(wire, "sejoli_bridge", "wp-staging.superlatif.id")).toEqual({
      provider: "sejoli_bridge",
      site: "wp-staging.superlatif.id",
      eventId: v.eventId,
      type: "purchase.status_changed",
      occurredAt: "2026-01-01T00:00:00Z",
      order: {
        externalId: "9526",
        status: "payment_settled",
        currency: "IDR",
        amountMinor: 149_000,
        externalUserId: "4821",
        externalSkuId: "9001",
      },
      schemaVersion: 1,
    });
  });
});
