// Test-case IDs reference test/fixtures/contracts/privacy-rbac.cases.json's
// SEC-SYN-001..006. Fixture roles ("student", "tutor", "moderator",
// "admin") map to this module's canonical roles per roles.ts's documented
// mapping - "tutor" -> tutor_writer, "moderator" -> moderator_reviewer,
// generic "admin" -> operations_admin (representative), "owner/founder"
// (founder instruction vocabulary, not in the fixture) -> super_admin.
//
// SEC-SYN-005 (attempt-question payload excludes answer secrets) and the
// redaction/pseudonymization half of SEC-SYN-006 are field-level serializer
// concerns over objects (attempts, audit exports) this task does not own -
// SEC-SYN-005 needs an attempt/question entity (EXM series); SEC-SYN-006's
// redaction is already GOV-004's `@superlatif/observability/redaction.ts`,
// re-proven there, not here. This task's contribution to both is the same:
// gating WHETHER the read/export is authorized at all - proven below for
// the export_audit high-risk-action half of SEC-SYN-006. See ADR-049.

import { describe, expect, it } from "vitest";
import { authorize, type AuthorizeRequest, type RoleHolding } from "./authorize.ts";

function actor(userId: string, roles: readonly RoleHolding[] = []) {
  return { userId, roles };
}

function unscoped(role: RoleHolding["role"]): RoleHolding {
  return { role, scopes: [] };
}

function scoped(role: RoleHolding["role"], scopeType: string, scopeRef: string): RoleHolding {
  return { role, scopes: [{ scopeType, scopeRef }] };
}

describe("authorize - SEC-SYN-001: student cannot read another student's attempt", () => {
  it("denies OBJECT_SCOPE_DENIED when the actor is not the object's owner and holds no overriding role", () => {
    const request: AuthorizeRequest = {
      actor: actor("user-1"),
      action: { type: "read_attempt" },
      object: { ownerUserId: "user-2" },
    };
    expect(authorize(request)).toEqual({ allowed: false, reasonCode: "OBJECT_SCOPE_DENIED" });
  });

  it("allows a student to read their own attempt - the identity match itself is the grant", () => {
    const request: AuthorizeRequest = {
      actor: actor("user-1"),
      action: { type: "read_attempt" },
      object: { ownerUserId: "user-1" },
    };
    expect(authorize(request)).toEqual({ allowed: true, reasonCode: "GRANTED" });
  });
});

describe("authorize - SEC-SYN-002: tutor can edit an assigned draft but not publish a blueprint", () => {
  const tutor = actor("tutor-2", [scoped("tutor_writer", "program", "program-2")]);

  it("allows editing a draft within the tutor's assigned program scope, reasonCode ASSIGNED_SCOPE", () => {
    const request: AuthorizeRequest = {
      actor: tutor,
      action: { type: "edit_question_draft", permission: "question.draft.write" },
      object: { scopeType: "program", scopeRef: "program-2" },
    };
    expect(authorize(request)).toEqual({ allowed: true, reasonCode: "ASSIGNED_SCOPE" });
  });

  it("denies publishing a blueprint - tutor_writer has no grant for it at all, regardless of scope", () => {
    const request: AuthorizeRequest = {
      actor: tutor,
      action: { type: "publish_blueprint", permission: "question.ranked_publish" },
      object: { scopeType: "program", scopeRef: "program-2" },
    };
    expect(authorize(request)).toEqual({ allowed: false, reasonCode: "ROLE_DENIED" });
  });
});

describe("authorize - required negative test: tutor mengakses program di luar scope", () => {
  it("denies OBJECT_SCOPE_DENIED - the tutor holds question.draft.write, but only scoped to program-2, not program-9", () => {
    const tutor = actor("tutor-2", [scoped("tutor_writer", "program", "program-2")]);
    const request: AuthorizeRequest = {
      actor: tutor,
      action: { type: "edit_question_draft", permission: "question.draft.write" },
      object: { scopeType: "program", scopeRef: "program-9" },
    };
    expect(authorize(request)).toEqual({ allowed: false, reasonCode: "OBJECT_SCOPE_DENIED" });
  });
});

describe("authorize - SEC-SYN-003: moderator approves another creator's question", () => {
  it("allows - moderator_reviewer holds question.first_approve, unscoped, and the creator differs from the actor", () => {
    const request: AuthorizeRequest = {
      actor: actor("mod-3", [unscoped("moderator_reviewer")]),
      action: { type: "approve_question", permission: "question.first_approve" },
      object: { creatorUserId: "tutor-3" },
      audit: { reason: "first approval", correlationId: "corr-3" },
    };
    expect(authorize(request)).toEqual({ allowed: true, reasonCode: "GRANTED" });
  });
});

describe("authorize - SEC-SYN-004: creator cannot approve own question", () => {
  it("denies MAKER_CHECKER_VIOLATION even though the role otherwise grants the permission", () => {
    const request: AuthorizeRequest = {
      actor: actor("mod-4", [unscoped("moderator_reviewer")]),
      action: { type: "approve_question", permission: "question.first_approve" },
      object: { creatorUserId: "mod-4" },
    };
    expect(authorize(request)).toEqual({ allowed: false, reasonCode: "MAKER_CHECKER_VIOLATION" });
  });

  it("maker-checker is role-independent - even a super_admin cannot approve their own question", () => {
    const request: AuthorizeRequest = {
      actor: actor("owner-1", [unscoped("super_admin")]),
      action: { type: "approve_question", permission: "question.first_approve" },
      object: { creatorUserId: "owner-1" },
    };
    expect(authorize(request).allowed).toBe(false);
    expect(authorize(request).reasonCode).toBe("MAKER_CHECKER_VIOLATION");
  });
});

describe("authorize - required negative test: moderator mengubah entitlement", () => {
  it("denies ROLE_DENIED - moderator_reviewer has no access.manual.change grant at all (dok 24 §6: '—')", () => {
    const request: AuthorizeRequest = {
      actor: actor("mod-9", [unscoped("moderator_reviewer")]),
      action: { type: "change_entitlement", permission: "access.manual.change" },
      object: { scopeType: "user", scopeRef: "user-5" },
      audit: { reason: "trying anyway", correlationId: "corr-9" },
    };
    expect(authorize(request)).toEqual({ allowed: false, reasonCode: "ROLE_DENIED" });
  });
});

describe("authorize - required negative test: admin melewati audit trail (SEC-SYN-006's gating half)", () => {
  const admin = actor("admin-6", [unscoped("operations_admin")]);

  it("denies AUDIT_FIELDS_REQUIRED for a high-risk PII/secret export when reason/correlationId are missing - the export is refused before any permission is even resolved", () => {
    const request: AuthorizeRequest = {
      actor: admin,
      action: { type: "export_audit", highRiskType: "export_pii_or_secrets" },
    };
    expect(authorize(request)).toEqual({ allowed: false, reasonCode: "AUDIT_FIELDS_REQUIRED" });
  });

  it("denies AUDIT_FIELDS_REQUIRED for a super_admin role.manage change with no reason - even the top role cannot bypass the audit trail by omission", () => {
    const request: AuthorizeRequest = {
      actor: actor("owner-1", [unscoped("super_admin")]),
      action: { type: "change_role", permission: "role.manage", highRiskType: "role_change" },
      audit: { reason: "", correlationId: "corr-10" },
    };
    expect(authorize(request)).toEqual({ allowed: false, reasonCode: "AUDIT_FIELDS_REQUIRED" });
  });

  it("allows the same super_admin role.manage change once reason and correlationId are both supplied", () => {
    const request: AuthorizeRequest = {
      actor: actor("owner-1", [unscoped("super_admin")]),
      action: { type: "change_role", permission: "role.manage", highRiskType: "role_change" },
      audit: { reason: "onboarding new academic admin", correlationId: "corr-11" },
    };
    expect(authorize(request)).toEqual({ allowed: true, reasonCode: "GRANTED" });
  });
});

describe("authorize - entitlement axis (object-level access checks entitlement, distinct from ownership/role)", () => {
  it("denies ENTITLEMENT_DENIED for a shared/catalogue object with no supporting effective access", () => {
    const request: AuthorizeRequest = {
      actor: actor("user-7"),
      action: { type: "view_program" },
      object: { requiresEntitlement: true },
      entitlement: { hasEffectiveAccess: false },
    };
    expect(authorize(request)).toEqual({ allowed: false, reasonCode: "ENTITLEMENT_DENIED" });
  });

  it("allows when effective access is present", () => {
    const request: AuthorizeRequest = {
      actor: actor("user-7"),
      action: { type: "view_program" },
      object: { requiresEntitlement: true },
      entitlement: { hasEffectiveAccess: true },
    };
    expect(authorize(request)).toEqual({ allowed: true, reasonCode: "GRANTED" });
  });
});

describe("authorize - requiresApproval is surfaced but not itself enforced (later task's workflow)", () => {
  it("flags requiresApproval:true for academic_admin's second-approval-marked question.ranked_publish", () => {
    const request: AuthorizeRequest = {
      actor: actor("aa-1", [unscoped("academic_admin")]),
      action: { type: "ranked_publish", permission: "question.ranked_publish" },
    };
    expect(authorize(request)).toEqual({ allowed: true, reasonCode: "GRANTED", requiresApproval: true });
  });
});
