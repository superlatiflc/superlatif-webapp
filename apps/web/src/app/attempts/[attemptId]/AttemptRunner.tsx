"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { AnswerableQuestion, CountdownTimer } from "@superlatif/ui";
import { saveAnswerAction, type SaveAnswerActionResult } from "../actions.ts";

// Production attempt player.
//
// Reuses the SAME `AnswerableQuestion`/`CountdownTimer` components the
// preview build already uses - they were written as pure presentational
// components with no data source of their own, so nothing about them
// needed to change to serve real data.
//
// What differs from the preview version, and why:
//   - `deadlineIso` comes from `attempts.deadline_at` (server), not from
//     `Date.now() + duration` computed in the browser. A reload cannot
//     extend it.
//   - Every answer selection calls a Server Action that persists to
//     `answer_states` through ATM-002's compare-and-swap. Local state here
//     is a RENDERING cache of what the server acknowledged, never the
//     source of truth.
//   - `expectedRevision` per instance is tracked so the server can detect a
//     stale write (another tab) instead of silently overwriting.
//   - Submission carries no score: the server scores from its own frozen
//     snapshot.

export interface RunnerOption {
  readonly optionCode: string;
  readonly text: string;
}

export interface RunnerInstance {
  readonly instanceId: string;
  readonly sequence: number;
  readonly sectionCode: string;
  readonly stem: string;
  readonly options: readonly RunnerOption[];
}

export interface AttemptRunnerProps {
  readonly attemptId: string;
  readonly deadlineIso: string;
  readonly instances: readonly RunnerInstance[];
  /** instanceId -> {optionCode, revision} already acknowledged by the server (resume). */
  readonly initialAnswers: Readonly<
    Record<string, { readonly optionCode: string | null; readonly revision: number }>
  >;
  readonly initialAttemptRevision: number;
  readonly canWrite: boolean;
}

type SaveFailureCode = Extract<SaveAnswerActionResult, { ok: false }>["code"];

function messageFor(code: SaveFailureCode): string {
  switch (code) {
    case "lease_lost":
      return "Tryout ini sedang dibuka di perangkat atau tab lain. Muat ulang halaman ini untuk melanjutkan di sini.";
    case "deadline_passed":
      return "Waktu pengerjaan sudah berakhir, jadi jawaban ini tidak tersimpan.";
    case "conflict":
      return "Jawaban untuk soal ini baru saja berubah di tempat lain. Muat ulang halaman untuk melihat versi terbaru.";
    case "invalid":
      return "Jawaban ini tidak dapat diproses. Muat ulang halaman lalu coba lagi.";
    case "rate_limited":
      // Pilihan yang sudah dibuat tetap ada di layar; hanya penyimpanannya
      // yang ditunda, dan penyimpanan berikutnya akan tersimpan normal.
      return "Permintaan terlalu cepat. Coba lagi beberapa saat.";
    case "writes_disabled":
      // ACCURACY OVER REASSURANCE (P0-2). This exact answer was NOT saved, so
      // the copy must not say "progresmu aman" without qualification - the
      // guard runs before the write, which is precisely why we can promise
      // that ALREADY-SAVED answers are intact while being explicit that this
      // one is not yet. Overstating it here would be the "hide an operational
      // failure behind motivational language" the brand rules forbid.
      return "Penyimpanan jawaban sedang dihentikan sementara. Jawaban yang sudah tersimpan tetap aman, tetapi jawaban ini belum tersimpan. Jangan tutup halaman ini; coba lagi beberapa saat.";
  }
}

export function AttemptRunner({
  attemptId,
  deadlineIso,
  instances,
  initialAnswers,
  initialAttemptRevision,
  canWrite,
}: AttemptRunnerProps) {
  const [answers, setAnswers] = useState(initialAnswers);
  // Tracked so a save's acknowledged attempt revision is visible to this
  // component; the SUBMIT path deliberately re-reads the authoritative
  // revision server-side rather than trusting anything echoed from here.
  const [, setAttemptRevision] = useState(initialAttemptRevision);
  const [flagged, setFlagged] = useState<Record<string, boolean>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const current = instances[currentIndex]!;
  const answeredCount = useMemo(
    () => Object.values(answers).filter((entry) => entry.optionCode != null).length,
    [answers],
  );

  const select = useCallback(
    (instanceId: string, optionCode: string) => {
      const previous = answers[instanceId];
      // Optimistic render, reconciled against the server's acknowledged
      // revision below. If the server refuses, the previous value is
      // restored - an unacknowledged answer is never left looking saved.
      setAnswers((state) => ({
        ...state,
        [instanceId]: { optionCode, revision: previous?.revision ?? 0 },
      }));
      setNotice(null);

      startTransition(async () => {
        const result = await saveAnswerAction({
          attemptId,
          instanceId,
          optionCode,
          expectedRevision: previous?.revision ?? 0,
          // A fresh id per user action: a retry of the SAME logical write
          // would reuse it and be deduplicated server-side, while a new
          // choice is genuinely a new mutation.
          clientMutationId: crypto.randomUUID(),
        });
        if (result.ok) {
          setAnswers((state) => ({ ...state, [instanceId]: { optionCode, revision: result.revision } }));
          setAttemptRevision(result.attemptRevision);
        } else {
          setAnswers((state) => ({
            ...state,
            [instanceId]: previous ?? { optionCode: null, revision: 0 },
          }));
          setNotice(messageFor(result.code));
        }
      });
    },
    [answers, attemptId],
  );

  return (
    <main className="slf-page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
        <h1 className="slf-section-title" style={{ margin: 0 }}>
          Tryout berjalan
        </h1>
        <CountdownTimer deadlineIso={deadlineIso} />
      </div>

      {notice ? (
        <p className="slf-empty-state__body" role="alert">
          {notice}
        </p>
      ) : null}

      <ol className="slf-question-navigator" aria-label="Navigasi nomor soal">
        {instances.map((instance, index) => (
          <li key={instance.instanceId}>
            <button
              type="button"
              className={`slf-question-navigator__item${index === currentIndex ? " slf-question-navigator__item--current" : ""}${answers[instance.instanceId]?.optionCode ? " slf-question-navigator__item--answered" : ""}${flagged[instance.instanceId] ? " slf-question-navigator__item--flagged" : ""}`}
              aria-current={index === currentIndex ? "true" : undefined}
              onClick={() => setCurrentIndex(index)}
            >
              {instance.sequence}
            </button>
          </li>
        ))}
      </ol>

      <AnswerableQuestion
        instanceId={current.instanceId}
        sectionLabel={current.sectionCode}
        sequence={current.sequence}
        totalQuestions={instances.length}
        stem={current.stem}
        options={current.options}
        selectedOptionCode={answers[current.instanceId]?.optionCode ?? null}
        onSelect={(optionCode) => canWrite && select(current.instanceId, optionCode)}
        flagged={flagged[current.instanceId] ?? false}
        onToggleFlag={() =>
          setFlagged((state) => ({ ...state, [current.instanceId]: !state[current.instanceId] }))
        }
      />

      <p className="slf-empty-state__body" aria-live="polite">
        {pending ? "Menyimpan…" : `${answeredCount} dari ${instances.length} soal terjawab dan tersimpan.`}
      </p>

      <div className="slf-player-footer">
        <button
          type="button"
          className="slf-button slf-button--secondary"
          disabled={currentIndex === 0}
          onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}
        >
          Sebelumnya
        </button>
        {currentIndex < instances.length - 1 ? (
          <button
            type="button"
            className="slf-button slf-button--primary"
            onClick={() => setCurrentIndex((index) => Math.min(instances.length - 1, index + 1))}
          >
            Selanjutnya
          </button>
        ) : (
          <a className="slf-button slf-button--primary" href={`/attempts/${attemptId}/submit`}>
            Tinjau &amp; selesai
          </a>
        )}
      </div>
    </main>
  );
}
