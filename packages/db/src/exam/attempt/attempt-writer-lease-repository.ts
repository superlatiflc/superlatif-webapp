// attempt_writer_leases persistence (ATM-001).
//
// `isActive` only ever flips false via `revokeActiveLease` (an explicit
// takeover/void) - see schema/attempts.ts's own module doc. "Renew" is a
// plain in-place UPDATE of `renewedAt`/`expiresAt` on the SAME row
// (`renewActiveLease`), not a new row insert: dok 16 §7 "Lease diperbarui
// saat client aktif" describes a lightweight, potentially frequent
// heartbeat-style refresh, not a new credential each time. A genuinely new
// CREDENTIAL (new token, new row) is only ever issued by `issueLease` -
// called once at attempt start, and again by a future takeover flow this
// task does not build (see @superlatif/domain/exam's attempt-writer-
// lease.ts module doc).

import { and, eq } from "drizzle-orm";
import type { Queryable, Schema } from "../../db-types.ts";
import { attemptWriterLeases } from "../../schema/index.ts";

export interface AttemptWriterLeaseRow {
  readonly id: string;
  readonly attemptId: string;
  readonly tokenHash: string;
  readonly issuedAt: Date;
  readonly renewedAt: Date | null;
  readonly expiresAt: Date;
  readonly isActive: boolean;
  readonly revokedAt: Date | null;
  readonly revokedReason: string | null;
}

const LEASE_COLUMNS = {
  id: attemptWriterLeases.id,
  attemptId: attemptWriterLeases.attemptId,
  tokenHash: attemptWriterLeases.tokenHash,
  issuedAt: attemptWriterLeases.issuedAt,
  renewedAt: attemptWriterLeases.renewedAt,
  expiresAt: attemptWriterLeases.expiresAt,
  isActive: attemptWriterLeases.isActive,
  revokedAt: attemptWriterLeases.revokedAt,
  revokedReason: attemptWriterLeases.revokedReason,
};

export async function findActiveLease(
  db: Queryable<Schema>,
  attemptId: string,
): Promise<AttemptWriterLeaseRow | null> {
  const [row] = await db
    .select(LEASE_COLUMNS)
    .from(attemptWriterLeases)
    .where(and(eq(attemptWriterLeases.attemptId, attemptId), eq(attemptWriterLeases.isActive, true)))
    .limit(1);
  return (row as AttemptWriterLeaseRow | undefined) ?? null;
}

export interface IssueLeaseInput {
  readonly attemptId: string;
  readonly tokenHash: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
}

export async function issueLease(
  db: Queryable<Schema>,
  input: IssueLeaseInput,
): Promise<AttemptWriterLeaseRow> {
  const [row] = await db
    .insert(attemptWriterLeases)
    .values({
      attemptId: input.attemptId,
      tokenHash: input.tokenHash,
      issuedAt: input.issuedAt,
      expiresAt: input.expiresAt,
    })
    .returning(LEASE_COLUMNS);
  if (!row) throw new Error("issueLease: insert returned no row");
  return row as AttemptWriterLeaseRow;
}

export class WriterLeaseNotFoundError extends Error {
  constructor(leaseId: string) {
    super(`Writer lease ${leaseId} not found`);
    this.name = "WriterLeaseNotFoundError";
  }
}

export async function renewActiveLease(
  db: Queryable<Schema>,
  leaseId: string,
  now: Date,
  expiresAt: Date,
): Promise<AttemptWriterLeaseRow> {
  const [row] = await db
    .update(attemptWriterLeases)
    .set({ renewedAt: now, expiresAt })
    .where(and(eq(attemptWriterLeases.id, leaseId), eq(attemptWriterLeases.isActive, true)))
    .returning(LEASE_COLUMNS);
  if (!row) throw new WriterLeaseNotFoundError(leaseId);
  return row as AttemptWriterLeaseRow;
}

export async function revokeActiveLease(
  db: Queryable<Schema>,
  leaseId: string,
  now: Date,
  reason: string,
): Promise<void> {
  await db
    .update(attemptWriterLeases)
    .set({ isActive: false, revokedAt: now, revokedReason: reason })
    .where(and(eq(attemptWriterLeases.id, leaseId), eq(attemptWriterLeases.isActive, true)));
}
