// dok 12 §23A.3 "S18 — Leaderboard": "Data publik hanya membawa alias aman
// dari ranking subject, bukan nama, user ID, email, atau nomor telepon."
// This component only ever receives `displayAlias`/`publicOptIn` already
// resolved by the caller (mirroring @superlatif/domain/exam's
// `projectLeaderboardEntry`, SCR-003) - there is no field here an
// unredacted name/userId/subjectToken could ever be assigned to, the same
// structural guarantee QuestionPreviewCard/AnswerableQuestion already give
// their own kind of secret. "Tabel desktop berubah menjadi kartu ringkas di
// mobile tanpa kehilangan posisi/score/status" (acceptance) - one semantic
// list, restyled by CSS breakpoint, not two competing markup structures.

export interface LeaderboardRowData {
  readonly rank: number;
  readonly totalScore: number;
  readonly displayAlias: string | null;
  readonly publicOptIn: boolean;
  readonly percentile: number | null;
  readonly isCurrentLearner: boolean;
}

export interface LeaderboardTableProps {
  readonly rows: readonly LeaderboardRowData[];
}

export function LeaderboardTable({ rows }: LeaderboardTableProps) {
  return (
    <ol className="slf-leaderboard" aria-label="Papan peringkat">
      {rows.map((row) => (
        <li
          key={row.rank}
          className={`slf-leaderboard__row${row.isCurrentLearner ? " slf-leaderboard__row--self" : ""}`}
        >
          <span className="slf-leaderboard__rank" aria-hidden="true">
            #{row.rank}
          </span>
          <span className="slf-leaderboard__alias">
            {row.displayAlias ?? (row.isCurrentLearner ? "Kamu" : "Peserta privat")}
            {row.isCurrentLearner && row.displayAlias ? (
              <span className="slf-leaderboard__you-tag"> · Kamu</span>
            ) : null}
          </span>
          <span className="slf-leaderboard__score">
            {row.totalScore} <span className="slf-leaderboard__score-label">poin</span>
          </span>
          <span className="slf-leaderboard__percentile">
            {row.percentile !== null ? `Lebih baik dari ${row.percentile}% peserta` : "—"}
          </span>
        </li>
      ))}
    </ol>
  );
}
