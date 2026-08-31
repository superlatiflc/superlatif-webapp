"use client";

import { useEffect, useRef, useState } from "react";

// dok 12 §20 "E03/E04" Timer: "Berdasarkan server deadline... Tidak
// di-reset oleh reload... Warning visual dan aksesibel pada threshold yang
// dikonfigurasi." `deadlineIso` is the ONLY time authority this component
// reads - a fixed instant, never recomputed from a client-side "duration
// remaining" that a reload could reset (dok 16 §10 "Client menghitung
// tampilan dari server time offset tetapi server memutuskan" - this
// component IS that client-side display, driven by a value the caller
// resolves server-side/from state, not by this component's own clock
// arithmetic setting the deadline).
//
// CLAUDE.md "Do not make color, charts, or timer animation the only
// information source" + dok 09 §12.4 "exam runner" accessibility: the
// visible text always states the remaining time in words, never a bare
// color change, and the `aria-live` region only updates at coarse
// checkpoints (every minute, then every 10s in the final minute) so a
// screen reader is not flooded with a per-second announcement.

export interface CountdownTimerProps {
  readonly deadlineIso: string;
  readonly warningThresholdSeconds?: number;
  readonly onExpire?: () => void;
}

function formatRemaining(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function CountdownTimer({
  deadlineIso,
  warningThresholdSeconds = 300,
  onExpire,
}: CountdownTimerProps) {
  const deadline = useRef(new Date(deadlineIso).getTime());
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    Math.max(0, Math.round((deadline.current - Date.now()) / 1000)),
  );
  const [announcement, setAnnouncement] = useState("");
  const expiredRef = useRef(false);

  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.round((deadline.current - Date.now()) / 1000));
      setRemainingSeconds(remaining);

      const shouldAnnounce = remaining <= 60 ? remaining % 10 === 0 : remaining % 60 === 0;
      if (shouldAnnounce) setAnnouncement(`Sisa waktu ${formatRemaining(remaining)}`);

      if (remaining <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpire?.();
        clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [onExpire]);

  const isWarning = remainingSeconds <= warningThresholdSeconds && remainingSeconds > 0;
  const isExpired = remainingSeconds <= 0;

  return (
    <div
      className={`slf-countdown-timer${isWarning ? " slf-countdown-timer--warning" : ""}${isExpired ? " slf-countdown-timer--expired" : ""}`}
    >
      <span aria-hidden="true">{isExpired ? "Waktu selesai" : formatRemaining(remainingSeconds)}</span>
      <span className="slf-visually-hidden" role="status" aria-live="polite">
        {isExpired ? "Waktu pengerjaan telah selesai. Jawaban terakhir sedang dikirim." : announcement}
      </span>
    </div>
  );
}
