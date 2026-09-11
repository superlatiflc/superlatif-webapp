// Exchange client against a real HTTP fake of the WordPress plugin (IDN-002, M1, ADR-072).
//
// Every failure class the callback must handle is produced here over a real
// socket: rejected codes, credential and binding mismatches, broken and
// hostile responses, and an unreachable or slow bridge.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  exchangeBridgeCode,
  bridgeAuthorizeUrl,
  bridgeExchangeUrl,
  type BridgeClientConfig,
} from "./client.ts";
import { FakeWordPressBridge, signedClaims } from "./fake-wordpress-bridge.ts";
import { generateBridgeState } from "./protocol.ts";

const PRODUCTION_KEY = "production-hmac-key-for-client-tests-000000";
const STAGING_KEY = "staging-hmac-key-for-client-tests-0000000000";

let bridge: FakeWordPressBridge;
let config: BridgeClientConfig;

beforeEach(async () => {
  bridge = new FakeWordPressBridge({
    "superlatif-web-production": { secret: PRODUCTION_KEY, environment: "production" },
    "superlatif-web-staging": { secret: STAGING_KEY, environment: "staging" },
  });
  await bridge.start();
  config = {
    baseUrl: bridge.baseUrl,
    clientId: "superlatif-web-production",
    clientSecret: PRODUCTION_KEY,
    environment: "production",
  };
});

afterEach(async () => {
  await bridge.stop();
});

function freshCode(subject = "4821", clientId = "superlatif-web-production") {
  const state = generateBridgeState();
  return { state, code: bridge.issueCode(clientId, subject, state) };
}

describe("successful exchange", () => {
  it("returns the WordPress subject vouched for by a valid signature", async () => {
    const result = await exchangeBridgeCode(config, freshCode());
    expect(result).toEqual({ kind: "ok", subject: "4821" });
  });

  it("never sends the client secret over the wire", async () => {
    await exchangeBridgeCode(config, freshCode());
    expect(bridge.receivedBodies.join("")).not.toContain(PRODUCTION_KEY);
  });
});

describe("codes WordPress rejects (the only retryable failure)", () => {
  it("rejects an unknown code", async () => {
    const result = await exchangeBridgeCode(config, {
      code: generateBridgeState(),
      state: generateBridgeState(),
    });
    expect(result).toEqual({ kind: "invalid_grant" });
  });

  it("rejects a REPLAYED code: the second exchange of the same code fails", async () => {
    const input = freshCode();
    expect((await exchangeBridgeCode(config, input)).kind).toBe("ok");
    expect(await exchangeBridgeCode(config, input)).toEqual({ kind: "invalid_grant" });
  });

  it("rejects an EXPIRED code", async () => {
    const state = generateBridgeState();
    const code = bridge.issueCode("superlatif-web-production", "4821", state, -1);
    expect(await exchangeBridgeCode(config, { code, state })).toEqual({ kind: "invalid_grant" });
  });

  it("rejects a code presented with a different state", async () => {
    const { code } = freshCode();
    expect(await exchangeBridgeCode(config, { code, state: generateBridgeState() })).toEqual({
      kind: "invalid_grant",
    });
  });

  it("rejects a code issued for ANOTHER client (audience binding at WordPress)", async () => {
    const stagingCode = freshCode("4821", "superlatif-web-staging");
    expect(await exchangeBridgeCode(config, stagingCode)).toEqual({ kind: "invalid_grant" });
  });
});

describe("configuration and binding failures (never retryable by the learner)", () => {
  it("treats a wrong bridge credential as a rejected client", async () => {
    const result = await exchangeBridgeCode(
      { ...config, clientSecret: `${PRODUCTION_KEY}-wrong` },
      freshCode(),
    );
    expect(result).toEqual({ kind: "misconfigured", reason: "client_rejected" });
  });

  it("rejects the request when the app's environment does not match the client's", async () => {
    const result = await exchangeBridgeCode({ ...config, environment: "staging" }, freshCode());
    expect(result).toEqual({ kind: "misconfigured", reason: "request_rejected" });
  });

  it("refuses a validly signed response for a DIFFERENT audience", async () => {
    bridge.respondWith = () =>
      signedClaims(
        PRODUCTION_KEY,
        { version: 1, subject: "4821", audience: "some-other-app", environment: "production" },
        String(Math.floor(Date.now() / 1000)),
      );
    expect(await exchangeBridgeCode(config, freshCode())).toEqual({
      kind: "misconfigured",
      reason: "audience",
    });
  });

  it("refuses a validly signed response for a DIFFERENT environment", async () => {
    bridge.respondWith = () =>
      signedClaims(
        PRODUCTION_KEY,
        { version: 1, subject: "4821", audience: "superlatif-web-production", environment: "staging" },
        String(Math.floor(Date.now() / 1000)),
      );
    expect(await exchangeBridgeCode(config, freshCode())).toEqual({
      kind: "misconfigured",
      reason: "environment",
    });
  });

  it("refuses claims signed with another key (a forged or substituted identity)", async () => {
    bridge.respondWith = () =>
      signedClaims(
        STAGING_KEY,
        { version: 1, subject: "1", audience: "superlatif-web-production", environment: "production" },
        String(Math.floor(Date.now() / 1000)),
      );
    expect(await exchangeBridgeCode(config, freshCode())).toEqual({
      kind: "misconfigured",
      reason: "signature",
    });
  });

  it("refuses a response whose subject was changed after signing", async () => {
    bridge.respondWith = (build) => {
      const real = build();
      return { ...real, body: real.body.replace('"4821"', '"1"') };
    };
    expect(await exchangeBridgeCode(config, freshCode())).toEqual({
      kind: "misconfigured",
      reason: "signature",
    });
  });

  it("does not follow a redirect", async () => {
    bridge.respondWith = () => ({ status: 302, headers: { location: "https://example.invalid/" }, body: "" });
    expect(await exchangeBridgeCode(config, freshCode())).toEqual({
      kind: "misconfigured",
      reason: "redirected",
    });
  });

  it("reports a missing plugin/REST route as not_found", async () => {
    bridge.respondWith = () => ({ status: 404, body: '{"code":"rest_no_route"}' });
    expect(await exchangeBridgeCode(config, freshCode())).toEqual({
      kind: "misconfigured",
      reason: "not_found",
    });
  });
});

describe("malformed responses", () => {
  it.each([
    ["non-JSON body", "<html>not json</html>"],
    ["empty object", "{}"],
    [
      "email instead of a WordPress user id",
      '{"version":1,"subject":"a@b.c","audience":"superlatif-web-production","environment":"production"}',
    ],
  ])("rejects %s", async (_label, body) => {
    bridge.respondWith = () => ({ status: 200, body });
    expect(await exchangeBridgeCode(config, freshCode())).toEqual({
      kind: "invalid_response",
      reason: "malformed",
    });
  });

  it("rejects a stale response timestamp", async () => {
    bridge.respondWith = () =>
      signedClaims(
        PRODUCTION_KEY,
        { version: 1, subject: "4821", audience: "superlatif-web-production", environment: "production" },
        String(Math.floor(Date.now() / 1000) - 3600),
      );
    expect(await exchangeBridgeCode(config, freshCode())).toEqual({
      kind: "invalid_response",
      reason: "stale",
    });
  });

  it("refuses an oversized body without buffering it", async () => {
    bridge.respondWith = () => ({ status: 200, body: "x".repeat(20_000) });
    expect(await exchangeBridgeCode(config, freshCode())).toEqual({
      kind: "invalid_response",
      reason: "too_large",
    });
  });

  it("rejects an unexpected status", async () => {
    bridge.respondWith = () => ({ status: 418, body: "{}" });
    expect(await exchangeBridgeCode(config, freshCode())).toEqual({
      kind: "invalid_response",
      reason: "unexpected_status",
    });
  });
});

describe("unavailable bridge", () => {
  it("reports a 5xx as unavailable", async () => {
    bridge.respondWith = () => ({ status: 503, body: "" });
    expect(await exchangeBridgeCode(config, freshCode())).toEqual({
      kind: "unavailable",
      reason: "server_error",
    });
  });

  it("reports a refused connection as unavailable", async () => {
    const input = freshCode();
    const baseUrl = bridge.baseUrl;
    await bridge.stop();
    expect(await exchangeBridgeCode({ ...config, baseUrl }, input)).toEqual({
      kind: "unavailable",
      reason: "network",
    });
    await bridge.start();
  });

  it("gives up on a slow bridge instead of hanging the sign-in", async () => {
    bridge.respondWith = async (build) => {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      return build();
    };
    expect(await exchangeBridgeCode(config, freshCode(), { timeoutMs: 100 })).toEqual({
      kind: "unavailable",
      reason: "timeout",
    });
  });
});

describe("URLs", () => {
  it("addresses the REST route via rest_route, independent of permalink settings", () => {
    expect(bridgeExchangeUrl("https://superlatif.id").toString()).toBe(
      "https://superlatif.id/?rest_route=%2Fsuperlatif-bridge%2Fv1%2Fexchange",
    );
  });

  it("builds the authorize URL with only client id and state - never an identity", () => {
    const url = bridgeAuthorizeUrl("https://superlatif.id/", "superlatif-web-production", "S".repeat(43));
    expect(url.origin + url.pathname).toBe("https://superlatif.id/wp-admin/admin-post.php");
    expect([...url.searchParams.keys()].sort()).toEqual(["action", "client_id", "state"]);
  });

  it("drops any query or fragment carried in the configured base URL", () => {
    expect(bridgeExchangeUrl("https://superlatif.id/?x=1#y").toString()).toBe(
      "https://superlatif.id/?rest_route=%2Fsuperlatif-bridge%2Fv1%2Fexchange",
    );
  });
});
