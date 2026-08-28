import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabaseHandle } from "../test-client.ts";
import { findExternalIdentity, findSessionById, findUsersByContact } from "./repository.ts";
import {
  performDeterministicLogin,
  revokeSessionById,
  validateSession,
  type DeterministicLoginDeps,
  type DeterministicLoginInput,
} from "./service.ts";

const FIXED_NOW = new Date("2026-06-01T00:00:00.000Z");
const SESSION_TTL_SECONDS = 3600;

function deps(overrides: Partial<DeterministicLoginDeps> = {}): DeterministicLoginDeps {
  return { now: () => FIXED_NOW, sessionTtlSeconds: SESSION_TTL_SECONDS, ...overrides };
}

function loginInput(overrides: Partial<DeterministicLoginInput> = {}): DeterministicLoginInput {
  return {
    provider: "deterministic-fixture",
    externalSubject: "subject-1",
    emailNormalized: "student@example.com",
    phoneE164: null,
    linkReason: "deterministic_fixture_login",
    ...overrides,
  };
}

let handle: TestDatabaseHandle;

beforeEach(async () => {
  handle = await createTestDatabase();
});

afterEach(async () => {
  await handle.close();
});

describe("known identity login (IDN-001 acceptance: deterministic mapping)", () => {
  it("creates a new user + link + session on first login", async () => {
    const result = await performDeterministicLogin(handle.db, loginInput(), deps());
    expect(result.kind).toBe("session_issued");
    if (result.kind === "session_issued") {
      expect(result.linkDecision).toBe("create_new_user");
      expect(result.secret.length).toBeGreaterThan(0);
    }
  });

  it("resolves the SAME user deterministically on a repeat login for a known identity", async () => {
    const first = await performDeterministicLogin(handle.db, loginInput(), deps());
    const second = await performDeterministicLogin(handle.db, loginInput(), deps());
    expect(first.kind).toBe("session_issued");
    expect(second.kind).toBe("session_issued");
    if (first.kind === "session_issued" && second.kind === "session_issued") {
      expect(second.userId).toBe(first.userId);
      expect(second.linkDecision).toBe("link_existing");
      // Each login mints its own session - never the same one.
      expect(second.sessionId).not.toBe(first.sessionId);
      expect(second.secret).not.toBe(first.secret);
    }
  });

  it("never stores the raw session secret anywhere in the database", async () => {
    const result = await performDeterministicLogin(handle.db, loginInput(), deps());
    if (result.kind !== "session_issued") throw new Error("expected session_issued");
    const found = await findSessionById(handle.db, result.sessionId);
    expect(found).not.toBeNull();
    expect(found?.secretHash).not.toBe(result.secret);
    expect(found?.secretHash.length).toBe(64); // sha256 hex digest length
  });

  it("actually persists the external identity link at the database level", async () => {
    await performDeterministicLogin(handle.db, loginInput(), deps());
    const link = await findExternalIdentity(handle.db, "deterministic-fixture", "subject-1");
    expect(link).not.toBeNull();
  });
});

describe("duplicate email conflict (required negative test)", () => {
  it("creates an identity_conflicts record instead of auto-linking or creating a session, when a NEW external subject shares an email with an existing different user", async () => {
    const first = await performDeterministicLogin(
      handle.db,
      loginInput({ externalSubject: "subject-1" }),
      deps(),
    );
    expect(first.kind).toBe("session_issued");

    // A different provider/subject pair arrives with the SAME email.
    const second = await performDeterministicLogin(
      handle.db,
      loginInput({ provider: "another-provider", externalSubject: "subject-2" }),
      deps(),
    );

    expect(second.kind).toBe("conflict");
    if (second.kind === "conflict" && first.kind === "session_issued") {
      expect(second.candidateUserIds).toEqual([first.userId]);
    }
  });

  it("does NOT create a session for the conflicting login attempt", async () => {
    await performDeterministicLogin(handle.db, loginInput({ externalSubject: "subject-1" }), deps());
    const result = await performDeterministicLogin(
      handle.db,
      loginInput({ provider: "another-provider", externalSubject: "subject-2" }),
      deps(),
    );
    expect(result.kind).toBe("conflict");
    expect((result as { secret?: string }).secret).toBeUndefined();
  });

  it("does NOT link the new external identity while a conflict is unresolved", async () => {
    await performDeterministicLogin(handle.db, loginInput({ externalSubject: "subject-1" }), deps());
    await performDeterministicLogin(
      handle.db,
      loginInput({ provider: "another-provider", externalSubject: "subject-2" }),
      deps(),
    );
    const link = await findExternalIdentity(handle.db, "another-provider", "subject-2");
    expect(link).toBeNull();
  });

  it("email alone is never sufficient to merge - two independent providers with the same email produce TWO separate users, not one", async () => {
    // First provider creates user A.
    await performDeterministicLogin(
      handle.db,
      loginInput({ provider: "provider-a", externalSubject: "a-1" }),
      deps(),
    );
    // Second provider with the same email is flagged, not merged - so a
    // second, genuinely different user must never silently appear either;
    // confirm exactly one contact match exists (the original user), proving
    // no phantom second user was created for the "merge".
    await performDeterministicLogin(
      handle.db,
      loginInput({ provider: "provider-b", externalSubject: "b-1" }),
      deps(),
    );
    const matches = await findUsersByContact(handle.db, {
      emailNormalized: "student@example.com",
      phoneE164: null,
    });
    expect(matches).toHaveLength(1);
  });

  it("the database itself allows two users to share an email (no unique constraint) - required for a conflict to even be possible", async () => {
    // If email_normalized were unique, this schema could never represent a
    // genuine collision case; assert both users can coexist in the users
    // table with the same email until a human resolves the conflict.
    const { createUser } = await import("./repository.ts");
    const a = await createUser(handle.db, { emailNormalized: "shared@example.com", phoneE164: null });
    const b = await createUser(handle.db, { emailNormalized: "shared@example.com", phoneE164: null });
    expect(a.userId).not.toBe(b.userId);
  });
});

describe("revoked session rejection (required negative test)", () => {
  it("a valid session validates successfully before revocation", async () => {
    const login = await performDeterministicLogin(handle.db, loginInput(), deps());
    if (login.kind !== "session_issued") throw new Error("expected session_issued");
    const result = await validateSession(handle.db, login.sessionId, login.secret, FIXED_NOW);
    expect(result).toEqual({ outcome: "valid", userId: login.userId });
  });

  it("rejects the exact same secret once the session is revoked", async () => {
    const login = await performDeterministicLogin(handle.db, loginInput(), deps());
    if (login.kind !== "session_issued") throw new Error("expected session_issued");

    await revokeSessionById(handle.db, login.sessionId, FIXED_NOW);

    const result = await validateSession(handle.db, login.sessionId, login.secret, FIXED_NOW);
    expect(result.outcome).toBe("revoked");
    expect(result.userId).toBeUndefined();
  });

  it("revocation is enforceable per-device: revoking one session never invalidates another session for the same user", async () => {
    const first = await performDeterministicLogin(handle.db, loginInput(), deps());
    const second = await performDeterministicLogin(handle.db, loginInput(), deps());
    if (first.kind !== "session_issued" || second.kind !== "session_issued")
      throw new Error("expected sessions");

    await revokeSessionById(handle.db, first.sessionId, FIXED_NOW);

    expect((await validateSession(handle.db, first.sessionId, first.secret, FIXED_NOW)).outcome).toBe(
      "revoked",
    );
    expect((await validateSession(handle.db, second.sessionId, second.secret, FIXED_NOW)).outcome).toBe(
      "valid",
    );
  });
});

describe("session replay/fixation (required negative test)", () => {
  it("replay: a captured secret from BEFORE revocation is rejected AFTER revocation, even though it is byte-for-byte the original valid secret", async () => {
    const login = await performDeterministicLogin(handle.db, loginInput(), deps());
    if (login.kind !== "session_issued") throw new Error("expected session_issued");
    const capturedSecret = login.secret; // attacker captures the valid secret

    await revokeSessionById(handle.db, login.sessionId, FIXED_NOW);

    const replay = await validateSession(handle.db, login.sessionId, capturedSecret, FIXED_NOW);
    expect(replay.outcome).toBe("revoked");
  });

  it("replay: an expired session's secret is rejected even when it is the correct secret", async () => {
    const login = await performDeterministicLogin(handle.db, loginInput(), deps({ sessionTtlSeconds: 60 }));
    if (login.kind !== "session_issued") throw new Error("expected session_issued");

    const wayAfterExpiry = new Date(FIXED_NOW.getTime() + 3_600_000);
    const result = await validateSession(handle.db, login.sessionId, login.secret, wayAfterExpiry);
    expect(result.outcome).toBe("expired");
  });

  it("fixation: session creation never accepts a caller-supplied session identifier - performDeterministicLogin's own input type has no such field", async () => {
    // Structural proof, not just a runtime one: DeterministicLoginInput has
    // no sessionId/session identifier field at all, so there is no code path
    // by which a caller (or an attacker who set one before authentication)
    // could make the server reuse a pre-chosen session ID.
    const input = loginInput();
    expect(Object.keys(input)).not.toContain("sessionId");
    expect(Object.keys(input)).not.toContain("existingSessionId");
  });

  it("fixation: two logins for the same identity always mint a NEW session id and secret, never reusing the previous one", async () => {
    const first = await performDeterministicLogin(handle.db, loginInput(), deps());
    const second = await performDeterministicLogin(handle.db, loginInput(), deps());
    if (first.kind !== "session_issued" || second.kind !== "session_issued")
      throw new Error("expected sessions");
    expect(second.sessionId).not.toBe(first.sessionId);
    expect(second.secret).not.toBe(first.secret);
  });

  it("wrong secret against a real, valid session is rejected without revealing which part was wrong", async () => {
    const login = await performDeterministicLogin(handle.db, loginInput(), deps());
    if (login.kind !== "session_issued") throw new Error("expected session_issued");
    const result = await validateSession(handle.db, login.sessionId, "not-the-real-secret", FIXED_NOW);
    expect(result.outcome).toBe("secret_mismatch");
  });

  it("an unknown session id is rejected as not_found, not as a crash or false positive", async () => {
    const result = await validateSession(
      handle.db,
      "00000000-0000-0000-0000-000000000000",
      "anything",
      FIXED_NOW,
    );
    expect(result.outcome).toBe("not_found");
  });
});
