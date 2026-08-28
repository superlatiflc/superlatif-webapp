import { describe, expect, it } from "vitest";
import { computeChecksum } from "./policy-checksum.ts";

describe("computeChecksum", () => {
  it("is independent of object key order", () => {
    expect(computeChecksum({ b: 1, a: 2 })).toBe(computeChecksum({ a: 2, b: 1 }));
  });

  it("changes when content changes", () => {
    expect(computeChecksum({ a: 1 })).not.toBe(computeChecksum({ a: 2 }));
  });

  it("is sensitive to array order (unlike object key order)", () => {
    expect(computeChecksum([1, 2])).not.toBe(computeChecksum([2, 1]));
  });

  it("produces a 64-character hex digest", () => {
    expect(computeChecksum({ x: "y" })).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic across repeated calls", () => {
    const value = { claims: [{ target: "track:skd", action: "view" }], version: 3 };
    expect(computeChecksum(value)).toBe(computeChecksum(value));
  });
});
