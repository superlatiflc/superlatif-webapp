"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { exam } from "@superlatif/db";
import { getDb, getEffectiveAccessCache } from "../../lib/db.ts";
import { requireUserId } from "../../lib/session.ts";
import { readLeaseToken, setLeaseToken } from "../../lib/attempt-lease.ts";
import { classifyStartAttemptError } from "../../lib/attempt-start-error.ts";
import {
  RateLimitedError,
  enforceAnswerSaveRateLimit,
  enforceAttemptStartRateLimit,
  enforceLeaseTakeoverRateLimit,
  enforceSubmitRateLimit,
} from "../../lib/rate-limit.ts";

// Server Actions for the production tryout core flow.
//
// Every action here is a THIN wrapper: authenticate, read the lease token
// from its httpOnly cookie, delegate to the existing @superlatif/db
// function, translate the domain's own errors into a value the UI can
// render. No business rule is re-implemented - ownership, idempotency,
// timing windows, lease enforcement, CAS, and scoring all stay where they
// already live (ATM-001/002/003, SCR-001).
//
// Server Actions rather than client fetches, deliberately: the session
// credential and the writer-lease token both stay server-side, so neither
// ever reaches the client bundle or a network request the browser can
// inspect.

/** What the attempt player renders after a save - never the answer key, never a score. */
export type SaveAnswerActionResult =
  | { readonly ok: true; readonly revision: number; readonly attemptRevision: number }
  | {
      readonly ok: false;
      readonly code: "lease_lost" | "deadline_passed" | "conflict" | "invalid" | "rate_limited";
    };

export async function startAttemptAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const batchCode = String(formData.get("batchCode") ?? "");
  if (!batchCode) redirect("/tryouts");

  // P0-3. Start/resume is idempotent, so throttling here costs a learner
  // nothing they cannot retry: the redirect lands back on the batch page,
  // which already renders reason codes, and the existing attempt is
  // untouched.
  try {
    await enforceAttemptStartRateLimit(userId);
  } catch (error) {
    if (error instanceof RateLimitedError) redirect(`/tryouts/${batchCode}?error=rate_limited`);
    throw error;
  }

  const db = getDb();
  const batch = await exam.findExamBatchByCode(db, batchCode);
  if (!batch) redirect("/tryouts");

  // `startOrResumeAttempt` is start-OR-RESUME: calling it again for a
  // (user, batch) that already has a non-voided attempt returns that same
  // attempt (`created: false`) rather than creating a second one - the
  // partial unique index `attempts_user_batch_active_uq` is the real
  // arbiter under a race. The idempotency key is generated server-side;
  // a browser never supplies an attempt identifier.
  //
  // Authorization is untouched - `assertAttemptStartEligible` (inside
  // startOrResumeAttempt) still decides exactly as strictly as before.
  // This only changes what happens to an EXPECTED denial afterward: instead
  // of an uncaught throw surfacing as Next's generic error page, the three
  // known eligibility outcomes (classifyStartAttemptError) redirect back to
  // the batch page with a code the page renders a friendly message for.
  // Anything NOT one of those three - a genuine bug, a DB error - still
  // rethrows here and still surfaces as a real error, unchanged.
  let result: Awaited<ReturnType<typeof exam.startOrResumeAttempt>>;
  try {
    result = await exam.startOrResumeAttempt(
      db,
      getEffectiveAccessCache(),
      userId,
      {
        batchId: batch.id,
        idempotencyKey: randomUUID(),
        clientCapabilities: { offlineQueue: false, writerLease: true },
      },
      new Date(),
    );
  } catch (error) {
    const denial = classifyStartAttemptError(error);
    if (!denial) throw error;
    const params = new URLSearchParams({ error: denial.code });
    if (denial.reason) params.set("reason", denial.reason);
    redirect(`/tryouts/${batchCode}?${params.toString()}`);
  }

  // A lease token is only ever returned at the instant it is minted (start).
  // On resume it is null, and whatever token this device already holds in
  // its cookie stays valid.
  const leaseToken = result.view.writerLease.leaseToken;
  if (leaseToken) await setLeaseToken(result.view.id, leaseToken);

  redirect(`/attempts/${result.view.id}`);
}

/**
 * Reclaims write access for THIS device after its own lease expired, or
 * takes over from another device the learner explicitly chose to abandon.
 * dok 16 §7 calls this an explicit takeover on purpose - it is never done
 * silently inside the save path, because that would defeat the two-device
 * protection the lease exists to provide.
 */
export async function takeoverLeaseAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const attemptId = String(formData.get("attemptId") ?? "");
  if (!attemptId) redirect("/tryouts");

  try {
    await enforceLeaseTakeoverRateLimit(userId);
  } catch (error) {
    if (error instanceof RateLimitedError) redirect(`/attempts/${attemptId}?error=rate_limited`);
    throw error;
  }

  const takeover = await exam.takeoverWriterLease(getDb(), userId, attemptId, new Date());
  await setLeaseToken(attemptId, takeover.leaseToken);
  redirect(`/attempts/${attemptId}`);
}

export async function saveAnswerAction(input: {
  readonly attemptId: string;
  readonly instanceId: string;
  readonly optionCode: string | null;
  readonly expectedRevision: number;
  readonly clientMutationId: string;
}): Promise<SaveAnswerActionResult> {
  const userId = await requireUserId();
  const db = getDb();
  const leaseToken = await readLeaseToken(input.attemptId);
  const now = new Date();

  // P0-3, autosave. Runs BEFORE the lease renewal and the write, so a
  // runaway client loop is stopped without touching answer state at all.
  //
  // Returned as a normal result code rather than thrown: the player already
  // handles `ok: false` by surfacing a message and keeping the learner's
  // local answer, so a throttled save behaves exactly like any other
  // non-fatal save failure. Nothing is lost - CAS, clientMutationId, the
  // writer lease, and the learner's unsaved selection are all untouched, and
  // the next save inside budget persists normally.
  try {
    await enforceAnswerSaveRateLimit(input.attemptId, now);
  } catch (error) {
    if (error instanceof RateLimitedError) return { ok: false, code: "rate_limited" };
    throw error;
  }

  try {
    // Renew BEFORE writing: the lease TTL (120s) is shorter than a learner
    // may spend on one question, and `renewWriterLease` renews in place for
    // whichever device still holds the matching token. A token that no
    // longer matches throws here, and surfaces as `lease_lost` rather than
    // being silently reclaimed.
    if (leaseToken) {
      await exam.renewWriterLease(db, userId, input.attemptId, leaseToken, now);
    }

    const result = await exam.saveAnswer(
      db,
      userId,
      input.attemptId,
      {
        instanceId: input.instanceId,
        clientMutationId: input.clientMutationId,
        leaseToken,
        expectedRevision: input.expectedRevision,
        payload: input.optionCode === null ? null : { kind: "single_choice", optionCode: input.optionCode },
        capturedAtClient: null,
      },
      now,
    );

    if (result.kind === "recovery_candidate") {
      // Stored as a late-sync recovery candidate, deliberately NOT applied
      // to answer_states (dok 16: a recovery candidate needs adjudication,
      // it is never automatically scored).
      return { ok: false, code: "deadline_passed" };
    }
    return { ok: true, revision: result.revision, attemptRevision: result.attemptRevision };
  } catch (error) {
    return { ok: false, code: classifySaveError(error) };
  }
}

function classifySaveError(error: unknown): "lease_lost" | "deadline_passed" | "conflict" | "invalid" {
  const name = error instanceof Error ? error.name : "";
  if (name === "WriterLeaseRequiredError" || name === "WriterLeaseRevokedError") return "lease_lost";
  if (name === "WriterLeaseTokenMismatchError") return "lease_lost";
  if (name === "AttemptDeadlinePassedError") return "deadline_passed";
  if (name === "AnswerRevisionConflictError") return "conflict";
  if (name === "AnswerSchemaInvalidError" || name === "AttemptInstanceNotFoundError") return "invalid";
  // An attempt that is no longer `in_progress` (already submitted, voided)
  // cannot accept writes - surfaced as "not writable" rather than crashing
  // the page.
  if (name === "AttemptNotWritableError") return "deadline_passed";
  throw error;
}

/**
 * Submit + score, synchronously. `submitAttempt` is idempotent (unique
 * index on `attempt_submissions.attempt_id`) and `scoreSubmission` returns
 * the existing result rather than recomputing - so a double click, a retry
 * after a lost response, and a race against the timeout finalizer all
 * converge on exactly one submission and one result.
 *
 * Scoring runs inline rather than in a worker: `submitAttempt` still
 * enqueues its durable outbox row (that happens transactionally inside
 * submit), and `drainScoringJob` is the same callable path a future worker
 * would use - this slice simply calls it immediately instead of waiting
 * for a scheduler that does not exist yet.
 */
export async function submitAttemptAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const attemptId = String(formData.get("attemptId") ?? "");
  const expectedAttemptRevision = Number(formData.get("expectedAttemptRevision") ?? "0");
  if (!attemptId) redirect("/tryouts");

  const db = getDb();
  const leaseToken = await readLeaseToken(attemptId);
  const now = new Date();

  // Failures redirect back to the confirmation page with a reason rather
  // than returning a value: a plain <form action> can only accept a
  // void-returning action, and the learner needs to land somewhere that
  // explains what happened.
  if (!leaseToken) redirect(`/attempts/${attemptId}/submit?error=lease_lost`);

  // P0-3. Bounds the cost of the inline scoring drain below. Idempotency
  // remains authoritative: the unique index on attempt_submissions is what
  // guarantees one submission, and a throttled retry converges on that same
  // single submission exactly as an untrottled retry does.
  try {
    await enforceSubmitRateLimit(attemptId);
  } catch (error) {
    if (error instanceof RateLimitedError) {
      redirect(`/attempts/${attemptId}/submit?error=rate_limited`);
    }
    throw error;
  }

  try {
    await exam.submitAttempt(
      db,
      attemptId,
      {
        kind: "user",
        userId,
        mutationId: randomUUID(),
        leaseToken,
        expectedAttemptRevision,
      },
      now,
    );
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "WriterLeaseRequiredError" || name === "WriterLeaseRevokedError") {
      redirect(`/attempts/${attemptId}/submit?error=lease_lost`);
    }
    if (name === "AttemptNotSubmittableError" || name === "SubmitRevisionConflictError") {
      redirect(`/attempts/${attemptId}/submit?error=not_submittable`);
    }
    throw error;
  }

  // Drain this attempt's own pending scoring job(s). Idempotent: an
  // already-delivered job replays the existing result instead of scoring
  // twice.
  for (const job of await exam.findPendingScoringJobs(db)) {
    if (job.attemptId === attemptId) await exam.drainScoringJob(db, job.id, now);
  }

  revalidatePath(`/attempts/${attemptId}`);
  redirect(`/attempts/${attemptId}/result`);
}
