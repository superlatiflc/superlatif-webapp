"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnswerableQuestion, CountdownTimer } from "@superlatif/ui";
import { keepLeaseAliveAction, saveAnswerAction, type SaveAnswerActionResult } from "../actions.ts";
import {
  acknowledge,
  choose,
  displayedChoice,
  initialSlot,
  isSaving,
  reject,
  type AnswerSlot,
  type SaveRequest,
} from "./answer-save-queue.ts";

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
//     stale write (another tab) instead of silently overwriting. Saves for
//     one question are sequenced by answer-save-queue.ts: one in flight at a
//     time, the learner's latest choice wins, and the revision sent is
//     always the one the server last acknowledged.
//   - A heartbeat keeps this device's writer lease alive while the page is
//     open, so reading one question for a few minutes does not lose it.
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

/** Well under the 120s lease TTL, so one missed beat does not lose the lease. */
const LEASE_HEARTBEAT_MS = 45_000;

const UNREACHABLE_MESSAGE =
  "Jawaban ini belum tersimpan karena server tidak dapat dihubungi. Periksa koneksi, lalu pilih jawabanmu lagi.";

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
  // The ref is the source of truth for the async save chain (no stale
  // closures); the state copy only drives rendering.
  const slotsRef = useRef<Record<string, AnswerSlot>>(
    Object.fromEntries(instances.map((i) => [i.instanceId, initialSlot(initialAnswers[i.instanceId])])),
  );
  const [slots, setSlots] = useState(slotsRef.current);
  // Tracked so a save's acknowledged attempt revision is visible to this
  // component; the SUBMIT path deliberately re-reads the authoritative
  // revision server-side rather than trusting anything echoed from here.
  const [, setAttemptRevision] = useState(initialAttemptRevision);
  const [flagged, setFlagged] = useState<Record<string, boolean>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  const current = instances[currentIndex]!;
  const slotValues = Object.values(slots);
  const savedCount = slotValues.filter((slot) => slot.acked.optionCode != null).length;
  const saving = slotValues.some(isSaving);

  const putSlot = useCallback((instanceId: string, slot: AnswerSlot) => {
    slotsRef.current = { ...slotsRef.current, [instanceId]: slot };
    setSlots(slotsRef.current);
  }, []);

  const send = useCallback(
    async (instanceId: string, request: SaveRequest): Promise<void> => {
      let result: SaveAnswerActionResult;
      try {
        result = await saveAnswerAction({
          attemptId,
          instanceId,
          optionCode: request.optionCode,
          expectedRevision: request.expectedRevision,
          // A fresh id per send: each one is a genuinely new mutation.
          clientMutationId: crypto.randomUUID(),
        });
      } catch {
        putSlot(instanceId, reject(slotsRef.current[instanceId]!));
        setNotice(UNREACHABLE_MESSAGE);
        return;
      }
      if (!result.ok) {
        // Back to what the server holds - an unacknowledged answer is never
        // left looking saved.
        putSlot(instanceId, reject(slotsRef.current[instanceId]!));
        setNotice(messageFor(result.code));
        return;
      }
      setAttemptRevision(result.attemptRevision);
      const [next, followUp] = acknowledge(slotsRef.current[instanceId]!, result.revision);
      putSlot(instanceId, next);
      if (followUp) await send(instanceId, followUp);
    },
    [attemptId, putSlot],
  );

  const select = useCallback(
    (instanceId: string, optionCode: string) => {
      setNotice(null);
      const [next, request] = choose(slotsRef.current[instanceId] ?? initialSlot(), optionCode);
      putSlot(instanceId, next);
      if (request) void send(instanceId, request);
    },
    [putSlot, send],
  );

  // Writer-lease heartbeat while the page is visible, plus one beat when the
  // learner comes back to the tab.
  useEffect(() => {
    if (!canWrite) return;
    let stopped = false;
    const beat = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      try {
        const result = await keepLeaseAliveAction({ attemptId });
        if (!stopped && !result.ok && result.code === "lease_lost") setNotice(messageFor("lease_lost"));
      } catch {
        // A missed beat is harmless; the next save or beat renews the lease.
      }
    };
    const timer = window.setInterval(beat, LEASE_HEARTBEAT_MS);
    const onVisible = () => void beat();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [attemptId, canWrite]);

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
              className={`slf-question-navigator__item${index === currentIndex ? " slf-question-navigator__item--current" : ""}${slots[instance.instanceId] && displayedChoice(slots[instance.instanceId]!) ? " slf-question-navigator__item--answered" : ""}${flagged[instance.instanceId] ? " slf-question-navigator__item--flagged" : ""}`}
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
        selectedOptionCode={slots[current.instanceId] ? displayedChoice(slots[current.instanceId]!) : null}
        onSelect={(optionCode) => canWrite && select(current.instanceId, optionCode)}
        flagged={flagged[current.instanceId] ?? false}
        onToggleFlag={() =>
          setFlagged((state) => ({ ...state, [current.instanceId]: !state[current.instanceId] }))
        }
      />

      <p className="slf-empty-state__body" aria-live="polite">
        {saving ? "Menyimpan…" : `${savedCount} dari ${instances.length} soal terjawab dan tersimpan.`}
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
