// Access grant persistence adapter (ENT-001).
//
// access_grants rows are inserted once and never updated (see
// schema/access.ts's module doc). Every status change is an INSERT into
// grant_events - "perubahan dibuat sebagai grant/revocation/event baru,
// bukan update diam-diam," applied literally. Status itself is never
// stored; callers derive it via @superlatif/domain/access's
// deriveGrantStatus from the rows this module returns.

import { and, asc, eq } from "drizzle-orm";
import type { GrantEventType, GrantOwnership } from "@superlatif/domain/access";
import { isOwnedBy } from "@superlatif/domain/access";
import type { Queryable, Schema } from "../db-types.ts";
import { accessGrants, grantEvents } from "../schema/index.ts";

export interface IssueGrantInput {
  readonly userId: string;
  readonly sourceType: string;
  readonly sourceId: string;
  /** Idempotency key: replaying the same event twice with the same key never creates a second grant. */
  readonly sourceKey: string;
  readonly accessPolicyId: string;
  readonly validFrom: Date | null;
  readonly validTo: Date | null;
  readonly issuedByUserId?: string | null;
  readonly issuedReason?: string | null;
}

export interface GrantRow {
  readonly id: string;
  readonly userId: string;
  readonly sourceType: string;
  readonly sourceId: string;
  readonly sourceKey: string;
  readonly accessPolicyId: string;
  readonly validFrom: Date | null;
  readonly validTo: Date | null;
  readonly createdAt: Date;
}

const GRANT_COLUMNS = {
  id: accessGrants.id,
  userId: accessGrants.userId,
  sourceType: accessGrants.sourceType,
  sourceId: accessGrants.sourceId,
  sourceKey: accessGrants.sourceKey,
  accessPolicyId: accessGrants.accessPolicyId,
  validFrom: accessGrants.validFrom,
  validTo: accessGrants.validTo,
  createdAt: accessGrants.createdAt,
};

/**
 * Inserts a grant. Idempotent via the (userId, sourceType, sourceKey)
 * unique index: replaying the same source event returns the EXISTING row
 * rather than raising a constraint-violation error or creating a duplicate
 * (dok 16 invariant 7 "Replay event commerce tidak membuat duplicate
 * grant").
 */
export async function issueGrant(db: Queryable<Schema>, input: IssueGrantInput): Promise<GrantRow> {
  const existing = await findGrantBySourceKey(db, input.userId, input.sourceType, input.sourceKey);
  if (existing) return existing;

  const [row] = await db
    .insert(accessGrants)
    .values({
      userId: input.userId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      sourceKey: input.sourceKey,
      accessPolicyId: input.accessPolicyId,
      validFrom: input.validFrom,
      validTo: input.validTo,
      issuedByUserId: input.issuedByUserId ?? null,
      issuedReason: input.issuedReason ?? null,
    })
    .onConflictDoNothing({ target: [accessGrants.userId, accessGrants.sourceType, accessGrants.sourceKey] })
    .returning(GRANT_COLUMNS);

  if (row) return row;
  // A concurrent caller won the race between our existence check and
  // insert; the unique index guarantees a row now exists - fetch it rather
  // than fail the second caller.
  const afterConflict = await findGrantBySourceKey(db, input.userId, input.sourceType, input.sourceKey);
  if (!afterConflict) throw new Error("issueGrant: onConflictDoNothing left no row and none was found");
  return afterConflict;
}

async function findGrantBySourceKey(
  db: Queryable<Schema>,
  userId: string,
  sourceType: string,
  sourceKey: string,
): Promise<GrantRow | null> {
  const [row] = await db
    .select(GRANT_COLUMNS)
    .from(accessGrants)
    .where(
      and(
        eq(accessGrants.userId, userId),
        eq(accessGrants.sourceType, sourceType),
        eq(accessGrants.sourceKey, sourceKey),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function findGrantById(db: Queryable<Schema>, grantId: string): Promise<GrantRow | null> {
  const [row] = await db
    .select(GRANT_COLUMNS)
    .from(accessGrants)
    .where(eq(accessGrants.id, grantId))
    .limit(1);
  return row ?? null;
}

/**
 * Ordered by (createdAt, id) - ENT-003's "deterministic rebuild" requirement
 * needs this explicitly: without an ORDER BY, Postgres does not guarantee
 * row order, and @superlatif/domain/access#resolveEffectiveAccess's
 * `decisiveGrantIds` is derived directly from this array's order (it dedupes
 * but never sorts) - an unordered fetch could report the same overlapping
 * grants in a different sequence on every call, purely as a side effect of
 * physical storage, never a real change in what a user is entitled to.
 */
export async function listGrantsForUser(db: Queryable<Schema>, userId: string): Promise<GrantRow[]> {
  return db
    .select(GRANT_COLUMNS)
    .from(accessGrants)
    .where(eq(accessGrants.userId, userId))
    .orderBy(asc(accessGrants.createdAt), asc(accessGrants.id));
}

export interface GrantEventRow {
  readonly eventType: GrantEventType;
  readonly occurredAt: Date;
  readonly reason: string | null;
}

export async function listGrantEvents(db: Queryable<Schema>, grantId: string): Promise<GrantEventRow[]> {
  return db
    .select({
      eventType: grantEvents.eventType,
      occurredAt: grantEvents.occurredAt,
      reason: grantEvents.reason,
    })
    .from(grantEvents)
    .where(eq(grantEvents.grantId, grantId))
    .orderBy(asc(grantEvents.occurredAt));
}

const REASON_REQUIRED_EVENTS = new Set<GrantEventType>(["suspended", "revoked", "reinstated", "cancelled"]);

export class GrantEventReasonRequiredError extends Error {
  constructor(eventType: GrantEventType) {
    super(`A reason is required to record a "${eventType}" event (dok 05 §10 E8)`);
    this.name = "GrantEventReasonRequiredError";
  }
}

export class GrantOwnershipMismatchError extends Error {
  constructor(grantId: string) {
    super(`Actor does not own grant ${grantId} - refusing to record the event (SOURCE_OWNERSHIP_MISMATCH)`);
    this.name = "GrantOwnershipMismatchError";
  }
}

export interface RecordGrantEventInput {
  readonly grantId: string;
  readonly eventType: GrantEventType;
  readonly occurredAt: Date;
  readonly actorUserId?: string | null;
  readonly actor?: GrantOwnership | null;
  readonly reason?: string | null;
}

/**
 * Appends a grant_events row. Two invariants enforced here, not left to the
 * caller's discipline:
 *
 *  - dok 05 §10 E8: suspended/revoked/reinstated/cancelled require a reason.
 *  - dok 05 §10 E4 / entitlement-resolution.cases.json ENT-SYN-004: when an
 *    `actor` is supplied, it must own the grant (same sourceType+sourceId)
 *    for events that ADMINISTRATIVELY change status (suspended/revoked/
 *    cancelled/reinstated) - "activated" is a system-derived event and is
 *    not ownership-checked.
 */
export async function recordGrantEvent(db: Queryable<Schema>, input: RecordGrantEventInput): Promise<void> {
  if (REASON_REQUIRED_EVENTS.has(input.eventType) && !input.reason) {
    throw new GrantEventReasonRequiredError(input.eventType);
  }

  if (input.actor && input.eventType !== "activated") {
    const grant = await findGrantById(db, input.grantId);
    if (!grant) throw new Error(`recordGrantEvent: grant ${input.grantId} not found`);
    if (!isOwnedBy({ sourceType: grant.sourceType, sourceId: grant.sourceId }, input.actor)) {
      throw new GrantOwnershipMismatchError(input.grantId);
    }
  }

  await db.insert(grantEvents).values({
    grantId: input.grantId,
    eventType: input.eventType,
    occurredAt: input.occurredAt,
    actorUserId: input.actorUserId ?? null,
    actorSourceType: input.actor?.sourceType ?? null,
    actorSourceId: input.actor?.sourceId ?? null,
    reason: input.reason ?? null,
  });
}
