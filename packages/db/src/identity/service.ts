// Identity/session service (IDN-001).
//
// Orchestrates packages/domain's pure decisions with packages/db's
// repository inside one transaction, so a login mapping (user creation +
// external identity link + session issuance, or a conflict record) is
// atomic - CLAUDE.md "Use explicit transactions for ... other atomic
// invariants". "Login mapping is deterministic and audited" (IDN-001
// acceptance): deterministic because evaluateIdentityLink always returns
// the same decision for the same inputs; audited via the structured logger
// built in GOV-004, correlation-ID tagged, rather than a new bespoke audit
// table (identity_conflicts already covers the case that genuinely needs a
// durable, queryable record).

import {
  computeSessionExpiry,
  evaluateIdentityLink,
  evaluateSessionValidity,
  generateSessionSecret,
  hashSessionSecret,
  secretMatchesHash,
} from "@superlatif/domain/identity";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as repository from "./repository.ts";
import type { Queryable, Schema } from "./repository.ts";

/**
 * Minimal structural logging capability, not an import of
 * @superlatif/observability: packages/db is only allowed to depend on
 * contracts and domain (ADR-042 layering), and a full package dependency
 * for "can log two messages" would be disproportionate. Any
 * @superlatif/observability Logger already satisfies this shape - the
 * caller wires the real one in, this module only needs the capability.
 */
export interface AuditLogger {
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
}

export interface DeterministicLoginInput {
  readonly provider: string;
  readonly externalSubject: string;
  readonly emailNormalized: string | null;
  readonly phoneE164: string | null;
  /** Why this link is being created, e.g. "deterministic_fixture_login". The live bridge reason arrives with IDN-002. */
  readonly linkReason: string;
  readonly deviceLabel?: string | null;
  readonly ipPrefix?: string | null;
  readonly userAgentFamily?: string | null;
}

export interface DeterministicLoginDeps {
  readonly now: () => Date;
  readonly sessionTtlSeconds: number;
  readonly logger?: AuditLogger;
}

export type DeterministicLoginResult =
  | {
      readonly kind: "session_issued";
      readonly userId: string;
      readonly sessionId: string;
      /** Raw secret - returned exactly once. Callers must hand it to the caller and never log it. */
      readonly secret: string;
      readonly linkDecision: "link_existing" | "create_new_user";
    }
  | { readonly kind: "conflict"; readonly conflictId: string; readonly candidateUserIds: readonly string[] };

/**
 * Resolves a (provider, externalSubject) pair to a session, or to a
 * recorded conflict. Never fabricates live provider behaviour: `provider`/
 * `externalSubject`/contact fields are supplied by the caller (a test
 * fixture today; the real bridge adapter once IDN-002/OD-02 close) - this
 * function has no knowledge of WordPress/Sejoli specifically.
 */
export async function performDeterministicLogin(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  input: DeterministicLoginInput,
  deps: DeterministicLoginDeps,
): Promise<DeterministicLoginResult> {
  return db.transaction(async (tx) => {
    const existingLink = await repository.findExternalIdentity(tx, input.provider, input.externalSubject);
    const contactMatches = existingLink
      ? []
      : await repository.findUsersByContact(tx, {
          emailNormalized: input.emailNormalized,
          phoneE164: input.phoneE164,
        });

    const decision = evaluateIdentityLink(
      {
        provider: input.provider,
        externalSubject: input.externalSubject,
        emailNormalized: input.emailNormalized,
        phoneE164: input.phoneE164,
      },
      existingLink,
      contactMatches,
    );

    if (decision.kind === "conflict") {
      const { conflictId } = await repository.createIdentityConflict(tx, {
        conflictType: decision.reason,
        candidateUserIds: decision.candidateUserIds,
        evidence: {
          provider: input.provider,
          externalSubject: input.externalSubject,
          reason: decision.reason,
        },
      });
      deps.logger?.warn("identity.link_conflict", {
        conflictId,
        reason: decision.reason,
        candidateCount: decision.candidateUserIds.length,
      });
      return { kind: "conflict" as const, conflictId, candidateUserIds: decision.candidateUserIds };
    }

    let userId: string;
    if (decision.kind === "link_existing") {
      userId = decision.userId;
    } else {
      const created = await repository.createUser(tx, {
        emailNormalized: input.emailNormalized,
        phoneE164: input.phoneE164,
      });
      userId = created.userId;
      await repository.linkExternalIdentity(tx, {
        userId,
        provider: input.provider,
        externalSubject: input.externalSubject,
        linkReason: input.linkReason,
      });
    }

    const secret = generateSessionSecret();
    const now = deps.now();
    const { sessionId } = await repository.insertSession(tx, {
      userId,
      secretHash: hashSessionSecret(secret),
      expiresAt: computeSessionExpiry(now, deps.sessionTtlSeconds),
      deviceLabel: input.deviceLabel ?? null,
      ipPrefix: input.ipPrefix ?? null,
      userAgentFamily: input.userAgentFamily ?? null,
    });

    deps.logger?.info("identity.login_mapped", {
      userId,
      sessionId,
      decision: decision.kind,
      provider: input.provider,
    });

    return { kind: "session_issued" as const, userId, sessionId, secret, linkDecision: decision.kind };
  });
}

export type SessionValidationOutcome = "valid" | "not_found" | "expired" | "revoked" | "secret_mismatch";

export interface ValidateSessionResult {
  readonly outcome: SessionValidationOutcome;
  readonly userId?: string;
}

/**
 * Checks a session ID + raw secret pair. Internal server-side use only: the
 * distinct outcomes (not_found/expired/revoked/secret_mismatch) are useful
 * for logging and precise tests, but an HTTP layer built on top of this must
 * map every non-"valid" outcome to the same generic 401 - echoing WHICH
 * reason a session is invalid to an unauthenticated caller is an oracle.
 */
export async function validateSession(
  db: Queryable<Schema>,
  sessionId: string,
  providedSecret: string,
  now: Date,
): Promise<ValidateSessionResult> {
  const session = await repository.findSessionById(db, sessionId);
  if (!session) return { outcome: "not_found" };
  if (!secretMatchesHash(providedSecret, session.secretHash)) return { outcome: "secret_mismatch" };
  const validity = evaluateSessionValidity(session, now);
  if (validity !== "valid") return { outcome: validity };
  return { outcome: "valid", userId: session.userId };
}

export async function revokeSessionById(db: Queryable<Schema>, sessionId: string, now: Date): Promise<void> {
  await repository.revokeSession(db, sessionId, now);
}
