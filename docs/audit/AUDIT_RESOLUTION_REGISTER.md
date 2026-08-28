# Audit Resolution Register — Gate 1, 2, dan 3

**Versi:** 1.0-RC2  
**Tanggal:** 28 Agustus 2026  
**Input audit:** `AUDIT_GATE_1_2_FINDINGS.md`, `AUDIT_GATE_3_FINDINGS.md`, `FINAL_RC1_VERIFICATION.md`  
**Status:** Temuan internal RC1 telah diremediasi pada RC2; external hard gates tetap terbuka

## 1. Putusan

Dokumen 00–26 dan artefak Gate 3 sekarang menjadi **audit-resolved release candidate**, bukan kontrak produksi beku. Hasil verifikasi RC1 awalnya `CONDITIONAL_GO`; RC2 menutup N-01 sampai N-20 dan partial finding internal yang dapat diselesaikan tanpa bukti eksternal. Keputusan sekarang `GO_TO_GATE_4_PLANNING`. Keputusan ini bukan izin aktivasi produksi: commerce menunggu spike Sejoli/WordPress, sedangkan ranked exam menunggu aturan resmi, academic review, security/load test, dan UAT.

## 2. Keputusan founder/default yang diadopsi

| ID | Keputusan RC2 |
|---|---|
| D1 | Ranked MVP memakai immutable fixed form; tidak ada pool randomization. |
| D2 | Form retired dari ranked reuse setelah kunci/pembahasan dirilis. |
| D3 | Practice attempt ditunda; kontrak menyimpan penghitung terpisah dengan nilai 0. |
| D4 | Navigasi mengikuti blueprint resmi berversi; default satu final submit per attempt. |
| D5 | Leaderboard opt-in dengan display name aman. |
| D6 | Refund tidak menghapus attempt/result/ranking historis; akses konten mengikuti grant. |
| D7 | Post-expiry per product; default `read_only_history`. |
| D8 | Konten gratis memakai ecosystem/free grant, bukan bypass authorization. |
| D10 | Tryout Pass adalah compact program dengan daftar batch terlihat. |
| D11 | Pilihan program utama manual menang; urgensi program lain berupa banner, bukan silent switch. |
| D12 | Bantuan utama tiket in-app dengan eskalasi WhatsApp. |
| D13 | WhatsApp hanya dengan opt-in eksplisit per kategori/template. |
| D14 | Checkout menjelaskan handoff ke mitra commerce Superlatif secara transparan. |
| D15 | Progres hanya menghitung aktivitas wajib pada denominator utama. |
| D16 | Struktur consent anak/wali dibuat; kebijakan final menunggu review hukum. |
| D17 | Academic admin dapat menjadi approver kedua; penulis tidak boleh menyetujui sendiri. |
| OD-05 | Cutoff awal late-sync 30 detik; payload menjadi recovery candidate dan tidak otomatis dinilai. |
| ND-01 | Attempt menyimpan FK versi dan checksum form/blueprint/scoring/policy. |
| ND-02 | Kunci/bobot dipisah ke restricted secret record. |
| ND-03 | Retensi late-sync mengikuti record attempt/audit, bukan analytics umum; angka final menunggu legal. |
| ND-04 | Profil impor sederhana dipertahankan dan sekarang membawa alt text. |
| ND-05 | Leaderboard termasuk MVP hanya setelah snapshot, opt-in, dan review gate tersedia. |

## 3. Disposisi Gate 1–2

| Temuan | Disposisi | Bukti perbaikan |
|---|---|---|
| K-01, K-02 | Closed | Route kanonik disamakan di 07/12; batch tetap dalam program context dengan global resolver fallback. |
| K-03, K-04 | Closed by decision | 05, 16, 17, schema blueprint, ADR-031. |
| K-05 | Closed | Satu resolver, reason-code allowlist, threshold, dan tie-break di 09 §5 serta 14/OpenAPI. |
| K-06 | Closed | C04 menjadi maksimal tiga layar progresif. |
| K-07 | Closed | C03 memisahkan purchase state dan access state, termasuk partial refund/chargeback. |
| K-08 | Closed | UTC storage/server, user timezone rendering, authoritative WIB label untuk deadline nasional. |
| K-09, K-10 | Closed | IA admin disatukan; Import/Live Ops dan `live_class_coordinator` ditambahkan. |
| K-11 | Closed by decision | Practice attempt 0 pada MVP. |
| K-12, K-13 | Closed | Six-state result + 30-second recovery receipt/adjudication. |
| K-14, K-17 | Closed | Progress denominator required-only; completion policy berversi pada resource. |
| K-15 | Closed | Satu final submit; section behavior dari blueprint resmi. |
| K-16 | Closed | Transparent checkout handoff copy. |
| K-18 | Clarified | Question report/quality flag adalah operational QA, bukan full psychometric item analysis. |
| M-01 | Structurally closed; legal gate open | 03/09/24, `consent_records`, guardian state. |
| M-02 | Closed | 15A, workbook v2.1, ZIP v2.1. |
| M-03 | Register created; evidence gate open | 05A. Klaim audit tidak dianggap fakta tanpa sumber primer. |
| M-04–M-13 | Closed | Free grant, leaderboard, accommodation/report/notification screens, expiry/refund policies, sync detection, void/retake, Progress/Community screens. |
| M-14 | Closed | 02A marketing evidence register. |
| M-15, M-16 | Closed | Hex data series dan focus token ditambahkan ke 11. |
| A-01–A-11 | Closed/defaulted | Compact Pass, manual primary program, explicit writer lease, result semantics, import idempotency, second approval, attendance policy, recording definition, elective blueprint, ticket+WA, settled price snapshot. |
| R-01 | Partially accepted | Functional boundary/focus/status memakai ≥3:1; decorative divider tidak dipaksa 3:1 karena bukan meaningful non-text object. |
| R-02–R-07 | Closed | Reflow 320, WCAG 2.2 criteria, math format, canonical events, P0 priorities, missing components. |
| R-08 | Accepted deferral with mitigation | Dark mode ditunda; low-glare UAT wajib. |

## 4. Disposisi Gate 3

| Temuan | Disposisi | Bukti perbaikan |
|---|---|---|
| G3-B01 | Closed | Revisi P0 diterapkan pada file asli dan register 02A/05A/15A dibuat tanpa menabrak nomor Gate 4. |
| G3-B02 | Closed | Ranked release memaksa fixed form, human review, scheduled/manual release. |
| G3-B03 | Closed | Enam result state sama di 13/16/OpenAPI/Drizzle. |
| G3-B04 | Closed | Mutation menyimpan answer payload, writer lease, cutoff, adjudication; receipt API. |
| G3-B05 | Closed | Workflow enum lengkap; workbook hanya draft/in_review. |
| G3-B06 | Closed | Entitlement schema v2 memuat enam validity mode, sepuluh target, download, ranked/practice, expiry/refund history. |
| G3-B07 | Closed | Purchase enum memuat failed/expired dan seluruh delapan status. |
| G3-B08 | Closed for contract review | Physical schema menambah RBAC, consent, reconciliation, moderation/import rows, progress, live occurrence, ranking, accommodation/incident, notification, analytics, background jobs. |
| G3-H01–H05 | Closed | Attempt snapshots, no pool, batch ranking rule, complete resume, canonical batch state/windows. |
| G3-H06 | Contract closed; provider gate open | Header anti-replay/key ID/event ID + canonical body; algoritme nyata menunggu staging. |
| G3-H07–H15 | Closed | Mapping version, redacted audit diff, outbox idempotency, current result, stable progress, live occurrence, canonical analytics/privacy, workbook v2.1. |
| G3-H16 | Closed with corrected implementation | `is_active=true` partial unique + service expiry closure; rekomendasi predicate `expires_at > now()` tidak dipakai karena invalid/volatile di PostgreSQL. |
| G3-H17–H22 | Closed | Secret table, grant lifecycle, expiry/refund, consent, progress/remediation API, canonical enrollment. |
| G3-M01–M12, M15–M18 | Closed | Extensible family, accommodation, timing precedence, safe defaults, API/DB/import/offer/target alignment, endpoints lengkap. |
| G3-M13 | Partially accepted | Family masa depan tetap ada untuk authoring tetapi `draft_only`; activation gate mencegah publish. |
| G3-M14 | Closed; provenance claim withdrawn | ZIP RC2 diregenerasi sebagai v2.1 dengan konvensi folder eksplisit. RC2 tidak menyimpulkan apakah file tersedia pada salinan pra-RC1 yang diterima auditor. |
| G3-L01 | No change required | camelCase API dan snake_case database adalah boundary naming normal untuk konsep yang sama. |
| G3-L02–L05 | Closed | Prerequisite, vocabulary navigation, PII classification gate, SLO owner/runbook. |

## 5. Koreksi terhadap asumsi audit

1. `Instruksi superlatif.txt` tersedia pada sumber kerja dan telah diperiksa; keterbatasan Project Knowledge hanya berlaku pada sesi Claude.
2. Deck Compro yang disuplai adalah company/brand profile dan tidak memuat daftar benefit SKU yang diklaim audit. Klaim tersebut masuk 05A sebagai `UNVERIFIED`, bukan source of truth.
3. `question-import-example.zip` tersedia dan valid pada RC2. Riwayat ketersediaannya sebelum RC1 tidak dipakai sebagai dasar disposisi.
4. WCAG 3:1 berlaku pada objek/batas yang diperlukan untuk memahami komponen, bukan setiap divider dekoratif.
5. API camelCase dan database snake_case tidak dianggap kontradiksi selama mapping eksplisit dan semantics sama.

## 6. Hard gates yang belum dapat ditutup dari dokumen

| Gate | Status | Bukti yang dibutuhkan | Owner |
|---|---|---|---|
| OD-01 Sejoli event | BLOCKED_EXTERNAL | Payload nyata, signature bytes, timestamp/replay, retries, refund/chargeback, coupon/affiliate amounts, stable order/SKU IDs | Commerce/Engineering |
| OD-02 WordPress bridge | BLOCKED_EXTERNAL | One-time exchange staging, audience/nonce/expiry, safe account link, logout/revocation | Identity/Engineering |
| OD-03 Vendor | OPEN | Decision record + benchmark hosting, Redis, storage, messaging, live provider | Engineering |
| OD-04 SKD rules | EXPECTED_OPEN | Official current-year structure, thresholds/categories, academic sign-off, scoring fixtures | Academic/Product |
| OD-07 Legal/privacy | BLOCKED_REVIEW | Indonesian legal review: child age rule, guardian consent, retention, DSR, incident notices, WhatsApp basis | Legal/Founder |
| OD-08 Scale | BLOCKED_TEST | Launch concurrency, workload model, load/soak/failure results | Engineering/Ops |

## 7. Verification berikutnya

Claude/auditor berikutnya harus membandingkan aturan yang sama secara horizontal pada 05, 13, 16, 17, 18, 21, 22, OpenAPI, Drizzle, dua JSON Schema, analytics JSON, dan workbook v2.1. Audit dinyatakan lulus jika tidak ada blocker/high internal, seluruh schema parse dan reference-check, workbook semua sheet lolos visual/formula scan, serta setiap hard gate eksternal tetap terlihat dan tidak disamarkan sebagai keputusan final. Bukti penutupan RC2 berada di `RC2_AUDIT_CLOSURE_REPORT.md`.
