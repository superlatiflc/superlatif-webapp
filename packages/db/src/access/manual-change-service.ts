// Manual access change service (ENT-004): request -> peer decision ->
// execution, composing IDN-004's authorize() for role/scope enforcement and
// ENT-002's cache-invalidating grant wrappers so effective access reflects
// a manual change immediately.
//
// Two-step workflow, matching dok 21 §5 "requested action, preview, reason,
// approvals, result":
//   1. requestManualChange - authorize() gates it FIRST (nothing is written
//      if denied), then computes a before-state preview and inserts the
//      immutable request row. Never touches access_grants/grant_events.
//   2. decideManualChange - authorize() gates the DECIDER too (with
//      object.creatorUserId set to the requester, so IDN-004's universal
//      maker-checker rule refuses self-approval structurally); on
//      rejection nothing executes; on approval, the underlying grant
//      mutation runs through ENT-002's issueGrantAndInvalidate/
//      recordGrantEventAndInvalidate wrappers - the ONLY two functions in
//      this codebase that touch the cache, so "resolver/cache langsung
//      invalidated" is inherited for free, not reimplemented here.
//
// "Jangan pernah rewrite purchase grant asli": manual grants/revocations
// use ENT-001's issueGrant/recordGrantEvent UNCHANGED - both are
// insert/append-only by construction, so there is no code path in this
// file (or anywhere else) capable of mutating an existing access_grants
// row. See ADR-051 for the sourceId convention that makes manual
// revocation ownership-scoped to "the manual channel for this student"
// rather than per-request, and why revoking a non-manual grant fails at
// EXECUTION time (GrantOwnershipMismatchError) rather than being
// pre-validated away.

import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { authorize, type AuthorizationDecision } from "@superlatif/domain/authorization";
import {
  deriveManualChangeStatus,
  parsePolicyClaims,
  type EffectiveAccessCache,
  type EffectiveAccessDecision,
  type ManualChangeDecisionFacts,
  type ManualChangeStatus,
  type ManualChangeType,
} from "@superlatif/domain/access";
import type { Queryable, Schema } from "../db-types.ts";
import { accessChangeDecisions, accessChangeRequests } from "../schema/index.ts";
import { listActiveRoleHoldings } from "../authorization/index.ts";
import { findPolicyById } from "./policy-repository.ts";
import { findGrantById } from "./grant-repository.ts";
import {
  getEffectiveAccess,
  issueGrantAndInvalidate,
  recordGrantEventAndInvalidate,
} from "./effective-access-service.ts";

export class ManualChangeNotAuthorizedError extends Error {
  readonly decision: AuthorizationDecision;
  constructor(decision: AuthorizationDecision) {
    super(`Manual change refused: ${decision.reasonCode}`);
    this.name = "ManualChangeNotAuthorizedError";
    this.decision = decision;
  }
}

export class ManualChangeRequestNotFoundError extends Error {
  constructor(changeRequestId: string) {
    super(`Manual change request ${changeRequestId} not found`);
    this.name = "ManualChangeRequestNotFoundError";
  }
}

export class ManualChangeAlreadyDecidedError extends Error {
  constructor(changeRequestId: string, status: ManualChangeStatus) {
    super(`Manual change request ${changeRequestId} already has a decision (status: ${status})`);
    this.name = "ManualChangeAlreadyDecidedError";
  }
}

interface PreviewEntry {
  readonly targetType: string;
  readonly targetRef: string;
  readonly action: string;
  readonly before: EffectiveAccessDecision;
}

/**
 * Impact preview: for every (targetType, targetRef, action) the given
 * policy's claims cover, the CURRENT effective-access decision - "what a
 * reviewer sees before deciding" (dok 21 §5's "preview"). Read-only; never
 * writes anything.
 */
async function buildChangePreview(
  db: Queryable<Schema>,
  cache: EffectiveAccessCache,
  targetUserId: string,
  accessPolicyId: string,
  now: Date,
): Promise<PreviewEntry[]> {
  const policy = await findPolicyById(db, accessPolicyId);
  if (!policy) throw new Error(`buildChangePreview: policy ${accessPolicyId} not found`);
  const claims = parsePolicyClaims(policy.config);

  const preview: PreviewEntry[] = [];
  for (const claim of claims) {
    for (const action of claim.actions) {
      const before = await getEffectiveAccess(
        db,
        cache,
        targetUserId,
        { targetType: claim.targetType, targetRef: claim.targetRef.code, action },
        now,
      );
      preview.push({ targetType: claim.targetType, targetRef: claim.targetRef.code, action, before });
    }
  }
  return preview;
}

export interface RequestManualGrantInput {
  readonly changeType: "manual_grant" | "manual_extension";
  readonly targetUserId: string;
  readonly requestedByUserId: string;
  readonly reason: string;
  readonly correlationId: string;
  readonly accessPolicyId: string;
  readonly validFrom: Date | null;
  readonly validTo: Date | null;
  /** Purely for audit trail clarity on manual_extension - not used for anything at execution time. */
  readonly extendsGrantId?: string;
}

export interface RequestManualRevocationInput {
  readonly changeType: "manual_revocation";
  readonly targetUserId: string;
  readonly requestedByUserId: string;
  readonly reason: string;
  readonly correlationId: string;
  readonly targetGrantId: string;
}

export type RequestManualChangeInput = RequestManualGrantInput | RequestManualRevocationInput;

export interface ChangeRequestRow {
  readonly id: string;
  readonly changeType: string;
  readonly targetUserId: string;
  readonly requestedByUserId: string;
  readonly reason: string;
  readonly correlationId: string;
  readonly payload: Record<string, unknown>;
  readonly previewSnapshot: unknown[];
  readonly createdAt: Date;
}

/**
 * Requests a manual grant, extension, or revocation. `authorize()` runs
 * FIRST - a denied request (missing permission, missing reason/
 * correlationId per the manual_grant_revoke_extension high-risk gate)
 * writes nothing at all, matching "required negative test: unauthorized
 * actor" / "missing reason" exactly at the point of refusal, not after the
 * fact.
 */
export async function requestManualChange(
  db: Queryable<Schema>,
  cache: EffectiveAccessCache,
  input: RequestManualChangeInput,
  now: Date,
): Promise<ChangeRequestRow> {
  const roles = await listActiveRoleHoldings(db, input.requestedByUserId);
  const decision = authorize({
    actor: { userId: input.requestedByUserId, roles },
    action: {
      type: input.changeType,
      permission: "access.manual.change",
      highRiskType: "manual_grant_revoke_extension",
    },
    audit: { reason: input.reason, correlationId: input.correlationId },
  });
  if (!decision.allowed) throw new ManualChangeNotAuthorizedError(decision);

  let payload: Record<string, unknown>;
  let previewSnapshot: PreviewEntry[];

  if (input.changeType === "manual_revocation") {
    const grant = await findGrantById(db, input.targetGrantId);
    if (!grant) throw new Error(`requestManualChange: grant ${input.targetGrantId} not found`);
    payload = { targetGrantId: input.targetGrantId };
    previewSnapshot = await buildChangePreview(db, cache, input.targetUserId, grant.accessPolicyId, now);
  } else {
    payload = {
      accessPolicyId: input.accessPolicyId,
      validFrom: input.validFrom ? input.validFrom.toISOString() : null,
      validTo: input.validTo ? input.validTo.toISOString() : null,
      ...(input.extendsGrantId ? { extendsGrantId: input.extendsGrantId } : {}),
    };
    previewSnapshot = await buildChangePreview(db, cache, input.targetUserId, input.accessPolicyId, now);
  }

  const [row] = await db
    .insert(accessChangeRequests)
    .values({
      changeType: input.changeType,
      targetUserId: input.targetUserId,
      requestedByUserId: input.requestedByUserId,
      reason: input.reason,
      correlationId: input.correlationId,
      payload,
      previewSnapshot,
    })
    .returning();
  if (!row) throw new Error("requestManualChange: insert returned no row");
  return row as ChangeRequestRow;
}

export interface DecisionRow {
  readonly id: string;
  readonly changeRequestId: string;
  readonly decidedByUserId: string;
  readonly outcome: "approved" | "rejected";
  readonly reason: string;
  readonly correlationId: string;
  readonly executionStatus: "executed" | "execution_failed" | null;
  readonly executionResult: Record<string, unknown> | null;
  readonly resultGrantId: string | null;
  readonly occurredAt: Date;
}

async function listDecisionRows(db: Queryable<Schema>, changeRequestId: string): Promise<DecisionRow[]> {
  const rows = await db
    .select()
    .from(accessChangeDecisions)
    .where(eq(accessChangeDecisions.changeRequestId, changeRequestId));
  return rows as DecisionRow[];
}

function toFacts(row: DecisionRow): ManualChangeDecisionFacts {
  return { outcome: row.outcome, executionStatus: row.executionStatus, occurredAt: row.occurredAt };
}

export interface DecideManualChangeInput {
  readonly changeRequestId: string;
  readonly decidedByUserId: string;
  readonly outcome: "approved" | "rejected";
  readonly reason: string;
  readonly correlationId: string;
}

/**
 * Records a peer decision on a pending request. Approving executes the
 * underlying grant mutation through ENT-002's cache-invalidating
 * wrappers; a failure there (e.g. `GrantOwnershipMismatchError` when a
 * manual revocation targets a non-manual-sourced grant - "jangan pernah
 * rewrite purchase grant asli," proven by NOT executing rather than by
 * pre-validating it away) is captured as `executionStatus:
 * "execution_failed"` on the decision row rather than thrown - the
 * decision itself (a human peer approving) still happened and is still
 * auditable, even though the system correctly refused to carry it out.
 */
export async function decideManualChange(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  cache: EffectiveAccessCache,
  input: DecideManualChangeInput,
  now: Date,
): Promise<DecisionRow> {
  const [request] = await db
    .select()
    .from(accessChangeRequests)
    .where(eq(accessChangeRequests.id, input.changeRequestId))
    .limit(1);
  if (!request) throw new ManualChangeRequestNotFoundError(input.changeRequestId);

  const existingDecisions = await listDecisionRows(db, input.changeRequestId);
  const currentStatus = deriveManualChangeStatus(existingDecisions.map(toFacts));
  if (currentStatus !== "pending_approval")
    throw new ManualChangeAlreadyDecidedError(input.changeRequestId, currentStatus);

  const roles = await listActiveRoleHoldings(db, input.decidedByUserId);
  const decision = authorize({
    actor: { userId: input.decidedByUserId, roles },
    action: {
      type: `${request.changeType}_decision`,
      permission: "access.manual.change",
      highRiskType: "manual_grant_revoke_extension",
    },
    // Maker-checker: the requester is the "creator" of this decision's
    // object - a decider who IS the requester is refused here,
    // structurally, by IDN-004's universal rule, before anything below runs.
    object: { creatorUserId: request.requestedByUserId },
    audit: { reason: input.reason, correlationId: input.correlationId },
  });
  if (!decision.allowed) throw new ManualChangeNotAuthorizedError(decision);

  if (input.outcome === "rejected") {
    const [row] = await db
      .insert(accessChangeDecisions)
      .values({
        changeRequestId: input.changeRequestId,
        decidedByUserId: input.decidedByUserId,
        outcome: "rejected",
        reason: input.reason,
        correlationId: input.correlationId,
        occurredAt: now,
      })
      .returning();
    if (!row) throw new Error("decideManualChange: insert returned no row");
    return row as DecisionRow;
  }

  let executionStatus: "executed" | "execution_failed";
  let executionResult: Record<string, unknown>;
  let resultGrantId: string | null = null;

  try {
    if (request.changeType === "manual_revocation") {
      const payload = request.payload as { targetGrantId: string };
      await recordGrantEventAndInvalidate(db, cache, request.targetUserId, {
        grantId: payload.targetGrantId,
        eventType: "revoked",
        occurredAt: now,
        reason: request.reason,
        // sourceId = targetUserId (not this request's id) - the stable
        // "manual channel" identity for this student. Only grants that
        // were THEMSELVES issued with sourceType="manual" for this same
        // user satisfy ENT-001's ownership check; a purchase/scholarship/
        // bundle-sourced grant is refused here (GrantOwnershipMismatchError)
        // by construction. See ADR-051.
        actor: { sourceType: "manual", sourceId: request.targetUserId },
      });
      resultGrantId = payload.targetGrantId;
      executionStatus = "executed";
      executionResult = { revokedGrantId: payload.targetGrantId };
    } else {
      const payload = request.payload as {
        accessPolicyId: string;
        validFrom: string | null;
        validTo: string | null;
      };
      const grant = await issueGrantAndInvalidate(db, cache, {
        userId: request.targetUserId,
        sourceType: "manual",
        sourceId: request.targetUserId,
        // sourceKey = this request's id: replaying decideManualChange for
        // the same request is idempotent (ENT-001's unique index), never a
        // duplicate grant.
        sourceKey: request.id,
        accessPolicyId: payload.accessPolicyId,
        validFrom: payload.validFrom ? new Date(payload.validFrom) : null,
        validTo: payload.validTo ? new Date(payload.validTo) : null,
        issuedByUserId: input.decidedByUserId,
        issuedReason: request.reason,
      });
      resultGrantId = grant.id;
      executionStatus = "executed";
      executionResult = { grantId: grant.id };
    }
  } catch (error) {
    executionStatus = "execution_failed";
    executionResult = {
      errorType: error instanceof Error ? error.constructor.name : "UnknownError",
      message: error instanceof Error ? error.message : String(error),
    };
  }

  const [row] = await db
    .insert(accessChangeDecisions)
    .values({
      changeRequestId: input.changeRequestId,
      decidedByUserId: input.decidedByUserId,
      outcome: "approved",
      reason: input.reason,
      correlationId: input.correlationId,
      executionStatus,
      executionResult,
      resultGrantId,
      occurredAt: now,
    })
    .returning();
  if (!row) throw new Error("decideManualChange: insert returned no row");
  return row as DecisionRow;
}

export interface ChangeRequestWithStatus {
  readonly request: ChangeRequestRow;
  readonly decisions: readonly DecisionRow[];
  readonly status: ManualChangeStatus;
}

export async function getManualChangeRequest(
  db: Queryable<Schema>,
  changeRequestId: string,
): Promise<ChangeRequestWithStatus | null> {
  const [request] = await db
    .select()
    .from(accessChangeRequests)
    .where(eq(accessChangeRequests.id, changeRequestId))
    .limit(1);
  if (!request) return null;
  const decisions = await listDecisionRows(db, changeRequestId);
  const status = deriveManualChangeStatus(decisions.map(toFacts));
  return { request: request as ChangeRequestRow, decisions, status };
}

export type { ManualChangeType };
