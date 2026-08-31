// SYNTHETIC preview content (UI Preview Track) - one cohesive demo dataset:
// one demo student, one active program, one tryout batch with six
// questions (TWK single_choice + TKP weighted_choice, matching SCR-004's
// own real scorer scope exactly - this mock never invents a question type
// the real backend cannot even grade), a result, and a leaderboard.
//
// No number here is an official SKD threshold/score (dok 17 §4/§17) - the
// scoring below is a plain, clearly-synthetic point scheme (correct = 10,
// weighted option = the option's own weight), and every UI surface that
// shows it labels it "simulasi"/"estimasi", never "resmi".
//
// Real replacement, once wired: packages/db/src/program/home-view-service.ts
// (buildHomeViewModel), packages/db/src/exam/batch (list/detail),
// packages/db/src/exam/attempt (attempt-service.ts), packages/db/src/exam/
// scoring (scoring-service.ts, result-release-service.ts, ranking-service.ts).

import type {
  MockLeaderboardView,
  MockStudentResultView,
  PreviewBatchDetail,
  PreviewBatchSummary,
  PreviewQuestion,
} from "./types.ts";

export const DEMO_STUDENT_NAME = "Calon Siswa";
export const DEMO_PROGRAM_NAME = "SKD Sekolah Kedinasan 2026";
export const DEMO_BATCH_SLUG = "to-skd-sept-01";
export const DEMO_BATCH_TITLE = "Tryout Akbar SKD Kedinasan #1";

export const PREVIEW_QUESTIONS: readonly PreviewQuestion[] = [
  {
    instanceId: "twk-1",
    sequence: 1,
    sectionCode: "TWK",
    sectionTitle: "Tes Wawasan Kebangsaan",
    stem: "Sila keberapa dalam Pancasila yang menekankan musyawarah untuk mufakat?",
    options: [
      { optionCode: "A", text: "Sila kedua" },
      { optionCode: "B", text: "Sila ketiga" },
      { optionCode: "C", text: "Sila keempat" },
      { optionCode: "D", text: "Sila kelima" },
    ],
  },
  {
    instanceId: "twk-2",
    sequence: 2,
    sectionCode: "TWK",
    sectionTitle: "Tes Wawasan Kebangsaan",
    stem: "Lembaga negara yang berwenang menguji undang-undang terhadap UUD 1945 adalah…",
    options: [
      { optionCode: "A", text: "Mahkamah Agung" },
      { optionCode: "B", text: "Mahkamah Konstitusi" },
      { optionCode: "C", text: "Komisi Yudisial" },
      { optionCode: "D", text: "Dewan Perwakilan Rakyat" },
    ],
  },
  {
    instanceId: "twk-3",
    sequence: 3,
    sectionCode: "TWK",
    sectionTitle: "Tes Wawasan Kebangsaan",
    stem: "Perjanjian yang mengakhiri konflik Indonesia-Belanda dan mengakui kedaulatan Indonesia ditandatangani pada tahun…",
    options: [
      { optionCode: "A", text: "1945" },
      { optionCode: "B", text: "1947" },
      { optionCode: "C", text: "1949" },
      { optionCode: "D", text: "1950" },
    ],
  },
  {
    instanceId: "tkp-1",
    sequence: 4,
    sectionCode: "TKP",
    sectionTitle: "Tes Karakteristik Pribadi",
    stem: "Rekan satu timmu membuat kesalahan yang berdampak pada hasil kerja bersama. Sikapmu adalah…",
    options: [
      { optionCode: "A", text: "Membicarakannya berdua secara langsung dan mencari solusi bersama" },
      { optionCode: "B", text: "Melaporkannya ke atasan tanpa berdiskusi terlebih dahulu" },
      { optionCode: "C", text: "Membiarkannya karena bukan tanggung jawabku" },
      { optionCode: "D", text: "Membicarakannya di belakang dengan rekan lain" },
    ],
  },
  {
    instanceId: "tkp-2",
    sequence: 5,
    sectionCode: "TKP",
    sectionTitle: "Tes Karakteristik Pribadi",
    stem: "Kamu diminta menyelesaikan tugas baru yang belum pernah kamu kerjakan sebelumnya. Responsmu adalah…",
    options: [
      { optionCode: "A", text: "Mempelajari sumber yang relevan dan mencoba menyelesaikannya sendiri dulu" },
      { optionCode: "B", text: "Menolak karena merasa tidak kompeten" },
      { optionCode: "C", text: "Meminta orang lain menyelesaikannya" },
      { optionCode: "D", text: "Menunda sampai ada instruksi lebih detail" },
    ],
  },
  {
    instanceId: "tkp-3",
    sequence: 6,
    sectionCode: "TKP",
    sectionTitle: "Tes Karakteristik Pribadi",
    stem: "Jadwalmu berbenturan antara agenda pribadi penting dan rapat kerja mendadak. Kamu akan…",
    options: [
      { optionCode: "A", text: "Mengomunikasikan situasi ke kedua pihak dan mencari solusi yang adil" },
      { optionCode: "B", text: "Mengabaikan rapat kerja tanpa pemberitahuan" },
      { optionCode: "C", text: "Mengabaikan agenda pribadi tanpa penjelasan ke siapa pun" },
      { optionCode: "D", text: "Membiarkan situasi berlarut tanpa keputusan" },
    ],
  },
];

/** Synthetic point scheme: TWK correct = 10 (per soal), TKP weighted option A=10/B=7/C=4/D=2. Never an official SKD scoring formula (dok 17 §4). */
export const TWK_CORRECT_OPTION: Record<string, string> = {
  "twk-1": "C",
  "twk-2": "B",
  "twk-3": "C",
};
export const TWK_CORRECT_SCORE = 10;
export const TKP_OPTION_WEIGHTS: Record<string, number> = { A: 10, B: 7, C: 4, D: 2 };
export const SECTION_MAX_SCORES: Record<string, number> = { TWK: 30, TKP: 30 };

export function computeMockScore(answers: Record<string, { readonly optionCode: string } | null>): {
  readonly sectionScores: Record<string, number>;
  readonly total: number;
} {
  const sectionScores: Record<string, number> = { TWK: 0, TKP: 0 };
  for (const question of PREVIEW_QUESTIONS) {
    const answer = answers[question.instanceId];
    if (!answer) continue;
    if (question.sectionCode === "TWK") {
      sectionScores["TWK"]! +=
        answer.optionCode === TWK_CORRECT_OPTION[question.instanceId] ? TWK_CORRECT_SCORE : 0;
    } else {
      sectionScores["TKP"]! += TKP_OPTION_WEIGHTS[answer.optionCode] ?? 0;
    }
  }
  return { sectionScores, total: (sectionScores["TWK"] ?? 0) + (sectionScores["TKP"] ?? 0) };
}

export const PREVIEW_BATCH_SUMMARIES: readonly PreviewBatchSummary[] = [
  {
    batchSlug: DEMO_BATCH_SLUG,
    title: DEMO_BATCH_TITLE,
    examFamilyLabel: "SKD Sekolah Kedinasan",
    statusGroup: "available",
    attemptWindowLabel: "1–7 Sep 2026",
    durationLabel: "1 jam 40 menit",
    attemptsUsed: 0,
    attemptsAllowed: 1,
    resultReleaseLabel: "Estimasi rilis 30 menit setelah selesai",
  },
  {
    batchSlug: "to-skd-agu-04",
    title: "Tryout Mingguan SKD #4",
    examFamilyLabel: "SKD Sekolah Kedinasan",
    statusGroup: "completed",
    attemptWindowLabel: "24–25 Agu 2026",
    durationLabel: "1 jam 40 menit",
    attemptsUsed: 1,
    attemptsAllowed: 1,
    resultReleaseLabel: "Hasil sudah rilis",
  },
  {
    batchSlug: "to-skd-sept-02",
    title: "Tryout Akbar SKD Kedinasan #2",
    examFamilyLabel: "SKD Sekolah Kedinasan",
    statusGroup: "upcoming",
    attemptWindowLabel: "14–20 Sep 2026",
    durationLabel: "1 jam 40 menit",
    attemptsUsed: 0,
    attemptsAllowed: 1,
    resultReleaseLabel: "Dijadwalkan setelah periode selesai",
  },
];

export const PREVIEW_BATCH_DETAIL: PreviewBatchDetail = {
  ...PREVIEW_BATCH_SUMMARIES[0]!,
  sections: [
    { code: "TWK", title: "Tes Wawasan Kebangsaan", questionCount: 3, durationLabel: "50 menit" },
    { code: "TKP", title: "Tes Karakteristik Pribadi", questionCount: 3, durationLabel: "50 menit" },
  ],
  navigationPolicyLabel: "Bebas berpindah soal dalam subtes yang sama, submit sekali untuk seluruh attempt",
  scoringPolicyLabel: "TWK: benar/salah per soal · TKP: skor berbobot per pilihan",
  integrityNotice:
    "Kerjakan mandiri. Waktu berjalan berdasarkan jam server, tidak berhenti saat berpindah tab.",
  deviceNotice: "Gunakan koneksi stabil. Jawaban tersimpan otomatis setiap kali kamu memilih.",
  totalDurationSeconds: 6000, // 1h40m - matches durationLabel
};

// Post-submission review/pembahasan content - deliberately kept in a
// SEPARATE export from PREVIEW_QUESTIONS (the attempt-time projection).
// Nothing in the attempt player (AttemptPlayer.tsx) or AnswerableQuestion
// imports QUESTION_REVIEW - only the /review page does, and only after a
// learner has an "answers" query proving they actually submitted (see that
// page's own gate). This mirrors the real domain boundary: ATM-001's
// student-facing attempt view never carries an answer key; a review/
// explanation projection would only ever run after submission, from a
// completely different read path.
//
// `bestOptionCode` means two different things by section, on purpose:
// - TWK (single_choice): the one objectively correct option.
// - TKP (weighted_choice): the highest-weighted option in this mock's own
//   synthetic scheme (TKP_OPTION_WEIGHTS) - NOT a claim that other options
//   are "wrong". Real TKP has no single correct answer (dok 16 §8); every
//   option is a valid response of differing quality. The review UI must
//   say this explicitly for TKP items, never imply a false binary.
export interface QuestionReviewContent {
  readonly bestOptionCode: string;
  readonly explanation: string;
  readonly concept: string;
  readonly mindsetTip: string;
}

export const QUESTION_REVIEW: Record<string, QuestionReviewContent> = {
  "twk-1": {
    bestOptionCode: "C",
    explanation:
      'Sila keempat Pancasila berbunyi "Kerakyatan yang dipimpin oleh hikmat kebijaksanaan dalam permusyawaratan/perwakilan" - inti sila ini adalah pengambilan keputusan lewat musyawarah untuk mufakat.',
    concept: "Nilai-nilai Pancasila",
    mindsetTip:
      "Hafalkan bukan sekadar urutan sila, tapi juga maknanya - soal TWK sering menguji pemahaman, bukan hafalan urutan.",
  },
  "twk-2": {
    bestOptionCode: "B",
    explanation:
      "Mahkamah Konstitusi (MK) berwenang menguji undang-undang terhadap UUD 1945 (judicial review), berbeda dari Mahkamah Agung yang menangani kasasi dan peninjauan kembali.",
    concept: "Lembaga negara & sistem ketatanegaraan",
    mindsetTip: "Bedakan kewenangan MK dan MA - ini salah satu jebakan paling sering muncul di TWK.",
  },
  "twk-3": {
    bestOptionCode: "C",
    explanation:
      "Konferensi Meja Bundar (KMB) tahun 1949 mengakhiri konflik Indonesia-Belanda dan mengakui kedaulatan Indonesia, meski secara de facto Indonesia telah merdeka sejak 1945.",
    concept: "Sejarah kemerdekaan Indonesia",
    mindsetTip:
      "Buat garis waktu sendiri untuk peristiwa 1945-1950 - urutan tahun adalah sumber salah paling umum.",
  },
  "tkp-1": {
    bestOptionCode: "A",
    explanation:
      "Menyelesaikan masalah secara langsung dan kolaboratif paling selaras dengan nilai kerja sama dan profesionalisme yang diukur TKP.",
    concept: "Kerja sama dan resolusi konflik",
    mindsetTip:
      'TKP bukan soal "benar-salah" seperti TWK - semua pilihan valid, tapi ada yang lebih mencerminkan sikap kerja profesional yang diharapkan.',
  },
  "tkp-2": {
    bestOptionCode: "A",
    explanation:
      "Menunjukkan inisiatif dan kemauan belajar mandiri sebelum meminta bantuan paling selaras dengan karakter adaptif yang diukur TKP.",
    concept: "Inisiatif dan adaptabilitas",
    mindsetTip:
      "Perhatikan kata kerja aktif di pilihan jawaban - biasanya itu menandakan sikap paling proaktif.",
  },
  "tkp-3": {
    bestOptionCode: "A",
    explanation:
      "Komunikasi terbuka ke kedua pihak dan mencari solusi yang adil paling mencerminkan kematangan dalam mengelola prioritas.",
    concept: "Manajemen prioritas dan komunikasi",
    mindsetTip:
      'Pilihan yang melibatkan komunikasi biasanya lebih "aman" dibanding pilihan yang menghindar atau diam-diam mengabaikan satu pihak.',
  },
};

export function buildMockResult(
  totalScore: number,
  sectionScores: Record<string, number>,
): MockStudentResultView {
  return {
    state: "provisional",
    resultId: "mock-result-1",
    version: 1,
    scoreSummary: {
      total: totalScore,
      sectionScores,
      sectionMaxScores: SECTION_MAX_SCORES,
      overallPassed: totalScore >= 30,
    },
    releasedAt: new Date().toISOString(),
  };
}

export function buildMockLeaderboard(
  ownTotal: number,
  ownSectionScores: Record<string, number>,
): MockLeaderboardView {
  const others = [
    { alias: "Rajin97", total: 52, publicOptIn: true },
    { alias: null, total: 47, publicOptIn: false },
    { alias: "Tekun_id", total: 38, publicOptIn: true },
    { alias: null, total: 22, publicOptIn: false },
  ];
  const combined = [
    ...others.map((entry, index) => ({
      rank: 0,
      scoreSummary: {
        total: entry.total,
        sectionScores: { TWK: Math.round(entry.total * 0.55), TKP: Math.round(entry.total * 0.45) },
        sectionMaxScores: SECTION_MAX_SCORES,
        overallPassed: entry.total >= 30,
      },
      publicOptIn: entry.publicOptIn,
      displayAlias: entry.alias,
      percentile: null,
      isCurrentLearner: false,
      _sortKey: index,
    })),
    {
      rank: 0,
      scoreSummary: {
        total: ownTotal,
        sectionScores: ownSectionScores,
        sectionMaxScores: SECTION_MAX_SCORES,
        overallPassed: ownTotal >= 30,
      },
      publicOptIn: false,
      displayAlias: DEMO_STUDENT_NAME,
      percentile: null,
      isCurrentLearner: true,
      _sortKey: 99,
    },
  ].sort((a, b) => b.scoreSummary.total - a.scoreSummary.total);

  const total = combined.length;
  const entries = combined.map((entry, index) => {
    const rank = index + 1;
    const percentile = Math.round(((total - rank + 1) / total) * 1000) / 10;
    const { _sortKey, ...rest } = entry;
    void _sortKey;
    return { ...rest, rank, percentile };
  });

  return {
    state: "provisional",
    snapshotVersion: 1,
    generatedAt: new Date().toISOString(),
    policyVersion: "preview-tiebreak-v1",
    entries,
    ownEntry: entries.find((entry) => entry.isCurrentLearner) ?? null,
  };
}
