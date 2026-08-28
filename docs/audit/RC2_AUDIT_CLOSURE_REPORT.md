# RC2 Audit Closure Report — Gates 1–3

**Versi paket:** 1.0-RC2  
**Tanggal:** 28 Agustus 2026  
**Input verifikasi:** `FINAL_RC1_VERIFICATION.md`  
**Keputusan:** `GO_TO_GATE_4_PLANNING`  
**Batas keputusan:** bukan persetujuan production activation

## 1. Ringkasan keputusan

Verifikasi independen RC1 memberi putusan `CONDITIONAL_GO` dan menemukan dua puluh isu internal N-01–N-20, termasuk satu blocker jalur jawaban `weighted_choice`, result-state PRD yang basi, dan kosakata RBAC yang bercabang. RC2 menutup seluruh isu internal tersebut melalui perubahan pada dokumen induk, screen specification, OpenAPI, JSON Schema, Drizzle contract, workbook XLSX, dan example ZIP.

Gate 4 sekarang boleh dimulai untuk planning, test design, backlog, spike, fixture, dan runbook. Putusan ini tidak menutup gate eksternal dan tidak mengizinkan aktivasi production commerce atau ranked exam.

## 2. Penutupan N-01–N-20

| ID | Status RC2 | Resolusi dan bukti utama |
|---|---|---|
| N-01 | CLOSED | `weighted_choice` memakai response shape `single_choice` dengan `optionCode`; bobot tetap server-only. Dinormalkan di 15/15A/16 dan `SingleChoiceAnswer` OpenAPI. |
| N-02 | CLOSED | `13 §SCR-003` memakai enam state kanonik: `processing`, `provisional`, `final`, `corrected`, `withheld`, `voided`; worker failure bukan result state siswa. |
| N-03 | CLOSED_BY_DECISION | Delapan role bundle kanonik diterapkan pada 02/07/15/24: Super Admin, Operations Admin, Academic Admin, Tutor/Writer, Moderator/Reviewer, Live-Class Coordinator, Support, Finance/Reconciliation. Separation-of-duties berlaku pada level aktor. |
| N-04 | CLOSED | Activation scope workbook dan schema sama: `draft_only`, `staging`, `production`; `production_candidate` dihapus. |
| N-05 | CLOSED | Family universal `MANDIRI_PTN` dihapus; contoh spesifik `SIMAK_UI` digunakan dan tetap tunduk pada activation gate. |
| N-06 | CLOSED | Drizzle memakai enum batch 11-state; batch window memakai enum type dan `ends_at` nullable untuk window instan dengan constraint bentuk data. |
| N-07 | CLOSED | Ranking entry merujuk `ranking_subject` terpisah dan terbatas, bukan FK langsung ke `users`; UI menerima alias aman/opt-in. |
| N-08 | CLOSED | Seluruh vocabulary entitlement dan blueprint yang machine-readable kini dijelaskan di 05 dan 17, termasuk attempt/expiry resolution, `dedupeKey`, activation, presentation, watermark, dan timing precedence. |
| N-09 | CLOSED | 15A memuat delapan sheet advanced termasuk `Assets`; `asset_role` dipisahkan dari `image_purpose`. |
| N-10 | CLOSED | Profil simple hanya mengiklankan `single_choice` dan `weighted_choice`; lima tipe hanya tersedia pada advanced. |
| N-11 | CLOSED | Tabel kritis yang hilang ditambahkan secara fisik. 21 memuat mapping logical-to-physical eksplisit dan mencatat beberapa version object yang sengaja dikolaps ke tabel berstatus immutable/versioned. |
| N-12 | CLOSED | Daftar keputusan UX basi dibersihkan; manual primary program, denominator progres, dan kanal bantuan tidak lagi ditanyakan sebagai open decision. |
| N-13 | CLOSED | Presentation menetapkan question order fixed untuk ranked MVP; hanya option order yang dapat mengikuti question policy dan urutan tersaji wajib dipersist. |
| N-14 | CLOSED | Pipeline impor kanonik disamakan: `awaiting_upload → queued → scanning → parsing → validating → preview_ready → blocked|importing → completed|partial|failed|cancelled`. |
| N-15 | CLOSED | Nama deadline disatukan menjadi `deadlineAt` pada API/domain dan `deadline_at` pada database; residu `hardDeadlineAt`/`hard_deadline_at` tidak ada pada artefak aktif. |
| N-16 | CLOSED | SLO dan alert threshold dipisah: read 500 ms, start/resume 800 ms, answer save 350 ms, submit acknowledgement 1 s. |
| N-17 | CLOSED | Checklist reflow disatukan pada 320 CSS px; residu 360 px dihapus. |
| N-18 | CLOSED | WCAG 2.2 AA kini eksplisit mencakup 2.5.7 Dragging Movements dan 3.3.7 Redundant Entry di UX/design system. |
| N-19 | CLOSED | Purchase state string kanonik: `pending`, `paid`, `failed`, `expired`, `cancelled`, `refunded_partial`, `refunded_full`, `chargeback`. |
| N-20 | CLOSED | S16 Progres, S17 Komunitas, S18 Leaderboard, student question report, admin accommodation, dan admin notification memiliki tujuan, content/state, serta acceptance criteria penuh. |

## 3. Temuan partial RC1 yang ikut ditutup

| Kelompok | Status RC2 | Perubahan |
|---|---|---|
| K-07 | CLOSED | Diagram purchase lifecycle memuat refund partial/full dan chargeback. |
| K-09/K-10 | CLOSED | Satu route/area admin kanonik dan matriks delapan role dipakai lintas IA/screen/RBAC. |
| K-14/A-02/A-10 | CLOSED | Keputusan program utama, progres required-only, dan tiket + eskalasi WhatsApp diterapkan serta dihapus dari open questions. |
| K-16 | CLOSED | Checkout copy menyatakan handoff ke checkout ber-branding Superlatif yang dijalankan melalui Sejoli/WordPress. |
| M-05/M-06/M-07/M-08/M-13 | CLOSED | Enam layar diperluas dan endpoint minimum leaderboard/report/accommodation/notification ditambahkan. |
| R-03 | CLOSED | Kriteria WCAG 2.5.7 dan 3.3.7 ditambahkan. |
| G3-B03/B08 | CLOSED_INTERNAL | PRD state diperbaiki; physical tables dan mapping logical-to-physical dilengkapi. |
| G3-H04/H05 | CLOSED | Resume envelope diperkaya; batch/window enforcement dipindah ke schema fisik. |
| G3-M01/M03 | CLOSED_INTERNAL | `exam_families` ditambahkan; invariant jumlah durasi section dicatat sebagai semantic invariant dan wajib ditegakkan publication validator. |

## 4. Keputusan kontrak yang disengaja

### 4.1 Weighted choice

`weighted_choice` bukan interaction payload baru. Siswa tetap memilih tepat satu opsi, sehingga payload memakai `kind=single_choice` dan `optionCode`. Perbedaan berada pada server-side scoring policy: opsi memiliki bobot rahasia dan tidak dikirim sebagai jawaban/kunci kepada klien.

### 4.2 Ranking subject

`ranking_subject` menjadi boundary pseudonimitas. Relasi user-to-ranking subject disimpan pada area terbatas dengan kontrol RBAC dan audit. Snapshot leaderboard serta ranking entry tidak membutuhkan direct user FK.

### 4.3 Durasi section

JSON Schema Draft 2020-12 tidak memiliki keyword portabel untuk menjumlahkan nilai seluruh elemen array. Karena itu schema menegakkan keberadaan `durationSeconds` pada mode per-section, sedangkan invariant `sum(sections.durationSeconds) = totalDurationSeconds` ditegakkan oleh publication validator dan fixture test. Ketentuan ini tercatat di schema melalui `x-superlatifSemanticInvariants` serta di dokumen blueprint.

### 4.4 Logical versus physical version tables

Tidak semua object logical `*_version` memerlukan tabel terpisah. Untuk object yang versioning/immutability-nya dapat ditegakkan pada satu tabel, physical schema sengaja mengolapsnya dan mapping ditulis eksplisit di 21. Tabel terpisah ditambahkan ketika ada kebutuhan lifecycle, access boundary, atau evidence record yang berbeda.

## 5. Validasi artefak RC2

| Pemeriksaan | Hasil |
|---|---|
| OpenAPI 3.1 parse | PASS — 33 path, 54 schema |
| OpenAPI local reference resolution | PASS — 219 referensi, 0 putus |
| OpenAPI path parameter parity | PASS |
| CSRF mutation coverage | PASS — seluruh mutasi cookie-auth non-exempt memakai `X-CSRF-Token` |
| Drizzle TypeScript syntax | PASS dengan Node TypeScript strip/check |
| JSON/JSON Schema parse | PASS |
| JSON Schema local reference resolution | PASS — blueprint 13/13, entitlement 6/6 |
| XLSX formula/error scan | PASS — 0 formula error pada seluruh sheet |
| XLSX visual render | PASS — simple 4 sheet dan advanced 8 sheet diperiksa |
| Example ZIP integrity | PASS — struktur folder kanonik dan media referensi lengkap |
| Residual terminology scan | PASS — tidak ada active-contract residue untuk `hardDeadlineAt`, `production_candidate`, `MANDIRI_PTN`, atau 360 px |

Validasi ini bersifat kontraktual dan struktural. Ia bukan pengganti migration test, runtime integration test, provider staging test, load/soak test, atau regulatory sign-off.

## 6. Hard gate yang tetap terbuka

| Gate | Status | Syarat penutupan |
|---|---|---|
| OD-01 Sejoli event | BLOCKED_EXTERNAL | Payload/event nyata, signature bytes, timestamp/replay, retry, refund/chargeback, amount, ID order/SKU stabil. |
| OD-02 WordPress bridge | BLOCKED_EXTERNAL | One-time exchange staging, audience/nonce/expiry, account linking, logout/revocation. |
| OD-03 Vendor | OPEN | Decision record dan benchmark hosting, queue/cache, storage, messaging, serta live provider. |
| OD-04 Aturan SKD | EXPECTED_OPEN | Sumber resmi tahun berjalan, threshold/kategori, academic sign-off, scoring fixture. |
| OD-07 Legal/privacy | BLOCKED_REVIEW | Review hukum Indonesia untuk anak/wali, consent, retention, DSR, incident notice, dan WhatsApp. |
| OD-08 Scale | BLOCKED_TEST | Model concurrency dan hasil load/soak/failure test. |
| Legacy product promises | BLOCKED_EXTERNAL | Bukti sales page/order/terms atau keputusan founder atas LP-001–LP-005. |

## 7. Putusan dan batas kerja berikutnya

### `GO_TO_GATE_4_PLANNING`

Gate 4 boleh menghasilkan QA/UAT plan, implementation roadmap, Claude Code execution plan, operations runbook, `CLAUDE.md`, domain skills, test fixture, dan migration rehearsal plan.

Yang belum diizinkan:

- mengaktifkan commerce production sebelum OD-01/OD-02;
- mengaktifkan ranked SKD production sebelum OD-04, academic/security/UAT, dan OD-08;
- memigrasikan janji/benefit legacy yang masih `UNVERIFIED`;
- menganggap RC2 sebagai dokumen final/frozen tanpa sign-off owner terkait.

Perubahan kebijakan baru pada Gate 4 harus memperbarui dokumen induk dan ADR sebelum artefak atau kode diubah.
