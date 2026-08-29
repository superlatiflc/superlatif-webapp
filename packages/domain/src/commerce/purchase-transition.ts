// Purchase lifecycle transition legality (COM-003).
//
// dok 22 §18 "Purchase transition rules": "Out-of-order event tidak
// otomatis menurunkan state tanpa transition policy/evidence... Paid ->
// pending replay diabaikan/flagged... Unknown/ambiguous event creates
// reconciliation case." dok 23 §11 "Out-of-order": "compare provider
// revision/occurred time and allowed transition; do not regress paid to
// pending; preserve all events; create reconciliation when ambiguous."
//
// This function decides ONE thing: given a purchase's currently-applied
// status/time and one incoming normalized event's status/time, is this
// event safe to apply? It never touches a database and never decides what
// side effect (grant issuance/revocation) an applied transition causes -
// that split mirrors this codebase's usual pure-decision/impure-effect
// separation (e.g. @superlatif/domain/access's deriveGrantStatus vs
// packages/db/src/access's grant-repository.ts).
//
// Two independent checks, in this order:
//   1. STALENESS - does the incoming event's occurredAt precede the
//      purchase's current occurredAt? A stale event is rejected regardless
//      of whether its target status would otherwise be a legal transition -
//      a late-arriving webhook from before the purchase's current state
//      must never move the timeline backward.
//   2. LEGALITY - for a non-stale event, is (currentStatus -> incomingStatus)
//      an allowed edge in ALLOWED_TRANSITIONS? "paid -> pending" is
//      deliberately absent (dok 22 §18's own example of a rejected
//      regression).
//
// A same-status re-delivery (duplicate) is recognized separately from
// both, and is NOT an error - a provider retry re-sending an unchanged
// status is expected, not ambiguous.

import type { PurchaseState } from "./canonical-event.ts";

export type PurchaseTransitionOutcome =
  | { readonly kind: "apply"; readonly newStatus: PurchaseState }
  /** Same target status as already applied, not stale - a provider retry, not an error. */
  | { readonly kind: "duplicate" }
  /** Legal transition in principle, but this event's occurredAt precedes the purchase's current state. */
  | { readonly kind: "stale"; readonly reason: string }
  /** currentStatus -> incomingStatus is not an allowed edge, regardless of timing. */
  | { readonly kind: "illegal_regression"; readonly reason: string };

export interface PurchaseTransitionContext {
  readonly currentStatus: PurchaseState;
  readonly currentOccurredAt: Date;
  readonly incomingStatus: PurchaseState;
  readonly incomingOccurredAt: Date;
}

/**
 * dok 22 §18 / dok 23 §11's allowed edges, transcribed as data (same
 * "config, not switch statement" discipline as canonical-event.ts's
 * ProviderStatusMap). `failed -> paid` stays open: a delayed retry can
 * still succeed after an earlier attempt was marked failed. `expired`,
 * `cancelled`, `refunded_full`, and `chargeback` are terminal - reopening
 * one is always a reconciliation case (`illegal_regression`), never an
 * automatic transition, even with a later timestamp.
 */
export const ALLOWED_TRANSITIONS: Readonly<Record<PurchaseState, readonly PurchaseState[]>> = {
  pending: ["paid", "failed", "expired", "cancelled"],
  paid: ["refunded_partial", "refunded_full", "chargeback", "cancelled"],
  failed: ["paid"],
  expired: [],
  cancelled: [],
  refunded_partial: ["refunded_full"],
  refunded_full: [],
  chargeback: [],
};

export function resolvePurchaseTransition(context: PurchaseTransitionContext): PurchaseTransitionOutcome {
  const { currentStatus, currentOccurredAt, incomingStatus, incomingOccurredAt } = context;

  if (incomingOccurredAt.getTime() < currentOccurredAt.getTime()) {
    return {
      kind: "stale",
      reason: `Event occurred at ${incomingOccurredAt.toISOString()}, before the purchase's current state (occurred at ${currentOccurredAt.toISOString()})`,
    };
  }

  if (incomingStatus === currentStatus) {
    return { kind: "duplicate" };
  }

  const allowed = ALLOWED_TRANSITIONS[currentStatus];
  if (!allowed.includes(incomingStatus)) {
    return {
      kind: "illegal_regression",
      reason: `"${currentStatus}" -> "${incomingStatus}" is not an allowed transition`,
    };
  }

  return { kind: "apply", newStatus: incomingStatus };
}
