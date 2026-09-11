// Session cookie attributes and resolution (IDN-001 wiring, ADR-072 hardening).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as Db from "@superlatif/db";

const jar = new Map<string, string>();
const setCalls: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name: string, value: string, options: Record<string, unknown>) => {
      setCalls.push({ name, value, options });
      if (options["maxAge"] === 0) jar.delete(name);
      else jar.set(name, value);
    },
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));

vi.mock("./db.ts", () => ({ getDb: () => ({ fake: "db" }) }));

const validateSession = vi.fn();
vi.mock("@superlatif/db", async (importOriginal) => {
  const actual = await importOriginal<typeof Db>();
  return {
    ...actual,
    identity: { ...actual.identity, validateSession: (...args: unknown[]) => validateSession(...args) },
  };
});

const {
  UnauthenticatedError,
  clearSessionCookie,
  decodeSessionCookie,
  getSessionUserId,
  requireUserId,
  requireUserIdOrRedirect,
  sessionCookieName,
  setSessionCookie,
} = await import("./session.ts");

const SESSION_ID = "0e0c1d4e-1111-4222-8333-444455556666";
const SECRET = "Q".repeat(43);
beforeEach(() => {
  jar.clear();
  setCalls.length = 0;
  validateSession.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("cookie attributes", () => {
  it("production: __Host- prefix, Secure, HttpOnly, SameSite=Lax, Path=/, no Domain", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await setSessionCookie(SESSION_ID, SECRET);
    const [call] = setCalls;
    expect(call?.name).toBe("__Host-slf_session");
    expect(call?.options).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 28_800,
    });
    expect(call?.options).not.toHaveProperty("domain");
  });

  it("local development: unprefixed name, not Secure (plain http), still HttpOnly/Lax", async () => {
    vi.stubEnv("NODE_ENV", "development");
    await setSessionCookie(SESSION_ID, SECRET);
    expect(setCalls[0]?.name).toBe("slf_session");
    expect(setCalls[0]?.options).toMatchObject({ httpOnly: true, secure: false, sameSite: "lax", path: "/" });
  });

  it("clearing re-sends the full attribute set (a bare delete is ignored for __Host- cookies) and clears the legacy name", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await clearSessionCookie();
    expect(setCalls.map((call) => call.name)).toEqual(["__Host-slf_session", "slf_session"]);
    for (const call of setCalls) {
      expect(call.options).toMatchObject({ maxAge: 0, secure: true, httpOnly: true, path: "/" });
    }
  });
});

describe("cookie decoding", () => {
  it.each([
    ["no separator", "garbage"],
    ["non-uuid session id", `not-a-uuid.${SECRET}`],
    ["empty secret", `${SESSION_ID}.`],
    ["empty session id", `.${SECRET}`],
    ["secret with illegal characters", `${SESSION_ID}.bad secret!`],
    ["sql-ish session id", `'; drop table user_sessions;--.${SECRET}`],
  ])("treats %s as no session", (_label, raw) => {
    expect(decodeSessionCookie(raw)).toBeNull();
  });

  it("accepts a well-formed value", () => {
    expect(decodeSessionCookie(`${SESSION_ID}.${SECRET}`)).toEqual({ sessionId: SESSION_ID, secret: SECRET });
  });
});

describe("session resolution", () => {
  it("anonymous: null, and the database is not consulted", async () => {
    expect(await getSessionUserId()).toBeNull();
    expect(validateSession).not.toHaveBeenCalled();
  });

  it("malformed cookie: null, and the database is not consulted (no 500 from a bad uuid)", async () => {
    jar.set(sessionCookieName(), "not-a-uuid.whatever");
    expect(await getSessionUserId()).toBeNull();
    expect(validateSession).not.toHaveBeenCalled();
  });

  it("valid session: the user id comes from the server-side session row", async () => {
    jar.set(sessionCookieName(), `${SESSION_ID}.${SECRET}`);
    validateSession.mockResolvedValue({ outcome: "valid", userId: "user-from-session" });
    expect(await getSessionUserId()).toBe("user-from-session");
    expect(validateSession).toHaveBeenCalledWith(expect.anything(), SESSION_ID, SECRET, expect.any(Date));
  });

  it.each(["expired", "revoked", "secret_mismatch", "not_found"])(
    "%s session: indistinguishable null",
    async (outcome) => {
      jar.set(sessionCookieName(), `${SESSION_ID}.${SECRET}`);
      validateSession.mockResolvedValue({ outcome });
      expect(await getSessionUserId()).toBeNull();
    },
  );
});

describe("requireUserId trusts only the session", () => {
  it("accepts no caller-supplied identity at all", () => {
    expect(requireUserId.length).toBe(0);
    expect(getSessionUserId.length).toBe(0);
    expect(requireUserIdOrRedirect.length).toBe(0);
  });

  it("throws for an unauthenticated caller", async () => {
    await expect(requireUserId()).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it("page variant redirects an unauthenticated visitor to /signin", async () => {
    await expect(requireUserIdOrRedirect()).rejects.toThrow("REDIRECT:/signin");
  });

  it("returns the session's user for an authenticated caller", async () => {
    jar.set(sessionCookieName(), `${SESSION_ID}.${SECRET}`);
    validateSession.mockResolvedValue({ outcome: "valid", userId: "user-a" });
    expect(await requireUserId()).toBe("user-a");
  });
});
