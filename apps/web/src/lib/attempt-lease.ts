// Writer-lease token custody for production attempt writes.
//
// ATM-001 issues a writer-lease token exactly once, at attempt start
// (`AttemptView.writerLease.leaseToken`), and stores only its hash
// server-side. Every subsequent write (`saveAnswer`, user-triggered
// `submitAttempt`) must present the raw token, and ATM-002's
// `assertWriterLeaseValidForWrite` is fail-closed about it.
//
// That token is a bearer credential for WRITING to an attempt, so it is
// kept in an httpOnly cookie and only ever read server-side inside a
// Server Action - the browser never receives it, and page JS cannot read
// it. This is why the attempt player below is built as Server Actions
// rather than client fetches: it keeps both session and lease credentials
// entirely out of the client bundle.
//
// One cookie per attempt (name includes the attempt id) so that having
// started attempt A does not silently authorize writes to attempt B: a
// missing/mismatched cookie simply produces no token, and the domain's own
// `WRITER_LEASE_REQUIRED` refuses the write.
//
// LEASE EXPIRY: the TTL is short by design (120s,
// DEFAULT_WRITER_LEASE_TTL_SECONDS) - shorter than a learner may spend on
// one question. `renewWriterLease` (ATM-001) renews an active lease in
// place for the device that still holds its token, and notably does NOT
// require the lease to be unexpired - only that the token still matches
// the active lease row. So the save path renews first, then writes. A
// token that no longer matches means another device explicitly took over,
// which surfaces to the learner rather than being silently reclaimed -
// silently taking over would defeat the two-device protection dok 16 §7
// exists to provide.

import { cookies } from "next/headers";

function cookieName(attemptId: string): string {
  return `slf_lease_${attemptId}`;
}

export async function setLeaseToken(attemptId: string, leaseToken: string): Promise<void> {
  const store = await cookies();
  store.set(cookieName(attemptId), leaseToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env["NODE_ENV"] === "production",
    path: "/",
    // Deliberately longer than the lease's own 120s TTL: the cookie only
    // has to survive long enough for the NEXT renew to happen. Lease
    // validity itself is decided server-side against the database row,
    // never by this cookie's lifetime.
    maxAge: 60 * 60 * 6,
  });
}

export async function readLeaseToken(attemptId: string): Promise<string | null> {
  const store = await cookies();
  return store.get(cookieName(attemptId))?.value ?? null;
}

export async function clearLeaseToken(attemptId: string): Promise<void> {
  const store = await cookies();
  store.delete(cookieName(attemptId));
}
