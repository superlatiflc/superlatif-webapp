// Bridge callback orchestration (M1, ADR-072) - every branch, with fakes.
//
// PostgreSQL behaviour of the login it calls (user creation, linking,
// conflicts, rotation) is covered by packages/db's
// bridge-login.integration.test.ts; the wire protocol by
// packages/integrations. This file owns the decisions in between.

import { describe, expect, it, vi } from "vitest";
import type { BridgeExchangeResult } from "@superlatif/integrations";
import { completeBridgeSignIn, type BridgeSignInDeps } from "./sign-in.ts";

const STATE = "S".repeat(43);
const CODE = "C".repeat(43);
const CLIENT_SECRET = "client-secret-that-must-never-be-logged-000";
const SESSION_SECRET = "new-session-secret-that-must-never-be-logged";
const PRIOR = { sessionId: "00000000-0000-4000-8000-000000000001", secret: "prior-secret-value-000000" };

class FakeRateLimited extends Error {}

function harness(overrides: Partial<BridgeSignInDeps> = {}) {
  const logs: Array<{ level: string; message: string; fields: Record<string, unknown> | undefined }> = [];
  const deps: BridgeSignInDeps = {
    config: {
      baseUrl: "https://wp.example",
      clientId: "superlatif-web-production",
      clientSecret: CLIENT_SECRET,
      environment: "production",
    },
    takeState: vi.fn(async () => ({ state: STATE, returnPath: "/tryouts/skd-01" })),
    readSession: vi.fn(async () => PRIOR),
    setSession: vi.fn(async () => {}),
    enforceClientLimit: vi.fn(async () => {}),
    enforceSubjectLimit: vi.fn(async () => {}),
    isRateLimited: (error) => error instanceof FakeRateLimited,
    exchange: vi.fn(async (): Promise<BridgeExchangeResult> => ({ kind: "ok", subject: "4821" })),
    login: vi.fn(async () => ({
      kind: "session_issued" as const,
      userId: "11111111-1111-4111-8111-111111111111",
      sessionId: "22222222-2222-4222-8222-222222222222",
      secret: SESSION_SECRET,
      linkDecision: "create_new_user" as const,
    })),
    logger: {
      info: (message, fields) => logs.push({ level: "info", message, fields }),
      warn: (message, fields) => logs.push({ level: "warn", message, fields }),
      error: (message, fields) => logs.push({ level: "error", message, fields }),
    },
    ...overrides,
  };
  return { deps, logs };
}

describe("successful sign-in", () => {
  it("links the WordPress subject from the VERIFIED exchange and issues a session", async () => {
    const { deps } = harness();
    const outcome = await completeBridgeSignIn({ code: CODE, state: STATE }, deps);

    expect(outcome).toEqual({ kind: "signed_in", returnPath: "/tryouts/skd-01" });
    expect(deps.exchange).toHaveBeenCalledWith(deps.config, { code: CODE, state: STATE });
    expect(deps.login).toHaveBeenCalledWith({
      provider: "wordpress",
      externalSubject: "4821",
      // No contact attributes: linking is by (provider, subject) only, so an
      // email collision can never link or merge accounts.
      emailNormalized: null,
      phoneE164: null,
      linkReason: "wordpress_bridge_login",
      supersedesSession: PRIOR,
    });
  });

  it("sets the NEW session and hands the prior one over only for revocation (fixation resistance)", async () => {
    const { deps } = harness();
    await completeBridgeSignIn({ code: CODE, state: STATE }, deps);
    expect(deps.setSession).toHaveBeenCalledExactlyOnceWith(
      "22222222-2222-4222-8222-222222222222",
      SESSION_SECRET,
    );
    expect(deps.setSession).not.toHaveBeenCalledWith(PRIOR.sessionId, expect.anything());
  });

  it("works for a browser with no prior session", async () => {
    const { deps } = harness({ readSession: vi.fn(async () => null) });
    await completeBridgeSignIn({ code: CODE, state: STATE }, deps);
    expect(deps.login).toHaveBeenCalledWith(expect.objectContaining({ supersedesSession: null }));
  });
});

describe("state (login-CSRF) checks happen before anything else", () => {
  it.each([
    ["no state cookie", { takeState: vi.fn(async () => null) }, { code: CODE, state: STATE }],
    ["state differs from the cookie", {}, { code: CODE, state: "T".repeat(43) }],
    ["state missing from the callback", {}, { code: CODE, state: null }],
    ["malformed code", {}, { code: "short", state: STATE }],
    ["code missing", {}, { code: null, state: STATE }],
  ] as const)(
    "%s: fails without calling WordPress or touching the database",
    async (_label, overrides, query) => {
      const { deps } = harness(overrides);
      expect(await completeBridgeSignIn(query, deps)).toEqual({ kind: "failed", error: "bridge" });
      expect(deps.takeState).toHaveBeenCalledOnce();
      expect(deps.exchange).not.toHaveBeenCalled();
      expect(deps.login).not.toHaveBeenCalled();
      expect(deps.setSession).not.toHaveBeenCalled();
    },
  );
});

describe("rate limiting", () => {
  it("throttles before the exchange, so a flood never reaches WordPress", async () => {
    const { deps } = harness({
      enforceClientLimit: vi.fn(async () => {
        throw new FakeRateLimited();
      }),
    });
    expect(await completeBridgeSignIn({ code: CODE, state: STATE }, deps)).toEqual({
      kind: "failed",
      error: "rate_limited",
    });
    expect(deps.exchange).not.toHaveBeenCalled();
  });

  it("throttles per WordPress account before any session is minted", async () => {
    const { deps } = harness({
      enforceSubjectLimit: vi.fn(async () => {
        throw new FakeRateLimited();
      }),
    });
    expect(await completeBridgeSignIn({ code: CODE, state: STATE }, deps)).toEqual({
      kind: "failed",
      error: "rate_limited",
    });
    expect(deps.enforceSubjectLimit).toHaveBeenCalledWith("4821");
    expect(deps.login).not.toHaveBeenCalled();
  });

  it("does not swallow an unexpected limiter error", async () => {
    const { deps } = harness({
      enforceClientLimit: vi.fn(async () => {
        throw new Error("boom");
      }),
    });
    await expect(completeBridgeSignIn({ code: CODE, state: STATE }, deps)).rejects.toThrow("boom");
  });
});

describe("exchange failures never become a session", () => {
  it.each([
    [{ kind: "invalid_grant" }, "bridge"],
    [{ kind: "misconfigured", reason: "client_rejected" }, "bridge_unavailable"],
    [{ kind: "misconfigured", reason: "audience" }, "bridge_unavailable"],
    [{ kind: "misconfigured", reason: "environment" }, "bridge_unavailable"],
    [{ kind: "misconfigured", reason: "signature" }, "bridge_unavailable"],
    [{ kind: "unavailable", reason: "timeout" }, "bridge_unavailable"],
    [{ kind: "invalid_response", reason: "malformed" }, "bridge_unavailable"],
  ] as const)("%j -> %s", async (result, error) => {
    const { deps } = harness({ exchange: vi.fn(async () => result) });
    expect(await completeBridgeSignIn({ code: CODE, state: STATE }, deps)).toEqual({ kind: "failed", error });
    expect(deps.login).not.toHaveBeenCalled();
    expect(deps.setSession).not.toHaveBeenCalled();
  });
});

describe("identity conflict", () => {
  it("records nothing further and issues no session", async () => {
    const { deps } = harness({
      login: vi.fn(async () => ({
        kind: "conflict" as const,
        conflictId: "33333333-3333-4333-8333-333333333333",
        candidateUserIds: [],
      })),
    });
    expect(await completeBridgeSignIn({ code: CODE, state: STATE }, deps)).toEqual({
      kind: "failed",
      error: "conflict",
    });
    expect(deps.setSession).not.toHaveBeenCalled();
  });
});

describe("secret leakage", () => {
  it("never logs the code, state, WordPress subject, client secret, or session secret", async () => {
    const outcomes: Array<Partial<BridgeSignInDeps>> = [
      {},
      { exchange: vi.fn(async () => ({ kind: "invalid_grant" }) as const) },
      { exchange: vi.fn(async () => ({ kind: "misconfigured", reason: "signature" }) as const) },
      { takeState: vi.fn(async () => null) },
    ];
    for (const overrides of outcomes) {
      const { deps, logs } = harness(overrides);
      await completeBridgeSignIn({ code: CODE, state: STATE }, deps);
      const text = JSON.stringify(logs);
      for (const sensitive of [CODE, STATE, "4821", CLIENT_SECRET, SESSION_SECRET, PRIOR.secret]) {
        expect(text).not.toContain(sensitive);
      }
    }
  });
});
