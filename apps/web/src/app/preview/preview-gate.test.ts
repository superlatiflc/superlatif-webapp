// `/preview/*` production gate - behavioural regression tests.
//
// The layout and the Server Actions are called directly, the same way Next.js
// invokes them, and the assertions look for Next's own 404 signal. The demo
// session module is mocked so the tests can also prove ORDER: in production
// the gate fires before the demo cookie is ever touched.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const setPreviewSession = vi.fn(async () => {});
const clearPreviewSession = vi.fn(async () => {});
vi.mock("../../lib/preview-data/index.ts", () => ({ setPreviewSession, clearPreviewSession }));

const ORIGINAL_APP_ENV = process.env["APP_ENV"];

function digestOf(error: unknown): string {
  return String((error as { digest?: string } | null)?.digest ?? "");
}

beforeEach(() => {
  vi.resetModules();
  setPreviewSession.mockClear();
  clearPreviewSession.mockClear();
});

afterEach(() => {
  if (ORIGINAL_APP_ENV === undefined) delete process.env["APP_ENV"];
  else process.env["APP_ENV"] = ORIGINAL_APP_ENV;
});

describe("isPreviewSurfaceEnabled", () => {
  it("is off only in production", async () => {
    const { isPreviewSurfaceEnabled } = await import("../../lib/preview-gate.ts");
    expect(isPreviewSurfaceEnabled({ APP_ENV: "production" })).toBe(false);
    for (const appEnv of ["staging", "development", "test", undefined]) {
      expect(isPreviewSurfaceEnabled({ APP_ENV: appEnv }), String(appEnv)).toBe(true);
    }
  });
});

describe("preview layout", () => {
  it("renders Next's 404 in production", async () => {
    process.env["APP_ENV"] = "production";
    const { default: PreviewSurfaceLayout } = await import("./layout.tsx");
    let thrown: unknown;
    try {
      PreviewSurfaceLayout({ children: "synthetic page" });
    } catch (error) {
      thrown = error;
    }
    expect(digestOf(thrown)).toMatch(/404/);
  });

  it.each(["staging", "development"])("renders the preview pages in %s", async (appEnv) => {
    process.env["APP_ENV"] = appEnv;
    const { default: PreviewSurfaceLayout } = await import("./layout.tsx");
    expect(PreviewSurfaceLayout({ children: "synthetic page" })).toBe("synthetic page");
  });
});

describe("preview Server Actions", () => {
  it("refuse with 404 in production, before touching the demo cookie", async () => {
    process.env["APP_ENV"] = "production";
    const { demoLoginAction, logoutPreviewAction } = await import("./actions.ts");
    for (const action of [demoLoginAction, logoutPreviewAction]) {
      let thrown: unknown;
      try {
        await action();
      } catch (error) {
        thrown = error;
      }
      expect(digestOf(thrown)).toMatch(/404/);
    }
    expect(setPreviewSession).not.toHaveBeenCalled();
    expect(clearPreviewSession).not.toHaveBeenCalled();
  });

  it("keep working outside production", async () => {
    process.env["APP_ENV"] = "staging";
    const { demoLoginAction } = await import("./actions.ts");
    let thrown: unknown;
    try {
      await demoLoginAction();
    } catch (error) {
      thrown = error; // redirect() signals by throwing
    }
    expect(setPreviewSession).toHaveBeenCalledTimes(1);
    expect(digestOf(thrown)).toMatch(/NEXT_REDIRECT/);
    expect(digestOf(thrown)).toMatch(/\/preview\/onboarding/);
  });
});
