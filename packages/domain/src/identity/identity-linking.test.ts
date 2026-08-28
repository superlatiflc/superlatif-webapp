import { describe, expect, it } from "vitest";
import {
  evaluateIdentityLink,
  type ExistingUserByContact,
  type IdentityLinkCandidate,
} from "./identity-linking.ts";

const candidate: IdentityLinkCandidate = {
  provider: "wordpress",
  externalSubject: "wp-1001",
  emailNormalized: "student@example.com",
  phoneE164: "+6281200000000",
};

describe("rule 1: an existing (provider, externalSubject) link always resolves directly", () => {
  it("links to the existing user, ignoring any contact info entirely", () => {
    const decision = evaluateIdentityLink(
      candidate,
      { userId: "user-1", provider: "wordpress", externalSubject: "wp-1001" },
      // Even with contact matches present, an existing link takes priority
      // and this list must not influence the outcome.
      [{ userId: "user-2", emailNormalized: candidate.emailNormalized, phoneE164: null }],
    );
    expect(decision).toEqual({ kind: "link_existing", userId: "user-1", reason: "provider_subject_match" });
  });

  it("is idempotent: calling it twice for the same known identity gives the same decision", () => {
    const existingLink = { userId: "user-1", provider: "wordpress", externalSubject: "wp-1001" };
    const first = evaluateIdentityLink(candidate, existingLink, []);
    const second = evaluateIdentityLink(candidate, existingLink, []);
    expect(first).toEqual(second);
  });

  it("throws if the caller passes an existingLink for a different (provider, externalSubject)", () => {
    expect(() =>
      evaluateIdentityLink(
        candidate,
        { userId: "user-1", provider: "wordpress", externalSubject: "wp-9999" },
        [],
      ),
    ).toThrow(/does not match the candidate/);
  });
});

describe("rule 2: no link and no contact collision creates a new user", () => {
  it("returns create_new_user", () => {
    const decision = evaluateIdentityLink(candidate, null, []);
    expect(decision).toEqual({ kind: "create_new_user", reason: "no_existing_link_no_contact_collision" });
  });
});

describe("rule 3: email/phone match against a different user is a conflict, never an auto-link", () => {
  it("email is NEVER a sufficient merge key by itself - a collision is a conflict, not link_existing", () => {
    const matchingUsers: ExistingUserByContact[] = [
      { userId: "user-2", emailNormalized: candidate.emailNormalized, phoneE164: null },
    ];
    const decision = evaluateIdentityLink(candidate, null, matchingUsers);
    expect(decision.kind).toBe("conflict");
    expect(decision.kind).not.toBe("link_existing");
    if (decision.kind === "conflict") {
      expect(decision.reason).toBe("email_collision");
      expect(decision.candidateUserIds).toEqual(["user-2"]);
    }
  });

  it("phone collision is also a conflict, not an auto-link", () => {
    const matchingUsers: ExistingUserByContact[] = [
      { userId: "user-3", emailNormalized: null, phoneE164: candidate.phoneE164 },
    ];
    const decision = evaluateIdentityLink(candidate, null, matchingUsers);
    expect(decision).toEqual({ kind: "conflict", reason: "phone_collision", candidateUserIds: ["user-3"] });
  });

  it("email collision takes priority when both email and phone independently match different users", () => {
    const matchingUsers: ExistingUserByContact[] = [
      { userId: "user-email", emailNormalized: candidate.emailNormalized, phoneE164: null },
      { userId: "user-phone", emailNormalized: null, phoneE164: candidate.phoneE164 },
    ];
    const decision = evaluateIdentityLink(candidate, null, matchingUsers);
    expect(decision.kind).toBe("conflict");
    if (decision.kind === "conflict") expect(decision.reason).toBe("email_collision");
  });

  it("collects every candidate user sharing the same normalized email", () => {
    const matchingUsers: ExistingUserByContact[] = [
      { userId: "user-a", emailNormalized: candidate.emailNormalized, phoneE164: null },
      { userId: "user-b", emailNormalized: candidate.emailNormalized, phoneE164: null },
    ];
    const decision = evaluateIdentityLink(candidate, null, matchingUsers);
    if (decision.kind === "conflict") expect(decision.candidateUserIds).toEqual(["user-a", "user-b"]);
  });

  it("a contact match on an unrelated field (different email, different phone) does not trigger a conflict", () => {
    const matchingUsers: ExistingUserByContact[] = [
      { userId: "user-unrelated", emailNormalized: "someone-else@example.com", phoneE164: "+15555550100" },
    ];
    const decision = evaluateIdentityLink(candidate, null, matchingUsers);
    expect(decision.kind).toBe("create_new_user");
  });

  it("a candidate with no email/phone at all cannot trigger a collision even if the list is non-empty", () => {
    const noContactCandidate: IdentityLinkCandidate = {
      ...candidate,
      emailNormalized: null,
      phoneE164: null,
    };
    const matchingUsers: ExistingUserByContact[] = [
      { userId: "user-x", emailNormalized: null, phoneE164: null },
    ];
    const decision = evaluateIdentityLink(noContactCandidate, null, matchingUsers);
    expect(decision.kind).toBe("create_new_user");
  });
});
