import { describe, expect, it } from "vitest";
import { resolveRootDestination } from "./root-redirect.ts";

describe("resolveRootDestination", () => {
  it("sends an anonymous visitor (no session) to sign-in", () => {
    expect(resolveRootDestination(null)).toBe("/signin");
  });

  it("sends an authenticated visitor to the canonical student home", () => {
    expect(resolveRootDestination("11111111-1111-1111-1111-111111111111")).toBe("/home");
  });
});
