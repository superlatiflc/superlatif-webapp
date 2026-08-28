import { describe, expect, it } from "vitest";
import { canonicalStringify, canonicalize, digest } from "./canonical.ts";

describe("canonicalize", () => {
  it("treats key order as insignificant", () => {
    expect(canonicalStringify({ b: 1, a: 2 })).toBe(canonicalStringify({ a: 2, b: 1 }));
  });

  it("treats array order as significant", () => {
    expect(canonicalStringify([1, 2])).not.toBe(canonicalStringify([2, 1]));
  });

  it("sorts nested keys", () => {
    expect(canonicalize({ outer: { z: 1, a: 2 } })).toEqual({ outer: { a: 2, z: 1 } });
  });

  it("refuses a non-finite number instead of emitting null", () => {
    expect(() => canonicalStringify({ value: Number.POSITIVE_INFINITY })).toThrow(TypeError);
  });
});

describe("digest", () => {
  it("is stable for equal meaning and different for different meaning", () => {
    expect(digest({ a: 1, b: [2, 3] })).toBe(digest({ b: [2, 3], a: 1 }));
    expect(digest({ a: 1 })).not.toBe(digest({ a: 2 }));
  });
});
