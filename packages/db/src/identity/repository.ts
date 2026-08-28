// Identity persistence adapter (IDN-001).
//
// Driver-agnostic: every function takes a drizzle `PgDatabase` (or
// transaction handle), which both the production postgres.js client and the
// pglite test client satisfy identically. ADR-042 layering: packages/db may
// depend on packages/domain, never the reverse - this module is where pure
// domain decisions (identity-linking.ts, session.ts) meet real reads/writes.

import { and, eq, or } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from "drizzle-orm/pg-core";
import type {
  ExistingExternalIdentity,
  ExistingUserByContact,
  IdentityLinkCandidate,
} from "@superlatif/domain/identity";
import { externalIdentities, identityConflicts, userSessions, users } from "../schema/index.ts";

/** Anything that can run drizzle queries: a top-level db handle or an open transaction. Both drivers satisfy this identically. */
export type Queryable<TSchema extends Record<string, unknown> = Record<string, never>> =
  PgDatabase<PgQueryResultHKT, TSchema> | PgTransaction<PgQueryResultHKT, TSchema>;

/** Exported so service.ts (and any other consumer) references the exact same type, not a structurally-similar redeclaration drizzle's generics would reject. */
export type Schema = {
  users: typeof users;
  externalIdentities: typeof externalIdentities;
  userSessions: typeof userSessions;
  identityConflicts: typeof identityConflicts;
};

export async function findExternalIdentity(
  db: Queryable<Schema>,
  provider: string,
  externalSubject: string,
): Promise<ExistingExternalIdentity | null> {
  const [row] = await db
    .select({
      userId: externalIdentities.userId,
      provider: externalIdentities.provider,
      externalSubject: externalIdentities.externalSubject,
    })
    .from(externalIdentities)
    .where(
      and(eq(externalIdentities.provider, provider), eq(externalIdentities.externalSubject, externalSubject)),
    )
    .limit(1);
  return row ?? null;
}

export async function findUsersByContact(
  db: Queryable<Schema>,
  candidate: Pick<IdentityLinkCandidate, "emailNormalized" | "phoneE164">,
): Promise<ExistingUserByContact[]> {
  if (candidate.emailNormalized === null && candidate.phoneE164 === null) return [];
  const conditions = [];
  if (candidate.emailNormalized !== null)
    conditions.push(eq(users.emailNormalized, candidate.emailNormalized));
  if (candidate.phoneE164 !== null) conditions.push(eq(users.phoneE164, candidate.phoneE164));
  const rows = await db
    .select({ userId: users.id, emailNormalized: users.emailNormalized, phoneE164: users.phoneE164 })
    .from(users)
    .where(or(...conditions));
  return rows;
}

export async function createUser(
  db: Queryable<Schema>,
  input: { emailNormalized: string | null; phoneE164: string | null; displayName?: string | null },
): Promise<{ userId: string }> {
  const [row] = await db
    .insert(users)
    .values({
      emailNormalized: input.emailNormalized,
      phoneE164: input.phoneE164,
      displayName: input.displayName ?? null,
    })
    .returning({ userId: users.id });
  if (!row) throw new Error("createUser: insert returned no row");
  return row;
}

export async function linkExternalIdentity(
  db: Queryable<Schema>,
  input: {
    userId: string;
    provider: string;
    externalSubject: string;
    linkReason: string;
    linkedByUserId?: string | null;
    verifiedAt?: Date | null;
  },
): Promise<void> {
  await db.insert(externalIdentities).values({
    userId: input.userId,
    provider: input.provider,
    externalSubject: input.externalSubject,
    linkReason: input.linkReason,
    linkedByUserId: input.linkedByUserId ?? null,
    verifiedAt: input.verifiedAt ?? null,
  });
}

export async function createIdentityConflict(
  db: Queryable<Schema>,
  input: { conflictType: string; candidateUserIds: readonly string[]; evidence: Record<string, unknown> },
): Promise<{ conflictId: string }> {
  const [row] = await db
    .insert(identityConflicts)
    .values({
      conflictType: input.conflictType,
      candidateUserIds: [...input.candidateUserIds],
      evidence: input.evidence,
    })
    .returning({ conflictId: identityConflicts.id });
  if (!row) throw new Error("createIdentityConflict: insert returned no row");
  return row;
}

export interface CreatedSession {
  readonly sessionId: string;
  /** Raw secret - returned exactly once, at creation. Never persisted anywhere; callers must not log it. */
  readonly secret: string;
}

export async function insertSession(
  db: Queryable<Schema>,
  input: {
    userId: string;
    secretHash: string;
    expiresAt: Date;
    deviceLabel?: string | null;
    ipPrefix?: string | null;
    userAgentFamily?: string | null;
  },
): Promise<{ sessionId: string }> {
  const [row] = await db
    .insert(userSessions)
    .values({
      userId: input.userId,
      secretHash: input.secretHash,
      expiresAt: input.expiresAt,
      deviceLabel: input.deviceLabel ?? null,
      ipPrefix: input.ipPrefix ?? null,
      userAgentFamily: input.userAgentFamily ?? null,
    })
    .returning({ sessionId: userSessions.id });
  if (!row) throw new Error("insertSession: insert returned no row");
  return row;
}

export interface SessionRow {
  readonly id: string;
  readonly userId: string;
  readonly secretHash: string;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
}

export async function findSessionById(db: Queryable<Schema>, sessionId: string): Promise<SessionRow | null> {
  const [row] = await db
    .select({
      id: userSessions.id,
      userId: userSessions.userId,
      secretHash: userSessions.secretHash,
      expiresAt: userSessions.expiresAt,
      revokedAt: userSessions.revokedAt,
    })
    .from(userSessions)
    .where(eq(userSessions.id, sessionId))
    .limit(1);
  return row ?? null;
}

export async function revokeSession(
  db: Queryable<Schema>,
  sessionId: string,
  revokedAt: Date,
): Promise<void> {
  await db.update(userSessions).set({ revokedAt }).where(eq(userSessions.id, sessionId));
}

export async function touchSessionLastSeen(
  db: Queryable<Schema>,
  sessionId: string,
  seenAt: Date,
): Promise<void> {
  await db.update(userSessions).set({ lastSeenAt: seenAt }).where(eq(userSessions.id, sessionId));
}
