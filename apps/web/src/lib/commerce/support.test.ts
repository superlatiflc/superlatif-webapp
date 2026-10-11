// Commerce webhook configuration, build gate, body cap, and landing claim (M2, ADR-074).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRuntimeFlagsForTests } from "@superlatif/contracts";
import { commerceWriteBlockReason } from "../write-guard.ts";
import { commerceSyncConfigViolations, deploymentConfigViolations } from "../deployment-config.ts";
import { createBridgeLogger } from "../bridge/log.ts";
import { commerceWebhookConfig } from "./config.ts";
import { readBodyWithLimit } from "./read-body.ts";
import { claimPurchasesOnLanding } from "./claim.ts";

const COMPLETE = {
  WP_BRIDGE_BASE_URL: "https://wp-staging.superlatif.id",
  WP_BRIDGE_CLIENT_ID: "superlatif-web-staging",
  WP_BRIDGE_CLIENT_SECRET: "b".repeat(40),
  SEJOLI_WEBHOOK_SIGNING_SECRET: "w".repeat(40),
};

const ORIGINAL = { ...process.env };

function setEnv(appEnv: string, extra: Record<string, string> = {}): void {
  for (const key of Object.keys(process.env)) {
    if (
      key.startsWith("WP_BRIDGE_") ||
      key.startsWith("FEATURE_") ||
      key === "SEJOLI_WEBHOOK_SIGNING_SECRET" ||
      key === "PRODUCTION_WRITES_ENABLED"
    ) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, {
    APP_ENV: appEnv,
    APP_BASE_URL: "https://app.example.com",
    ADMIN_BASE_URL: "https://admin.example.com",
    API_BASE_URL: "https://api.example.com",
    WORKER_CONCURRENCY: "2",
    LOG_LEVEL: "info",
    ...extra,
  });
  resetRuntimeFlagsForTests();
}

beforeEach(() => resetRuntimeFlagsForTests());
afterEach(() => {
  process.env = { ...ORIGINAL };
  resetRuntimeFlagsForTests();
});

describe("commerceWebhookConfig", () => {
  it("staging: derives provider, site (the WordPress host) and key ID (the bridge client ID)", () => {
    setEnv("staging", COMPLETE);
    expect(commerceWebhookConfig()).toEqual({
      provider: "sejoli_bridge",
      site: "wp-staging.superlatif.id",
      keyId: "superlatif-web-staging",
      secret: "w".repeat(40),
    });
  });

  it("staging: off when FEATURE_COMMERCE_SYNC is explicitly false", () => {
    setEnv("staging", { ...COMPLETE, FEATURE_COMMERCE_SYNC: "false" });
    expect(commerceWebhookConfig()).toBeNull();
  });

  it("production: off by default even when fully configured", () => {
    setEnv("production", COMPLETE);
    expect(commerceWebhookConfig()).toBeNull();
  });

  it("production: the write freeze still blocks commerce writes when the flag is on", () => {
    setEnv("production", { ...COMPLETE, FEATURE_COMMERCE_SYNC: "true" });
    expect(commerceWebhookConfig()).not.toBeNull();
    expect(commerceWriteBlockReason()).toBe("writes_disabled");
  });

  // A secret shorter than 32 characters never gets this far: ENV_SPEC's
  // minLength fails environment validation, and the build gate refuses it.
  it("off with a missing or reused webhook secret", () => {
    const { SEJOLI_WEBHOOK_SIGNING_SECRET: _omit, ...noSecret } = COMPLETE;
    setEnv("staging", noSecret);
    expect(commerceWebhookConfig()).toBeNull();
    setEnv("staging", { ...COMPLETE, SEJOLI_WEBHOOK_SIGNING_SECRET: COMPLETE.WP_BRIDGE_CLIENT_SECRET });
    expect(commerceWebhookConfig()).toBeNull();
  });

  it("off without the bridge client configuration", () => {
    setEnv("staging", { SEJOLI_WEBHOOK_SIGNING_SECRET: "w".repeat(40) });
    expect(commerceWebhookConfig()).toBeNull();
  });
});

describe("FEATURE_COMMERCE_SYNC build gate", () => {
  it("does nothing unless the flag is explicitly true", () => {
    expect(commerceSyncConfigViolations({})).toEqual([]);
    expect(commerceSyncConfigViolations({ FEATURE_COMMERCE_SYNC: "false" })).toEqual([]);
  });

  it("refuses an explicit true without a complete webhook configuration, naming no values", () => {
    const violations = commerceSyncConfigViolations({
      FEATURE_COMMERCE_SYNC: "true",
      ...COMPLETE,
      SEJOLI_WEBHOOK_SIGNING_SECRET: "tooshort-secret-value",
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("SEJOLI_WEBHOOK_SIGNING_SECRET");
    expect(violations[0]).not.toContain("tooshort-secret-value");
    expect(commerceSyncConfigViolations({ FEATURE_COMMERCE_SYNC: "true", ...COMPLETE })).toEqual([]);
  });

  it("is part of the hosted deployment gate", () => {
    const env = { VERCEL: "1", APP_ENV: "production", FEATURE_COMMERCE_SYNC: "true" };
    expect(deploymentConfigViolations(env).some((v) => v.includes("FEATURE_COMMERCE_SYNC=true"))).toBe(true);
  });
});

function streamRequest(text: string, contentLength?: string) {
  const bytes = new TextEncoder().encode(text);
  return {
    headers: new Headers(contentLength === undefined ? {} : { "content-length": contentLength }),
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 5));
        controller.enqueue(bytes.slice(5));
        controller.close();
      },
    }),
  };
}

describe("readBodyWithLimit", () => {
  it("returns the exact text within the limit, multi-byte safe", async () => {
    expect(await readBodyWithLimit(streamRequest('{"a":"é"}'), 100)).toBe('{"a":"é"}');
  });

  it("refuses a declared oversize body without reading it, and an undeclared one while streaming", async () => {
    expect(await readBodyWithLimit(streamRequest("x".repeat(10), "999999"), 100)).toBeNull();
    expect(await readBodyWithLimit(streamRequest("x".repeat(101)), 100)).toBeNull();
  });
});

describe("claimPurchasesOnLanding", () => {
  const logger = createBridgeLogger(() => {});

  it("claims for the session user when commerce writes are allowed", async () => {
    const claim = vi.fn().mockResolvedValue({ results: [], grantsIssued: [] });
    await claimPurchasesOnLanding("user-1", { blocked: () => false, claim, logger });
    expect(claim).toHaveBeenCalledWith("user-1");
  });

  it("does nothing when commerce sync is off or production writes are frozen", async () => {
    const claim = vi.fn();
    await claimPurchasesOnLanding("user-1", { blocked: () => true, claim, logger });
    expect(claim).not.toHaveBeenCalled();
  });

  it("never throws into the page", async () => {
    const claim = vi.fn().mockRejectedValue(new Error("db down"));
    await expect(
      claimPurchasesOnLanding("user-1", { blocked: () => false, claim, logger }),
    ).resolves.toBeUndefined();
  });
});
