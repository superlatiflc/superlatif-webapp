# Audit Gate 3 — Temuan Kontrak Teknis

**Tanggal audit:** 27 Agustus 2026
**Cakupan:** Dokumen 13–26, `ARTIFACTS_README.md`, `GATE_3_REVIEW_GUIDE.md`, dan lima artefak machine-readable (`openapi.yaml`, `drizzle-schema.ts`, `exam-blueprint.schema.json`, `entitlement-policy.schema.json`, `analytics-event-catalog.json`) serta dua workbook impor soal
**Baseline:** Gate 1 (00–05), Gate 2 (06–12), dan `claude/AUDIT_GATE_1_2_FINDINGS.md`
**Peran auditor:** principal product architect, exam-platform engineer, database/API contract reviewer, security & privacy reviewer, WordPress–Sejoli integration reviewer
**Status:** Audit saja. Tidak ada dokumen atau artefak yang diubah.

---

## Batasan audit

Tiga hal membatasi verifikasi dan harus dibaca sebelum temuan:

1. **`Instruksi superlatif.txt`** — sumber otoritatif #1 menurut `00_MASTER_README.md` §2 dan hierarki `13_PRD.md` §2 — tetap tidak ada di Project Knowledge. Klaim "keputusan eksplisit founder" pada urutan otoritas tidak dapat diverifikasi terhadap sumbernya.
2. **`artifacts/question-import-example.zip`** terdaftar di `ARTIFACTS_README.md` §Isi tetapi tidak ada di Project Knowledge. Konvensi ZIP (struktur folder, penamaan, manifest) tidak dapat diperiksa terhadap contoh nyata.
3. **Tidak ada bukti spike Sejoli maupun bukti bridge SSO.** `20 §23`, `22 §22`, `23 §2` dan `23 §18` semuanya masih menyebutnya sebagai pekerjaan yang belum dilakukan. Seluruh temuan commerce di bawah ini karena itu bersifat kontrak, bukan verifikasi terhadap payload nyata.

Saya tidak menetapkan aturan, ambang batas, atau passing grade seleksi 2026 apa pun. `17 §4` benar ketika menyatakan nilai ambang 2026 belum boleh diasumsikan; audit ini tidak menambahkan asumsi baru di atasnya.

---

## A. Executive summary

### Verdict

**CONDITIONAL PASS — dokumen 13–26 layak menjadi baseline; folder `artifacts/` belum layak dibekukan; build tidak boleh dimulai.**

Lapisan dokumen Gate 3 adalah lompatan kualitas nyata dibanding Gate 2. `16_EXAM_ENGINE_CORE_CONTRACT.md` menutup hampir semua celah exam yang ditandai audit sebelumnya: writer lease, revision CAS, persisted presentation order, larangan client-timestamp sebagai pemenang konflik, dan correction yang tidak menimpa history. `17` menolak dengan tepat godaan mengunci angka regulasi 2026. `21`, `24`, dan `25` adalah kontrak yang serius.

Masalahnya bukan pada dokumen; masalahnya pada **jarak antara dokumen dan artefak turunannya**. Lima artefak machine-readable secara sistematis lebih sempit daripada dokumen induk, dan pada delapan titik mereka menyatakan aturan bisnis yang berbeda. `ARTIFACTS_README.md` §Hierarchy sudah memerintahkan bahwa "artefak tidak boleh diam-diam mengubah requirement" — audit ini menemukan bahwa artefak sudah melakukannya.

### Verdict per jalur

Mengikuti pemecahan tiga jalur yang direkomendasikan audit Gate 1–2:

| Jalur | Verdict | Syarat buka |
|---|---|---|
| Entitlement, IA, program/LMS | **Conditional pass** | Tutup G3-B06, G3-B07, G3-H23; regenerasi `entitlement-policy.schema.json` dari `05 §5/§8` |
| Kontrak exam | **Reject sebagai kontrak beku** | Tutup G3-B02, G3-B03, G3-B04, G3-B05, G3-H02; keputusan D1/D3/D4 warisan Gate 1–2 masih terbuka |
| Kontrak commerce | **Reject** | OD-01 dan OD-02 belum dikerjakan; G3-H06 dan G3-H07 tidak dapat ditutup tanpa payload nyata |

### Lima risiko terbesar

1. **Revisi P0 Gate 1–2 tidak pernah dijalankan, tetapi Gate 3 tetap dibuka.** `12_SCREEN_SPECIFICATIONS.md` masih versi 1.0 dengan `/program/:slug`, `/program/:offer`, dan `/tryout/:batch` yang bertabrakan (K-01, K-02); `05` masih "Versi 0.1 Draft untuk Keputusan" tanpa sumber grant gratis, tanpa kebijakan pasca-expiry, dan tanpa invariant larangan reuse form. Gate 3 dibangun di atas fondasi yang secara eksplisit dinyatakan belum siap.
2. **Hasil ranked dapat dirilis tanpa review manusia yang dipaksakan sistem.** `GATE_3_REVIEW_GUIDE.md` §5 menyebut ini blocker secara harfiah, dan §3 menyatakan keputusannya sudah diambil. Namun `exam-blueprint.schema.json` mengizinkan `releaseMode: immediate_unranked` bersama `rankingMode: batch` tanpa constraint, `exam_batches.rankingMode` default `"batch"`, dan `results.reviewedByUserId` nullable tanpa aturan yang mengikat `releasedAt`.
3. **Jawaban late-sync tidak dapat dipulihkan.** `answer_mutations` menyimpan `lateSyncCandidate: boolean` dan `requestChecksum`, tetapi tidak menyimpan payload jawaban. Sistem akan tahu bahwa ada jawaban yang terlambat, dan tidak akan pernah bisa memulihkannya. Ini membatalkan ADR-018 dan `16 §10`.
4. **Perlindungan data anak masih tidak ada, sepuluh dokumen kemudian.** M-01 dan D16 diangkat sebagai Critical pada audit Gate 1–2. `24 §15` menjawabnya dengan satu kalimat penangguhan; `users` tidak memiliki field usia, wali, atau consent; `13 §10` menandai seluruh retensi sebagai provisional. Target pasar adalah siswa SMA.
5. **Empat kosakata berbeda untuk satu state hasil ujian.** `16 §16`, `13` SCR-003, `openapi.yaml` `ResultEnvelope`, dan `openapi.yaml` `SubmissionEnvelope` masing-masing berbeda; `results.state` di database adalah `text` tanpa enum sama sekali. Siswa tidak dapat membedakan provisional dari final, dan tidak ada satu pun tempat yang memaksakan perbedaan itu.

### Skor kesiapan

| Dimensi | Skor | Alasan |
|---|---:|---|
| Kelengkapan dokumen | 84 | 13–26 menutup hampir seluruh domain. Ditahan `13_LEGACY_PRODUCT_PROMISE_REGISTER` dan kontrak template soal yang diminta Gate 1–2 dan tidak pernah dibuat |
| Exam contract (dokumen) | 82 | `16` adalah artefak terkuat paket ini. Ditahan randomization/pool yang belum diputuskan dan late-sync yang belum punya angka |
| Entitlement (dokumen) | 80 | `05` tetap kuat. Ditahan pasca-expiry, hasil pasca-refund, dan tier gratis yang belum ditambahkan |
| Arsitektur & keamanan | 78 | `20` dan `24` proporsional untuk MVP. Ditahan absennya model RBAC fisik dan model data privasi minor |
| Konsistensi dokumen ↔ artefak | **41** | Delapan kontradiksi aturan bisnis; lima artefak lebih sempit daripada induknya tanpa daftar pengecualian |
| Physical schema | **46** | Enam enum berbeda dari dokumen induk; sebelas tabel yang disyaratkan `21` tidak ada tanpa penjelasan scope |
| Machine API contract | 52 | Envelope, idempotency, dan error model benar. Ditahan resume payload yang tertutup, batch windows yang tidak lengkap, dan webhook tanpa header replay |
| Impor soal | 55 | Struktur sheet masuk akal. Ditahan dua tipe soal MVP yang tidak dapat direpresentasikan dan profil sederhana tanpa alt text |
| Kesiapan commerce | **38** | Tidak berubah dari Gate 1–2 karena spike belum dijalankan |
| **Gate 3 readiness** | **61** | **Conditional pass dengan gerbang keras** |

---

## B. BLOCKER

Delapan temuan memenuhi kriteria `GATE_3_REVIEW_GUIDE.md` §5.

### G3-B01 — Revisi P0 Gate 1–2 tidak dijalankan; Gate 3 dibuka di atas baseline yang belum diperbaiki

- **Kategori:** proses / traceability
- **File:** `claude/AUDIT_GATE_1_2_FINDINGS.md` §H "P0 — sebelum Gate 3 dibuka"; `12_SCREEN_SPECIFICATIONS.md` §2 Inventaris layar; `05_PRODUCT_CATALOG_AND_ENTITLEMENT.md` §8.1, §8.3, §16; `13_PRD.md` §2 Status dokumen
- **Kontradiksi:** Audit Gate 1–2 menetapkan sebelas perubahan P0 sebagai syarat membuka Gate 3, termasuk penghapusan tabrakan route `/program/:offer` (K-01), pemisahan purchase state dari access state di C03 (K-07), invariant waktu (K-08), dan penambahan sumber grant gratis serta kebijakan pasca-expiry di `05`. Tidak satu pun diterapkan: `12` masih versi 1.0 dengan `S04 /program/:slug`, `C02 /program/:offer`, dan `E01 /tryout/:batch`; `05` masih "Versi 0.1 Draft untuk Keputusan" tanpa penambahan apa pun. `13 §2` menempatkan Gate 2 sebagai otoritas #3 di atas PRD, sehingga PRD mewarisi kontradiksi yang belum ditutup.
- **Dampak:** Setiap kontrak Gate 3 yang menurunkan requirement dari Gate 2 mewarisi ambiguitas yang sudah diketahui. Dua dokumen yang diminta dibuat — register janji produk legacy 2026 dan kontrak template impor soal — tidak pernah dibuat, dan keduanya adalah prasyarat untuk menilai scope MVP dan impor massal secara benar. Nomor `13` dan `14` bahkan sudah dipakai ulang untuk PRD dan spesifikasi LMS, sehingga dua dokumen yang diminta kehilangan slot penomorannya.
- **Perbaikan minimal:** Jangan menulis ulang Gate 3. Terapkan sebelas baris P0 pada file aslinya, lalu tandai di `00_MASTER_README.md` §8 bahwa Gate 3 berjalan tiga jalur dan mana yang sudah dibuka. Beri nomor baru (`27`, `28`) untuk register janji legacy dan kontrak template impor.
- **Dokumen induk:** `claude/AUDIT_GATE_1_2_FINDINGS.md` §H, `00_MASTER_README.md`
- **Turunan yang harus disinkronkan:** `05`, `09`, `11`, `12`, `03`, lalu seluruh dokumen 13–26 yang mengutipnya

### G3-B02 — Hasil ranked dapat dirilis tanpa review manusia yang dipaksakan

- **Kategori:** integritas ujian
- **File:** `exam-blueprint.schema.json` `$defs.resultPolicy`; `drizzle-schema.ts` `examBatches`, `results`; `GATE_3_REVIEW_GUIDE.md` §3 dan §5; `16_EXAM_ENGINE_CORE_CONTRACT.md` §16
- **Kontradiksi:** `GATE_3_REVIEW_GUIDE.md` §3 menyatakan sebagai keputusan yang sudah diambil bahwa "ranked result memerlukan review manusia sebelum rilis", dan §5 menjadikan pelanggarannya blocker eksplisit. Tiga tempat membuka jalannya: (a) `resultPolicy` tidak memiliki `if/then` yang melarang kombinasi `releaseMode: "immediate_unranked"` dengan `rankingMode: "batch"` atau `"cohort"`; (b) `exam_batches.rankingMode` adalah `text` dengan default `"batch"` dan `resultReleaseMode` adalah `text` dengan default `"scheduled_after_review"`, keduanya tanpa constraint; (c) `results.reviewedByUserId` nullable dan tidak ada aturan yang mensyaratkan pengisiannya sebelum `releasedAt` terisi pada batch yang ranked.
- **Dampak:** Satu batch yang dibuat dengan nilai default dan satu job scoring yang selesai cukup untuk mempublikasikan peringkat yang belum diverifikasi manusia. Pada tryout mingguan dengan leaderboard, kesalahan kunci satu soal menjadi peringkat publik sebelum ada yang meninjaunya, dan `16 §17` correction kemudian harus membatalkan peringkat yang sudah dilihat siswa.
- **Perbaikan minimal:** Tambahkan satu `allOf` pada `resultPolicy`: jika `rankingMode != "none"` maka `releaseMode` harus `"scheduled_after_review"` atau `"manual"`. Di database, jadikan `rankingMode` dan `resultReleaseMode` enum, dan tambahkan check constraint `released_at IS NULL OR reviewed_by_user_id IS NOT NULL` untuk result pada batch ranked. Hapus default `"batch"` pada `rankingMode` — ranking harus keputusan eksplisit.
- **Dokumen induk:** `16 §16`, `17 §2 Result`
- **Turunan:** `exam-blueprint.schema.json`, `drizzle-schema.ts`, `openapi.yaml` `ResultEnvelope`, `analytics-event-catalog.json` `exam_result_released.human_reviewed`

### G3-B03 — Empat kosakata berbeda untuk state hasil; tidak ada satu pun yang mengikat

- **Kategori:** kontradiksi antardokumen
- **File:** `16_EXAM_ENGINE_CORE_CONTRACT.md` §16; `13_PRD.md` §8.10 SCR-003; `openapi.yaml` `components.schemas.ResultEnvelope` dan `SubmissionEnvelope`; `drizzle-schema.ts` `results`
- **Kontradiksi:**

| Sumber | State |
|---|---|
| `16 §16` | `processing`, `provisional`, `final`, `corrected`, `failed`, `withheld` |
| `13` SCR-003 | `processing`, `provisional`, `final`, `corrected`, `failed` |
| `openapi.yaml` `ResultEnvelope.state` | `pending`, `calculated`, `under_review`, `released`, `corrected` |
| `openapi.yaml` `SubmissionEnvelope.resultState` | `pending`, `calculated`, `under_review`, `released` |
| `drizzle-schema.ts` `results.state` | `text`, tanpa enum |

`provisional`, `final`, `failed`, dan `withheld` semuanya hilang dari API. `released` tidak membedakan provisional dari final.
- **Dampak:** `05 §7` memisahkan window "Provisional result" dan "Official result", dan `18 §16` mengizinkan provisional dirilis lebih dulu "hanya jika copy jelas". Dengan API yang hanya mengenal `released`, copy itu tidak punya data untuk dibangun. Siswa akan melihat skor yang sama persis pada dua fase yang secara akademik berbeda. Kegagalan scoring (`failed`) tidak dapat dibedakan dari hasil yang belum siap (`pending`), sehingga runbook insiden tidak punya sinyal.
- **Perbaikan minimal:** Adopsi enam state `16 §16` sebagai satu-satunya kosakata. Ganti kedua enum OpenAPI, dan jadikan `results.state` sebagai `pgEnum` dengan enam nilai yang sama.
- **Dokumen induk:** `16 §16`
- **Turunan:** `13 §8.10`, `openapi.yaml`, `drizzle-schema.ts`, `exam-blueprint.schema.json` `resultPolicy.releaseMode`, `analytics-event-catalog.json` `exam_result_released.release_mode`

### G3-B04 — Kandidat late-sync tidak menyimpan jawaban, sehingga tidak dapat dipulihkan

- **Kategori:** integritas ujian / kehilangan data
- **File:** `drizzle-schema.ts` `answerMutations`; `16_EXAM_ENGINE_CORE_CONTRACT.md` §10 "Late sync"; `21_ERD_AND_DATA_DICTIONARY.md` §10 `answer_mutations`; `26_ADRS.md` ADR-018
- **Kontradiksi:** `21 §10` mendefinisikan `answer_mutations` sebagai append log yang memuat "client mutation ID unique per attempt, expected/accepted revision, **payload**, writer lease, received/captured, disposition". Implementasi Drizzle memuat `mutationId`, `expectedRevision`, `resultingRevision`, `state`, `receivedAt`, `clientObservedAt`, `lateSyncCandidate`, dan `requestChecksum` — **tanpa payload dan tanpa referensi writer lease**. `16 §10` menyatakan mutation yang tiba setelah deadline dan sebelum cutoff "disimpan sebagai recovery candidate", dan ADR-018 menjadikan recoverability sebagai alasan keberadaan mekanisme ini.
- **Dampak:** Skenario nyatanya: siswa kehilangan koneksi pada menit terakhir, antrean offline terkirim empat detik setelah deadline, `lateSyncCandidate` menjadi `true`. Support membuka case, melihat bahwa ada tiga jawaban tertunda, dan tidak memiliki satu pun isi jawaban untuk dipulihkan. `13 §9` menjanjikan "tidak ada acknowledged answer yang hilang"; jalur pemulihan justru yang paling mungkin dipakai, dan justru itu yang tidak menyimpan data.
- **Perbaikan minimal:** Tambahkan `answerPayload jsonb` dan `writerLeaseId uuid` pada `answer_mutations`. Tetapkan retensinya mengikuti `13 §10` baris attempt/answer/result, bukan retensi log.
- **Dokumen induk:** `21 §10`
- **Turunan:** `drizzle-schema.ts`, `16 §10` (tambahkan kalimat bahwa payload kandidat disimpan), `openapi.yaml` (respon submit sudah punya `unresolved recovery status` di `22 §13` tetapi belum ada di schema)

### G3-B05 — Status workflow soal tidak dapat menyimpan `approved`, sementara template impor mengizinkan `published`

- **Kategori:** integritas akademik / segregation of duties
- **File:** `drizzle-schema.ts` `recordStatus` enum dan `questionVersions.status`; `15_ADMIN_CMS_AND_QUESTION_BANK_SPEC.md` §7 Workflow status; `13_PRD.md` §8.7 QST-004; `questionimporttemplate.xlsx` sheet `Lookups` kolom `workflow_status`; `26_ADRS.md` ADR-019
- **Kontradiksi:** Dua kegagalan yang saling memperkuat.
  1. `recordStatus` hanya memuat `draft`, `in_review`, `published`, `archived`. QST-004 mensyaratkan `draft → in review → approved → published → archived`, dan `15 §7` menambahkan `ChangesRequested` di antaranya. State `approved` — yang disyaratkan keduanya, dan justru gerbang tempat moderator memisahkan diri dari penulis — tidak dapat disimpan; `changes_requested` dari `15 §7` juga tidak.
  2. Sheet `Lookups` pada **kedua** template mencantumkan `approved` dan `published` sebagai nilai `workflow_status` yang boleh diisi, tanpa catatan bahwa importer menolaknya. Sheet `Instructions` baris 9 hanya mengimbau "Soal tetap perlu review moderator" sebagai prosa.
- **Dampak:** ADR-019 dan `15 §2` melarang penulis menyetujui soalnya sendiri untuk ranked exam. Dengan `approved` yang tidak dapat disimpan, sistem tidak dapat membuktikan bahwa persetujuan pernah terjadi; dengan `published` yang boleh diisi di kolom XLSX, satu penulis dapat menerbitkan lima ratus soal ranked dalam satu unggahan. `GATE_3_REVIEW_GUIDE.md` §3 menyatakan "import tidak langsung publish" sebagai keputusan yang sudah diambil.
- **Perbaikan minimal:** Tambahkan `approved` dan `changes_requested` ke `recordStatus`. Batasi kolom `workflow_status` pada kedua template hanya ke `draft` dan `in_review`, dan tetapkan di `15 §8` bahwa nilai lain menghasilkan row-level error, bukan warning.
- **Dokumen induk:** `15 §7`, `15 §8`
- **Turunan:** `drizzle-schema.ts`, kedua workbook XLSX, `openapi.yaml` `ImportCreateRequest`, `19` event `question_approved` yang saat ini tidak ada di katalog

### G3-B06 — `entitlement-policy.schema.json` tidak dapat merepresentasikan model entitlement yang sudah disetujui

- **Kategori:** entitlement / schema coverage
- **File:** `entitlement-policy.schema.json` `$defs.validity`, `$defs.claim`, `$defs.attemptAllowance`; `05_PRODUCT_CATALOG_AND_ENTITLEMENT.md` §5, §8.3, §8.4; `13_PRD.md` §8.6 ENT-002 dan ENT-005; `18_FLASH_SALE_AND_BATCH_SYSTEM.md` §7
- **Kontradiksi:** Tiga celah representasi.

| Requirement | Sumber | Schema |
|---|---|---|
| Enam mode validity | `05 §8.3`, ENT-002 | Empat: `fixed_window`, `duration_after_activation`, `through_program_end`, `lifetime`. **Purchase time + duration** dan **manual start/end** tidak ada; `activationTrigger: grant_issued` bukan padanan waktu pembelian karena grant dapat terbit setelah rekonsiliasi |
| Sembilan target komponen | `05 §5` | Lima: `program`, `program_track`, `resource`, `live_session`, `exam_batch`. **Module**, **live session series**, **batch collection**, **community**, dan **capability** tidak ada |
| Ranked dan practice attempt terpisah | `05 §8.4`, ENT-005 | Satu `count` tunggal; tidak ada pemisahan ranked/practice dan tidak ada `cooldown` |

Tanpa `batch_collection`, Tryout Pass bounded dynamic (`18 §7`) tidak punya bentuk. Tanpa `community`, entitlement grup yang dijanjikan `05 §5` dan `14 §15` tidak punya target. Tanpa `download` pada enum `actions`, LRN-006 dan capability `Download` pada `05 §5` tidak dapat diberikan.
- **Dampak:** Ini kriteria blocker `GATE_3_REVIEW_GUIDE.md` §5 secara harfiah: schema tidak dapat merepresentasikan requirement MVP yang disetujui. Konsekuensi praktisnya, produk yang menjanjikan akses komunitas atau satu modul wawancara tidak dapat dikonfigurasi, dan Tryout Pass hanya dapat dijual sebagai named list.
- **Perbaikan minimal:** Tambahkan dua mode validity (`duration_after_purchase`, `manual`), empat `targetType`, satu action `download`, dan pisahkan `attemptAllowance` menjadi `rankedCount` dan `practiceCount`. Selaraskan `TargetType` dan `AccessAction` di `openapi.yaml` pada saat yang sama.
- **Dokumen induk:** `05 §5`, `05 §8.3`, `05 §8.4`
- **Turunan:** `entitlement-policy.schema.json`, `openapi.yaml` `TargetType`/`AccessAction`, `drizzle-schema.ts` `grant_claims.target_type` (saat ini `text` tanpa batasan)

### G3-B07 — Enum purchase status di database tidak dapat menyimpan `failed` dan `expired`

- **Kategori:** commerce / kontradiksi antardokumen
- **File:** `drizzle-schema.ts` `purchaseStatus`; `05_PRODUCT_CATALOG_AND_ENTITLEMENT.md` §11.2; `22_API_AND_WEBHOOK_CONTRACT.md` §18; `23_SEJOLI_WORDPRESS_INTEGRATION.md` §10
- **Kontradiksi:** Tiga dokumen menetapkan delapan state normalisasi yang identik: `pending`, `paid`, `failed`, `expired`, `cancelled`, `refunded`, `partially_refunded`, `disputed`. Enum fisik memuat enam dengan nama berbeda: `pending`, `paid`, `cancelled`, `refunded_partial`, `refunded_full`, `chargeback`. `failed` dan `expired` hilang sepenuhnya.
- **Dampak:** `23 §12` menjadikan "stale pending" salah satu pemeriksaan rekonsiliasi terjadwal; tanpa `expired`, order yang kedaluwarsa tetap `pending` selamanya dan mengotori antrean rekonsiliasi. `05 §13` menjanjikan copy siswa "Pembayaran menunggu — selesaikan atau cek pembayaran"; pembayaran yang gagal akan menampilkan copy yang sama dan mendorong siswa menunggu sesuatu yang tidak akan datang. Penggantian nama tiga state lain memaksa adapter menerjemahkan dua arah, tepat pada lapisan yang `23 §10` minta dibuat sebagai "configuration/versioned adapter, not scattered switch statements".
- **Perbaikan minimal:** Ganti enum fisik dengan delapan nilai `22 §18` apa adanya. Ini perubahan satu baris pada artefak, bukan keputusan bisnis.
- **Dokumen induk:** `22 §18`
- **Turunan:** `drizzle-schema.ts`, `openapi.yaml` (canonical event `order.status` belum punya enum sama sekali), `analytics-event-catalog.json` `purchase_status_changed.to_status`

### G3-B08 — Physical schema menghilangkan sebelas tabel yang disyaratkan ERD tanpa daftar pengecualian

- **Kategori:** schema coverage / traceability
- **File:** `drizzle-schema.ts` keseluruhan; `21_ERD_AND_DATA_DICTIONARY.md` §3, §7, §8, §10, §11, §12; `ARTIFACTS_README.md` §Isi; `13_PRD.md` §12 Release gates
- **Kontradiksi:** `ARTIFACTS_README.md` menyebut Drizzle sebagai "draft physical mapping aggregate kritis", tetapi tidak pernah mendaftar apa yang sengaja dikecualikan. Yang hilang dan disyaratkan `21`:

| Tabel `21` | Konsekuensi |
|---|---|
| `roles`, `permissions`, `user_roles`, `role_permissions` (§3) | Seluruh matriks RBAC `24 §6` dan acceptance `24 §23` tidak punya penyimpanan |
| `reconciliation_cases` (§4) | Release Gate A `13 §12` mensyaratkan "reconciliation queue and manual recovery work"; antreannya tidak ada |
| `ranking_snapshots`, `ranking_entries` (§10) | Leaderboard `18 §15` dan SCR-008 tidak punya penyimpanan |
| `moderation_reviews` (§8) | Bukti persetujuan ADR-019 tidak tersimpan |
| `import_rows` (§8) | QST-007 idempotency dan `15 §8` "setiap imported row menyimpan source job/sheet/row" tidak dapat dipenuhi |
| `question_reports` (§8) | `15 §13` laporan soal siswa (M-07 Gate 1–2) tidak punya penyimpanan |
| `notification_*` (§11) | NTF-001 sampai NTF-003 tidak punya penyimpanan |
| `live_session_occurrences`, `attendances` (§7) | SCH-002 dan SCH-004 tidak dapat dipenuhi |
| `exam_incidents`, `attempt_accommodations` (§10) | ATM-010 dan `18 §17` tidak punya penyimpanan |
| `background_jobs` (§12) | `15 §19` dead-letter dan retry tidak punya penyimpanan |
| `progress_events`, `progress_projections` (§6) | "Projection dapat dibangun ulang" (`13 §9`) tidak dapat diverifikasi |

- **Dampak:** Butir 9 mandat audit ini — kesesuaian ERD ↔ `drizzle-schema.ts` — tidak dapat dijawab, karena tidak ada garis antara "belum ditulis" dan "sengaja tidak ada". Lebih konkret, dua dari empat release gate `13 §12` bergantung pada tabel yang tidak ada.
- **Perbaikan minimal:** Tambahkan blok komentar di kepala `drizzle-schema.ts` yang mendaftar tabel `21` yang belum dipetakan beserta alasannya, lalu tambahkan minimal empat yang menghalangi release gate: `reconciliation_cases`, empat tabel RBAC, `moderation_reviews`, dan `import_rows`.
- **Dokumen induk:** `21`
- **Turunan:** `drizzle-schema.ts`, `ARTIFACTS_README.md` §Isi

---

## C. HIGH

### G3-H01 — Attempt tidak menyimpan snapshot attempt policy, cutoff late-sync, akomodasi, dan idempotency key

`drizzle-schema.ts` `attempts` · `16 §5` Transaction · `21 §10` `attempts`

`16 §5` langkah 4 mensyaratkan snapshot "policy, form, blueprint, scoring", langkah 7 mensyaratkan `started_at`, `deadline_at`, dan `late_sync_cutoff_at` dari server, dan langkah 2 mensyaratkan reuse berdasarkan idempotency key. Tabel `attempts` hanya memuat `formChecksum`, `blueprintChecksum`, `scoringPolicyChecksum`, dan `hardDeadlineAt`. Tidak ada snapshot attempt policy, tidak ada `lateSyncCutoffAt`, tidak ada referensi akomodasi/insiden, dan tidak ada `startIdempotencyKey`. Ketiga checksum juga bukan foreign key, dan tidak ada unique index pada kolom `checksum` di tabel sumbernya, sehingga snapshot tidak dapat di-resolve kembali secara deterministik.

**Dampak:** Perubahan attempt policy di tengah batch (misalnya menambah allowance karena insiden) berlaku surut ke attempt yang sedang berjalan, dan `16 §22` invariant 11 tidak dapat diuji. Tanpa `lateSyncCutoffAt` per attempt, akomodasi waktu individual (ATM-010) tidak dapat menggeser cutoff-nya.

**Perbaikan minimal:** Tambahkan `attemptPolicyId`, `attemptPolicyChecksum`, `lateSyncCutoffAt`, `approvedExtensionSeconds`, `startIdempotencyKey`, dan FK ke `examForms`/`examBlueprints`/`scoringPolicies`.
**Induk:** `21 §10` · **Turunan:** `drizzle-schema.ts`, `openapi.yaml` `Attempt`

### G3-H02 — Randomization dan pool selection membatalkan immutability form dan kelayakan ranking

`exam-blueprint.schema.json` `$defs.presentation.questionOrder`, `$defs.section.selectionRules` · `05 §16` invariant 4 · `16 §3` · `21 §9` `exam_form_items` · `drizzle-schema.ts` `examFormItems`

Blueprint mengizinkan `questionOrder: "random_per_attempt"` dan memberi setiap section `selectionRules` dengan `count`, `subjectCodes`, `difficultyMix`, dan `excludeRecentlySeenDays`. `excludeRecentlySeenDays` hanya bermakna jika seleksi terjadi per siswa. Namun `16 §3` mendefinisikan exam form sebagai "susunan immutable question versions" dan `05 §16` invariant 4 menguatkannya. `21 §9` menyebut `exam_form_items` menyimpan "order/pool/group metadata", tetapi implementasi Drizzle hanya punya `sectionCode`, `position`, `questionVersionId`, dan `fixedOptionOrder` — tidak ada kolom pool. Ini adalah K-03 dari audit Gate 1–2, yang keputusannya (D1) tidak pernah diambil.

**Dampak:** Jika pool aktif, dua peserta dalam satu batch mengerjakan soal berbeda dan leaderboard `18 §15` membandingkan hal yang tidak sebanding — bertabrakan dengan larangan klaim kesetaraan skor. Jika pool tidak aktif, blueprint schema menjanjikan kemampuan yang tidak akan ada.

**Perbaikan minimal:** Sampai D1 diputuskan, hapus `selectionRules` dari `exam-blueprint.schema.json` dan batasi `questionOrder` ke `"fixed"`. Simpan `optionOrder: "random_per_attempt"` — mengacak opsi tidak merusak komparabilitas.
**Induk:** `16 §3`, `05 §16` · **Turunan:** `exam-blueprint.schema.json`, `drizzle-schema.ts`, `12 §32`

### G3-H03 — Aturan attempt untuk ranking didefinisikan di tiga tempat tanpa aturan presedensi

`exam-blueprint.schema.json` `$defs.attemptPolicy.rankingAttempt` · `entitlement-policy.schema.json` `$defs.attemptAllowance.rankingAttempt` (default `"first"`) · `drizzle-schema.ts` `examBatches.rankingMode` · `18 §8`

`18 §8` menyatakan "ranking tetap mengikuti batch rule", tetapi entitlement policy dapat menetapkan `rankingAttempt` dengan default `"first"` yang berlaku diam-diam, dan blueprint dapat menetapkannya lagi. Tidak ada dokumen yang menyatakan siapa menang.

**Dampak:** Siswa dengan bundle dan pembelian satuan untuk batch yang sama dapat menerima aturan ranking berbeda tergantung grant mana yang dievaluasi lebih dulu. Ini adalah OD-06 pada `GATE_3_REVIEW_GUIDE.md` §4 yang belum ditutup.

**Perbaikan minimal:** Hapus `rankingAttempt` dari `entitlement-policy.schema.json`; entitlement mengatur hak, bukan aturan kompetisi. Tetapkan di `18 §8` bahwa batch adalah satu-satunya sumber.
**Induk:** `18 §8` · **Turunan:** `entitlement-policy.schema.json`, `exam-blueprint.schema.json`

### G3-H04 — Payload resume di OpenAPI tertutup dan kehilangan lima field yang disyaratkan kontrak exam

`openapi.yaml` `components.schemas.Attempt` (`additionalProperties: false`) · `16 §11` Resume contract

`16 §11` menyebut resume mengembalikan sebelas hal. Schema `Attempt` memuat enam dan menutup diri terhadap penambahan. Yang hilang: `late_sync_cutoff`, metadata section (judul, urutan, durasi — padahal `timing.mode: "per_section"` ada di blueprint), state submission/result, state insiden/akomodasi, dan daftar permitted actions.

**Dampak:** Blueprint dapat mengonfigurasi timer per section, tetapi client tidak dapat menerima informasi untuk menjalankannya. Client juga tidak dapat menampilkan "jawaban tertunda menunggu review" karena tidak tahu ada kandidat late-sync.

**Perbaikan minimal:** Tambahkan `lateSyncCutoffAt`, `sections[]`, `submissionState`, `incident`, dan `permittedActions` pada schema `Attempt`.
**Induk:** `16 §11` · **Turunan:** `openapi.yaml`

### G3-H05 — Tiga kosakata state batch dan window batch yang tidak lengkap

`openapi.yaml` `Batch.state` dan `Batch.windows` · `18 §5` · `05 §7` · `drizzle-schema.ts` `examBatches.state`, `batchWindows`

`05 §7` dan `18 §3` menetapkan sepuluh window; `Batch.windows` membawa enam dan menghilangkan catalogue visibility, registration, late-sync cutoff, provisional result, leaderboard, dan access end. `18 §5` menetapkan sepuluh state siswa; `Batch.state` memberi enam state sistem yang berbeda; `examBatches.state` adalah `text` bebas. Selain itu `batch_windows.startsAt` dan `endsAt` keduanya `notNull`, padahal late-sync cutoff, rilis hasil, dan akses berakhir adalah titik waktu tunggal.

**Dampak:** Resolver state batch yang `18 §5` minta ("UI tidak merakit logika sendiri") tidak dapat dibangun dari data yang dikirim API. Window yang bersifat instan memaksa operator mengisi waktu akhir palsu.

**Perbaikan minimal:** Lengkapi `Batch.windows` menjadi sepuluh; jadikan `endsAt` nullable; jadikan `Batch.state` mencerminkan sepuluh state `18 §5`.
**Induk:** `18 §3`, `18 §5` · **Turunan:** `openapi.yaml`, `drizzle-schema.ts`

### G3-H06 — Kontrak webhook tidak memuat header replay-protection maupun schema event kanonik

`openapi.yaml` `/integrations/commerce/{provider}/events`, `securitySchemes.webhookSignature` · `22 §16`, `22 §17` · `23 §8`

`23 §8` mensyaratkan "HMAC signature over raw canonical bytes with timestamp/key ID" dan rotasi kunci dengan key ID yang tumpang tindih. OpenAPI hanya mendeklarasikan satu header `X-Superlatif-Signature` sebagai `apiKey`; tidak ada header timestamp maupun key ID, sehingga replay window dan rotasi tidak dapat diimplementasikan sesuai kontrak. `requestBody` adalah `{type: object, additionalProperties: true}` walaupun `22 §17` sudah menuliskan canonical event lengkap. `X-Provider-Event-ID` bersifat opsional, padahal `22 §16` langkah 4 menjadikannya kunci idempotency. Respons `403` yang disebut `22 §16` tidak ada.

**Dampak:** Contract test `22 §23` "Webhook duplicate/out-of-order/invalid signature" tidak dapat dituliskan terhadap kontrak ini. Perlu dicatat bahwa duplikasi grant tetap tercegah di lapisan bawah oleh unique `purchase_event_key_uq` dan `access_grant_source_key_uq`, sehingga ini serius tetapi bukan blocker.

**Perbaikan minimal:** Tambahkan `X-Superlatif-Timestamp` dan `X-Superlatif-Key-Id` sebagai header wajib, jadikan `X-Provider-Event-ID` wajib, dan pasang `CanonicalCommerceEvent` dari `22 §17` sebagai schema request body.
**Induk:** `22 §16`, `23 §8` · **Turunan:** `openapi.yaml`

### G3-H07 — Purchase tidak menyimpan versi SKU mapping yang berlaku saat transaksi

`drizzle-schema.ts` `purchases`, `externalSkuMappings` · `13` COM-004 · `05 §11.1` · `05 §16` invariant 3

COM-004 mensyaratkan purchase menyimpan "product/offer/**mapping** version saat transaksi", dan `05 §11.1` menyatakan "mapping harus berversi". `external_sku_mappings` tidak memiliki kolom versi — hanya `validFrom`, `validTo`, `priority`, `status` — dan `purchases` menyimpan `externalSkuId` sebagai teks tanpa FK ke baris mapping yang dipakai.

**Dampak:** Ketika mapping diubah (`23 §6` mengizinkannya untuk event masa depan), tidak ada cara membuktikan mapping mana yang menghasilkan grant untuk order lama. Rekonsiliasi `25 §12` "Every source-derived grant references mapping/source" tidak dapat dijalankan.

**Perbaikan minimal:** Tambahkan `version integer` pada `external_sku_mappings` (unique dengan provider+site+sku) dan `externalSkuMappingId uuid` pada `purchases`.
**Induk:** `05 §11.1` · **Turunan:** `drizzle-schema.ts`, `23 §6`

### G3-H08 — Audit log hanya menyimpan checksum, bukan diff teredaksi

`drizzle-schema.ts` `auditLogs` · `21 §12` · `15 §18` · `05 §E8` · `13` ENT-007

Ketiga dokumen induk mensyaratkan "before/after diff teredaksi". Implementasi menyimpan `beforeChecksum` dan `afterChecksum`. Checksum membuktikan bahwa sesuatu berubah; ia tidak dapat menjawab apa yang berubah.

**Dampak:** ENT-007 ("manual action memerlukan actor, reason, dan before/after") tidak dapat dipenuhi. Ketika support memperpanjang akses seorang siswa dan siswa lain mengeluh, tidak ada cara menunjukkan policy sebelum dan sesudah. `24 §23` acceptance 7 ("Manual access dan correction show complete audit") gagal.

**Perbaikan minimal:** Tambahkan `beforeRedacted jsonb` dan `afterRedacted jsonb`; pertahankan checksum sebagai integritas.
**Induk:** `21 §12` · **Turunan:** `drizzle-schema.ts`

### G3-H09 — Outbox tidak memiliki idempotency key maupun unique constraint

`drizzle-schema.ts` `outboxEvents` · `21 §12`, `21 §13` butir 12 · `26 ADR-012`

`21 §12` mendefinisikan `outbox_events` dengan "Aggregate/event/payload/**idempotency**", dan `21 §13` butir 12 mensyaratkan "Outbox/job idempotency keys unique within type/scope". Implementasi tidak memiliki kolom itu.

**Dampak:** Worker yang gagal setelah mengirim tetapi sebelum menandai `publishedAt` akan mengirim ulang. Efek domino tercegah pada grant (unique source key) tetapi tidak pada notifikasi — `19 §13` menjanjikan "retry tidak membuat pesan baru", dan `19 §20` acceptance 2 ("Retry WA tidak mengirim duplikat") tidak dapat dijamin dari sisi outbox.

**Perbaikan minimal:** Tambahkan `idempotencyKey text notNull` dengan unique index `(eventType, idempotencyKey)`.
**Induk:** `21 §12` · **Turunan:** `drizzle-schema.ts`

### G3-H10 — Result version tidak memiliki current pointer dan diunikkan pada submission, bukan attempt

`drizzle-schema.ts` `results` · `21 §10`, `21 §13` butir 11 · `16 §17`

`21 §13` butir 11 mensyaratkan "Result version unique by attempt + version; **one current**". Implementasi meng-unique-kan `(submissionId, version)` dan tidak memiliki kolom `isCurrent`. `supersedesResultId` adalah lineage, bukan pointer.

**Dampak:** `16 §17` mensyaratkan pointer current berpindah dalam satu transaksi ketika koreksi dipublikasikan. Tanpa kolom itu, "hasil yang berlaku" harus disimpulkan dari `releasedAt` atau `version` tertinggi, dan koreksi yang gagal separuh jalan meninggalkan dua hasil yang sama-sama tampak berlaku.

**Perbaikan minimal:** Tambahkan `attemptId` dan `isCurrent boolean`, dengan partial unique index `(attemptId) WHERE is_current`.
**Induk:** `21 §13` · **Turunan:** `drizzle-schema.ts`, `openapi.yaml` `ResultEnvelope.version`

### G3-H11 — Progress terikat pada resource version, sehingga revisi materi memutus completion historis

`drizzle-schema.ts` `resourcePlacements`, `progressRecords` · `13` PRG-007, LRN-003 · `14 §2` invariant 4, `14 §9`

`resource_placements` mereferensi `resourceVersionId` secara langsung, dan `progress_records` mereferensi `placementId`. Menerbitkan versi baru sebuah materi berarti membuat placement baru — dan seluruh progress yang menempel pada placement lama menjadi yatim. PRG-007 menyatakan "perubahan curriculum tidak menghapus completion historis". Selain itu `progress_records` kehilangan `firstStartedAt`, `positionSeconds`, `completionSource`, `resourceVersionId`, dan state `waived` yang disyaratkan `14 §9`; LRN-003 secara eksplisit menyebut "last position" sebagai P0.

**Dampak:** Memperbaiki satu typo pada video akan mereset progres seluruh cohort, atau memaksa tim menghindari revisi konten sama sekali.

**Perbaikan minimal:** Jadikan placement mereferensi `resourceId` yang stabil, dan simpan `resourceVersionId` pada `progress_records` sebagai versi yang benar-benar dialami. Tambahkan empat field `14 §9` yang hilang.
**Induk:** `14 §9` · **Turunan:** `drizzle-schema.ts`

### G3-H12 — Live class tidak memiliki status, occurrence, maupun lineage reschedule

`drizzle-schema.ts` `liveSessions`, `scheduleItems` · `13` SCH-001/002/004 · `14 §11`, `14 §13` · `21 §7`

SCH-002 (P0) mensyaratkan status `scheduled, live, ended, cancelled, rescheduled`; SCH-004 (P0) mensyaratkan penyimpanan waktu lama, waktu baru, reason, dan notification status. `liveSessions` tidak memiliki kolom status sama sekali, dan `live_session_occurrences` dari `21 §7` tidak ada. `schedule_items` tidak memiliki kolom `timezone` maupun referensi track, padahal SCH-001 (P0) mensyaratkan "timezone eksplisit" — ini juga K-08 warisan Gate 1–2 yang belum ditutup.

**Dampak:** Tiga requirement P0 tidak dapat dipenuhi. `14 §19` acceptance 3 ("Reschedule kelas mengubah jadwal, menyimpan waktu lama, dan mengirim notifikasi tepat") tidak dapat diuji.

**Perbaikan minimal:** Tambahkan tabel `live_session_occurrences` dengan status, lineage, reason, dan notification state; tambahkan `timezone text notNull` pada `schedule_items` dan `exam_batches`.
**Induk:** `21 §7`, `14 §11` · **Turunan:** `drizzle-schema.ts`

### G3-H13 — Katalog analytics adalah taksonomi event kelima dan kehilangan event yang menopang metrik PRD

`analytics-event-catalog.json` `events` · `19 §5`, `19 §9`, `19 §20` · `13 §11`

Audit Gate 1–2 (R-05) sudah menemukan tiga taksonomi event di Gate 2. `19 §5` menambah yang keempat, dan katalog menambah yang kelima dengan penamaan berbeda lagi (`resource_started` → `module_started`, `live_class_joined` → `live_join_intent_created`, `batch_viewed` → `exam_batch_viewed`). Yang lebih serius adalah event yang hilang sama sekali:

| Event hilang | Yang menjadi tidak terukur |
|---|---|
| `next_action_impression` | `19 §9` dan `19 §20` acceptance 5 (rekonsiliasi impression/click/start) |
| `payment_settled`, `access_activated_from_purchase`, `effective_access_changed` | `13 §11` "Paid-to-access activation rate" dan "Time from payment settled to active access"; `19 §20` acceptance 1 |
| `result_viewed`, `explanation_opened`, `remediation_started` | `13 §11` "Remediation start after result"; funnel `19 §3` "Result action started" |
| `attempt_resumed`, `session_started`, `account_link_succeeded\|failed` | Reliability resume dan funnel identity |
| `reconciliation_case_created\|resolved` | Dashboard operasional `19 §16` "reconciliation backlog" |

**Dampak:** Tiga dari empat kelompok metrik `13 §11` tidak memiliki event pendukung. Funnel aktivasi — metrik utama produk ini — tidak dapat dihitung.

**Perbaikan minimal:** Jadikan `19 §5` satu-satunya daftar nama event dan regenerasi katalog darinya, bukan sebaliknya.
**Induk:** `19 §5` · **Turunan:** `analytics-event-catalog.json`, `openapi.yaml` `NextAction.kind`, `06`, `09 §16`, `12 §4`

### G3-H14 — Retensi analytics 2555 hari dan `user_id` non-pseudonim melanggar kebijakan privasinya sendiri

`analytics-event-catalog.json` `commonProperties.user_id`, `retentionDays` · `19 §2` prinsip 6, `19 §4`, `19 §19` · `26 ADR-025` · `13 §10`

`19 §19` menetapkan retensi raw analytics provisional 13 bulan. Enam event pada katalog menetapkan `retentionDays: 2555` (tujuh tahun). `19 §4` dan ADR-025 mensyaratkan `actor_id` pseudonim; katalog menggunakan `user_id` bertipe `uuid` dari `source: server-enriched`, yaitu primary key aplikasi, ditambah `session_id`.

**Dampak:** Sistem analytics akan menyimpan identitas langsung siswa selama tujuh tahun berdasarkan artefak yang menyebut dirinya menegakkan pseudonimitas. Untuk populasi yang sebagian besar di bawah 18 tahun (lihat G3-H20), ini risiko kepatuhan yang nyata, bukan teoretis.

**Perbaikan minimal:** Ganti `user_id` menjadi `actor_pseudonym`, dan turunkan seluruh `retentionDays` ke ≤ 395 kecuali ada baris retensi yang disetujui di `13 §10`. Audit event finansial/ujian jangka panjang tetap hidup di `audit_logs`, bukan di analytics.
**Induk:** `19 §19`, `19 §4` · **Turunan:** `analytics-event-catalog.json`

### G3-H15 — Template impor tidak dapat merepresentasikan dua tipe soal MVP, dan profil sederhana tidak dapat membawa alt text

`questionimporttemplate.xlsx`, `questionimportadvancedtemplate.xlsx` · `15 §4`, `15 §6`, `15 §8` · `13` QST-003, QST-005 · `exam-blueprint.schema.json` `allowedQuestionTypes`

Sheet `Lookups` pada kedua workbook mencantumkan lima tipe soal, sama dengan enum blueprint. Sheet `Options` hanya memiliki `option_code`, `option_text`, `option_image`, `is_correct`, `score`, `notes`.

- **`numeric`** — `15 §6` mensyaratkan "accepted value/range/tolerance/unit policy lengkap". Tidak ada satu pun kolom untuk itu, dan soal numerik tidak memiliki opsi. Tipe ini tidak dapat diimpor.
- **`true_false_matrix`** — `15 §6` mensyaratkan "setiap statement memiliki expected value". Tidak ada sheet statement; `option_code` dibatasi A–E oleh Lookups.
- **`multiple_choice`** — `15 §6` mensyaratkan "policy partial score eksplisit". Tidak ada kolomnya.
- **Formula dan tabel** — `15 §4` dan `15 §5` mensyaratkan LaTeX subset; kolom `stem` adalah teks bebas tanpa konvensi markup yang dinyatakan. Ini adalah R-04 warisan Gate 1–2.
- **Alt text** — profil sederhana memiliki `stem_image` tetapi tidak memiliki sheet `Assets`, sehingga tidak ada tempat untuk alt text. QST-003 adalah P0 dan baseline aksesibilitas `24` adalah WCAG 2.2 AA.

Selain itu `15 §8` mendeskripsikan **satu** set sheet (`Instructions, Questions, Options, Passages, Assets, Lookups`) sementara artefak menyediakan dua profil; `openapi.yaml` sudah mengenal keduanya. Header berada di baris 4 dan versi template hanya ditulis sebagai prosa, sehingga validasi "sheet/header/template version" (`15 §8`) tidak punya sel yang dapat dibaca mesin.

**Dampak:** Untuk SKD (single choice + weighted choice) impor tetap berjalan, sehingga ini belum memblokir peluncuran. Ia menjadi blocker pada hari pertama sebuah item TIU numerik atau family lain dijadwalkan.

**Perbaikan minimal:** Tambahkan sheet `NumericAnswers` dan `Statements`, kolom `partial_score_policy` pada `Questions`, kolom `alt_text` pada `Options`/`Questions` di profil sederhana, sel bernama `template_version`, dan satu baris di `15 §5` yang menetapkan delimiter LaTeX.
**Induk:** `15 §8` (dan dokumen kontrak template yang diminta Gate 1–2 dan belum dibuat) · **Turunan:** kedua workbook, `openapi.yaml` `ImportCreateRequest.profileCode`

### G3-H16 — Tidak ada constraint yang menjamin satu writer lease aktif per attempt

`drizzle-schema.ts` `attemptWriterLeases` · `16 §7` · `26 ADR-017`

`16 §7` menyatakan "satu attempt memiliki satu active writer lease". Tabel hanya memiliki index biasa `(attemptId, expiresAt)`. Dua permintaan takeover bersamaan dapat menghasilkan dua lease yang keduanya belum kedaluwarsa dan belum dilepas.

**Dampak:** Revision CAS masih mencegah penimpaan diam-diam, sehingga kerusakannya terbatas — tetapi dua perangkat akan saling menolak dengan `409` tanpa satu pun yang secara resmi kalah, dan UX takeover `16 §24` menjadi tidak dapat dijelaskan.

**Perbaikan minimal:** Partial unique index pada `attemptId` dengan kondisi `released_at IS NULL AND expires_at > now()`.
**Induk:** `16 §7` · **Turunan:** `drizzle-schema.ts`

### G3-H17 — Kunci jawaban dan bobot berada satu baris dengan konten yang dilihat siswa

`drizzle-schema.ts` `questionVersions` · `21 §8`, `21 §15` · `24 §10` · `26 ADR-021`

`21 §15` mengklasifikasikan kunci jawaban dan bobot sebagai "Exam secret" dengan kontrol "restricted columns/serializer/role", dan `21 §8` menyebut "scoring secret **reference**/config". Implementasi menempatkan `answerKey` dan `explanation` sebagai kolom jsonb biasa pada baris yang sama dengan `stem` dan `options`. Tidak jelas pula apakah bobot `weighted_choice` berada di `options` (yang diserialisasi ke siswa) atau di `answerKey`.

**Dampak:** Setiap `SELECT *` — termasuk yang tidak disengaja pada layer admin, export, atau debugging — membawa kunci. `24 §23` acceptance 2 ("Support cannot view question key") bergantung sepenuhnya pada disiplin kode tanpa dukungan struktur.

**Perbaikan minimal:** Pisahkan menjadi `question_version_secrets` (question_version_id, answer_key, option_weights, explanation) dengan grant kolom terpisah, dan tetapkan di `21 §8` bahwa bobot tidak pernah berada di `options`.
**Induk:** `21 §15` · **Turunan:** `drizzle-schema.ts`, `16 §20`

### G3-H18 — Grant lifecycle kehilangan `cancelled` dan mengganti nama `scheduled`

`drizzle-schema.ts` `grantStatus` · `05 §8.2`

`05 §8.2` mendefinisikan enam status dengan makna berbeda: `Scheduled` (valid tetapi belum mulai) dan `Cancelled` (tidak pernah aktif karena order dibatalkan). Enum fisik memakai `pending` untuk yang pertama dan menghilangkan yang kedua.

**Dampak:** Order yang dibatalkan sebelum aktif akan direkam sebagai `revoked`, yang menurut `05 §8.2` berarti "dicabut permanen dari sumber ini" — makna audit yang berbeda. Ketika `18 §18` mencari kasus rekonsiliasi "grant no eligible purchase", kedua situasi menjadi tak terbedakan.

**Perbaikan minimal:** Ganti enum menjadi enam nilai `05 §8.2` apa adanya.
**Induk:** `05 §8.2` · **Turunan:** `drizzle-schema.ts`

### G3-H19 — Kebijakan pasca-expiry dan nasib hasil setelah refund masih belum ada

`entitlement-policy.schema.json` `$defs.lifecycle.expiryAction` (`const: "expire_source_grant"`) · `05 §8.3`, `05 §10` E4 · `claude/AUDIT_GATE_1_2_FINDINGS.md` M-09, M-10, D6, D7

Audit Gate 1–2 menandai keduanya sebagai High dan meminta field kebijakannya ditambahkan ke `05` sebagai P0. Tidak ditambahkan, dan schema entitlement justru mengunci `expiryAction` menjadi satu nilai tanpa opsi read-only/riwayat. Nasib attempt yang sudah selesai, hasil, dan posisi leaderboard setelah refund tidak diatur di dokumen Gate 3 mana pun.

**Dampak:** "Akses seumur program" yang dijual di deck tidak dapat dikonfigurasi berbeda dari akses berdurasi. Ketika refund pertama terjadi pada peserta yang sudah masuk leaderboard, tidak ada aturan, dan keputusannya akan diambil ad hoc oleh support.

**Perbaikan minimal:** Ubah `expiryAction` menjadi enum (`expire_source_grant`, `downgrade_to_read_only`, `retain_history_only`) dan tambahkan satu paragraf di `05 §10` tentang hasil dan ranking pasca-refund. Keduanya membutuhkan keputusan founder (D6, D7).
**Induk:** `05 §8.3`, `05 §10` · **Turunan:** `entitlement-policy.schema.json`, `18 §15`

### G3-H20 — Perlindungan data anak dan consent wali masih belum dimodelkan

`24_AUTH_RBAC_SECURITY_AND_PRIVACY.md` §15, §16 · `13_PRD.md` §10 · `drizzle-schema.ts` `users`, `enrollments.onboardingAnswers` · `claude/AUDIT_GATE_1_2_FINDINGS.md` M-01, D16

`24 §15` menyebut "Minor/student privacy and Indonesian legal review required before production" dan `24 §16` menyatakan tabel retensi PRD "remains provisional". `13 §10` menandai `OQ-RET-01` sebagai belum direview. Tidak ada field usia, tanggal lahir, status wali, maupun catatan consent di `users`, `enrollments`, atau schema onboarding — dan `21 §6` `onboarding_responses` (yang menyebut "sensitive fields classified") bahkan tidak ada di implementasi fisik.

**Dampak:** M-01 diangkat sebagai Critical pada audit sebelumnya dan naik satu gate tanpa perubahan. Karena consent dan retensi memengaruhi bentuk onboarding (`14 §8`), preferensi notifikasi (`19 §10`), dan hak penghapusan (`24 §15`), menundanya lagi berarti tiga area harus dirancang ulang setelah review hukum.

**Perbaikan minimal:** Jangan menunggu review hukum untuk membuat tempat penyimpanannya. Tambahkan `date_of_birth`, `guardian_consent_state`, dan `consent_records` sekarang; isi kebijakannya setelah review. Ini menutup D16 secara struktural tanpa mendahului keputusan hukum.
**Induk:** `03 §3.4` (bagian yang diminta Gate 1–2 dan belum dibuat), `24 §15` · **Turunan:** `drizzle-schema.ts`, `13 §10`, `14 §8`

### G3-H21 — Tab `progress` hilang dan resolver kehilangan tipe aksi remediation

`openapi.yaml` `ProgramOverviewEnvelope.tabs`, `NextAction.kind` · `07 §6` · `14 §10`

`07 §6` menetapkan tujuh tab kontekstual Program Hub; enum OpenAPI memuat enam dan menghilangkan **Progres** — tab yang menurut `07 §6` berisi "learning completion dan exam trends". `14 §10` menetapkan tujuh level prioritas resolver termasuk **remediation** pada level 6; `NextAction.kind` memuat enam nilai tanpa `remediation` (`view_result` bukan padanannya). `reasonCode` adalah string bebas tanpa allowlist, sehingga K-05 (tiga definisi resolver) tetap tidak dapat diuji.

**Dampak:** Loop inti produk — hasil ujian mengarahkan siswa ke materi perbaikan — tidak memiliki tipe aksi. Metrik `13 §11` "Remediation start after result" kehilangan sumbernya, sejalan dengan G3-H13.

**Perbaikan minimal:** Tambahkan `progress` ke enum tab dan `remediation` ke `NextAction.kind`; jadikan `reasonCode` enum yang diambil dari `14 §10`.
**Induk:** `07 §6`, `14 §10` · **Turunan:** `openapi.yaml`, `analytics-event-catalog.json`

### G3-H22 — Enrollment diunikkan pada program version, memecah kartu program saat migrasi kurikulum

`drizzle-schema.ts` `enrollments` · `14 §7` · `05 §16` invariant 10 · `26 ADR-004`

Unique index adalah `(userId, programVersionId)`. `14 §7` mengizinkan admin memilih `migrate with mapping`, yang menghasilkan enrollment kedua untuk program yang sama. `05 §16` invariant 10 mensyaratkan siswa melihat satu program kanonik. Selain itu `sourceGrantId` adalah FK tunggal, padahal ADR-004 menyatakan akses bersifat additive dari banyak grant.

**Dampak:** Setelah migrasi versi kurikulum, siswa melihat dua kartu program identik. Ketika grant yang tercatat sebagai sumber dicabut sementara grant lain masih aktif, enrollment tampak yatim.

**Perbaikan minimal:** Unique pada `(userId, programId)` dengan `programVersionId` sebagai kolom biasa; ganti `sourceGrantId` menjadi `sourceGrantIds jsonb` atau tabel penghubung.
**Induk:** `14 §7` · **Turunan:** `drizzle-schema.ts`

---

## D. MEDIUM dan LOW

| ID | Sev | Temuan | File dan heading |
|---|---|---|---|
| G3-M01 | Medium | `examFamily` sebagai enum tetap di blueprint schema, sementara `21 §9` memodelkannya sebagai tabel `exam_families`; menambah family memerlukan perubahan schema | `exam-blueprint.schema.json` `properties.examFamily` vs `21 §9` |
| G3-M02 | Medium | `presentation` tidak memiliki konfigurasi akomodasi aksesibilitas walaupun `17 §2` Presentation mencantumkannya | `exam-blueprint.schema.json` `$defs.presentation` vs `17 §2` |
| G3-M03 | Medium | Kebijakan late-sync tersebar di tiga tempat (blueprint `timing.lateSyncPolicy`, `batch_windows`, `attempt_policies`) tanpa presedensi; tidak ada validasi bahwa jumlah durasi section sama dengan `totalDurationSeconds` | `exam-blueprint.schema.json` `$defs.timing`; `21 §9` |
| G3-M04 | Medium | `resultPolicy.showCorrectAnswer` default `true` — default yang aman seharusnya `false` untuk field yang mengontrol pembukaan kunci | `exam-blueprint.schema.json` `$defs.resultPolicy` vs `16 §16` |
| G3-M05 | Medium | `gracePeriodDays` dan `attemptAllowance.mode: "pooled"` diperkenalkan artefak tanpa ada di dokumen induk — melanggar `ARTIFACTS_README.md` §Hierarchy | `entitlement-policy.schema.json` vs `05 §8.3`, `05 §8.4` |
| G3-M06 | Medium | Respons `/me/access/explain` kehilangan `attemptsRemaining`, waktu mulai terjadwal, dan pemisahan alasan aman-siswa dari diagnostik internal; sebaliknya mengekspos UUID grant mentah ke siswa | `openapi.yaml` `AccessDecisionEnvelope` vs `05 §9`, `05 §13` |
| G3-M07 | Medium | Tidak ada representasi CSRF token pada endpoint cookie-authenticated mana pun | `openapi.yaml` `securitySchemes` vs `24 §8` |
| G3-M08 | Medium | Enum state import kehilangan `scanning` dan `partial`; acceptance `15 §20` butir 1 (impor sebagian) tidak dapat direpresentasikan, begitu pula tahap malware scan `24 §9` | `openapi.yaml` `ImportJobEnvelope.state`, `drizzle-schema.ts` `importStatus` vs `15 §8` |
| G3-M09 | Medium | `attempt_flags` dari `21 §10` dilebur ke `attempt_answers.flagged`, mencampur state flag dengan state jawaban yang `16 §12` minta dipisahkan | `drizzle-schema.ts` `attemptAnswers` vs `21 §10`, `16 §12` |
| G3-M10 | Medium | Payload jawaban tidak bertipe (`additionalProperties: true`) di API maupun database, sehingga validasi skema per tipe soal (`16 §8` langkah 4) tidak dapat diuji kontrak | `openapi.yaml` `AnswerSaveRequest.answer`; `drizzle-schema.ts` `attemptAnswers.answerPayload` |
| G3-M11 | Medium | Enum attempt status kehilangan `created` dan `scoring`, menambahkan `expired`, dan mengganti `voided` menjadi `invalidated` | `drizzle-schema.ts` `attemptStatus`, `openapi.yaml` `Attempt.status` vs `16 §4` |
| G3-M12 | Medium | `offers` kehilangan `termsVersion`, sumber sold count, kebijakan reservasi, return URL, dan `upgrade_from` sebagai field kelas satu | `drizzle-schema.ts` `offers` vs `05 §6` |
| G3-M13 | Medium | Sheet `Lookups` mencantumkan tujuh exam family termasuk yang dinonaktifkan, dan contoh data advanced menggunakan `TPA_TBI` | kedua workbook vs `13` EXM-006, `26 ADR-015` |
| G3-M14 | Medium | `question-import-example.zip` terdaftar tetapi tidak ada; konvensi folder/penamaan ZIP tidak pernah ditetapkan | `ARTIFACTS_README.md` §Isi vs `15 §5` |
| G3-M15 | Medium | `AccessChangeRequest.operation` kehilangan `resume` yang ada di daftar aksi Entitlement Manager | `openapi.yaml` vs `15 §16` |
| G3-M16 | Medium | `prohibitedProperties` tidak menyebut kunci jawaban/bobot, private meeting URL, raw webhook payload, dan inferensi kesehatan; tidak ada `schema_version` per event | `analytics-event-catalog.json` vs `19 §4`, `19 §6` |
| G3-M17 | Medium | `targetType` adalah `text` bebas di `product_components`, `grant_claims`, dan `effective_access`, sementara API dan schema entitlement memakai enum tetap | `drizzle-schema.ts` vs `entitlement-policy.schema.json` |
| G3-M18 | Medium | Subset OpenAPI justru menghilangkan endpoint dengan semantik paling diperdebatkan: takeover, submit-summary, flags, dan review | `openapi.yaml` vs `22 §9` |
| G3-L01 | Low | `hardDeadlineAt` vs `deadline_at` — penamaan berbeda untuk konsep yang sama | `drizzle-schema.ts`, `openapi.yaml` vs `16 §10` |
| G3-L02 | Low | `resource_placements` tidak memiliki field prerequisite eksplisit | `drizzle-schema.ts` vs `21 §6` |
| G3-L03 | Low | `navigation.sectionLockMode` memakai kosakata berbeda dari `16 §12` (`free`, `section-restricted`, `forward-only`) | `exam-blueprint.schema.json` vs `16 §12` |
| G3-L04 | Low | Hanya `providerMeetingRefEncrypted` yang ditandai terenkripsi; tidak ada penanda klasifikasi pada kolom PII | `drizzle-schema.ts` vs `21 §15`, `24 §13` |
| G3-L05 | Low | Target p95 `13 §9` tidak dipetakan ke alert dengan owner dan runbook di `20 §17` | `13 §9` vs `20 §17` |

---

## E. Daftar kontradiksi antardokumen

Sepuluh tempat di mana dua sumber menyatakan aturan berbeda untuk hal yang sama.

| # | Subjek | Sumber A | Sumber B | Temuan |
|---|---|---|---|---|
| 1 | State hasil ujian | `16 §16` (6 state) | `openapi.yaml` `ResultEnvelope` (5 state berbeda), `SubmissionEnvelope` (4), `results.state` (tanpa enum) | G3-B03 |
| 2 | State pembelian | `05 §11.2`, `22 §18`, `23 §10` (8 state) | `drizzle-schema.ts` `purchaseStatus` (6, dua hilang) | G3-B07 |
| 3 | Status workflow soal | `15 §7` (6 state), QST-004 (5 state) | `drizzle-schema.ts` `recordStatus` (4) dan Lookups XLSX (mengizinkan `published`) | G3-B05 |
| 4 | Mode validity entitlement | `05 §8.3`, ENT-002 (6 mode) | `entitlement-policy.schema.json` (4) | G3-B06 |
| 5 | Target komponen produk | `05 §5` (9 jenis) | `entitlement-policy.schema.json` dan `openapi.yaml` `TargetType` (5) | G3-B06 |
| 6 | Aturan attempt untuk ranking | `18 §8` (batch menang) | `entitlement-policy.schema.json` default `"first"`, `exam-blueprint.schema.json` `attemptPolicyDefaults` | G3-H03 |
| 7 | Immutability exam form | `05 §16` invariant 4, `16 §3` | `exam-blueprint.schema.json` `selectionRules` + `questionOrder: random_per_attempt` | G3-H02 |
| 8 | Lifecycle grant | `05 §8.2` (6 status) | `drizzle-schema.ts` `grantStatus` (5, `cancelled` hilang) | G3-H18 |
| 9 | Nama event analytics | `19 §5` | `analytics-event-catalog.json`, ditambah tiga taksonomi Gate 2 yang belum disatukan | G3-H13 |
| 10 | Retensi dan pseudonimitas analytics | `19 §19` (13 bulan), `19 §4` (pseudonim) | `analytics-event-catalog.json` (2555 hari, `user_id` langsung) | G3-H14 |

Dua kontradiksi warisan Gate 1–2 yang masih terbuka dan kini mengikat Gate 3: skema route Gate 2 (K-01, K-02) dan pemisahan purchase/access state di layar C03 (K-07).

---

## F. Traceability matrix

Requirement → data → API → implikasi test. Empat belas baris yang paling menentukan kelayakan build.

| Requirement | Data | API | Implikasi test | Status |
|---|---|---|---|---|
| ATM-003 deadline server, tidak reset saat reload | `attempts.hard_deadline_at` | `X-Server-Time`, `Attempt.hardDeadlineAt` | Reload dan ganti perangkat mempertahankan deadline; jam client dimundurkan tidak mengubah apa pun | **Siap** |
| ATM-004 autosave idempotent dengan revision monotonic | `answer_mutations` (unique attempt+mutationId), `attempt_answers.revision` | `PUT /attempts/{id}/answers/{instanceId}`, `409 AnswerConflict` | Mutation ID yang sama dua kali menghasilkan satu revisi; mutation stale ditolak dengan state aman | **Siap** |
| ATM-005 antrean offline dapat disinkronkan kembali | `answer_mutations.lateSyncCandidate` | belum ada di respons submit | Antrean terkirim setelah deadline dapat dipulihkan | **Gagal — G3-B04** |
| ATM-006 resume mengembalikan state server-authoritative | `attempt_question_instances.option_order` | `GET /attempts/{id}` | Resume mempertahankan urutan soal, urutan opsi, dan jawaban | **Sebagian — G3-H04** |
| ATM-010 akomodasi memerlukan permission, reason, audit | tidak ada tabel | tidak ada endpoint | Perpanjangan waktu tercatat dan mengubah deadline satu attempt | **Gagal — G3-B08, G3-H01** |
| SCR-003 result punya lima state | `results.state` (text) | `ResultEnvelope.state` (kosakata lain) | Provisional dan final dapat dibedakan siswa | **Gagal — G3-B03** |
| SCR-006 correction mempertahankan hasil lama | `results.supersedesResultId`, `result_corrections` | tidak ada di subset | Koreksi membuat versi baru dan pointer current berpindah dalam satu transaksi | **Sebagian — G3-H10** |
| SCR-008 ranking snapshot tanpa nama tertanam | tidak ada tabel | tidak ada endpoint | Snapshot menyimpan referensi pseudonim; display name di-resolve saat baca | **Gagal — G3-B08** |
| ENT-002 enam mode validity | `access_policies.config` (jsonb) | `AccessChangeRequest.policyId` | Setiap mode menghasilkan effective end yang benar | **Gagal — G3-B06** |
| ENT-004 revocation satu grant tidak menutup akses grant lain | `access_grants`, `grant_claims`, `effective_access` | `GET /me/access/explain` | Refund satu order; scholarship tetap membuka akses | **Siap** |
| ENT-007 manual action menyimpan before/after | `audit_logs` (hanya checksum) | `/admin/access/change-requests` | Diff sebelum dan sesudah dapat ditampilkan ke support | **Gagal — G3-H08** |
| COM-005 commerce event idempotent dan terverifikasi | `purchase_events` unique provider event key | `POST /integrations/commerce/{provider}/events` | Event yang sama dua kali menghasilkan satu transisi dan satu grant | **Sebagian — G3-H06** |
| QST-004 alur draft → review → approved → published | `recordStatus` (tanpa `approved`) | `/admin/question-versions/{id}/review` | Penulis tidak dapat menyetujui soalnya sendiri untuk batch ranked | **Gagal — G3-B05** |
| QST-005 impor XLSX + ZIP untuk seluruh tipe MVP | `question_imports`, `question_import_issues` | `/admin/question-imports/*` | Kelima tipe soal dapat diimpor dan divalidasi | **Sebagian — G3-H15** |
| NTF-003 delivery idempotent dengan template version | tidak ada tabel | tidak ada endpoint | Retry provider tidak mengirim pesan kedua | **Gagal — G3-B08, G3-H09** |
| ANL-002 funnel inti dapat dihitung tanpa PII | `analytics_events` tidak ada di schema fisik | — | Aktivasi paid-to-access dapat dihitung | **Gagal — G3-H13, G3-H14** |

---

## G. Open decisions

### Belum ditutup dari `GATE_3_REVIEW_GUIDE.md` §4

| ID | Keputusan | Status | Terhalang oleh |
|---|---|---|---|
| OD-01 | Payload, signature, retry, status order Sejoli nyata | **Terbuka** | Spike belum dijalankan; memblokir G3-H06, G3-H07, dan seluruh jalur commerce |
| OD-02 | Mekanisme SSO/bridge WordPress | **Terbuka** | ADR-006 masih provisional |
| OD-03 | Provider hosting, Redis, storage, messaging, live class | **Terbuka** | ADR-008 dan ADR-010 provisional |
| OD-04 | Aturan dan ambang SKD Sekdin 2026 | **Terbuka dan benar demikian** | Belum terbit. `17 §4` tepat menolak mengasumsikannya. Tidak ada tindakan |
| OD-05 | Kebijakan late-sync setelah deadline | **Terbuka** | Angka 30 detik masih draft; G3-B04 harus ditutup lebih dulu agar keputusannya bermakna |
| OD-06 | Aturan attempt untuk ranking | **Terbuka dan kini bertabrakan** | G3-H03 |
| OD-07 | Retensi dan mekanisme consent/DSR | **Terbuka** | G3-H14, G3-H20 |
| OD-08 | Batas skala peluncuran dan target concurrency | **Terbuka** | `13 §9` menyebut 1.000 concurrent sebagai hipotesis load test |

### Warisan Gate 1–2 yang masih memblokir Gate 3

| ID | Keputusan | Mengapa masih penting |
|---|---|---|
| D1 | Randomization dan ranking | Menentukan apakah `selectionRules` dan `random_per_attempt` boleh ada — G3-H02 |
| D2 | Reuse exam form lintas batch | Tidak ada satu pun dokumen Gate 3 yang mengatur eksposur form lintas batch |
| D3 | Practice attempt di MVP | Menentukan apakah `entitlement-policy.schema.json` perlu dua penghitung — G3-B06 |
| D4 | Navigasi antar-subtes SKD | `navigation.sectionLockMode` sudah punya tiga opsi tanpa keputusan yang mengisinya |
| D6 | Hasil dan ranking setelah refund | G3-H19 |
| D7 | Kebijakan pasca-expiry | G3-H19 |
| D13 | WhatsApp sebagai kanal notifikasi | Menentukan apakah tabel consent notifikasi wajib pada MVP |
| D16 | Perlindungan data anak dan consent wali | G3-H20 |

### Keputusan baru yang muncul dari Gate 3

| ID | Keputusan | Pemilik yang disarankan |
|---|---|---|
| ND-01 | Apakah `attempts` menyimpan FK ke versi form/blueprint/scoring, atau checksum saja | Engineering |
| ND-02 | Apakah bobot opsi disimpan terpisah dari `options` | Engineering + Academic |
| ND-03 | Retensi kandidat late-sync: mengikuti retensi jawaban atau retensi log | Product + Legal |
| ND-04 | Apakah profil impor sederhana dipertahankan, mengingat ia tidak dapat membawa alt text | Academic + Engineering |
| ND-05 | Apakah leaderboard masuk MVP; jika ya, `ranking_snapshots` harus ada sebelum batch pertama | Founder + Product |

---

## H. Lima belas perubahan prioritas sebelum Gate 4

Diurutkan berdasarkan apa yang memblokir apa. Nomor 1–3 tidak memerlukan keputusan founder dan dapat dikerjakan hari ini.

| # | Perubahan | File utama | Menutup |
|---|---|---|---|
| 1 | Samakan enam state hasil `16 §16` di API dan database; jadikan `results.state` enum | `openapi.yaml`, `drizzle-schema.ts` | G3-B03 |
| 2 | Ganti enum purchase status dengan delapan nilai `22 §18` | `drizzle-schema.ts` | G3-B07 |
| 3 | Tambahkan `approved` dan `changes_requested` ke `recordStatus`; batasi `workflow_status` XLSX ke `draft`/`in_review` | `drizzle-schema.ts`, kedua workbook | G3-B05 |
| 4 | Tambahkan `answerPayload` dan `writerLeaseId` pada `answer_mutations` | `drizzle-schema.ts` | G3-B04 |
| 5 | Larang `rankingMode != none` bersama rilis tanpa review; tambahkan check constraint pada `results` | `exam-blueprint.schema.json`, `drizzle-schema.ts` | G3-B02 |
| 6 | Terapkan sebelas revisi P0 Gate 1–2 pada file aslinya; buat dua dokumen yang diminta dengan nomor `27` dan `28` | `05`, `09`, `11`, `12`, `03`, `00` | G3-B01 |
| 7 | Regenerasi `entitlement-policy.schema.json` dari `05 §5` dan `05 §8`: dua mode validity, empat target type, action `download`, pemisahan ranked/practice | `entitlement-policy.schema.json` | G3-B06 |
| 8 | Tambahkan blok scope di kepala `drizzle-schema.ts` dan empat kelompok tabel yang menghalangi release gate | `drizzle-schema.ts` | G3-B08 |
| 9 | Lengkapi snapshot attempt: attempt policy, `lateSyncCutoffAt`, akomodasi, idempotency key, dan FK versi | `drizzle-schema.ts` | G3-H01 |
| 10 | Buka blok `Attempt` di OpenAPI dan tambahkan lima field resume `16 §11` | `openapi.yaml` | G3-H04 |
| 11 | Tambahkan header timestamp dan key ID webhook, jadikan event ID wajib, pasang canonical event sebagai schema body | `openapi.yaml` | G3-H06 |
| 12 | Regenerasi katalog analytics dari `19 §5`; ganti `user_id` menjadi pseudonim; turunkan retensi ke ≤ 395 hari | `analytics-event-catalog.json` | G3-H13, G3-H14 |
| 13 | Tambahkan field usia, consent wali, dan tabel consent — struktur dulu, kebijakan setelah review hukum | `drizzle-schema.ts`, `03 §3.4` | G3-H20 |
| 14 | Perbaiki model progress: placement mereferensi resource stabil, progress menyimpan versi yang dialami dan posisi terakhir | `drizzle-schema.ts` | G3-H11 |
| 15 | Tambahkan `live_session_occurrences`, status live session, dan kolom `timezone` pada `schedule_items` dan `exam_batches` | `drizzle-schema.ts` | G3-H12 |

Perubahan 1–5 dan 9–11 murni penyelarasan artefak terhadap dokumen yang sudah disetujui. Hanya perubahan 6, 7, 13, dan nomor 5 pada bagian rilis ranked yang menyentuh wilayah keputusan founder.

---

## I. Verdict dan exit criteria

**CONDITIONAL PASS.**

Gate 3 tidak ditolak karena dokumen 13–26 adalah pekerjaan yang baik dan tidak perlu ditulis ulang. Gate 3 juga tidak lulus karena artefak yang diturunkan darinya menyatakan aturan bisnis yang berbeda pada delapan titik, dan karena dua dari empat release gate `13 §12` bergantung pada tabel yang tidak ada.

Pembacaan yang tepat: **lapisan dokumen lulus bersyarat; lapisan `artifacts/` ditolak sebagai kontrak beku.** Artefak sebaiknya diperlakukan sebagai draft pertama yang dihasilkan dari dokumen, lalu diregenerasi — bukan diperbaiki sepotong-sepotong sampai keduanya bertemu di tengah.

Gate 3 dapat dinyatakan approved ketika:

- delapan BLOCKER ditutup atau diterima secara eksplisit sebagai risiko tertulis oleh pemiliknya;
- OD-01 dan OD-02 memiliki bukti dari staging, bukan rencana;
- D1, D3, D6, D7, dan D16 diputuskan founder;
- `13`, `21`, `22`, `openapi.yaml`, `drizzle-schema.ts`, `exam-blueprint.schema.json`, dan `entitlement-policy.schema.json` menghasilkan jawaban yang sama untuk pertanyaan yang sama;
- sebelas revisi P0 Gate 1–2 selesai pada file aslinya;
- pemilik produk, akademik, dan keamanan menyetujui scope peluncuran.

OD-04 sengaja dikecualikan dari daftar itu. Aturan SKD 2026 belum terbit, dan `17 §16` sudah memiliki workflow yang benar untuk menyerapnya ketika terbit. Menunggunya bukan syarat membuka Gate 4; mengaktifkan blueprint produksi tanpanya yang tidak boleh.

---

*Audit ini tidak mengubah dokumen atau artefak apa pun. Seluruh usulan menunggu persetujuan founder sesuai instruksi proyek.*
