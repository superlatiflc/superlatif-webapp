// Commerce webhook route (M2, ADR-074): no surface when disabled, body cap
// applied before the handler, and the handler's decision written verbatim.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const commerceWebhookConfig = vi.fn();
const handleCommerceWebhook = vi.fn();

vi.mock("../../../../../lib/commerce/config.ts", () => ({
  commerceWebhookConfig: () => commerceWebhookConfig(),
}));
vi.mock("../../../../../lib/commerce/webhook.ts", () => ({
  handleCommerceWebhook: (...args: unknown[]) => handleCommerceWebhook(...args),
}));
vi.mock("../../../../../lib/commerce/wiring.ts", () => ({ commerceWebhookDeps: () => ({ fake: "deps" }) }));

const route = await import("./[provider]/events/route.ts");

function post(body: string, headers: Record<string, string> = {}): NextRequest {
  return new Request("https://app.example/api/v1/integrations/commerce/sejoli_bridge/events", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  }) as unknown as NextRequest;
}

const params = (provider = "sejoli_bridge") => ({ params: Promise.resolve({ provider }) });

beforeEach(() => vi.clearAllMocks());

describe("POST /api/v1/integrations/commerce/{provider}/events", () => {
  it("answers 404 and never runs the handler when commerce sync is off or unconfigured", async () => {
    commerceWebhookConfig.mockReturnValue(null);
    const res = await route.POST(post("{}"), params());
    expect(res.status).toBe(404);
    expect(handleCommerceWebhook).not.toHaveBeenCalled();
  });

  it("passes provider, headers, and the raw body text to the handler and writes its answer", async () => {
    commerceWebhookConfig.mockReturnValue({ provider: "sejoli_bridge" });
    handleCommerceWebhook.mockResolvedValue({
      status: 202,
      body: { accepted: true, duplicate: false, eventReceiptId: "r" },
      headers: { "cache-control": "no-store", "x-request-id": "q" },
    });
    const res = await route.POST(post('{"a":1}', { "x-provider-event-id": "e1" }), params());
    expect(res.status).toBe(202);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ accepted: true, duplicate: false, eventReceiptId: "r" });

    const [request] = handleCommerceWebhook.mock.calls[0] as [
      { provider: string; body: string | null; header: (n: string) => string | null },
    ];
    expect(request.provider).toBe("sejoli_bridge");
    expect(request.body).toBe('{"a":1}');
    expect(request.header("x-provider-event-id")).toBe("e1");
  });

  it("hands over null instead of an oversized body", async () => {
    commerceWebhookConfig.mockReturnValue({ provider: "sejoli_bridge" });
    handleCommerceWebhook.mockResolvedValue({ status: 400, body: { error: {} }, headers: {} });
    await route.POST(post("x".repeat(16 * 1024 + 1)), params());
    const [request] = handleCommerceWebhook.mock.calls[0] as [{ body: string | null }];
    expect(request.body).toBeNull();
  });
});
