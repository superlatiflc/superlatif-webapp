// WordPress bridge login against real Postgres DDL (M1, ADR-072).
//
// The callback hands performDeterministicLogin a verified (wordpress, <user
// id>) pair with no contact attributes, plus the browser's prior session for
// rotation. These tests pin what that does to users, external_identities,
// identity_conflicts, and user_sessions.

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WORDPRESS_LOGIN_PROVIDER } from "@superlatif/domain/identity";
import { externalIdentities, identityConflicts, userSessions, users } from "../schema/index.ts";
import { createTestDatabase, type TestDatabaseHandle } from "../test-client.ts";
import {
  performDeterministicLogin,
  revokeSessionWithSecret,
  validateSession,
  type DeterministicLoginDeps,
  type DeterministicLoginInput,
} from "./service.ts";

const NOW = new Date("2026-09-10T03:00:00.000Z");
const TTL = 8 * 3600;

function deps(now: Date = NOW): DeterministicLoginDeps {
  return { now: () => now, sessionTtlSeconds: TTL };
}

function bridgeLogin(subject: string, extra: Partial<DeterministicLoginInput> = {}): DeterministicLoginInput {
  return {
    provider: WORDPRESS_LOGIN_PROVIDER,
    externalSubject: subject,
    emailNormalized: null,
    phoneE164: null,
    linkReason: "wordpress_bridge_login",
    ...extra,
  };
}

async function issue(input: DeterministicLoginInput, now: Date = NOW) {
  const result = await performDeterministicLogin(handle.db, input, deps(now));
  if (result.kind !== "session_issued") throw new Error(`expected a session, got ${result.kind}`);
  return result;
}

let handle: TestDatabaseHandle;

beforeEach(async () => {
  handle = await createTestDatabase();
});

afterEach(async () => {
  await handle.close();
});

describe("identity creation and existing identity login", () => {
  it("first bridge login creates exactly one user and one wordpress identity, with no contact data", async () => {
    const first = await issue(bridgeLogin("4821"));
    expect(first.linkDecision).toBe("create_new_user");

    const identities = await handle.db.select().from(externalIdentities);
    expect(identities).toHaveLength(1);
    expect(identities[0]).toMatchObject({
      userId: first.userId,
      provider: "wordpress",
      externalSubject: "4821",
      linkReason: "wordpress_bridge_login",
    });
    const [user] = await handle.db.select().from(users).where(eq(users.id, first.userId));
    expect(user?.emailNormalized).toBeNull();
    expect(user?.phoneE164).toBeNull();
  });

  it("a returning WordPress user resolves to the SAME internal user", async () => {
    const first = await issue(bridgeLogin("4821"));
    const again = await issue(bridgeLogin("4821"));
    expect(again.userId).toBe(first.userId);
    expect(again.linkDecision).toBe("link_existing");
    expect(await handle.db.select().from(users)).toHaveLength(1);
  });

  it("the internal user id is NOT the WordPress id (stable app identity, ADR-005)", async () => {
    const first = await issue(bridgeLogin("4821"));
    expect(first.userId).not.toBe("4821");
    expect(first.userId).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("cross-user isolation", () => {
  it("different WordPress users get different internal users, and each session resolves only to its owner", async () => {
    const a = await issue(bridgeLogin("100"));
    const b = await issue(bridgeLogin("200"));
    expect(a.userId).not.toBe(b.userId);
    expect((await validateSession(handle.db, a.sessionId, a.secret, NOW)).userId).toBe(a.userId);
    expect((await validateSession(handle.db, b.sessionId, b.secret, NOW)).userId).toBe(b.userId);
    // One user's secret never opens another user's session.
    expect((await validateSession(handle.db, a.sessionId, b.secret, NOW)).outcome).toBe("secret_mismatch");
  });

  it("the same numeric subject under a different provider is a different identity", async () => {
    const wordpress = await issue(bridgeLogin("4821"));
    const dev = await issue(bridgeLogin("4821", { provider: "dev_fixture" }));
    expect(dev.userId).not.toBe(wordpress.userId);
  });
});

describe("identity conflict (email is never a merge key)", () => {
  it("a contact collision records a conflict and issues NO session", async () => {
    await issue(bridgeLogin("legacy-1", { provider: "dev_fixture", emailNormalized: "siswa@example.com" }));
    const result = await performDeterministicLogin(
      handle.db,
      bridgeLogin("4821", { emailNormalized: "siswa@example.com" }),
      deps(),
    );
    expect(result.kind).toBe("conflict");
    expect(await handle.db.select().from(identityConflicts)).toHaveLength(1);
    expect(await handle.db.select().from(userSessions)).toHaveLength(1);
    const wordpressLinks = await handle.db
      .select()
      .from(externalIdentities)
      .where(eq(externalIdentities.provider, "wordpress"));
    expect(wordpressLinks).toHaveLength(0);
  });

  it("the bridge path (no contact attributes) cannot collide, even with an existing email owner", async () => {
    await issue(bridgeLogin("legacy-1", { provider: "dev_fixture", emailNormalized: "siswa@example.com" }));
    const result = await issue(bridgeLogin("4821"));
    expect(result.linkDecision).toBe("create_new_user");
  });
});

describe("session rotation on sign-in (fixation resistance)", () => {
  it("revokes the browser's prior session of the SAME user", async () => {
    const before = await issue(bridgeLogin("4821"));
    const after = await issue(
      bridgeLogin("4821", { supersedesSession: { sessionId: before.sessionId, secret: before.secret } }),
    );
    expect(after.sessionId).not.toBe(before.sessionId);
    expect((await validateSession(handle.db, before.sessionId, before.secret, NOW)).outcome).toBe("revoked");
    expect((await validateSession(handle.db, after.sessionId, after.secret, NOW)).outcome).toBe("valid");
  });

  it("revokes a prior session of a DIFFERENT user (the browser switched account)", async () => {
    const other = await issue(bridgeLogin("100"));
    await issue(
      bridgeLogin("200", { supersedesSession: { sessionId: other.sessionId, secret: other.secret } }),
    );
    expect((await validateSession(handle.db, other.sessionId, other.secret, NOW)).outcome).toBe("revoked");
  });

  it("does NOT revoke when the presented secret is wrong (forged cookie naming someone else's session)", async () => {
    const victim = await issue(bridgeLogin("100"));
    await issue(bridgeLogin("200", { supersedesSession: { sessionId: victim.sessionId, secret: "forged" } }));
    expect((await validateSession(handle.db, victim.sessionId, victim.secret, NOW)).outcome).toBe("valid");
  });

  it("tolerates a malformed prior session id without failing the login", async () => {
    const result = await issue(
      bridgeLogin("4821", { supersedesSession: { sessionId: "not-a-uuid", secret: "x" } }),
    );
    expect(result.kind).toBe("session_issued");
  });

  it("leaves the prior session untouched when the login ends in a conflict", async () => {
    const prior = await issue(
      bridgeLogin("legacy-1", { provider: "dev_fixture", emailNormalized: "siswa@example.com" }),
    );
    const result = await performDeterministicLogin(
      handle.db,
      bridgeLogin("4821", {
        emailNormalized: "siswa@example.com",
        supersedesSession: { sessionId: prior.sessionId, secret: prior.secret },
      }),
      deps(),
    );
    expect(result.kind).toBe("conflict");
    expect((await validateSession(handle.db, prior.sessionId, prior.secret, NOW)).outcome).toBe("valid");
  });
});

describe("logout / revocation and session validity", () => {
  it("revokes only with the matching secret and keeps the original revocation time", async () => {
    const session = await issue(bridgeLogin("4821"));
    expect(await revokeSessionWithSecret(handle.db, session.sessionId, "wrong", NOW)).toBe(false);
    expect((await validateSession(handle.db, session.sessionId, session.secret, NOW)).outcome).toBe("valid");

    expect(await revokeSessionWithSecret(handle.db, session.sessionId, session.secret, NOW)).toBe(true);
    expect((await validateSession(handle.db, session.sessionId, session.secret, NOW)).outcome).toBe(
      "revoked",
    );

    const later = new Date(NOW.getTime() + 60_000);
    expect(await revokeSessionWithSecret(handle.db, session.sessionId, session.secret, later)).toBe(false);
    const [row] = await handle.db.select().from(userSessions).where(eq(userSessions.id, session.sessionId));
    expect(row?.revokedAt?.toISOString()).toBe(NOW.toISOString());
  });

  it("an expired session is rejected", async () => {
    const session = await issue(bridgeLogin("4821"));
    const afterExpiry = new Date(NOW.getTime() + (TTL + 1) * 1000);
    expect((await validateSession(handle.db, session.sessionId, session.secret, afterExpiry)).outcome).toBe(
      "expired",
    );
  });

  it("a malformed session id is simply not found - no database error", async () => {
    expect((await validateSession(handle.db, "not-a-uuid", "x", NOW)).outcome).toBe("not_found");
    expect(await revokeSessionWithSecret(handle.db, "not-a-uuid", "x", NOW)).toBe(false);
  });

  it("only the secret HASH is stored", async () => {
    const session = await issue(bridgeLogin("4821"));
    const [row] = await handle.db.select().from(userSessions).where(eq(userSessions.id, session.sessionId));
    expect(row?.secretHash).not.toBe(session.secret);
    expect(JSON.stringify(row)).not.toContain(session.secret);
  });
});
