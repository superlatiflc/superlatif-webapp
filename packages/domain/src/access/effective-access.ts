// Effective-access resolver and explanation trace (ENT-002).
//
// dok 05 §9 "Resolusi effective access": for one user/target/action/time,
// find every grant that claims the target (directly or via a declared
// ancestor), keep the ones whose start condition is met, exclude expired/
// cancelled/suspended/revoked ones, and combine the surviving grants with
// their most permissive valid capability - returning a decision AND an
// explanation, never a bare boolean (dok 05 §9's "Bentuk keputusan akses
// yang wajib tersedia": allowed/denied, decisive grants, next start,
// effective end, a safe student-facing reason, and an internal diagnostic
// reason). This module composes ENT-001's deriveGrantStatus (one grant at a
// time) into a UNION across every grant a user holds - it does not
// reimplement status derivation.
//
// No I/O: every grant's derived status, claims, and policy config are
// supplied by the caller (packages/db/src/access, ENT-002) - this stays a
// pure function per the ADR-042 layering matrix.

import type { DerivedGrantStatus } from "./grant-status.ts";

export interface TargetRef {
  readonly code: string;
  readonly version?: number | null;
}

export interface AvailabilityOverride {
  readonly startsAt: Date | null;
  readonly endsAt: Date | null;
}

export interface PolicyClaim {
  readonly targetType: string;
  readonly targetRef: TargetRef;
  readonly actions: readonly string[];
  readonly includeDescendants: boolean;
  readonly availabilityOverride?: AvailabilityOverride | null;
}

export interface ResolvableGrant {
  readonly grantId: string;
  readonly derived: DerivedGrantStatus;
  readonly claims: readonly PolicyClaim[];
}

export interface EffectiveAccessQuery {
  readonly targetType: string;
  readonly targetRef: string;
  readonly action: string;
}

export interface EffectiveAccessOptions {
  /**
   * Returns true when `candidate` is a descendant of `ancestor` in the
   * content/program hierarchy. Supplied by the caller - no program/track
   * hierarchy table exists in this repository yet (PRG series), so this
   * resolver cannot determine descendant relationships on its own, the same
   * "require the caller to supply what this module cannot yet read"
   * pattern ENT-001's `through_program_or_batch_end` already established
   * for `lifecycleEndsAt`. Omitted = exact-target-match only, no descendant
   * expansion.
   */
  readonly isDescendantOf?: (candidateTargetRef: string, ancestorTargetRef: string) => boolean;
}

export type EffectiveAccessReasonCode =
  "ACTIVE_GRANT" | "OVERLAPPING_ACTIVE_GRANT" | "SCHEDULED" | "NO_ACTIVE_GRANT" | "NOT_CLAIMED";

export interface EffectiveAccessDiagnosticEntry {
  readonly grantId: string;
  readonly status: DerivedGrantStatus["status"];
}

export interface EffectiveAccessDecision {
  readonly allowed: boolean;
  readonly targetType: string;
  readonly targetRef: string;
  readonly action: string;
  /** Grants that actually support this decision right now. */
  readonly decisiveGrantIds: readonly string[];
  /** Grants that claim this target/action but do not count toward the decision (revoked, expired, suspended, cancelled, or merely scheduled while another grant decides) - support can still see every one, per dok 05 §9. */
  readonly ignoredGrantIds: readonly string[];
  readonly reasonCode: EffectiveAccessReasonCode;
  /** Earliest start among decisive grants (informational once already allowed), or the next start time when the decision is SCHEDULED. */
  readonly effectiveFrom: Date | null;
  /** Latest end among decisive grants ("expiryResolution=latest_supporting_grant", dok 05 §10 E3) - null means open-ended. */
  readonly effectiveTo: Date | null;
  /** Safe to show a student directly - never leaks grant IDs, source types, or other students' data. */
  readonly studentReason: string;
  /** Every claiming grant's derived status, for support explain tooling (dok 24 §6 `access.explain`). Not safe to show a student verbatim (mentions internal status/grant IDs). */
  readonly diagnostic: readonly EffectiveAccessDiagnosticEntry[];
}

function claimMatches(
  claim: PolicyClaim,
  query: EffectiveAccessQuery,
  options: EffectiveAccessOptions,
): boolean {
  if (claim.targetType !== query.targetType) return false;
  if (!claim.actions.includes(query.action)) return false;
  if (claim.targetRef.code === query.targetRef) return true;
  if (claim.includeDescendants && options.isDescendantOf) {
    return options.isDescendantOf(query.targetRef, claim.targetRef.code);
  }
  return false;
}

interface Window {
  readonly from: Date | null;
  readonly to: Date | null;
}

function laterOf(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
}

function earlierOf(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b;
}

/** Narrows a grant's own window by a claim's availabilityOverride, if any (dok 05 §5 per-component validity option). */
function narrowedWindow(grantWindow: Window, override?: AvailabilityOverride | null): Window {
  if (!override) return grantWindow;
  const from =
    grantWindow.from === null
      ? override.startsAt
      : override.startsAt === null
        ? grantWindow.from
        : laterOf(grantWindow.from, override.startsAt);
  const to =
    grantWindow.to === null
      ? override.endsAt
      : override.endsAt === null
        ? grantWindow.to
        : earlierOf(grantWindow.to, override.endsAt);
  return { from, to };
}

function earliestStart(windows: readonly Window[]): Date | null {
  const starts = windows.map((window) => window.from).filter((value): value is Date => value !== null);
  if (starts.length === 0) return null;
  return starts.reduce((earliest, current) => (current.getTime() < earliest.getTime() ? current : earliest));
}

/** "expiryResolution=latest_supporting_grant": open-ended if ANY decisive grant is open-ended, otherwise the latest end among them. */
function latestSupportingEnd(windows: readonly Window[]): Date | null {
  if (windows.some((window) => window.to === null)) return null;
  const ends = windows.map((window) => window.to as Date);
  return ends.reduce((latest, current) => (current.getTime() > latest.getTime() ? current : latest));
}

function dedupe(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

/**
 * Resolves effective access for one user/target/action/time from every
 * grant that could possibly apply, plus the claims their policies carry.
 * Never returns a bare boolean - always the full decision-plus-explanation
 * shape (dok 05 §9).
 */
export function resolveEffectiveAccess(
  grants: readonly ResolvableGrant[],
  query: EffectiveAccessQuery,
  options: EffectiveAccessOptions = {},
): EffectiveAccessDecision {
  const claiming: { readonly grant: ResolvableGrant; readonly window: Window }[] = [];
  for (const grant of grants) {
    for (const claim of grant.claims) {
      if (!claimMatches(claim, query, options)) continue;
      const window = narrowedWindow(
        { from: grant.derived.effectiveFrom, to: grant.derived.effectiveTo },
        claim.availabilityOverride,
      );
      claiming.push({ grant, window });
      break; // one matching claim per grant is enough to make the grant claiming
    }
  }

  const diagnostic: EffectiveAccessDiagnosticEntry[] = claiming.map(({ grant }) => ({
    grantId: grant.grantId,
    status: grant.derived.status,
  }));

  if (claiming.length === 0) {
    return {
      allowed: false,
      targetType: query.targetType,
      targetRef: query.targetRef,
      action: query.action,
      decisiveGrantIds: [],
      ignoredGrantIds: [],
      reasonCode: "NOT_CLAIMED",
      effectiveFrom: null,
      effectiveTo: null,
      studentReason: "Belum ada akses yang terdaftar untuk ini.",
      diagnostic: [],
    };
  }

  const decisive = claiming.filter(({ grant }) => grant.derived.status === "active");
  const scheduled = claiming.filter(({ grant }) => grant.derived.status === "scheduled");
  const everyoneElse = claiming.filter(
    ({ grant }) => grant.derived.status !== "active" && grant.derived.status !== "scheduled",
  );

  if (decisive.length > 0) {
    const decisiveGrantIds = dedupe(decisive.map(({ grant }) => grant.grantId));
    const ignoredGrantIds = dedupe([...scheduled, ...everyoneElse].map(({ grant }) => grant.grantId));
    const windows = decisive.map(({ window }) => window);
    return {
      allowed: true,
      targetType: query.targetType,
      targetRef: query.targetRef,
      action: query.action,
      decisiveGrantIds,
      ignoredGrantIds,
      reasonCode:
        decisiveGrantIds.length > 1 || ignoredGrantIds.length > 0
          ? "OVERLAPPING_ACTIVE_GRANT"
          : "ACTIVE_GRANT",
      effectiveFrom: earliestStart(windows),
      effectiveTo: latestSupportingEnd(windows),
      studentReason: "Aktif - lanjutkan belajar",
      diagnostic,
    };
  }

  if (scheduled.length > 0) {
    const nextStart = earliestStart(scheduled.map(({ window }) => window));
    return {
      allowed: false,
      targetType: query.targetType,
      targetRef: query.targetRef,
      action: query.action,
      decisiveGrantIds: [],
      ignoredGrantIds: dedupe(everyoneElse.map(({ grant }) => grant.grantId)),
      reasonCode: "SCHEDULED",
      effectiveFrom: nextStart,
      effectiveTo: null,
      studentReason: nextStart ? `Dimulai ${nextStart.toISOString()}` : "Belum dimulai.",
      diagnostic,
    };
  }

  return {
    allowed: false,
    targetType: query.targetType,
    targetRef: query.targetRef,
    action: query.action,
    decisiveGrantIds: [],
    ignoredGrantIds: dedupe(everyoneElse.map(({ grant }) => grant.grantId)),
    reasonCode: "NO_ACTIVE_GRANT",
    effectiveFrom: null,
    effectiveTo: null,
    studentReason: "Akses berakhir atau belum tersedia.",
    diagnostic,
  };
}
