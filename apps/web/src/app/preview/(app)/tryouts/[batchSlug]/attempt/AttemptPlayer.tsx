"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnswerableQuestion, CountdownTimer } from "@superlatif/ui";
import { computeMockScore, PREVIEW_QUESTIONS } from "../../../../../../lib/preview-data/content.ts";

// UI Preview Track tryout player (dok 12 §20 "E03/E04") - the first
// client-interactive PAGE in this app. Owns local answer/flag/navigation
// state (AnswerableQuestion itself stays a pure controlled component, see
// its own module doc) and a submit-confirmation step (E05) before
// "submitting". Nothing here is persisted server-side - this is a UI
// feel-through, not a real attempt/answer/submit pipeline (ATM-001/002).
//
// Real replacement, once wired: packages/db/src/exam/attempt/
// attempt-service.ts (startOrResumeAttempt, saveAnswer, submitAttempt).

interface AttemptPlayerProps {
  readonly batchSlug: string;
  readonly totalDurationSeconds: number;
}

export function AttemptPlayer({ batchSlug, totalDurationSeconds }: AttemptPlayerProps) {
  const router = useRouter();
  const deadlineIso = useRef(new Date(Date.now() + totalDurationSeconds * 1000).toISOString()).current;

  const [answers, setAnswers] = useState<Record<string, string | null>>({});
  const [flagged, setFlagged] = useState<Record<string, boolean>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showSummary, setShowSummary] = useState(false);

  const currentQuestion = PREVIEW_QUESTIONS[currentIndex]!;
  const answeredCount = useMemo(
    () => Object.values(answers).filter((value) => value != null).length,
    [answers],
  );

  function handleSubmit() {
    const answerSlots: Record<string, { readonly optionCode: string } | null> = {};
    for (const question of PREVIEW_QUESTIONS) {
      const selected = answers[question.instanceId];
      answerSlots[question.instanceId] = selected ? { optionCode: selected } : null;
    }
    const { total, sectionScores } = computeMockScore(answerSlots);
    // Carries the learner's actual per-question picks forward to the result
    // and review pages - the ONLY way those pages learn what was answered,
    // since nothing here is persisted server-side. See QUESTION_REVIEW's own
    // module doc for why this stays separate from the attempt-time question
    // projection.
    const query = new URLSearchParams({
      total: String(total),
      twk: String(sectionScores["TWK"] ?? 0),
      tkp: String(sectionScores["TKP"] ?? 0),
      answers: JSON.stringify(answers),
    });
    router.push(`/preview/tryouts/${batchSlug}/result?${query.toString()}`);
  }

  if (showSummary) {
    return (
      <main className="slf-page">
        <h1 className="slf-section-title">Tinjau sebelum mengirim</h1>
        <p className="slf-empty-state__body">
          {answeredCount} dari {PREVIEW_QUESTIONS.length} soal sudah dijawab. Jawaban tidak bisa diubah lagi
          setelah dikirim.
        </p>
        <ol className="slf-question-navigator" aria-label="Ringkasan jawaban">
          {PREVIEW_QUESTIONS.map((question, index) => (
            <li key={question.instanceId}>
              <button
                type="button"
                className={`slf-question-navigator__item${answers[question.instanceId] ? " slf-question-navigator__item--answered" : ""}${flagged[question.instanceId] ? " slf-question-navigator__item--flagged" : ""}`}
                onClick={() => {
                  setCurrentIndex(index);
                  setShowSummary(false);
                }}
              >
                {question.sequence}
              </button>
            </li>
          ))}
        </ol>
        <div className="slf-player-footer">
          <button
            type="button"
            className="slf-button slf-button--secondary"
            onClick={() => setShowSummary(false)}
          >
            Kembali ke soal
          </button>
          <button type="button" className="slf-button slf-button--primary" onClick={handleSubmit}>
            Kirim jawaban
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="slf-page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
        <h1 className="slf-section-title" style={{ margin: 0 }}>
          Tryout berjalan
        </h1>
        <CountdownTimer deadlineIso={deadlineIso} onExpire={handleSubmit} />
      </div>

      <ol className="slf-question-navigator" aria-label="Navigasi nomor soal">
        {PREVIEW_QUESTIONS.map((question, index) => (
          <li key={question.instanceId}>
            <button
              type="button"
              className={`slf-question-navigator__item${index === currentIndex ? " slf-question-navigator__item--current" : ""}${answers[question.instanceId] ? " slf-question-navigator__item--answered" : ""}${flagged[question.instanceId] ? " slf-question-navigator__item--flagged" : ""}`}
              aria-current={index === currentIndex ? "true" : undefined}
              onClick={() => setCurrentIndex(index)}
            >
              {question.sequence}
            </button>
          </li>
        ))}
      </ol>

      <AnswerableQuestion
        instanceId={currentQuestion.instanceId}
        sectionLabel={currentQuestion.sectionTitle}
        sequence={currentQuestion.sequence}
        totalQuestions={PREVIEW_QUESTIONS.length}
        stem={currentQuestion.stem}
        options={currentQuestion.options}
        selectedOptionCode={answers[currentQuestion.instanceId] ?? null}
        onSelect={(optionCode) =>
          setAnswers((prev) => ({ ...prev, [currentQuestion.instanceId]: optionCode }))
        }
        flagged={flagged[currentQuestion.instanceId] ?? false}
        onToggleFlag={() =>
          setFlagged((prev) => ({ ...prev, [currentQuestion.instanceId]: !prev[currentQuestion.instanceId] }))
        }
      />

      <div className="slf-player-footer">
        <button
          type="button"
          className="slf-button slf-button--secondary"
          disabled={currentIndex === 0}
          onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}
        >
          Sebelumnya
        </button>
        {currentIndex < PREVIEW_QUESTIONS.length - 1 ? (
          <button
            type="button"
            className="slf-button slf-button--primary"
            onClick={() => setCurrentIndex((index) => Math.min(PREVIEW_QUESTIONS.length - 1, index + 1))}
          >
            Selanjutnya
          </button>
        ) : (
          <button
            type="button"
            className="slf-button slf-button--primary"
            onClick={() => setShowSummary(true)}
          >
            Tinjau & selesai
          </button>
        )}
      </div>
    </main>
  );
}
