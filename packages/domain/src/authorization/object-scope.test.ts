import { describe, expect, it } from "vitest";
import { isEntitled, isOwner, isWithinAssignedScope, violatesMakerChecker } from "./object-scope.ts";

describe("isOwner", () => {
  it("is true only when the ids match exactly", () => {
    expect(isOwner("user-1", "user-1")).toBe(true);
    expect(isOwner("user-1", "user-2")).toBe(false);
  });
});

describe("isWithinAssignedScope", () => {
  it("treats an empty assignment list as unscoped - covers everywhere", () => {
    expect(isWithinAssignedScope([], "program", "program-2")).toBe(true);
  });

  it("requires an exact (scopeType, scopeRef) match when scoped", () => {
    const scopes = [{ scopeType: "program", scopeRef: "program-2" }];
    expect(isWithinAssignedScope(scopes, "program", "program-2")).toBe(true);
    expect(isWithinAssignedScope(scopes, "program", "program-9")).toBe(false);
    expect(isWithinAssignedScope(scopes, "batch", "program-2")).toBe(false);
  });

  it("matches if ANY of several scoped assignments covers the object", () => {
    const scopes = [
      { scopeType: "program", scopeRef: "program-2" },
      { scopeType: "program", scopeRef: "program-5" },
    ];
    expect(isWithinAssignedScope(scopes, "program", "program-5")).toBe(true);
    expect(isWithinAssignedScope(scopes, "program", "program-7")).toBe(false);
  });
});

describe("isEntitled", () => {
  it("is a direct pass-through of the precomputed effective-access flag", () => {
    expect(isEntitled(true)).toBe(true);
    expect(isEntitled(false)).toBe(false);
  });
});

describe("violatesMakerChecker", () => {
  it("is true only when the creator and actor are literally the same id", () => {
    expect(violatesMakerChecker("mod-4", "mod-4")).toBe(true);
    expect(violatesMakerChecker("tutor-3", "mod-3")).toBe(false);
  });
});
