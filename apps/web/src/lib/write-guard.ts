// Write guard for apps/web (P0-2).
//
// One place that answers "may this request perform an exam write right now?",
// so the actions stay readable and no action grows its own ad-hoc env check.
// The decision itself lives in @superlatif/contracts' runtime-flags, built
// from the same validated env and the same loadFlags() registry the audit
// found unused.
//
// WHY A REASON CODE RATHER THAN A THROWN ERROR: every caller here is a Server
// Action that must land the learner somewhere that explains what happened.
// Returning a small code lets each action choose its own controlled outcome
// (a redirect with a rendered message, or a typed result the exam player
// already knows how to display) instead of surfacing Next's generic error
// page - which is exactly what dok 30 §9's containment step must NOT look
// like when an operator flips the switch during an incident.

import { isCapabilityEnabled, isProductionWriteAllowed } from "@superlatif/contracts";

/** Stable, non-sensitive codes. Safe to place in a URL and render. */
export type WriteBlockReason = "writes_disabled" | "feature_disabled";

/**
 * Why an exam write must be refused, or null when it may proceed.
 *
 * Order matters: the master switch is checked first, so an incident freeze
 * reports as a freeze even if a capability flag also happens to be off.
 */
export function examWriteBlockReason(): WriteBlockReason | null {
  if (!isProductionWriteAllowed()) return "writes_disabled";
  if (!isCapabilityEnabled("FEATURE_EXAM_ENGINE")) return "feature_disabled";
  return null;
}

/** Convenience for call sites that only need the boolean. */
export function examWritesPermitted(): boolean {
  return examWriteBlockReason() === null;
}
