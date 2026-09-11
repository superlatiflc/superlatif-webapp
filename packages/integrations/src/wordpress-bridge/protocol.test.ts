// Wire-protocol tests (IDN-002, M1, ADR-072).
//
// The vectors file is shared with the WordPress plugin's PHP tests: if either
// side changes a signing input, one of the two suites fails.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BRIDGE_MAX_CLOCK_SKEW_SECONDS,
  bridgeSignatureMatches,
  generateBridgeState,
  isBridgeTimestampFresh,
  isWellFormedBridgeToken,
  parseIdentityClaims,
  requestSigningInput,
  responseSigningInput,
  signBridgeMessage,
} from "./protocol.ts";

interface Vectors {
  readonly hmacKey: string;
  readonly code: string;
  readonly state: string;
  readonly request: { readonly timestamp: string; readonly body: string; readonly signature: string };
  readonly response: {
    readonly timestamp: string;
    readonly claims: { version: 1; subject: string; audience: string; environment: string };
    readonly signature: string;
  };
}

const vectors = JSON.parse(
  readFileSync(
    path.join(import.meta.dirname, "../../../../wordpress-plugins/superlatif-app-bridge/tests/vectors.json"),
    "utf8",
  ),
) as Vectors;

describe("cross-language signing vectors (shared with the PHP plugin)", () => {
  it("signs the exchange request exactly like the plugin verifies it", () => {
    const input = requestSigningInput(vectors.request.timestamp, vectors.request.body);
    expect(signBridgeMessage(vectors.hmacKey, input)).toBe(vectors.request.signature);
    expect(bridgeSignatureMatches(vectors.hmacKey, input, vectors.request.signature)).toBe(true);
  });

  it("verifies the exchange response exactly like the plugin signs it", () => {
    const input = responseSigningInput(vectors.response.timestamp, vectors.response.claims);
    expect(signBridgeMessage(vectors.hmacKey, input)).toBe(vectors.response.signature);
  });

  it("uses well-formed tokens in the vectors", () => {
    expect(isWellFormedBridgeToken(vectors.code)).toBe(true);
    expect(isWellFormedBridgeToken(vectors.state)).toBe(true);
  });
});

describe("tokens", () => {
  it("generates unique 43-character base64url state values", () => {
    const a = generateBridgeState();
    const b = generateBridgeState();
    expect(isWellFormedBridgeToken(a)).toBe(true);
    expect(a).not.toBe(b);
  });

  it.each([["short"], [`${"a".repeat(43)}=`], ["a".repeat(44)], ["a".repeat(42) + "/"], [null], [42]])(
    "rejects %s",
    (value) => {
      expect(isWellFormedBridgeToken(value)).toBe(false);
    },
  );
});

describe("signature comparison", () => {
  const key = "unit-test-hmac-key-0000000000000000";
  const input = "v1\n1\n{}";
  const good = signBridgeMessage(key, input);

  it("accepts the right signature and rejects every malformed one", () => {
    expect(bridgeSignatureMatches(key, input, good)).toBe(true);
    for (const bad of [good.toUpperCase(), good.slice(1), `${good}0`, "", null, undefined, 1]) {
      expect(bridgeSignatureMatches(key, input, bad)).toBe(false);
    }
  });

  it("rejects a signature made with another key", () => {
    expect(bridgeSignatureMatches(key, input, signBridgeMessage(`${key}x`, input))).toBe(false);
  });
});

describe("timestamp freshness", () => {
  const now = new Date("2026-09-10T00:00:00Z");
  const seconds = Math.floor(now.getTime() / 1000);

  it("accepts the skew boundary in both directions and rejects beyond it", () => {
    expect(isBridgeTimestampFresh(String(seconds - BRIDGE_MAX_CLOCK_SKEW_SECONDS), now)).toBe(true);
    expect(isBridgeTimestampFresh(String(seconds + BRIDGE_MAX_CLOCK_SKEW_SECONDS), now)).toBe(true);
    expect(isBridgeTimestampFresh(String(seconds - BRIDGE_MAX_CLOCK_SKEW_SECONDS - 1), now)).toBe(false);
    expect(isBridgeTimestampFresh(String(seconds + BRIDGE_MAX_CLOCK_SKEW_SECONDS + 1), now)).toBe(false);
  });

  it.each([[null], [""], ["12.5"], ["-1"], ["1e9"], [String(seconds) + " "]])("rejects %j", (value) => {
    expect(isBridgeTimestampFresh(value, now)).toBe(false);
  });
});

describe("identity claims", () => {
  const valid = { version: 1, subject: "4821", audience: "superlatif-web-staging", environment: "staging" };

  it("accepts the exact claim shape", () => {
    expect(parseIdentityClaims(valid)).toEqual(valid);
  });

  it("ignores unsigned extra fields rather than trusting them", () => {
    expect(parseIdentityClaims({ ...valid, email: "x@example.com", userId: "other" })).toEqual(valid);
  });

  it.each([
    ["version 2", { ...valid, version: 2 }],
    ["numeric subject", { ...valid, subject: 4821 }],
    ["zero subject", { ...valid, subject: "0" }],
    ["leading-zero subject", { ...valid, subject: "04821" }],
    ["negative subject", { ...valid, subject: "-1" }],
    ["email as subject", { ...valid, subject: "student@example.com" }],
    ["21-digit subject", { ...valid, subject: "1".repeat(21) }],
    ["uppercase audience", { ...valid, audience: "Superlatif" }],
    ["missing environment", { version: 1, subject: "1", audience: "abc" }],
    ["array", [valid]],
    ["null", null],
  ])("rejects %s", (_label, value) => {
    expect(parseIdentityClaims(value)).toBeNull();
  });
});
