import { describe, expect, it } from "vitest";
import { assertSafeAssetPath, UnsafeAssetPathError } from "./import-path-safety.ts";

describe("assertSafeAssetPath - accepts well-formed paths", () => {
  it("accepts a path under images/questions/", () => {
    expect(assertSafeAssetPath("images/questions/Q-001-stem.png")).toEqual({
      placement: "questions",
      fileName: "Q-001-stem.png",
    });
  });

  it("accepts every documented placement directory", () => {
    expect(assertSafeAssetPath("images/options/Q-001-A.png").placement).toBe("options");
    expect(assertSafeAssetPath("images/passages/P-001.png").placement).toBe("passages");
    expect(assertSafeAssetPath("images/explanations/Q-001-explanation.png").placement).toBe("explanations");
  });
});

describe("assertSafeAssetPath - path traversal rejection", () => {
  it("rejects a path containing a .. segment", () => {
    expect(() => assertSafeAssetPath("images/questions/../../../etc/passwd")).toThrow(UnsafeAssetPathError);
  });

  it("rejects a leading absolute path", () => {
    expect(() => assertSafeAssetPath("/etc/passwd")).toThrow(UnsafeAssetPathError);
  });

  it("rejects a Windows drive-letter absolute path", () => {
    expect(() => assertSafeAssetPath("C:/Windows/System32/evil.dll")).toThrow(UnsafeAssetPathError);
  });

  it("rejects a backslash path (Windows-style traversal smuggling)", () => {
    expect(() => assertSafeAssetPath("images\\questions\\..\\..\\evil.png")).toThrow(UnsafeAssetPathError);
  });

  it("rejects an embedded null byte", () => {
    expect(() => assertSafeAssetPath("images/questions/evil.png\u0000.exe")).toThrow(UnsafeAssetPathError);
  });

  it("rejects a path not under images/", () => {
    expect(() => assertSafeAssetPath("scripts/evil.png")).toThrow(UnsafeAssetPathError);
  });

  it("rejects an unrecognized placement directory", () => {
    expect(() => assertSafeAssetPath("images/malware/evil.png")).toThrow(UnsafeAssetPathError);
  });

  it("rejects a disallowed/executable extension regardless of directory", () => {
    expect(() => assertSafeAssetPath("images/questions/payload.exe")).toThrow(UnsafeAssetPathError);
    expect(() => assertSafeAssetPath("images/questions/payload.sh")).toThrow(UnsafeAssetPathError);
    expect(() => assertSafeAssetPath("images/questions/payload.svg")).toThrow(UnsafeAssetPathError);
  });

  it("carries a stable reason code for each rejection kind", () => {
    try {
      assertSafeAssetPath("../../etc/passwd");
      expect.unreachable();
    } catch (error) {
      expect((error as UnsafeAssetPathError).reason).toBe("path_traversal");
    }
  });
});
