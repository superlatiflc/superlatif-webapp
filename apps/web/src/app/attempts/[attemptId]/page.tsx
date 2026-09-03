import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EmptyState } from "@superlatif/ui";
import { exam } from "@superlatif/db";
import { getDb } from "../../../lib/db.ts";
import { requireUserIdOrRedirect } from "../../../lib/session.ts";
import { notFoundOnAttemptAccessError, parseAttemptId } from "../../../lib/attempt-access.ts";
import { readLeaseToken } from "../../../lib/attempt-lease.ts";
import { extractText } from "../../../lib/rich-text.ts";
import { takeoverLeaseAction } from "../actions.ts";
import { AttemptRunner, type RunnerInstance } from "./AttemptRunner.tsx";

export const metadata: Metadata = {
  title: "Mengerjakan Tryout | Superlatif",
};

// The production attempt player's server half.
//
// `getAttemptResumeView` (ATM-001) is the single source for everything
// rendered here - it enforces ownership itself (`AttemptNotOwnedError`),
// returns the PERSISTED presented question/option order (so a reload shows
// the identical paper), the answers already acknowledged, and a
// server-computed `remainingSeconds`/`deadlineAt`.
//
// WHAT REACHES THE BROWSER: only `StudentFacingQuestionView` content -
// question code/version, stem, option codes + option content, assets. That
// type has no field an answer key or option weight could be assigned to
// (see @superlatif/domain/exam's student-view.ts), so this page cannot leak
// a key even by mistake. Explanation content is not read here at all; it
// belongs to /attempts/[attemptId]/review and its own release gate.

interface PageProps {
  readonly params: Promise<{ readonly attemptId: string }>;
  // Only a controlled outcome code from takeoverLeaseAction. Never identity -
  // see no-query-identity.test.ts, which fails the build if `userId` is ever
  // reintroduced as a search param on a production route (P0-1).
  readonly searchParams: Promise<{ readonly error?: string }>;
}

/** P0-2: takeover refusals. Nothing was mutated, and the copy says so. */
const TAKEOVER_ERROR_COPY: Record<string, string> = {
  writes_disabled:
    "Pengambilalihan sedang dihentikan sementara untuk pemeliharaan. Jawaban yang sudah tersimpan tetap aman. Coba lagi beberapa saat.",
  feature_disabled: "Tryout sedang tidak tersedia saat ini. Jawaban yang sudah tersimpan tetap aman.",
  rate_limited: "Permintaan terlalu cepat. Coba lagi beberapa saat.",
};

export default async function AttemptPage({ params, searchParams }: PageProps) {
  const userId = await requireUserIdOrRedirect();
  const { attemptId } = await params;
  parseAttemptId(attemptId);
  const { error } = await searchParams;
  const takeoverError = error ? TAKEOVER_ERROR_COPY[error] : undefined;

  const view = await exam
    .getAttemptResumeView(getDb(), userId, attemptId, await readLeaseToken(attemptId), new Date())
    .catch(notFoundOnAttemptAccessError);

  // Already finalized - there is nothing to answer. Send the learner to the
  // authoritative result instead of rendering a dead player.
  if (view.status !== "in_progress" && view.status !== "created") {
    redirect(`/attempts/${attemptId}/result`);
  }

  if (view.writerLease.state !== "held_here") {
    return (
      <main className="slf-page">
        <h1 className="slf-section-title">Lanjutkan di perangkat ini?</h1>
        {takeoverError ? (
          <p className="slf-empty-state__body" role="alert">
            {takeoverError}
          </p>
        ) : null}
        <EmptyState
          title="Tryout sedang terbuka di tempat lain"
          body="Untuk mencegah jawaban saling menimpa, hanya satu perangkat yang boleh menulis dalam satu waktu. Ambil alih untuk melanjutkan di sini - jawaban yang sudah tersimpan tetap aman."
        />
        <form action={takeoverLeaseAction}>
          <input type="hidden" name="attemptId" value={attemptId} />
          <button type="submit" className="slf-button slf-button--primary">
            Lanjutkan di perangkat ini
          </button>
        </form>
      </main>
    );
  }

  const instances: RunnerInstance[] = view.instances.map((instance) => ({
    instanceId: instance.instanceId,
    sequence: instance.sequence,
    sectionCode: instance.sectionCode,
    stem: extractText(instance.content.stemDocument) ?? "(Soal ini belum dapat ditampilkan.)",
    // `presentedOptionOrder` is the PERSISTED order this attempt was served
    // (dok 16 §6) - options are rendered in that order, not in the question
    // bank's own authoring order, so a reload never reshuffles the paper.
    options: (
      instance.presentedOptionOrder ?? instance.content.options.map((option) => option.optionCode)
    ).map((optionCode) => {
      const option = instance.content.options.find((candidate) => candidate.optionCode === optionCode);
      return option
        ? { optionCode, text: extractText(option.content) ?? optionCode }
        : { optionCode, text: optionCode };
    }),
  }));

  const initialAnswers: Record<string, { optionCode: string | null; revision: number }> = {};
  for (const answer of view.answers) {
    const payload = answer.payload;
    initialAnswers[answer.instanceId] = {
      optionCode: payload && payload.kind === "single_choice" ? payload.optionCode : null,
      revision: answer.revision,
    };
  }

  return (
    <AttemptRunner
      attemptId={attemptId}
      deadlineIso={view.deadlineAt.toISOString()}
      instances={instances}
      initialAnswers={initialAnswers}
      initialAttemptRevision={view.attemptRevision}
      canWrite
    />
  );
}
