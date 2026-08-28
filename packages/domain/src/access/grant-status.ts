// Grant status derivation (ENT-001).
//
// The founder instruction for this task: "Access grant harus immutable;
// perubahan dibuat sebagai grant/revocation/event baru, bukan update diam-
// diam." access_grants rows never change after insert - no status column,
// no updatedAt. Status is DERIVED from the grant's immutable facts plus an
// append-only stream of administrative events (activated/suspended/
// reinstated/revoked/cancelled), evaluated against a server clock - the
// same "compute, don't store" discipline IDN-001 already used for session
// expiry (evaluateSessionValidity).
//
// Canonical status vocabulary (CLAUDE.md): scheduled, active, suspended,
// expired, revoked, cancelled.

import { resolveActivatedWindow, type ValidityConfig } from "./policy-validity.ts";

export type GrantStatus = "scheduled" | "active" | "suspended" | "expired" | "revoked" | "cancelled";

export type GrantEventType = "activated" | "suspended" | "reinstated" | "revoked" | "cancelled";

export interface GrantEvent {
  readonly eventType: GrantEventType;
  readonly occurredAt: Date;
}

export interface GrantFacts {
  readonly validityConfig: ValidityConfig;
  readonly issuedAt: Date;
  /** Precomputed at issuance for every mode except duration_after_activation (null until an "activated" event exists). */
  readonly validFrom: Date | null;
  readonly validTo: Date | null;
}

export interface DerivedGrantStatus {
  readonly status: GrantStatus;
  readonly reasonCode:
    | "SCHEDULED"
    | "ACTIVE_GRANT"
    | "NO_ACTIVE_GRANT"
    | "SUSPENDED"
    | "REVOKED"
    | "CANCELLED"
    | "PENDING_ACTIVATION";
  readonly effectiveFrom: Date | null;
  readonly effectiveTo: Date | null;
}

/**
 * Derives current status from immutable grant facts plus the event log.
 * `now` is injected - server-authoritative, matching every other clock-
 * sensitive decision in this repository.
 *
 * Boundary semantics match test/fixtures/contracts/entitlement-resolution
 * .cases.json ENT-SYN-003: a grant is expired AT (not only after) its
 * validTo instant - the inclusive boundary IDN-001's evaluateSessionValidity
 * already established.
 */
export function deriveGrantStatus(
  facts: GrantFacts,
  events: readonly GrantEvent[],
  now: Date,
): DerivedGrantStatus {
  // Terminal administrative states win outright and are never revisited:
  // revocation is permanent (dok 05 §8.2 "Dicabut permanen"), and a
  // cancelled grant "tidak pernah aktif karena source order dibatalkan".
  const revoked = events.find((event) => event.eventType === "revoked");
  if (revoked) {
    return { status: "revoked", reasonCode: "REVOKED", effectiveFrom: null, effectiveTo: null };
  }
  const cancelled = events.find((event) => event.eventType === "cancelled");
  if (cancelled) {
    return { status: "cancelled", reasonCode: "CANCELLED", effectiveFrom: null, effectiveTo: null };
  }

  // Suspension is reversible: only the LATEST suspend/reinstate event
  // matters, since a grant can be suspended and reinstated more than once.
  const lastSuspensionEvent = [...events]
    .filter((event) => event.eventType === "suspended" || event.eventType === "reinstated")
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
    .at(-1);
  if (lastSuspensionEvent?.eventType === "suspended") {
    return { status: "suspended", reasonCode: "SUSPENDED", effectiveFrom: null, effectiveTo: null };
  }

  // Resolve the effective window: duration_after_activation has no window
  // until an "activated" event exists.
  let validFrom = facts.validFrom;
  let validTo = facts.validTo;
  if (facts.validityConfig.mode === "duration_after_activation") {
    const activation = events.find((event) => event.eventType === "activated");
    if (!activation) {
      return {
        status: "scheduled",
        reasonCode: "PENDING_ACTIVATION",
        effectiveFrom: null,
        effectiveTo: null,
      };
    }
    const resolved = resolveActivatedWindow(facts.validityConfig, activation.occurredAt);
    validFrom = resolved.validFrom;
    validTo = resolved.validTo;
  }

  if (validFrom !== null && validFrom.getTime() > now.getTime()) {
    return { status: "scheduled", reasonCode: "SCHEDULED", effectiveFrom: validFrom, effectiveTo: validTo };
  }
  if (validTo !== null && validTo.getTime() <= now.getTime()) {
    return {
      status: "expired",
      reasonCode: "NO_ACTIVE_GRANT",
      effectiveFrom: validFrom,
      effectiveTo: validTo,
    };
  }
  return { status: "active", reasonCode: "ACTIVE_GRANT", effectiveFrom: validFrom, effectiveTo: validTo };
}

export interface GrantOwnership {
  readonly sourceType: string;
  readonly sourceId: string;
}

/**
 * dok 05 §10 E4 "Refund hanya memengaruhi grant dari sumber order tersebut":
 * an administrative action may only target a grant owned by the exact same
 * (sourceType, sourceId) that issued it. Matches
 * entitlement-resolution.cases.json ENT-SYN-004 (SOURCE_OWNERSHIP_MISMATCH).
 */
export function isOwnedBy(grant: GrantOwnership, actor: GrantOwnership): boolean {
  return grant.sourceType === actor.sourceType && grant.sourceId === actor.sourceId;
}
