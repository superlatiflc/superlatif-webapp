// Writer-lease state derivation (ATM-001).
//
// dok 16 §7: "Satu attempt memiliki satu active writer lease... Perangkat
// kedua dapat read-only atau melakukan explicit takeover." `contracts/
// openapi.yaml`'s own `WriterLease` schema names the exact three-value
// state enum this module produces: `held_here` (the requesting device
// holds the current active, unexpired lease), `held_elsewhere` (a
// DIFFERENT active, unexpired lease exists), `expired` (the active lease's
// TTL has passed - "compute, don't store" again: `isActive` on the DB row
// only ever flips false on an explicit revoke, so an expired-but-not-yet-
// revoked lease is a state this function derives, not one the schema
// stores directly - see attempts.ts's own module doc).
//
// Full multi-device explicit-takeover UX is dok 16 §24's own OPEN decision
// ("Final writer lease duration dan takeover UX") - this module derives
// state and lets a caller decide the resulting `permittedActions`, but does
// not itself implement a `/writer-lease/takeover` flow (ATM-001's own
// scope is start + snapshot + resume only; the takeover endpoint is a
// later ATM task once answer-save/WRITER_LEASE_REVOKED enforcement exists
// to actually need it).

export type WriterLeaseState = "held_here" | "held_elsewhere" | "expired";

/** Default TTL a lease is issued/renewed for - short enough that a genuinely disconnected device's lease clears quickly (satisfying "Resume after disconnect": the NEXT resume call simply sees `expired` and is issued a fresh lease), long enough not to expire mid-normal-use between autosave heartbeats. Provisional per dok 16 §24's own open decision - a later task may make this configurable per blueprint/policy. */
export const DEFAULT_WRITER_LEASE_TTL_SECONDS = 120;

export interface ActiveWriterLeaseInput {
  readonly tokenHash: string;
  readonly expiresAt: Date;
}

/**
 * Pure. `requestingTokenHash` is null when the caller (e.g. a plain resume
 * with no lease token presented yet) is not claiming to hold any lease -
 * such a request can only ever see `held_elsewhere` or `expired`, never
 * `held_here`.
 */
export function deriveWriterLeaseState(
  activeLease: ActiveWriterLeaseInput | null,
  requestingTokenHash: string | null,
  now: Date,
): WriterLeaseState {
  if (activeLease === null) return "expired";
  if (now.getTime() >= activeLease.expiresAt.getTime()) return "expired";
  if (requestingTokenHash !== null && requestingTokenHash === activeLease.tokenHash) return "held_here";
  return "held_elsewhere";
}

export function computeWriterLeaseExpiry(
  now: Date,
  ttlSeconds: number = DEFAULT_WRITER_LEASE_TTL_SECONDS,
): Date {
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
    throw new RangeError(`ttlSeconds must be a positive finite number, received ${String(ttlSeconds)}`);
  }
  return new Date(now.getTime() + ttlSeconds * 1000);
}
