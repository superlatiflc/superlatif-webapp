// Server-derived batch operational state (EXM-002).
//
// Founder instruction: "Batch state harus server-derived, jangan simpan
// status mutable" - this deliberately diverges from
// contracts/drizzle-schema.ts's own `examBatches.state` column (a stored
// enum) the same class of divergence QST-001 already made for
// `question_options` (relational instead of embedded): the reviewed
// contract artifact is a strong reference, not a literal mandate, and an
// explicit founder instruction for this specific task wins (CLAUDE.md
// "Source of truth" - a lower-layer artifact does not override a founder
// decision). `deriveBatchState` mirrors the exact "compute, don't store"
// shape @superlatif/domain/commerce's `deriveOfferSaleState` and
// @superlatif/domain/access's `deriveGrantStatus` already established for
// this codebase.
//
// The eleven-value `BatchState` enum is transcribed verbatim from
// contracts/openapi.yaml's `Batch.state` schema (also identical to
// drizzle-schema.ts's `examBatchStatus` pg enum) - this IS the real,
// machine-validated Gate 3 contract vocabulary
// (scripts/validate-contracts.mjs), unlike the storage-shape question
// above.
//
// This is the CANONICAL operational state only - derived purely from
// `windows` + governance status + `now`. It is a DIFFERENT, narrower
// concept than dok 18 §5's own "batch state siswa" (student-facing
// resolved state, which additionally factors in purchase, effective
// access, attempt, and result release) - that richer resolver needs
// attempt/purchase data this task does not own (ATM-series, explicitly out
// of EXM-002's scope per the founder's "Jangan bangun attempt engine"
// instruction) and is left to a later task to compose on top of this one.

import type { RecordStatus } from "./question-lifecycle.ts";
import type { BatchPointWindow, BatchRangedWindow } from "./batch-windows.ts";

/** Transcribed verbatim from contracts/openapi.yaml's `Batch.state` schema (identical to drizzle-schema.ts's `examBatchStatus`). */
export const BATCH_STATES = [
  "draft",
  "scheduled",
  "registration_open",
  "exam_open",
  "exam_closed",
  "scoring",
  "provisional_released",
  "final_released",
  "review_open",
  "voided",
  "archived",
] as const;

export type BatchState = (typeof BATCH_STATES)[number];

export interface DeriveBatchStateInput {
  /** The batch's own recordStatus governance/mutability gate (draft/in_review/changes_requested/approved/published/archived) - reused unchanged from QST-001/EXM-001. Windows only take effect once this reaches "published"; before that the batch is not yet operationally live at all, regardless of what its windows say. */
  readonly governanceStatus: RecordStatus;
  /** Non-null once an admin has explicitly voided the batch (a terminal, immutable fact - the timestamp itself is never cleared, matching this codebase's "state changes are facts, not mutable flags" discipline). Takes priority over every other input. */
  readonly voidedAt: Date | null;
  readonly registration?: BatchRangedWindow;
  readonly attempt: BatchRangedWindow;
  readonly lateSyncCutoff?: BatchPointWindow;
  readonly provisionalResultRelease?: BatchPointWindow;
  readonly finalResultRelease?: BatchPointWindow;
  readonly explanationRelease?: BatchPointWindow;
}

function reached(at: Date | undefined, now: Date): boolean {
  return at !== undefined && now.getTime() >= at.getTime();
}

/**
 * Pure, timezone-safe (every `Date` is already a UTC instant): called fresh
 * with the current server time on every read, never persisted. See module
 * doc for why this is a DIFFERENT, narrower concept than dok 18 §5's
 * student-facing resolved state.
 */
export function deriveBatchState(input: DeriveBatchStateInput, now: Date): BatchState {
  if (input.voidedAt !== null) return "voided";
  if (input.governanceStatus === "archived") return "archived";
  if (input.governanceStatus !== "published") return "draft";

  if (input.registration) {
    if (!reached(input.registration.startsAt, now)) return "scheduled";
    if (!reached(input.registration.endsAt, now)) return "registration_open";
  }
  if (!reached(input.attempt.startsAt, now)) return "scheduled";
  if (!reached(input.attempt.endsAt, now)) return "exam_open";

  const lateSyncEndsAt = input.lateSyncCutoff?.startsAt;
  if (lateSyncEndsAt !== undefined && !reached(lateSyncEndsAt, now)) return "exam_closed";

  const provisionalAt = input.provisionalResultRelease?.startsAt;
  const finalAt = input.finalResultRelease?.startsAt;
  const explanationAt = input.explanationRelease?.startsAt;

  const nextReleaseAt = provisionalAt ?? finalAt ?? explanationAt;
  if (!reached(nextReleaseAt, now)) return "scoring";

  if (reached(explanationAt, now)) return "review_open";
  if (reached(finalAt, now)) return "final_released";
  return "provisional_released";
}
