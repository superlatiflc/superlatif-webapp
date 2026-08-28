// Identity linking policy (IDN-001).
//
// 23_SEJOLI_WORDPRESS_INTEGRATION.md §4 "Link rules":
//   1. Existing verified external identity maps directly.
//   2. New external subject + unique verified account creates/link per policy.
//   3. Email/phone collision creates conflict case.
//   4. Support merge requires evidence, elevated permission, preview, audit.
//   5. External user deletion/suspension does not silently delete app history.
//
// The hard rule this module enforces structurally: (provider, externalSubject)
// is the ONLY thing that ever links to an existing app user automatically.
// An email/phone match by itself NEVER links or merges - at most it produces
// a conflict case for a human to resolve (rule 3/4). There is no code path
// in this module that returns "link_existing" on the strength of an email
// match alone; evaluateIdentityLink's own tests assert that directly.
//
// Pure: takes already-looked-up candidates, returns a decision. The caller
// (packages/db's repository/service layer) performs the actual reads/writes
// inside a transaction and is the only place I/O happens.

export interface IdentityLinkCandidate {
  readonly provider: string;
  readonly externalSubject: string;
  readonly emailNormalized: string | null;
  readonly phoneE164: string | null;
}

export interface ExistingExternalIdentity {
  readonly userId: string;
  readonly provider: string;
  readonly externalSubject: string;
}

export interface ExistingUserByContact {
  readonly userId: string;
  readonly emailNormalized: string | null;
  readonly phoneE164: string | null;
}

export type IdentityLinkDecision =
  | { readonly kind: "link_existing"; readonly userId: string; readonly reason: "provider_subject_match" }
  | { readonly kind: "create_new_user"; readonly reason: "no_existing_link_no_contact_collision" }
  | {
      readonly kind: "conflict";
      readonly reason: "email_collision" | "phone_collision";
      readonly candidateUserIds: readonly string[];
    };

/**
 * Decides how a (provider, externalSubject) pair should resolve against
 * existing state. Deterministic: the same inputs always produce the same
 * decision, which is what IDN-001's "Login mapping is deterministic" means.
 */
export function evaluateIdentityLink(
  candidate: IdentityLinkCandidate,
  existingLink: ExistingExternalIdentity | null,
  usersMatchingContact: readonly ExistingUserByContact[],
): IdentityLinkDecision {
  // Rule 1: an existing verified (provider, externalSubject) link always
  // wins and is never re-evaluated against contact info. This also makes
  // repeated calls for the same external identity idempotent.
  if (existingLink !== null) {
    if (
      existingLink.provider !== candidate.provider ||
      existingLink.externalSubject !== candidate.externalSubject
    ) {
      // Defensive: a caller passing a mismatched existingLink is a bug in
      // the caller, not a case this policy should silently paper over.
      throw new Error(
        "evaluateIdentityLink: existingLink does not match the candidate's (provider, externalSubject)",
      );
    }
    return { kind: "link_existing", userId: existingLink.userId, reason: "provider_subject_match" };
  }

  // Rule 3: any contact match against a DIFFERENT user (no existing link for
  // this exact provider/subject) is a conflict, never an automatic merge.
  // Email is deliberately never sufficient by itself to link an identity.
  if (usersMatchingContact.length > 0) {
    const emailMatches = usersMatchingContact.filter(
      (user) => candidate.emailNormalized !== null && user.emailNormalized === candidate.emailNormalized,
    );
    const phoneMatches = usersMatchingContact.filter(
      (user) => candidate.phoneE164 !== null && user.phoneE164 === candidate.phoneE164,
    );
    if (emailMatches.length > 0) {
      return {
        kind: "conflict",
        reason: "email_collision",
        candidateUserIds: emailMatches.map((user) => user.userId),
      };
    }
    if (phoneMatches.length > 0) {
      return {
        kind: "conflict",
        reason: "phone_collision",
        candidateUserIds: phoneMatches.map((user) => user.userId),
      };
    }
  }

  // Rule 2: no existing link, no contact collision - safe to create.
  return { kind: "create_new_user", reason: "no_existing_link_no_contact_collision" };
}
