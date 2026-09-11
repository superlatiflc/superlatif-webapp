// Open-redirect protection for the post-sign-in destination (ADR-072).

import { describe, expect, it } from "vitest";
import { DEFAULT_RETURN_PATH, sanitizeReturnPath } from "./return-path.ts";

describe("sanitizeReturnPath", () => {
  it.each([
    ["/tryouts", "/tryouts"],
    ["/tryouts/skd-batch-01", "/tryouts/skd-batch-01"],
    ["/tryouts/skd-batch-01?tab=hasil", "/tryouts/skd-batch-01?tab=hasil"],
    ["/home", "/home"],
    ["/programs/skd-kedinasan", "/programs/skd-kedinasan"],
    [
      "/attempts/0e0c1d4e-0000-4000-8000-000000000000/result",
      "/attempts/0e0c1d4e-0000-4000-8000-000000000000/result",
    ],
    ["/tryouts#section", "/tryouts"],
  ])("keeps the allowed destination %s", (input, expected) => {
    expect(sanitizeReturnPath(input)).toBe(expected);
  });

  it.each([
    ["absent", undefined],
    ["non-string", 42],
    ["empty", ""],
    ["relative", "tryouts"],
    ["scheme-relative", "//evil.example/tryouts"],
    ["backslash", "/\\evil.example"],
    ["absolute URL", "https://evil.example/tryouts"],
    ["javascript URL", "javascript:alert(1)"],
    ["dot-segment escape", "/tryouts/../admin/questions"],
    ["encoded slashes", "/%2F%2Fevil.example"],
    ["prefix look-alike", "/tryouts-evil"],
    ["header injection", "/tryouts\r\nSet-Cookie: x=1"],
    ["tab", "/tryouts\t"],
    ["not a student area", "/admin/questions/1/review"],
    ["sign-in loop", "/signin"],
    ["bridge loop", "/auth/bridge/start"],
    ["too long", `/tryouts/${"a".repeat(600)}`],
  ])("falls back to the default for %s", (_label, input) => {
    expect(sanitizeReturnPath(input)).toBe(DEFAULT_RETURN_PATH);
  });
});
