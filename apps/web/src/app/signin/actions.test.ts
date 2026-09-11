// Deterministic (dev) sign-in must be unreachable in production; sign-out must
// revoke only with the session's own secret (ADR-072).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const DB = { fake: "db" };
const performDeterministicLogin = vi.fn();
const revokeSessionWithSecret = vi.fn();
const enforceSignInRateLimit = vi.fn();
const readSessionCookie = vi.fn();
const clearSessionCookie = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));
vi.mock("@superlatif/db", () => ({
  identity: {
    performDeterministicLogin: (...args: unknown[]) => performDeterministicLogin(...args),
    revokeSessionWithSecret: (...args: unknown[]) => revokeSessionWithSecret(...args),
  },
}));
vi.mock("../../lib/db.ts", () => ({ getDb: () => DB }));
vi.mock("../../lib/rate-limit.ts", () => ({
  RateLimitedError: class RateLimitedError extends Error {},
  enforceSignInRateLimit: (...args: unknown[]) => enforceSignInRateLimit(...args),
}));
vi.mock("../../lib/session.ts", () => ({
  SESSION_TTL_SECONDS: 60,
  readSessionCookie: () => readSessionCookie(),
  setSessionCookie: vi.fn(),
  clearSessionCookie: () => clearSessionCookie(),
}));

const { devSignInAction, signOutAction } = await import("./actions.ts");
const { DevLoginDisabledError, isDevLoginEnabled } = await import("../../lib/dev-login.ts");

const ORIGINAL_APP_ENV = process.env["APP_ENV"];

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  process.env["APP_ENV"] = ORIGINAL_APP_ENV;
});

describe("deterministic login is non-production only", () => {
  it("is disabled when APP_ENV=production and enabled elsewhere", () => {
    process.env["APP_ENV"] = "production";
    expect(isDevLoginEnabled()).toBe(false);
    for (const appEnv of ["staging", "development", "test"]) {
      process.env["APP_ENV"] = appEnv;
      expect(isDevLoginEnabled()).toBe(true);
    }
  });

  it("production cannot invoke it: refused before rate limiting, lookup, or any write", async () => {
    process.env["APP_ENV"] = "production";
    const form = new FormData();
    form.set("handle", "siswa-01");
    await expect(devSignInAction(form)).rejects.toBeInstanceOf(DevLoginDisabledError);
    expect(enforceSignInRateLimit).not.toHaveBeenCalled();
    expect(performDeterministicLogin).not.toHaveBeenCalled();
  });

  it("staging: rotates any prior session in the same login", async () => {
    process.env["APP_ENV"] = "staging";
    const prior = { sessionId: "00000000-0000-4000-8000-000000000009", secret: "prior" };
    readSessionCookie.mockResolvedValue(prior);
    performDeterministicLogin.mockResolvedValue({ kind: "session_issued", sessionId: "s", secret: "x" });
    const form = new FormData();
    form.set("handle", "siswa-01");
    await expect(devSignInAction(form)).rejects.toThrow("REDIRECT:/tryouts");
    expect(performDeterministicLogin.mock.calls[0]?.[1]).toMatchObject({
      provider: "dev_fixture",
      supersedesSession: prior,
    });
  });
});

describe("sign-out", () => {
  it("revokes the server-side session WITH its secret, then clears the cookie", async () => {
    readSessionCookie.mockResolvedValue({
      sessionId: "00000000-0000-4000-8000-000000000001",
      secret: "s3cret",
    });
    await expect(signOutAction()).rejects.toThrow("REDIRECT:/signin");
    expect(revokeSessionWithSecret).toHaveBeenCalledWith(
      DB,
      "00000000-0000-4000-8000-000000000001",
      "s3cret",
      expect.any(Date),
    );
    expect(clearSessionCookie).toHaveBeenCalledOnce();
  });

  it("without a session cookie only clears the cookie", async () => {
    readSessionCookie.mockResolvedValue(null);
    await expect(signOutAction()).rejects.toThrow("REDIRECT:/signin");
    expect(revokeSessionWithSecret).not.toHaveBeenCalled();
    expect(clearSessionCookie).toHaveBeenCalledOnce();
  });
});
