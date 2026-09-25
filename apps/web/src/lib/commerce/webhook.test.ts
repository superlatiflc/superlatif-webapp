// Commerce webhook ingress decisions (M2, ADR-074). No database: `receive` is
// faked here; packages/db m2-purchase-entitlement.integration.test.ts proves
// what receive does with Postgres.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { COMMERCE_WEBHOOK_HEADERS, signCommerceWebhook } from "@superlatif/integrations";
import { createBridgeLogger } from "../bridge/log.ts";
import type { CommerceWebhookConfig } from "./config.ts";
import { handleCommerceWebhook, type CommerceWebhookDeps } from "./webhook.ts";

const SECRET = "commerce-webhook-test-secret-not-a-credential-000";
const CONFIG: CommerceWebhookConfig = {
  provider: "sejoli_bridge",
  site: "wp-staging.superlatif.id",
  keyId: "superlatif-web-staging",
  secret: SECRET,
};
const NOW = new Date("2026-09-24T03:00:00.000Z");
const TS = String(Math.floor(NOW.getTime() / 1000));
const EVENT_ID = "0b6f6a52-4b3a-4d25-9a51-6a4e0b1e2c3d";
const BUYER = "5638";

function body(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schemaVersion: 1,
    eventId: EVENT_ID,
    eventType: "payment_settled",
    occurredAt: "2026-09-24T02:59:00Z",
    order: { externalOrderId: "9526", externalSkuId: "9001", externalUserId: BUYER },
    customer: { emailHash: null, phoneHash: null },
    amounts: {
      currency: "IDR",
      grossMinor: 149000,
      discountMinor: 0,
      netSettledMinor: 149000,
      refundedMinor: 0,
    },
    rawPayloadChecksum: "a".repeat(64),
    ...overrides,
  });
}

interface Req {
  provider?: string;
  body?: string | null;
  headers?: Record<string, string | undefined>;
}

function request({ provider = "sejoli_bridge", body: raw = body(), headers = {} }: Req = {}) {
  const signed = raw === null ? "" : signCommerceWebhook(SECRET, CONFIG.keyId, TS, EVENT_ID, raw);
  const all: Record<string, string | undefined> = {
    "content-type": "application/json",
    [COMMERCE_WEBHOOK_HEADERS.eventId]: EVENT_ID,
    [COMMERCE_WEBHOOK_HEADERS.timestamp]: TS,
    [COMMERCE_WEBHOOK_HEADERS.keyId]: CONFIG.keyId,
    [COMMERCE_WEBHOOK_HEADERS.signature]: signed,
    ...headers,
  };
  return { provider, body: raw, header: (name: string) => all[name] ?? null };
}

const receive = vi.fn();
const limitUnverified = vi.fn();
let logLines: string[];

function deps(overrides: Partial<CommerceWebhookDeps> = {}): CommerceWebhookDeps {
  return {
    config: CONFIG,
    writesBlocked: () => false,
    now: () => NOW,
    newRequestId: () => "11111111-1111-4111-8111-111111111111",
    receive,
    limitUnverified,
    isRateLimited: (error) => error instanceof Error && error.message === "limited",
    logger: createBridgeLogger(
      (_level, line) => logLines.push(line),
      () => NOW,
    ),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  logLines = [];
  receive.mockResolvedValue({
    rawEventId: "raw-1",
    duplicate: false,
    ingest: "normalized",
    lifecycle: { kind: "processed" },
  });
  limitUnverified.mockResolvedValue(undefined);
});

describe("no surface when disabled", () => {
  it("answers 404 without config and never reads or records anything", async () => {
    const res = await handleCommerceWebhook(request(), deps({ config: null }));
    expect(res.status).toBe(404);
    expect(res.body).toBeNull();
    expect(receive).not.toHaveBeenCalled();
  });

  it("answers 404 for a provider this deployment does not accept", async () => {
    expect((await handleCommerceWebhook(request({ provider: "woocommerce" }), deps())).status).toBe(404);
    expect(receive).not.toHaveBeenCalled();
  });
});

describe("production write freeze", () => {
  it("answers 503 with Retry-After so the bridge keeps and retries the event", async () => {
    const res = await handleCommerceWebhook(request(), deps({ writesBlocked: () => true }));
    expect(res.status).toBe(503);
    expect(res.headers["retry-after"]).toBe("300");
    expect(receive).not.toHaveBeenCalled();
  });
});

describe("a verified delivery", () => {
  it("is received with the configured site and the wire event type as status, and answers 202", async () => {
    const res = await handleCommerceWebhook(request(), deps());
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ accepted: true, duplicate: false, eventReceiptId: "raw-1" });
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(receive).toHaveBeenCalledOnce();
    const input = receive.mock.calls[0]?.[0];
    expect(input.signatureOutcome).toBe("verified");
    expect(input.envelope).toMatchObject({
      provider: "sejoli_bridge",
      site: "wp-staging.superlatif.id",
      eventId: EVENT_ID,
      order: { status: "payment_settled", externalUserId: BUYER, externalSkuId: "9001" },
    });
    expect(input.statusMap.provider).toBe("wire_event_type");
  });

  it("reports a duplicate as accepted, so the bridge stops retrying", async () => {
    receive.mockResolvedValue({ rawEventId: "raw-1", duplicate: true, ingest: "duplicate", lifecycle: null });
    const res = await handleCommerceWebhook(request(), deps());
    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ duplicate: true });
  });

  it("answers 503 when processing fails after receipt, so the retry re-drives it", async () => {
    receive.mockRejectedValue(new Error("db down"));
    const res = await handleCommerceWebhook(request(), deps());
    expect(res.status).toBe(503);
    expect(res.headers["retry-after"]).toBe("60");
    expect(JSON.stringify(res.body)).not.toContain("db down");
  });
});

describe("verification failures", () => {
  it("rejects an unknown key with 403 and records nothing", async () => {
    const res = await handleCommerceWebhook(
      request({ headers: { [COMMERCE_WEBHOOK_HEADERS.keyId]: "someone-else" } }),
      deps(),
    );
    expect(res.status).toBe(403);
    expect(receive).not.toHaveBeenCalled();
  });

  it("rejects a bad signature with 401 and records the delivery as failed (never verified)", async () => {
    const res = await handleCommerceWebhook(
      request({ headers: { [COMMERCE_WEBHOOK_HEADERS.signature]: "0".repeat(64) } }),
      deps(),
    );
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: { code: "SIGNATURE_INVALID" } });
    expect(limitUnverified).toHaveBeenCalledOnce();
    expect(receive).toHaveBeenCalledOnce();
    expect(receive.mock.calls[0]?.[0].signatureOutcome).toBe("failed");
  });

  it("rejects a body changed after signing", async () => {
    const signedFor = body();
    const req = request({ body: signedFor });
    const tampered = { ...req, body: signedFor.replace('"9001"', '"9999"') };
    const res = await handleCommerceWebhook(tampered, deps());
    expect(res.status).toBe(401);
    expect(receive.mock.calls[0]?.[0].signatureOutcome).toBe("failed");
  });

  it("rejects a correctly signed but stale delivery with 401", async () => {
    const res = await handleCommerceWebhook(
      request(),
      deps({ now: () => new Date(NOW.getTime() + 301_000) }),
    );
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: { code: "TIMESTAMP_OUT_OF_WINDOW" } });
    expect(receive.mock.calls[0]?.[0].signatureOutcome).toBe("failed");
  });

  it("stops recording unverified deliveries from a source over its limit, still answering 401", async () => {
    limitUnverified.mockRejectedValue(new Error("limited"));
    const res = await handleCommerceWebhook(
      request({ headers: { [COMMERCE_WEBHOOK_HEADERS.signature]: "0".repeat(64) } }),
      deps(),
    );
    expect(res.status).toBe(401);
    expect(receive).not.toHaveBeenCalled();
  });

  it("does not record an unverified body that is not a valid event", async () => {
    const res = await handleCommerceWebhook(
      request({ body: "not json", headers: { [COMMERCE_WEBHOOK_HEADERS.signature]: "0".repeat(64) } }),
      deps(),
    );
    expect(res.status).toBe(401);
    expect(receive).not.toHaveBeenCalled();
  });
});

describe("malformed deliveries (signed correctly) are 400 and never received", () => {
  it.each([
    [
      "wrong content type",
      request({ headers: { "content-type": "text/plain" } }),
      "UNSUPPORTED_CONTENT_TYPE",
    ],
    ["body over the limit", request({ body: null }), "PAYLOAD_TOO_LARGE"],
    [
      "missing event ID header",
      request({ headers: { [COMMERCE_WEBHOOK_HEADERS.eventId]: undefined } }),
      "MISSING_DELIVERY_HEADERS",
    ],
    [
      "non-numeric timestamp",
      request({ headers: { [COMMERCE_WEBHOOK_HEADERS.timestamp]: "soon" } }),
      "MISSING_DELIVERY_HEADERS",
    ],
    ["invalid JSON", request({ body: "{" }), "MALFORMED_JSON"],
    ["schema violation", request({ body: body({ eventType: "completed" }) }), "SCHEMA_VIOLATION"],
    ["extra field", request({ body: body({ email: "student@example.com" }) }), "SCHEMA_VIOLATION"],
    [
      "header/body event ID mismatch",
      request({ body: body({ eventId: "other-event" }) }),
      "EVENT_ID_MISMATCH",
    ],
  ])("%s", async (_name, req, code) => {
    const res = await handleCommerceWebhook(req, deps());
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code, requestId: "11111111-1111-4111-8111-111111111111" } });
    expect(receive).not.toHaveBeenCalled();
  });
});

describe("nothing sensitive leaves the handler", () => {
  it("logs neither the buyer, the secret, the signature, nor amounts", async () => {
    await handleCommerceWebhook(request(), deps());
    await handleCommerceWebhook(
      request({ headers: { [COMMERCE_WEBHOOK_HEADERS.signature]: "0".repeat(64) } }),
      deps(),
    );
    receive.mockRejectedValue(new Error("boom"));
    await handleCommerceWebhook(request(), deps());
    const logs = logLines.join("\n");
    expect(logs).toContain(EVENT_ID);
    for (const secretish of [
      BUYER,
      SECRET,
      "149000",
      signCommerceWebhook(SECRET, CONFIG.keyId, TS, EVENT_ID, body()),
    ]) {
      expect(logs).not.toContain(secretish);
    }
  });
});
