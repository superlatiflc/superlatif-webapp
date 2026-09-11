// Bridge route handlers (M1, ADR-072): unreachable when disabled, identity
// never taken from the URL, and structurally isolated from exam/business code.

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const studentLoginConfig = vi.fn();
const completeBridgeSignIn = vi.fn();
const setBridgeStateCookie = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));
vi.mock("../../../lib/bridge/config.ts", () => ({ studentLoginConfig: () => studentLoginConfig() }));
vi.mock("../../../lib/bridge/sign-in.ts", () => ({
  completeBridgeSignIn: (...args: unknown[]) => completeBridgeSignIn(...args),
}));
vi.mock("../../../lib/bridge/wiring.ts", () => ({ bridgeSignInDeps: () => ({ fake: "deps" }) }));
vi.mock("../../../lib/bridge/state-cookie.ts", () => ({
  setBridgeStateCookie: (...args: unknown[]) => setBridgeStateCookie(...args),
}));

const start = await import("./start/route.ts");
const callback = await import("./callback/route.ts");

const CONFIG = {
  baseUrl: "https://wp.example",
  clientId: "superlatif-web-production",
  clientSecret: "x".repeat(40),
  environment: "production",
};

function request(url: string): NextRequest {
  return { nextUrl: new URL(url) } as unknown as NextRequest;
}

beforeEach(() => vi.clearAllMocks());

describe("FEATURE_STUDENT_LOGIN=false (or unconfigured): no bridge surface at all", () => {
  it("start answers 404 and sets no cookie", async () => {
    studentLoginConfig.mockReturnValue(null);
    const response = await start.GET(request("https://app.example/auth/bridge/start"));
    expect(response.status).toBe(404);
    expect(setBridgeStateCookie).not.toHaveBeenCalled();
  });

  it("callback answers 404 and never attempts an exchange", async () => {
    studentLoginConfig.mockReturnValue(null);
    const response = await callback.GET(
      request(`https://app.example/auth/bridge/callback?code=${"C".repeat(43)}&state=${"S".repeat(43)}`),
    );
    expect(response.status).toBe(404);
    expect(completeBridgeSignIn).not.toHaveBeenCalled();
  });
});

describe("start", () => {
  it("stores state + sanitized destination, then redirects to WordPress authorize", async () => {
    studentLoginConfig.mockReturnValue(CONFIG);
    await expect(
      start.GET(request("https://app.example/auth/bridge/start?next=//evil.example")),
    ).rejects.toThrow(
      /^REDIRECT:https:\/\/wp\.example\/wp-admin\/admin-post\.php\?action=superlatif_bridge_authorize&client_id=superlatif-web-production&state=/,
    );
    const [stored] = setBridgeStateCookie.mock.calls[0] as [{ state: string; returnPath: string }];
    expect(stored.returnPath).toBe("/tryouts");
    expect(stored.state).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe("callback", () => {
  it("passes ONLY code and state on - a userId in the URL is ignored", async () => {
    studentLoginConfig.mockReturnValue(CONFIG);
    completeBridgeSignIn.mockResolvedValue({ kind: "signed_in", returnPath: "/tryouts" });
    await expect(
      callback.GET(
        request(
          `https://app.example/auth/bridge/callback?code=${"C".repeat(43)}&state=${"S".repeat(43)}&userId=victim&subject=1`,
        ),
      ),
    ).rejects.toThrow("REDIRECT:/tryouts");
    expect(completeBridgeSignIn).toHaveBeenCalledWith(
      { code: "C".repeat(43), state: "S".repeat(43) },
      { fake: "deps" },
    );
  });

  it("sends a failure to /signin with a fixed error code", async () => {
    studentLoginConfig.mockReturnValue(CONFIG);
    completeBridgeSignIn.mockResolvedValue({ kind: "failed", error: "bridge_unavailable" });
    await expect(callback.GET(request("https://app.example/auth/bridge/callback"))).rejects.toThrow(
      "REDIRECT:/signin?error=bridge_unavailable",
    );
  });
});

describe("structural isolation", () => {
  const webSrc = path.join(import.meta.dirname, "../../..");
  const files = [
    ...readdirSync(path.join(webSrc, "lib/bridge"))
      .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
      .map((name) => path.join(webSrc, "lib/bridge", name)),
    path.join(webSrc, "app/auth/bridge/start/route.ts"),
    path.join(webSrc, "app/auth/bridge/callback/route.ts"),
  ];

  function stripComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  }

  it.each(files.map((file) => [path.relative(webSrc, file), file]))(
    "%s imports no exam, attempt, commerce, access, or write-guard code",
    (_label, file) => {
      const imports = [...stripComments(readFileSync(file, "utf8")).matchAll(/from\s+"([^"]+)"/g)].map(
        (match) => match[1] ?? "",
      );
      for (const specifier of imports) {
        expect(specifier).not.toMatch(/exam|attempt|commerce|access|entitlement|write-guard|purchase/);
      }
    },
  );

  it("the callback reads no identity from its URL", () => {
    const source = stripComments(
      readFileSync(path.join(webSrc, "app/auth/bridge/callback/route.ts"), "utf8"),
    );
    const reads = [...source.matchAll(/params\.get\("([^"]+)"\)/g)].map((match) => match[1]);
    expect(reads.sort()).toEqual(["code", "state"]);
  });
});
