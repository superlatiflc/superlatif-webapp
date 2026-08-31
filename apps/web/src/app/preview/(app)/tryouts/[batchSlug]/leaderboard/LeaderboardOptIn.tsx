"use client";

import { useState } from "react";
import { LeaderboardTable, type LeaderboardRowData } from "@superlatif/ui";

// dok 12 §23A.3 "S18 - Leaderboard": peserta bisa mengatur tampil/tidaknya
// alias publiknya. This toggle is visual-only in the preview (it flips how
// the CURRENT learner's own row renders, client-side) - it does not call
// any real consent-recording endpoint (SCR-003's real projectLeaderboardEntry
// already enforces publicOptIn server-side; nothing here bypasses that).

export interface LeaderboardOptInProps {
  readonly rows: readonly LeaderboardRowData[];
  readonly ownAlias: string;
}

export function LeaderboardOptIn({ rows, ownAlias }: LeaderboardOptInProps) {
  const [optedIn, setOptedIn] = useState(false);

  const displayRows = rows.map((row) =>
    row.isCurrentLearner ? { ...row, publicOptIn: optedIn, displayAlias: optedIn ? ownAlias : null } : row,
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <label className="slf-flag-toggle" style={{ width: "fit-content" }}>
        <input type="checkbox" checked={optedIn} onChange={(event) => setOptedIn(event.target.checked)} />
        Tampilkan alias saya di papan peringkat publik
      </label>
      <LeaderboardTable rows={displayRows} />
    </div>
  );
}
