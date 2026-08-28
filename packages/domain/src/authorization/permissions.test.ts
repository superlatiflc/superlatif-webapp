import { describe, expect, it } from "vitest";
import { getPermissionGrant, hasFullGrant, PERMISSION_CODES, ROLE_PERMISSION_MATRIX } from "./permissions.ts";
import { CANONICAL_ROLES } from "./roles.ts";

describe("ROLE_PERMISSION_MATRIX", () => {
  it("has an entry (possibly empty) for every canonical role - no role is silently missing from the seed", () => {
    for (const role of CANONICAL_ROLES) {
      expect(ROLE_PERMISSION_MATRIX[role]).toBeDefined();
    }
  });

  it("is default-deny: a role/permission pair absent from the matrix has no grant at all", () => {
    expect(getPermissionGrant("tutor_writer", "role.manage")).toBeUndefined();
    expect(hasFullGrant("tutor_writer", "role.manage")).toBe(false);
  });

  it("super_admin holds role.manage - the one permission dok 24 §6 gives to no other role", () => {
    expect(hasFullGrant("super_admin", "role.manage")).toBe(true);
    for (const role of CANONICAL_ROLES) {
      if (role === "super_admin") continue;
      expect(hasFullGrant(role, "role.manage")).toBe(false);
    }
  });

  it("moderator_reviewer has no access.manual.change grant at all (dok 24 §6: '—') - moderator changing entitlement is denied at the matrix level", () => {
    expect(getPermissionGrant("moderator_reviewer", "access.manual.change")).toBeUndefined();
    expect(hasFullGrant("moderator_reviewer", "access.manual.change")).toBe(false);
  });

  it("tutor_writer holds question.draft.write but nothing else - a narrow, intentionally small grant set", () => {
    expect(hasFullGrant("tutor_writer", "question.draft.write")).toBe(true);
    expect(hasFullGrant("tutor_writer", "program.publish")).toBe(false);
    expect(hasFullGrant("tutor_writer", "question.ranked_publish")).toBe(false);
  });

  it("a 'scoped_nuance' cell (a dok 24 §6 prose qualifier this task defers) is never treated as a full grant", () => {
    const grant = getPermissionGrant("support", "purchase.raw.read");
    expect(grant?.level).toBe("scoped_nuance");
    expect(hasFullGrant("support", "purchase.raw.read")).toBe(false);
  });

  it("every permission code used in the matrix is a declared PERMISSION_CODES member", () => {
    for (const role of CANONICAL_ROLES) {
      for (const permission of Object.keys(ROLE_PERMISSION_MATRIX[role])) {
        expect(PERMISSION_CODES).toContain(permission);
      }
    }
  });
});
