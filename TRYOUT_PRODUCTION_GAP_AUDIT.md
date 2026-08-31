# Tryout Production Gap Audit

**Status:** Audit only. Tidak ada kode production, migration, endpoint baru, atau refactor domain yang dibuat oleh dokumen ini.
**Tanggal:** 2026-09-01
**Scope:** Flow tryout end-to-end (login → dashboard → tryout list → detail → attempt → result → pembahasan → leaderboard), UI Preview Track (`/preview/*`, mock) dibandingkan terhadap domain/db/contracts yang SUDAH ADA di repo ini.
**Metode:** Baca langsung source code (`packages/db/src/exam/**`, `packages/domain/src/exam/**`, `packages/db/src/schema/**`, `contracts/openapi.yaml`, `docs/gates/16_EXAM_ENGINE_CORE_CONTRACT.md`). Tidak ada asumsi/tebakan pada nama tabel, field, atau fungsi — setiap klaim di bawah bisa ditelusuri ke path yang disebutkan.

---

## Ringkasan eksekutif

Temuan paling penting audit ini: **backend exam-engine untuk attempt/answer/submit/scoring/result/leaderboard SUDAH LENGKAP dan production-grade** (dibangun lewat task ATM-001/002/003 dan SCR-001/002/003/004) — server-authoritative penuh, idempotent, race-safe, dan sudah diuji lewat integration test. UI Preview Track (`/preview/*`) sama sekali tidak menyentuhnya; ia murni mock/query-param.

Satu-satunya konsep yang **belum ada di production** secara nyata adalah **pembahasan/review** — tapi bahkan untuk ini, fondasinya sudah lebih siap dari dugaan awal:

- Route kontrak `GET /attempts/{attemptId}/review` **sudah ada** di `contracts/openapi.yaml` (baris 415-425), dengan deskripsi eksplisit "Get released explanation content only when review window and effective access permit it."
- Window type `explanation_release` **sudah ada** di `BatchWindowType` (`packages/domain/src/exam/batch-windows.ts:33`) dan sudah divalidasi coherence-nya — tinggal belum pernah DIBACA oleh service manapun (persis seperti `leaderboard_release` sebelum SCR-003 membangun `getBatchLeaderboardView`).
- Kolom `question_versions.explanation_document` **sudah ada di schema**, sudah bisa ditulis (question-service.ts, dipakai admin question editor) dan sudah dibaca balik oleh `findQuestionVersionById` — termasuk sudah dipakai di fixture test SCR-001 dengan isi contoh `"Pembahasan: opsi A memiliki bobot tertinggi."`
- Error code `EXPLANATION_NOT_RELEASED` dan `RESULT_NOT_RELEASED` **sudah didaftarkan** di dok 16 §19, belum diimplementasikan di manapun.

Artinya: gap production untuk pembahasan bukan "bangun dari nol", melainkan **satu fungsi assembly baru + satu domain helper visibility kecil + wiring satu endpoint yang sudah dikontrak**. Detail lengkap di Bagian C-H.

---

## A. Current architecture — bagaimana UI Preview Track bekerja sekarang

Semua di bawah ini berada di `apps/web/src/app/preview/**` dan `apps/web/src/lib/preview-data/**`, dan **tidak pernah memanggil `@superlatif/db`/`@superlatif/domain`**.

| Bagian                   | Implementasi preview saat ini                                                                                                                                                                                                                                       | Source of truth                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Loading questions        | `PREVIEW_QUESTIONS` — array literal 6 soal hardcoded di `apps/web/src/lib/preview-data/content.ts`                                                                                                                                                                  | **hardcoded preview**                           |
| Starting an attempt      | Tidak ada "attempt" nyata — `/preview/tryouts/[batchSlug]/attempt/page.tsx` langsung me-render `AttemptPlayer` (client component) dengan `deadlineIso = now + totalDurationSeconds` dihitung di `useRef` browser                                                    | **React/client state** (tidak ada persistensi)  |
| Storing selected answers | `useState<Record<string,string\|null>>` di `AttemptPlayer.tsx` — hilang begitu tab ditutup/reload                                                                                                                                                                   | **React/client state**                          |
| Timer                    | `CountdownTimer` (`packages/ui/src/components/CountdownTimer.tsx`) — `deadlineIso` dihitung SEKALI di client (`Date.now() + totalDurationSeconds*1000`), bukan dari server manapun                                                                                  | **client state (hardcoded duration dari mock)** |
| Submit                   | `AttemptPlayer.handleSubmit()` — hitung skor via `computeMockScore()` (fungsi pure di `content.ts`) lalu `router.push` ke `/result?total=...&twk=...&tkp=...&answers=<JSON encoded>`                                                                                | **client state + query parameter**              |
| Score                    | `computeMockScore()` — bandingkan `answers` (state client) terhadap `TWK_CORRECT_OPTION`/`TKP_OPTION_WEIGHTS` yang JUGA hardcoded di `content.ts` yang sama, bundel ke client (lihat catatan keamanan di Bagian F)                                                  | **hardcoded preview**                           |
| Result                   | `/preview/tryouts/[batchSlug]/result/page.tsx` (Server Component) — baca `total`/`twk`/`tkp` dari **query string**, fallback ke angka default kalau kosong, panggil `buildMockResult()`                                                                             | **query parameter**                             |
| Review/pembahasan        | `/preview/tryouts/[batchSlug]/review/page.tsx` — baca `answers` dari **query string** (JSON), cocokkan ke `QUESTION_REVIEW` (hardcoded per-soal: `bestOptionCode`/`explanation`/`concept`/`mindsetTip`)                                                             | **query parameter + hardcoded preview**         |
| Leaderboard              | `/preview/tryouts/[batchSlug]/leaderboard/page.tsx` — baca `total`/`twk`/`tkp` dari query string, panggil `buildMockLeaderboard()` yang MENCAMPUR skor pemain (dari query) dengan 4 "peserta lain" yang **hardcoded literal** (`Rajin97: 52`, dst, di `content.ts`) | **query parameter + hardcoded preview**         |

**Implikasi kritis:** setiap angka yang tampil di result/pembahasan/leaderboard preview berasal dari **query string yang bisa diedit manual di address bar** — sengaja demikian untuk tujuan UI-preview (lihat komentar modul `content.ts`/`review/page.tsx`), TAPI ini adalah pola yang **tidak boleh sama sekali muncul di production** (lihat Bagian E/F/I).

---

## B. Target production architecture

```
User
  → Start Attempt        POST /batches/{batchId}/attempts        [SUDAH ADA — ATM-001]
  → persisted attempt     attempts + attempt_question_instances   [SUDAH ADA — ATM-001]
  → answer persistence    answer_states + answer_mutations        [SUDAH ADA — ATM-002]
  → server-authoritative
    submission             attempt_submissions (unique per attempt) [SUDAH ADA — ATM-003]
  → domain scoring         scoreSubmission() → result_versions    [SUDAH ADA — SCR-001]
  → persisted/result state result_versions.state (+ release)      [SUDAH ADA — SCR-002]
  → review authorization   [BELUM ADA — lihat Bagian H]
  → leaderboard            ranking_snapshots + ranking_entries     [SUDAH ADA — SCR-003]
```

`attemptId` (UUID, `attempts.id`) memang sudah menjadi referensi kanonik di seluruh domain existing — dipakai sebagai parameter utama di `startOrResumeAttempt`, `saveAnswer`, `submitAttempt`, `scoreSubmission`, `getStudentResultView`, dan sudah menjadi path parameter `{attemptId}` di **9 endpoint kontrak** (`contracts/openapi.yaml`). Rekomendasi apa pun di dokumen ini **memakai `attemptId` sebagai kunci referensi**, bukan `batchSlug` (yang di preview cuma dipakai untuk routing kosmetik).

**Prinsip yang sudah dipegang teguh oleh domain existing dan HARUS dipertahankan saat wiring production:**
production result/review **tidak pernah** menerima score, answers, atau answer key dari client — setiap fungsi read (`getStudentResultView`, rencana `getAttemptReviewView`) query ulang dari database, bukan dari payload request.

---

## C. Attempt lifecycle audit

Domain sudah mendukung state yang PERSIS CLAUDE.md canonical, tidak perlu state baru:

```
created → in_progress → submitting → submitted → scoring → scored → voided
```

(`packages/db/src/schema/enums.ts:159-167`, transisi divalidasi lewat `@superlatif/domain/exam`'s `assertValidAttemptStatusTransition`, dipanggil dari `attempt-service.ts` — dua hop `submitting`→`submitted` di `submitAttempt`.)

| Yang diaudit            | Status                            | Bukti                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ownership               | ✅ Sudah                          | Setiap fungsi (`saveAnswer`, `submitAttempt`, `getAttemptResumeView`, `getStudentResultView`) cek `attempt.userId !== userId` → throw `*NotOwnedError` sebelum apa pun dibaca/ditulis                                                                                                                                                                                                                                                                               |
| Batch/test binding      | ✅ Sudah                          | `attempts.batchId` FK + partial unique index `attempts_user_batch_active_uq` (satu attempt non-voided per user+batch)                                                                                                                                                                                                                                                                                                                                               |
| `started_at`            | ✅ Sudah                          | `attempts.started_at`, di-set sekali di `createAttempt`                                                                                                                                                                                                                                                                                                                                                                                                             |
| `submitted_at`          | ⚠️ Ada TAPI di tabel yang berbeda | `attempts.submitted_at` dideklarasikan tapi **tidak pernah ditulis** oleh `submitAttempt` (bug/gap yang sudah didokumentasikan sendiri di `ranking-service.ts:137-143`: "that column is declared on attempts but never actually written... a pre-existing gap this task found but does not fix"). Sumber sebenarnya: `attempt_submissions.submitted_at` (SELALU ditulis). Konsumen production harus baca dari `attempt_submissions`, bukan `attempts.submitted_at`. |
| Remaining time/deadline | ✅ Sudah                          | `attempts.deadline_at`/`late_sync_cutoff_at`, `AttemptView.remainingSeconds` dihitung server-side tiap panggilan (`attempt-view.ts:108-110`) — reload TIDAK reset deadline                                                                                                                                                                                                                                                                                          |
| Unanswered questions    | ✅ Sudah                          | `submit-summary` endpoint sudah dikontrak (`GET /attempts/{attemptId}/submit-summary`), tapi **service-nya belum diverifikasi terimplementasi** — perlu re-cek saat wiring (lihat Bagian D)                                                                                                                                                                                                                                                                         |
| Resume                  | ✅ Sudah                          | `getAttemptResumeView`, mengembalikan urutan soal/opsi yang SAMA (dipersist di `attempt_question_instances.presented_option_order`), jawaban tersimpan, current lease state                                                                                                                                                                                                                                                                                         |
| Duplicate submit        | ✅ Sudah                          | Unique index `attempt_submissions_attempt_id_uq` + retry mengembalikan row yang sama (`created:false`) — diuji lewat "submission_replayed" audit event                                                                                                                                                                                                                                                                                                              |
| Submit setelah timeout  | ✅ Sudah                          | `finalizeExpiredAttemptIfDue` — dipicu terpisah dari user-submit, idempotent terhadap race                                                                                                                                                                                                                                                                                                                                                                          |
| Immutable submission    | ✅ Sudah                          | `attempt_submissions` tidak pernah di-UPDATE oleh kode manapun; `assertAttemptWritable` menolak tulis setelah status berubah dari `in_progress`                                                                                                                                                                                                                                                                                                                     |
| Idempotency (start)     | ✅ Sudah                          | `startIdempotencyKey` + `startRequestHash`, unique index `attempts_user_idempotency_key_uq`                                                                                                                                                                                                                                                                                                                                                                         |
| Idempotency (submit)    | ✅ Sudah                          | Race ditangani via `SubmissionRaceLostError` + re-query di luar transaksi yang gagal (`attempt-service.ts:868-885`)                                                                                                                                                                                                                                                                                                                                                 |

**Gap kecil ditemukan (bukan pembahasan, dicatat untuk kelengkapan):**

- `attempts.attempt_revision` dipakai untuk optimistic concurrency tapi kolomnya sendiri dikomentari "Optimistic-concurrency counter for the future answer-save path (ATM-004/005, not built here)" di `schema/attempts.ts:97` — padahal ATM-002 (`saveAnswer`) SUDAH memakainya (`incrementAttemptRevision`). Komentar schema itu sendiri sudah usang relatif terhadap kode; tidak berdampak fungsional, hanya catatan dokumentasi yang perlu disinkronkan suatu saat (P2, tidak menghalangi apa pun).
- **Flag-setting** (`POST /attempts/{attemptId}/flags/{instanceId}`, sudah dikontrak) **belum diimplementasikan** di `attempt-service.ts` — `AttemptView.flags` selalu `readonly never[]` (lihat `attempt-view.ts:85-86`, secara eksplisit didokumentasikan sebagai belum dibangun). Preview mock punya UI flag ("Tandai") yang murni client state. Ini bukan blocker untuk Minimum Production Slice (flag adalah convenience, bukan correctness), tapi harus tercatat sebagai P2 gap kalau UI production ingin menampilkan tombol "Tandai" yang benar-benar tersimpan.

---

## D. Answer persistence audit

**Model/schema sudah lengkap** — `answer_states` (current, CAS) + `answer_mutations` (append-only log), lihat `packages/db/src/schema/answers.ts`.

| Yang diaudit                  | Status                                               | Bukti                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Model/schema                  | ✅ Sudah                                             | Dua tabel terpisah persis mengikuti dok 16 §3 "Concept separation"                                                                                                                                                                                                                                                                                      |
| Autosave                      | ✅ Sudah (server-side machinery)                     | `saveAnswer()` di `attempt-service.ts` — endpoint kontrak `PUT /attempts/{attemptId}/answers/{instanceId}` sudah ada, tapi **belum ada bukti route handler BFF (`apps/web`) yang memanggilnya** — lihat Bagian "Minimum Production Slice"                                                                                                               |
| Granularity                   | Per-instance (per soal), bukan per-attempt sekaligus | `answer_states` unique per `(attempt_id, instance_id)`                                                                                                                                                                                                                                                                                                  |
| Replacement/update semantics  | ✅ Compare-and-swap                                  | `resolveAnswerSaveOutcome` (`@superlatif/domain/exam`) — `expectedRevision` harus cocok, kalau tidak → `ANSWER_REVISION_CONFLICT` dengan revision+payload terkini dikembalikan ke client untuk resolve                                                                                                                                                  |
| Concurrency/two tabs          | ✅ Sudah, fail-closed                                | Writer lease (`attempt_writer_leases`, partial unique index `WHERE is_active`) — tab kedua harus `takeoverWriterLease` eksplisit; tab pertama otomatis ditolak di tulis berikutnya (`WRITER_LEASE_REVOKED`), TIDAK ADA overwrite diam-diam                                                                                                              |
| Retry setelah network failure | ✅ Sudah, idempotent                                 | `client_mutation_id` (UUID dari client) — retry dengan ID sama selalu mengembalikan outcome yang SAMA persis, tidak pernah diproses ulang (`answer-mutation-repository.ts` + `attempt-service.ts:548-582`)                                                                                                                                              |
| Late-sync recovery            | ✅ Sudah (bukan auto-score)                          | Jawaban yang masuk setelah `deadline_at` tapi sebelum `late_sync_cutoff_at` disimpan sebagai `late_sync_recovery_candidate` — **tidak pernah menyentuh `answer_states`** sampai ada adjudikasi manual (adjudikasi itu sendiri belum dibangun — correctly out of scope, sesuai instruksi "late-sync adalah recovery candidate, bukan otomatis di-score") |

**Kesimpulan D:** tidak ada gap desain di layer domain/db untuk answer persistence. Gap production murni di layer `apps/web` — belum ada route/Server Action yang MEMANGGIL `saveAnswer`.

---

## E. Scoring integrity audit

| Syarat                                    | Status                                                  | Bukti                                                                                                                                                                                                                                                                                  |
| ----------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server authoritative                      | ✅ Sudah                                                | `scoreSubmission` hanya baca dari `answer_states` (re-checksum dicocokkan ke `attempt_submissions.answer_set_checksum` — lihat `ScoringInputChecksumMismatchError`), `question_version_secrets`, dan `scoring_policy_versions` — **tidak ada satu pun input dari client di jalur ini** |
| Reuse scorer/domain existing              | ✅ Sudah                                                | `gradeAnswer` (`packages/domain/src/exam/answer-grading.ts`) + `computeScore` (`score-calculation.ts`) — inilah "scorer" yang dimaksud, sudah dipakai SCR-001 dan tidak perlu dibuat ulang                                                                                             |
| Deterministic                             | ✅ Sudah, diverifikasi                                  | `inputChecksum` = checksum dari `{submissionId, answerSetChecksum, scoringPolicyVersionId, scoringEngineVersion}` — "Recompute equality" adalah acceptance test SCR-001 yang sudah lolos                                                                                               |
| Tidak percaya nilai dari browser          | ✅ Sudah                                                | Lihat baris pertama tabel ini                                                                                                                                                                                                                                                          |
| Tidak menerima score dari query parameter | ✅ Sudah (di domain) / ❌ **DILANGGAR di preview mock** | Preview `/result`, `/review`, `/leaderboard` SEMUA membaca skor dari query string — ini SATU-SATUNYA tempat prinsip ini dilanggar, dan itu memang by design untuk mock (lihat komentar modul), TIDAK BOLEH ikut ter-copy ke production route                                           |

**TWK vs TKP diaudit terpisah, sesuai instruksi:**

- **TWK (single_choice)** — `gradeAnswer` mengembalikan `{kind:"binary", correct: boolean}` dengan membandingkan `payload.optionCode === answerKey.correctOptionCode`. Ini genuinely binary, sesuai realita soal TWK. ✅ Tidak ada perubahan semantic diperlukan.
- **TKP (weighted_choice)** — `gradeAnswer` mengembalikan `{kind:"weighted", weight: number}` — **TIDAK PERNAH direduksi jadi correct/incorrect** di manapun dalam kode scoring. `answerKey.optionWeights` adalah `Record<string, number>` (semua opsi punya bobot, bukan satu "kunci"). **Scorer existing TIDAK memperlakukan TKP sebagai binary** — rekomendasi produksi manapun untuk pembahasan HARUS mempertahankan sifat ini (lihat Bagian H: badge "skor tertinggi" bukan "benar/salah", persis seperti sudah diterapkan di preview mock).

**Kesimpulan E:** tidak ada gap. Prinsip yang diminta user ("jangan mengubah TKP jadi binary") **sudah dipegang oleh domain existing**, bukan sesuatu yang perlu ditegakkan baru.

---

## F. Answer-key security audit

Lapisan keamanan struktural sudah ada, dicek langsung di source:

| Potensi leakage                      | Status                                                         | Bukti                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------ | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Question API (saat attempt berjalan) | ✅ Aman                                                        | `assembleStudentFacingQuestionView` (`question-preview-service.ts`) TIDAK PERNAH mengimpor `question-secret-repository.ts` — dijamin secara struktural (module tidak punya akses ke fungsi itu), bukan sekadar disiplin review                                                                                                                                                                                                                                                                                                                                                                              |
| Server Components / RSC payload      | ✅ Aman (untuk domain existing)                                | `AttemptView`/`StudentFacingQuestionView` tidak punya field yang bisa diisi answer key — type-level guarantee (lihat `student-view.ts` module doc: "no field an AnswerKey could be assigned to")                                                                                                                                                                                                                                                                                                                                                                                                            |
| Client bundle                        | ✅ Aman (untuk domain existing)                                | `question_version_secrets` hanya diimpor oleh `question-secret-repository.ts` dan `scoring-service.ts` (server-only, `packages/db`) — tidak pernah diimpor oleh apa pun yang bisa jadi client bundle                                                                                                                                                                                                                                                                                                                                                                                                        |
| Mock imports                         | ⚠️ **Ditemukan di preview, sudah dimitigasi**                  | `QUESTION_REVIEW` (jawaban benar mock) diimpor HANYA oleh `review/page.tsx` (Server Component) — `AttemptPlayer.tsx` (client, `"use client"`) import `content.ts` tapi HANYA named export `computeMockScore`/`PREVIEW_QUESTIONS`, tidak pernah `QUESTION_REVIEW`. Diverifikasi ulang lewat `grep` saat review PR #31 (lihat commit `f556ba8`). Next.js/Turbopack production build melakukan tree-shaking per-named-export, jadi `QUESTION_REVIEW` tidak seharusnya masuk client bundle — **tapi ini belum diverifikasi lewat inspeksi bundle fisik** (P2: tambahkan assertion otomatis, lihat Test Matrix). |
| Prefetch                             | ⚠️ Belum diaudit                                               | Next.js App Router prefetch link `<a>`/`<Link>` bisa memicu RSC payload fetch untuk halaman yang di-link — perlu verifikasi bahwa `/review` (production) tidak ter-prefetch dari halaman `/attempt` (yang mestinya belum boleh reveal apa pun). Untuk domain existing ini otomatis aman karena `/review` di production akan query DB fresh dan menolak sebelum window `explanation_release` terbuka (lihat Bagian H) — prefetch hanya memicu request, bukan bypass otorisasi.                                                                                                                               |
| Page source (view-source)            | ✅ Aman (untuk domain existing)                                | Server Component tidak mengirim source apa pun ke client selain HTML hasil render — tidak ada isu di sini selama assembly function-nya sendiri tidak pernah dipanggil sebelum waktunya                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Query parameters                     | ❌ **Prinsip dilanggar di preview, TIDAK BOLEH ke production** | Lihat Bagian E — preview mengirim `answers`/`total`/`twk`/`tkp` di URL. Production **wajib** memakai `attemptId` saja di URL, dan me-resolve semuanya dari database.                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Result endpoint                      | ✅ Aman (untuk domain existing)                                | `getStudentResultView` — `UNRELEASED_VIEW` (state:"processing", scoreSummary:null) dikembalikan SELALU kalau `resolveResultVisibility` bilang belum boleh, apa pun isi `result_versions` yang sebenarnya sudah ada di DB                                                                                                                                                                                                                                                                                                                                                                                    |
| Review endpoint                      | ❌ **Belum ada implementasi**                                  | Endpoint dikontrak, tapi tidak ada `getAttemptReviewView`-setara di `packages/db/src/exam/scoring/`. Ini AKAN jadi titik leakage paling kritis begitu dibangun — harus mengikuti pola `getStudentResultView` PERSIS: query fresh, visibility check SEBELUM baca apa pun dari `question_version_secrets`/`explanationDocument`.                                                                                                                                                                                                                                                                              |

---

## G. Authorization audit

**Pola existing (dipegang konsisten di semua fungsi yang sudah dibangun):**

```ts
const attempt = await findAttemptById(db, attemptId);
if (!attempt) throw new AttemptNotFoundError(attemptId);
if (attempt.userId !== userId) throw new AttemptNotOwnedError(attemptId); // atau ResultNotOwnedError
```

Dipakai identik oleh `getAttemptResumeView`, `saveAnswer`, `submitAttempt` (untuk trigger "user"), `getStudentResultView`. **Ini secara struktural mencegah IDOR** — mengganti `attemptId` di URL ke milik user lain akan selalu memicu error di titik paling awal, sebelum baris kode lain sempat berjalan.

`getBatchLeaderboardView` memakai pola setara tapi berbasis effective access ke batch (bukan ownership attempt tunggal) — `LeaderboardNotAuthorizedError` kalau `getEffectiveAccess` bilang tidak punya akses ke batch tersebut.

| Yang diaudit                   | Status                                                                                                                                                                                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ownership attempt              | ✅ Sudah, terverifikasi berulang di 4+ fungsi                                                                                                                                                                                                                |
| Ownership result               | ✅ Sudah (`ResultNotOwnedError`)                                                                                                                                                                                                                             |
| Ownership review               | ❌ Belum ada fungsi — tapi pola di atas trivial untuk direplikasi                                                                                                                                                                                            |
| Risiko IDOR (user A vs user B) | ✅ Dicegah secara struktural untuk attempt/result. Review: otomatis akan warisi proteksi yang sama SELAMA fungsi barunya benar-benar memanggil ownership check ini sebagai baris pertama (lihat rekomendasi implementasi, Bagian "Minimum Production Slice") |
| Role admin/tutor dikecualikan  | ❌ **Belum didukung sama sekali**                                                                                                                                                                                                                            | Tidak ada satu pun fungsi attempt/result/review yang menerima parameter role/actor selain `userId` pemilik attempt. `support` (salah satu 8 role canonical CLAUDE.md) TIDAK PUNYA jalur untuk melihat attempt/result siswa lain hari ini — bukan sesuatu yang "dilupakan", tapi genuinely belum dibangun. Kalau dibutuhkan (mis. untuk customer support investigasi komplain skor), ini butuh keputusan eksplisit: apakah lewat `authorize()`/IDN-004 permission baru (mis. `exam.attempt.support_view`), lalu titik pengecualiannya persis di baris `if (attempt.userId !== userId)` di atas — ganti jadi `if (attempt.userId !== userId && !(await hasPermission(actorUserId, "exam.attempt.support_view")))`. **Tidak direkomendasikan untuk Minimum Production Slice** — murni dicatat sebagai extension point P2. |

---

## H. Review/pembahasan release policy — titik ekstensi

Ini bagian dengan temuan paling penting. **Fondasinya sudah ada, tidak dipakai:**

1. **Window type sudah dimodelkan**: `explanation_release` adalah salah satu dari 8 nilai `BatchWindowType` (`packages/domain/src/exam/batch-windows.ts:26-35`), sudah termasuk dalam `assertBatchWindowsCoherent` validation, sudah punya kolom di tabel `batch_windows` (lewat `batchWindowType` pg enum, `packages/db/src/schema/exam-batches.ts`).
2. **Sudah dipetakan ke `BatchWindowSet`**: `WINDOW_SET_KEY.explanation_release → "explanationRelease"` (`batch-window-repository.ts:62`) — field `explanationRelease` SUDAH ADA di tipe `BatchWindowSet`, siap dibaca persis seperti `leaderboardRelease` sudah dibaca oleh `ranking-service.ts:255-257`:
   ```ts
   const leaderboardWindowReached =
     windowSet.leaderboardRelease !== undefined &&
     now.getTime() >= windowSet.leaderboardRelease.startsAt.getTime();
   ```
3. **dok 16 §16 sudah menetapkan aturan bisnis persis**: "Release nilai, leaderboard, dan explanation dapat berbeda waktunya" + "sebelum review release: tanpa correct answers/weights/explanation; setelah review: answer comparison dan explanation sesuai policy."
4. **Kontrak sudah menyediakan endpoint + error code**: `GET /attempts/{attemptId}/review` dan error `EXPLANATION_NOT_RELEASED` — keduanya dideklarasikan, keduanya belum ada implementasi apa pun.

**Titik ekstensi paling tepat (tanpa rewrite):** satu domain helper baru di level yang sama seperti `resolveResultVisibility`/`resolveLeaderboardWireState` — misalnya `resolveExplanationVisibility(explanationReleaseWindow, now)` — plus satu fungsi assembly baru `getAttemptReviewView` (mirror `getStudentResultView` PERSIS strukturnya: fresh query, ownership check, visibility check, baru compose data). Ini mendukung SEMUA 4 mode rilis yang diminta user tanpa desain ulang:

- **Langsung setelah submit** → set window `explanation_release.startsAt` = waktu batch dibuka, atau biarkan sama dengan `provisional_result_release`.
- **Setelah batch ditutup** → set `startsAt` = `attempt.endsAt`/`access_end` window.
- **Pada waktu tertentu** → set `startsAt` ke timestamp absolut manapun — window sudah mendukung tanggal bebas.
- **Berdasarkan entitlement/produk** → BUKAN tanggung jawab window (window murni waktu) — ini butuh cek `getEffectiveAccess` tambahan pada attempt/produk yang relevan, POLA yang sudah ada persis di `getBatchLeaderboardView` (baris `getEffectiveAccess(db, cache, viewerUserId, query, now)`), tinggal dipanggil ulang di fungsi review yang baru.

**Tidak ada policy baru yang perlu diimplementasikan sekarang** — hanya dicatat titik ekstensinya, sesuai instruksi.

---

## I. Leaderboard integrity audit

| Syarat                                                  | Status                                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Score dari submission authoritative, sama dengan result | ✅ Sudah                                                                        | `generateRankingSnapshot` baca `findCurrentResultByAttemptId` (sumber SAMA dengan `getStudentResultView`) — tidak ada jalur skor kedua |
| Submission                                              | ✅ Sudah                                                                        | Memakai `attempt_submissions.submitted_at` untuk tie-break (BUKAN `attempts.submitted_at` yang bug — lihat Bagian C), sudah benar      |
| Ranking                                                 | ✅ Sudah                                                                        | `rankCandidates` (domain, pure, deterministic)                                                                                         |
| Tie-break                                               | ✅ Sudah, berversi                                                              | `RANKING_POLICY_VERSION` dicatat di setiap snapshot — "Tie-break berversi" (dok 18 §15)                                                |
| Tidak dari browser/query parameter                      | ✅ Sudah (di domain) / ❌ **Dilanggar di preview mock** (sama seperti Bagian E) |
| Eligibility                                             | ✅ Sudah, 3 gerbang independen                                                  | Not voided + result RELEASED + effective access masih aktif (refund/expired otomatis exclude tanpa menghapus data historis)            |

**Kesimpulan I:** tidak ada gap desain. Leaderboard production tinggal WIRING (BFF route memanggil `getBatchLeaderboardView`), bukan membangun ulang logic apa pun.

---

## STEP 4 — Gap classification

### P0 — Production blocker

1. **Tidak ada BFF route/Server Action apa pun di `apps/web` yang memanggil domain/db attempt/answer/submit/scoring/result/leaderboard functions.** Semua fungsi di Bagian B "SUDAH ADA" hanya bisa dipanggil dari integration test hari ini — nol jalur HTTP/route production yang mengeksposnya. Ini P0 karena tanpa ini, TIDAK ADA satu pun bagian dari "tryout nyata" yang bisa berjalan, terlepas dari seberapa matang domain layer-nya.
2. **Tidak ada sesi/autentikasi nyata** (dicatat sejak UI Preview Track dibangun, ADR-052) — `userId` di setiap fungsi domain di atas HARUS datang dari identitas terverifikasi, bukan cookie demo/query string. Ini P0 karena tanpa ini, `attempt.userId !== userId` check di Bagian G tidak berarti apa-apa (siapa pun bisa mengklaim `userId` siapa pun).
3. **Query-parameter-as-truth pattern di preview TIDAK BOLEH ikut ter-copy ke production result/review/leaderboard page** — ini bukan gap yang perlu "diperbaiki" di preview (preview sudah benar untuk tujuannya), tapi risiko nyata kalau implementasi production route dimulai dari copy-paste halaman preview tanpa mengganti sumber data.

### P1 — Required (agar first production release layak)

1. **`getAttemptReviewView` (baru) + `resolveExplanationVisibility` (baru, kecil)** — lihat Bagian H. Tanpa ini, fitur pembahasan (feedback utama yang memicu audit ini) tidak punya jalur production sama sekali.
2. **Resolusi "best option" untuk `weighted_choice` di jalur pembahasan** — `gradeAnswer` hanya mengembalikan angka bobot, bukan kode opsi terbaik. Perlu satu fungsi pure kecil di `packages/domain/src/exam` (mis. `resolveBestWeightedOption(optionWeights): string`) — TIDAK mengubah `gradeAnswer`/`AnswerKey` yang sudah ada.
3. **Wiring `saveAnswer`/`submitAttempt` ke BFF route** dengan penanganan writer lease + client_mutation_id di sisi client (browser) — ini pekerjaan `apps/web` murni, domain/db tidak berubah.
4. **Autentikasi nyata (IDN-002 bridge atau setara)** — di luar scope exam-engine tapi menjadi prasyarat P0 #2 di atas. Dicatat di sini sebagai dependency, bukan untuk dikerjakan oleh slice ini.
5. **Verifikasi/perbaikan `submit-summary` endpoint** (`GET /attempts/{attemptId}/submit-summary`) — dikontrak, implementasinya di `attempt-service.ts` belum ditemukan/diverifikasi saat audit ini; perlu re-cek sebelum wiring UI konfirmasi submit.

### P2 — Improvement (bisa menyusul)

1. Admin/support override untuk melihat attempt/result/review siswa lain (Bagian G).
2. Flag-setting yang benar-benar persisten (Bagian C).
3. Sinkronisasi komentar schema `attempts.attempt_revision` yang sudah usang (Bagian C).
4. Verifikasi tree-shaking `QUESTION_REVIEW` lewat inspeksi bundle fisik, bukan hanya inspeksi import graph (Bagian F) — relevan untuk preview, bukan production (production tidak akan punya `QUESTION_REVIEW`-setara di client bundle sama sekali kalau `getAttemptReviewView` dipanggil server-side, seperti seharusnya).
5. Worker/scheduler nyata untuk `finalizeExpiredAttemptIfDue`/`releaseResult`/`generateRankingSnapshot`/`drainScoringJob` (lihat STEP 5 — tidak diperlukan untuk slice pertama).

---

## STEP 5 — Minimum Production Slice

**Filosofi yang diikuti:** setiap baris di bawah adalah **penyambungan** ke fungsi yang sudah ada dan sudah teruji, bukan pembangunan ulang. Tidak ada abstraksi baru untuk kebutuhan hipotetis — hanya yang literally dipakai flow satu tryout nyata.

### `apps/web`

|                    | Detail                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Existing**       | 8 halaman `/preview/*` (mock, tetap ada, tidak dihapus — tetap berguna untuk demo UX tanpa DB), `apps/web/src/lib/db.ts` (DB/cache singleton yang SUDAH dipakai `/home`)                                                                                                                                                                                                                                                                                                           |
| **Gap**            | Nol route production untuk attempt/answer/submit/result/review/leaderboard. Nol sesi nyata.                                                                                                                                                                                                                                                                                                                                                                                        |
| **Minimal Change** | Route baru di bawah `apps/web/src/app/tryouts/**` (namespace TERPISAH dari `/preview/*`, sama seperti `/preview/*` dulu dipisah dari `/home` — lihat STEP 7 untuk daftar route), masing-masing Server Component yang memanggil fungsi domain/db yang SUDAH ADA lewat `getDb()`/`getEffectiveAccessCache()` (pola yang identik dengan `/home/page.tsx`). Answer-save via Server Action yang memanggil `saveAnswer` langsung (App Router idiom yang sama seperti `demoLoginAction`). |
| **Why**            | Ini satu-satunya package yang BENAR-BENAR kosong untuk tryout nyata — semua "otak"-nya sudah ada di `packages/db`/`packages/domain`.                                                                                                                                                                                                                                                                                                                                               |
| **Risk**           | Sedang. Ini interactive client component PERTAMA yang terhubung ke data nyata (bukan mock) di app ini — perlu penanganan writer-lease-renewal dan client_mutation_id generation di client (browser), yang belum pernah dibangun di `apps/web` sama sekali (preview's `AttemptPlayer` tidak butuh ini karena semuanya mock).                                                                                                                                                        |

### `apps/worker`

|                    | Detail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Existing**       | Skeleton kosong (`apps/worker/src/index.ts`), tidak ada scheduler/queue apa pun                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Gap**            | `finalizeExpiredAttemptIfDue`, `drainScoringJob`/`drainAllPendingScoringJobs`, `releaseResult`, `generateRankingSnapshot` semuanya "callable, not a scheduler" (dikonfirmasi lewat komentar modul masing-masing) — tidak ada yang memicu mereka otomatis                                                                                                                                                                                                                                                                                                                              |
| **Minimal Change** | **TIDAK DIPERLUKAN untuk slice ini.** Untuk SATU tryout nyata dengan skala kecil: panggil `scoreSubmission`/`drainScoringJob` **secara sinkron di dalam request handler `submit`** (persis seperti integration test sudah memverifikasi urutan panggilan ini aman), dan panggil `releaseResult`/`generateRankingSnapshot` dari route/Server Action admin yang dipicu manual (tombol "Rilis hasil sekarang"), bukan scheduler.                                                                                                                                                         |
| **Why**            | "Boring technology, sedikit moving parts" — worker nyata (cron/queue) menambah operational complexity (deployment kedua, monitoring, retry policy) yang tidak dibutuhkan untuk memvalidasi SATU tryout end-to-end. `finalizeExpiredAttemptIfDue` untuk auto-submit-saat-timeout memang idealnya scheduler, tapi untuk slice pertama bisa diganti sementara dengan client-side "waktu habis → panggil submit" (`CountdownTimer.onExpire`, SUDAH ADA di `packages/ui`) + toleransi bahwa siswa yang menutup tab tepat saat timeout perlu mekanisme lanjutan di iterasi berikutnya (P2). |
| **Risk**           | Rendah untuk slice ini (worker sengaja tidak disentuh), tapi ini adalah utang yang HARUS dibayar sebelum batch besar/production sungguhan — auto-submit-saat-timeout tanpa scheduler berarti siswa yang crash/offline persis di detik deadline bisa punya attempt yang tidak pernah ter-finalize sampai ada permintaan berikutnya yang memicu `finalizeExpiredAttemptIfDue` secara eksplisit.                                                                                                                                                                                         |

### `packages/domain`

|                    | Detail                                                                                                                                                                                                                                                                                                               |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Existing**       | `resolveResultVisibility`, `resolveLeaderboardWireState`, `gradeAnswer`, `computeScore`, `BatchWindowType` (termasuk `explanation_release`) — semua reusable                                                                                                                                                         |
| **Gap**            | Tidak ada `resolveExplanationVisibility`. Tidak ada fungsi derive "opsi terbaik" untuk `weighted_choice`.                                                                                                                                                                                                            |
| **Minimal Change** | 2 fungsi pure baru, ditempatkan di `packages/domain/src/exam/` mengikuti pola file yang sudah ada (mis. `explanation-visibility.ts` mirror `result-lifecycle.ts`'s `resolveResultVisibility` persis strukturnya; `resolveBestWeightedOption` bisa jadi tambahan kecil di `answer-key.ts` atau file barunya sendiri). |
| **Why**            | Domain layer tetap jadi satu-satunya tempat aturan bisnis "kapan pembahasan boleh terlihat" dan "opsi mana yang terbaik" hidup — bukan di `apps/web` (menjaga "domain decisions in pure, testable modules", CLAUDE.md).                                                                                              |
| **Risk**           | Rendah — pure function baru, tidak menyentuh fungsi existing sama sekali.                                                                                                                                                                                                                                            |

### `packages/db`

|                    | Detail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Existing**       | Semua repository/service Bagian B lengkap. `findQuestionVersionById` sudah mengembalikan `explanationDocument`. `requireQuestionVersionSecret` sudah bisa dipanggil untuk resolve answer key.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Gap**            | Tidak ada `getAttemptReviewView`-setara di `packages/db/src/exam/scoring/`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Minimal Change** | Satu fungsi baru, mis. `packages/db/src/exam/scoring/attempt-review-service.ts`, isinya: (1) ownership check (copy pola `getStudentResultView`), (2) load `attempt`+`batch`+windowSet, (3) panggil `resolveExplanationVisibility` (domain, baru), (4) kalau belum boleh → return shape kosong (persis pola `UNRELEASED_VIEW`), (5) kalau boleh → loop `attempt_question_instances`, untuk tiap instance: ambil `answer_states` (jawaban siswa), `question_version_secrets` (via `requireQuestionVersionSecret`, SUDAH ADA), `question_versions.explanationDocument` (via `findQuestionVersionById`, SUDAH ADA), susun status pakai `gradeAnswer` (SUDAH ADA) + `resolveBestWeightedOption` (baru, domain). |
| **Why**            | Ini SATU-SATUNYA fungsi baru yang benar-benar "assembly logic" baru di seluruh Minimum Production Slice — semua ingredient-nya sudah ada, ini murni komposisi.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Risk**           | Sedang-rendah. Risiko utama: lupa memanggil visibility check SEBELUM baca secret (harus urutan yang sama seperti `getStudentResultView`, TIDAK boleh baca `question_version_secrets` dulu baru cek visibility).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

### `packages/contracts`

|                    | Detail                                                                                                                                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Existing**       | Route `GET /attempts/{attemptId}/review` sudah ada, `ResultEnvelope.data` tidak `additionalProperties:false` (terbuka untuk ekstensi)                                                                                                             |
| **Gap**            | Belum ada schema eksplisit untuk `data.reviewItems` (array per-soal: instanceId, sectionCode, selectedOptionCode, bestOptionCode/correctOptionCode, status, explanationDocument, concept)                                                         |
| **Minimal Change** | Tambah properti `reviewItems` (array, optional) ke `ResultEnvelope.data`, ATAU (lebih bersih) buat `ReviewEnvelope` baru yang extend `ResultEnvelope` lewat `allOf` — non-breaking baik dengan cara mana pun karena skema saat ini memang terbuka |
| **Why**            | Kontrak harus mencerminkan bentuk data nyata yang dikirim, untuk `test:contract` tetap berarti                                                                                                                                                    |
| **Risk**           | Rendah — aditif murni                                                                                                                                                                                                                             |

### `packages/ui`

|                    | Detail                                                                                                                                                                                                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Existing**       | `AnswerableQuestion`, `CountdownTimer`, `QuestionReviewCard`, `ResultScoreCard`, `LeaderboardTable`, `BatchCard` — SEMUA sudah dibangun untuk preview dan **tidak mengandung logic mock apa pun di dalam komponennya sendiri** (props murni, lihat file masing-masing) |
| **Gap**            | Tidak ada — komponen-komponen ini SUDAH siap dipakai ulang persis apa adanya oleh halaman production, cukup diberi data dari service call nyata alih-alih `content.ts`                                                                                                 |
| **Minimal Change** | Tidak ada perubahan diperlukan                                                                                                                                                                                                                                         |
| **Why**            | Disiplin "props murni, tidak import domain/db" (workspace boundary) yang sudah diikuti sejak awal UI Preview Track sekarang terbukti manfaatnya                                                                                                                        |
| **Risk**           | Tidak ada                                                                                                                                                                                                                                                              |

### Test infrastructure

|                    | Detail                                                                                                                                               |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Existing**       | `test/fixtures/contracts/exam-attempt-lifecycle.cases.json`, `scoring-skd-synthetic.cases.json`, dll — sudah dipakai integration test ATM/SCR series |
| **Gap**            | Tidak ada fixture untuk skenario review/pembahasan (visibility window, best-option resolution)                                                       |
| **Minimal Change** | Tambah kasus baru ke fixture yang sudah ada atau file fixture baru sejenis, mengikuti format yang sama                                               |
| **Why**            | Konsisten dengan disiplin "Use and extend the Gate 4 fixtures" (skill exam-engine)                                                                   |
| **Risk**           | Rendah                                                                                                                                               |

---

## STEP 6 — Schema / migration assessment

**Tidak ada migration yang dibuat oleh audit ini.** Temuan:

| Kebutuhan                  | Field/tabel existing yang bisa dipakai                                                                   | Field yang benar-benar hilang                                                                                                                                                                                                                         |
| -------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Attempt snapshot immutable | ✅ `attempts` (semua FK pinned di start) — SUDAH tersedia                                                | Tidak ada                                                                                                                                                                                                                                             |
| Answer/explanation model   | ✅ `question_versions.explanation_document` (jsonb, sudah ada, sudah bisa ditulis lewat question editor) | Tidak ada                                                                                                                                                                                                                                             |
| Jawaban siswa per soal     | ✅ `answer_states` (current) + `answer_mutations` (log)                                                  | Tidak ada                                                                                                                                                                                                                                             |
| Jawaban benar/bobot        | ✅ `question_version_secrets.answer_key` (jsonb, shape `AnswerKey` union)                                | Tidak ada                                                                                                                                                                                                                                             |
| Window rilis pembahasan    | ✅ `batch_windows` dengan `window_type = 'explanation_release'` (enum value SUDAH ada)                   | Tidak ada                                                                                                                                                                                                                                             |
| Index/constraint tambahan  | —                                                                                                        | Tidak ada yang teridentifikasi — semua query baru (per-attempt review assembly) akan pakai index yang sudah ada (`attempt_question_instances` sudah indexed by `attempt_id` secara implisit lewat FK+PK pattern yang konsisten di seluruh schema ini) |

**Kesimpulan:** STEP 6 secara eksplisit menghasilkan **nol kebutuhan schema/migration baru**. Ini adalah temuan paling langka dan paling menguntungkan dari audit ini — seluruh fondasi data untuk pembahasan sudah dirancang sejak QST-001/SCR-001, hanya belum pernah disambungkan.

---

## STEP 7 — Proposed production routes

**Rekomendasi: ikuti bentuk kontrak yang SUDAH ADA di `contracts/openapi.yaml`, bukan contoh `[batchSlug]` di instruksi** — karena `attemptId` sudah jadi kunci kanonik di domain existing (lihat Bagian B), dan endpoint-endpoint di bawah **sudah dikontrak secara eksplisit**, bukan usulan baru:

| Method + Path (kontrak, sudah ada)                                | Dilayani oleh (sudah ada)                        | Halaman `apps/web` (baru, tinggal wiring)                                                                                                                                |
| ----------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /batches/{batchId}/attempts`                                | `startOrResumeAttempt`                           | `apps/web/src/app/tryouts/[batchId]/attempt/page.tsx` — panggil saat mount/on-click "Mulai"                                                                              |
| `GET /attempts/{attemptId}`                                       | `getAttemptResumeView`                           | sama, untuk resume                                                                                                                                                       |
| `PUT /attempts/{attemptId}/answers/{instanceId}`                  | `saveAnswer`                                     | Server Action dipanggil dari `AnswerableQuestion.onSelect` (komponen `packages/ui` sudah siap, tinggal ganti `onSelect` handler dari `setState` mock jadi Server Action) |
| `POST /attempts/{attemptId}/writer-lease/renew` \| `.../takeover` | `renewWriterLease`/`takeoverWriterLease`         | dipanggil periodik (interval) dari client attempt page                                                                                                                   |
| `GET /attempts/{attemptId}/submit-summary`                        | ⚠️ perlu verifikasi implementasi (P1 #5)         | halaman ringkasan sebelum submit (persis seperti preview's "Tinjau sebelum mengirim")                                                                                    |
| `POST /attempts/{attemptId}/submit`                               | `submitAttempt`                                  | Server Action tombol "Kirim jawaban"                                                                                                                                     |
| `GET /attempts/{attemptId}/result`                                | `getStudentResultView`                           | `apps/web/src/app/tryouts/[batchId]/result/[attemptId]/page.tsx`                                                                                                         |
| `GET /attempts/{attemptId}/review`                                | ❌ **baru, lihat STEP 5** `getAttemptReviewView` | `apps/web/src/app/tryouts/[batchId]/review/[attemptId]/page.tsx`                                                                                                         |
| `GET /batches/{batchId}/leaderboard`                              | `getBatchLeaderboardView`                        | `apps/web/src/app/tryouts/[batchId]/leaderboard/page.tsx`                                                                                                                |

Pola URL yang mengikuti kontrak secara harfiah: **`attemptId` di path**, bukan `batchSlug`, untuk halaman yang attempt-scoped (result/review) — konsisten dengan endpoint-nya sendiri (`/attempts/{attemptId}/result`, bukan `/batches/{batchId}/result`). `batchId` tetap dipakai untuk halaman yang genuinely batch-scoped (start attempt, leaderboard).

---

## STEP 8 — Test matrix

### Happy path

- [ ] Seluruh soal dijawab (TWK 3 + TKP 3) → submit → result → review menunjukkan 6/6 dengan status benar
- [ ] Sebagian unanswered → submit → review menunjukkan status "kosong" untuk yang tidak dijawab, skor tetap hitung yang terjawab
- [ ] TWK: jawaban salah → review menunjukkan badge "Salah" + opsi kunci yang benar
- [ ] TKP (weighted_choice): review menunjukkan badge "skor tertinggi"/"bukan skor tertinggi", TIDAK PERNAH "benar"/"salah" mentah
- [ ] Submit → result state `provisional` sebelum window release, `final` setelahnya (kalau ada mekanisme transisi eksplisit — cek dulu apakah SCR-002 sudah punya ini)
- [ ] Review kosong/gated sebelum `explanation_release` window terbuka, muncul lengkap sesudahnya
- [ ] Leaderboard menunjukkan rank yang benar berdasarkan `result_versions.total_score`, bukan input manapun dari client

### Security

- [ ] `GET /attempts/{attemptId}/review` sebelum submit (attempt masih `in_progress`) → ditolak (bukan hasil kosong yang "terlihat seperti belum submit", tapi state yang eksplisit tidak mengekspos APAPUN dari `question_version_secrets`)
- [ ] `GET /attempts/{attemptId}/review`\|`/result` tanpa autentikasi → 401/403
- [ ] `GET /attempts/{attemptId}/*` dengan `attemptId` milik user lain → `AttemptNotOwnedError`/`ResultNotOwnedError` (403), TIDAK bocor bahkan `state`/existence attempt tersebut
- [ ] Skor/jawaban dipalsukan lewat request body/query manapun ke `submit`/`result`/`review` → tidak berpengaruh (endpoint-endpoint ini secara desain tidak menerima skor/jawaban sebagai input, hanya `attemptId`)
- [ ] `attemptId` malformed (bukan UUID valid) → validasi input menolak sebelum query DB (perlu verifikasi validasi ini ada di layer route/BFF, bukan cuma di domain)
- [ ] Inspeksi jaringan/DOM selama attempt berjalan (`GET /attempts/{attemptId}`) → tidak ada `answerKey`/`optionWeights`/`explanationDocument` di response manapun
- [ ] Akses langsung ke hipotetis endpoint lain (`question_version_secrets` table) dari luar service layer → mustahil secara struktural (tidak ada route yang mengeksposnya) — test ini adalah audit statis (grep import), bukan test runtime

### Reliability

- [ ] Refresh saat attempt → `getAttemptResumeView` mengembalikan urutan soal/opsi + jawaban tersimpan yang SAMA
- [ ] Refresh saat result/review → data yang sama persis (deterministic, dari DB, bukan dari state yang hilang saat refresh)
- [ ] Double-click submit → satu attempt_submissions row, `created:false` pada klik kedua
- [ ] Submit retry setelah timeout jaringan (client tidak tahu apakah request pertama sampai) → idempotent lewat `client_mutation_id`/unique index
- [ ] Network failure sementara saat save-answer → retry dengan `client_mutation_id` yang sama menghasilkan outcome yang sama, tidak menggandakan revision
- [ ] Dua tab dibuka bersamaan → tab kedua `takeoverWriterLease`, tab pertama mendapat `WRITER_LEASE_REVOKED` pada tulis berikutnya, TIDAK ADA jawaban yang hilang diam-diam (tab pertama tahu ia kalah)
- [ ] Timer expiry → `finalizeExpiredAttemptIfDue` (dipanggil dari client `onExpire` untuk slice pertama, lihat STEP 5) menghasilkan submission yang sama seperti submit manual jika race terjadi (`SubmissionRaceLostError` path)

---

## Rekomendasi urutan implementasi (untuk fase approval berikutnya, BELUM dieksekusi)

1. **Autentikasi nyata** (prasyarat P0, di luar scope exam-engine — kemungkinan task IDN-002 terpisah).
2. **`getAttemptReviewView` + `resolveExplanationVisibility` + `resolveBestWeightedOption`** (packages/domain + packages/db) — unit/integration test dulu, sebelum apa pun di `apps/web`.
3. **Wiring `apps/web` route production** (start → attempt player nyata dengan `saveAnswer`/writer lease → submit → result), reuse komponen `packages/ui` yang sudah ada.
4. **Wiring review + leaderboard route production**.
5. **Verifikasi `submit-summary` endpoint** (P1 #5) — paralel dengan langkah 3, tidak memblokir.
6. **Worker/scheduler nyata** — HANYA jika/ketika volume attempt sungguhan membutuhkan auto-submit-saat-timeout yang tidak bergantung client masih online (P2, bukan bagian slice pertama).

---

## OUTPUT — Ringkasan sesuai permintaan

1. **Status final PR #31**: Merged ke `main`.
2. **Commit SHA merge**: `a1cc1d64eeba1f107f33ab8b52bed3d37a58ae50`.
3. **Hasil clean-main verification**: `pnpm run verify` PASS penuh dari `main` bersih (607 unit / 315 integration / 30 contract, build termasuk route `/preview/tryouts/[batchSlug]/review`, secrets scan, contracts, determinism, `db:check` nol diff migrasi, `validate:starter`). Dev server di-boot ulang dari clean main, full flow login→onboarding→dashboard→tryout→attempt→result→pembahasan→leaderboard diverifikasi ulang di Browser pane (375px), nol console error aplikasi (dua entri 404/500 yang sempat muncul terkonfirmasi sebagai artefak restart dev-server di tab lama, bukan regresi — diverifikasi bersih di tab baru).
4. **`TRYOUT_PRODUCTION_GAP_AUDIT.md`**: dokumen ini.
5. **Current architecture flow**: Bagian A.
6. **Target architecture flow**: Bagian B.
7. **P0/P1/P2 gaps**: STEP 4.
8. **Minimum Production Slice**: STEP 5.
9. **File/package impact**: tabel per-package di STEP 5.
10. **Possible schema changes**: STEP 6 — **nol** migration diperlukan.
11. **Test matrix**: STEP 8.
12. **Recommended implementation sequence**: bagian "Rekomendasi urutan implementasi" di atas.

**BERHENTI di sini sesuai instruksi** — menunggu review Anda sebelum implementasi apa pun dimulai.
