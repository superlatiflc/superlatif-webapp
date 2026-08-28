# FINAL RC1 VERIFICATION

**Paket diverifikasi:** `Superlatif-WebApp-Gates-1-3-RC1.zip`
**Tanggal verifikasi:** 28 Agustus 2026
**Input audit pembanding:** `claude_AUDIT_GATE_1_2_FINDINGS.md`, `claude_AUDIT_GATE_3_FINDINGS.md`, `AUDIT_RESOLUTION_REGISTER.md` (dalam paket RC1)
**Sifat dokumen:** Verifikasi independen. Tidak ada file RC1 yang diubah, ditulis ulang, atau dibuat baru.

---

## 1. Executive Summary

RC1 adalah perbaikan yang nyata dan terukur, bukan sekadar pelabelan ulang. Delapan blocker Gate 3 sudah ditangani pada tingkat kontrak, kosakata state hasil/attempt/purchase/grant sudah menyatu di sebagian besar artefak, dan tiga register baru (`02A`, `05A`, `15A`) menutup kekosongan struktural yang sebelumnya menjadi lubang requirement.

Namun `AUDIT_RESOLUTION_REGISTER.md` **melebih-lebihkan tingkat penutupan**. Dari 60 ID temuan yang saya periksa ulang terhadap file aktual, register menyatakan 56 sebagai closed; verifikasi menemukan **41 benar-benar CLOSED, 14 PARTIALLY_CLOSED, 1 OPEN, dan 4 BLOCKED_EXTERNAL**. Pola kesalahannya konsisten: register mencatat *keputusan* sebagai bukti, padahal dokumen yang menjadi lokasi kontradiksi asli tidak ikut diperbarui.

Tiga hal paling material:

1. **`weighted_choice` tidak dapat dijawab melalui kontrak API.** `15 §4` menyatakan SKD produksi memakai single choice **dan weighted choice**. Blueprint, kedua workbook, dan contoh data membawanya. Tetapi `AnswerSaveRequest.answer` hanya punya empat `kind`, dan string `weighted` **nol kemunculan** di `openapi.yaml` maupun `drizzle-schema.ts`. Satu dari dua tipe soal produksi MVP tidak punya jalur jawaban. Ini P0.
2. **`13 §SCR-003` tidak ikut diperbarui.** PRD masih menyatakan result punya `processing, provisional, final, corrected, dan failed` — lima state termasuk `failed`, yang secara eksplisit ditolak `16 §4` ("kegagalan worker adalah job/error state, bukan result state siswa"). Register mengklaim G3-B03 "sama di 13/16/OpenAPI/Drizzle"; klaim itu tidak benar untuk 13.
3. **Kosakata peran bercabang tiga.** `02 §5.3` (7 peran), `07 §12` (6 kolom), dan `24 §6` (6 kolom berbeda, memperkenalkan `Finance`). `live_class_coordinator` hanya hidup sebagai prosa di `07 §11` dan `12 §23`; ia tidak ada di kedua permission matrix. `Academic admin` — aktor yang D17 tetapkan sebagai approver kedua — tidak ada sama sekali di RBAC matrix Gate 3.

Validasi artefak sendiri bersih: seluruh JSON/YAML/XLSX/ZIP parse, 55 `$ref` OpenAPI resolve tanpa satu pun putus, tidak ada schema yatim, dan ZIP contoh konsisten penuh terhadap workbook yang ditanamnya.

**Keputusan: `CONDITIONAL_GO`.** Jalur program/LMS boleh masuk Gate 4 planning sekarang. Jalur ranked exam ditahan sampai N-01 dan N-02 ditutup. Jalur commerce tetap menunggu spike eksternal.

---

## 2. Verification Scope

### Yang diperiksa

43 file diekstrak dan dibaca: 9 dokumen Gate 1, 8 dokumen Gate 2, 14 dokumen Gate 3, 8 artefak machine-readable, dan register resolusi.

| Kelas | Metode verifikasi |
|---|---|
| Markdown 00–26, 02A, 05A, 15A | Pembacaan langsung + grep silang antar-heading |
| `openapi.yaml` | Parse YAML, enumerasi 24 path, ekstraksi seluruh enum, resolusi 55 `$ref`, deteksi schema tak terpakai, audit parameter per operasi mutasi |
| `drizzle-schema.ts` | Ekstraksi 9 `pgEnum` dan 79 `pgTable`, dump definisi kolom/index untuk 30 tabel kritis, diff terhadap `21` |
| `exam-blueprint.schema.json`, `entitlement-policy.schema.json` | Parse, dump seluruh `$defs`, cek `allOf` conditional, telusur kosakata ke dokumen induk |
| `analytics-event-catalog.json` | Parse, diff 37 nama event terhadap `19 §5` secara programatik, audit `prohibitedProperties` dan retensi |
| Kedua workbook XLSX | Dump seluruh sheet baris-per-baris, audit header kontrak dan sheet `Lookups` |
| `question-import-example.zip` | Ekstraksi, `file(1)` per entri, verifikasi setiap referensi asset workbook terhadap isi ZIP, checksum SHA-256 workbook tertanam vs standalone |

### Yang tidak dapat diverifikasi

- **`Instruksi superlatif.txt`** tidak ada dalam paket RC1 maupun Project Knowledge sesi ini. Register §5 no. 1 menyatakan file itu tersedia pada sumber kerja; saya tidak dapat mengonfirmasi maupun membantahnya, dan tidak menjadikannya dasar penilaian apa pun.
- **Klaim G3-M14 sebagai "false positive".** `question-import-example.zip` **ada dan valid di RC1**. Apakah ia ada pada paket lokal *sebelum* audit tidak dapat saya verifikasi dari RC1 saja. Saya mencatat: salinan Gate 3 di Project Knowledge memang tidak memuat file tersebut, yang konsisten dengan observasi auditor. Status saya untuk RC1: CLOSED; karakterisasi "false positive" saya tandai **tidak terverifikasi**, bukan salah.
- **Klaim regulasi di `17 §4`** tentang jadwal SKD CAT BKN Sekdin 2026 (22 September–7 Oktober 2026). Ini fakta eksternal di luar cutoff pengetahuan saya dan masuk OD-04. Saya tidak mengesahkan maupun membantahnya; ia butuh sumber primer.
- **Perilaku runtime.** Tidak ada migration dijalankan, tidak ada TypeScript dikompilasi terhadap `drizzle-orm` nyata, tidak ada instance JSON divalidasi terhadap schema. Verifikasi ini bersifat kontraktual/struktural.

---

## 3. Temuan Gate 1–2

### 3.1 Kontradiksi kritis (K-01 … K-18)

| ID | Register | Status verifikasi | Bukti |
|---|---|---|---|
| K-01 | Closed | **CLOSED** | `07 §3` daftar route == route siswa `12 §2.1`; satu bahasa route |
| K-02 | Closed | **CLOSED** | `07 §3`: `/programs/:programSlug/tryouts/:batchSlug` kanonik; `/batches/:batchId` eksplisit sebagai deep link dengan kewajiban resolve program context |
| K-03 | Closed by decision | **CLOSED** | ADR-031; `05 §8.4`; `exam-blueprint.schema.json` `presentation.questionOrder: {"const":"fixed"}`; `selectionRules` dihapus total |
| K-04 | Closed by decision | **CLOSED** | `05 §8.4` butir 6; `18 §21`; `examForms.answerReviewReleasedAt` + `retiredFromRankedAt` |
| K-05 | Closed | **CLOSED** | `09 §5` satu tabel: 7 prioritas + reason code + threshold + tie-break; `08 §6` menunjuk `09 §5` sebagai satu-satunya sumber; identik dengan `NextAction.reasonCode` |
| K-06 | Closed | **CLOSED** | `12 §16` C04: "Maksimal tiga layar progresif" |
| K-07 | Closed | **PARTIALLY_CLOSED** | `12 §15` C03 benar: 9 purchase state + 6 access state terpisah. **Tetapi state diagram `08 §3` masih 7 state — `Partially refunded` tetap hilang** |
| K-08 | Closed | **CLOSED** | `09 §2` invariant 11: UTC di penyimpanan, render zona akun, WIB sebagai label otoritatif deadline nasional |
| K-09 | Closed | **PARTIALLY_CLOSED** | Import Soal + Live Ops kini ada di keduanya dan sama-sama Indonesia. **Tetapi `07 §11` (12 area) ≠ `12 §23` (16 area), dan route admin berbeda** (`/admin/catalog/products` vs `/admin/products/:id`) walau `07 §11` mendeklarasikan dirinya kanonik |
| K-10 | Closed | **PARTIALLY_CLOSED** | `live_class_coordinator` disebut di `07 §11` dan `12 §23` sebagai prosa. **Tidak ada di matrix `07 §12` maupun `24 §6`** — lihat N-03 |
| K-11 | Closed by decision | **CLOSED** | `05 §8.4`; `maxPracticeAttempts: {"const":0}` di kedua JSON Schema |
| K-12 | Closed | **CLOSED** | `16 §10`/`§24`; `answer_mutations.lateSyncCandidate` + `adjudicationState`; `SubmissionEnvelope.recoveryState` |
| K-13 | Closed | **CLOSED** | `08 §9`: tunggu maksimal 30 detik, lalu submit jawaban server sah + recovery receipt |
| K-14 | Closed | **PARTIALLY_CLOSED** | `14 §9` mengunci `required_progress = completed_or_waived_required / released_required`. **Tetapi `12 §8` S05 masih "kecuali dikonfigurasi" dan `09 §18` no. 3 masih mendaftarkannya sebagai keputusan belum terkunci** |
| K-15 | Closed | **CLOSED** | `12 §20`: "Submit hanya satu kali untuk seluruh attempt, kecuali blueprint resmi berversi..."; `16 §24` |
| K-16 | Closed | **PARTIALLY_CLOSED** | D14 tercatat di register. **Tetapi `12 §14` acceptance masih verbatim string yang diaudit: "sistem commerce Superlatif/mitra"** — tidak ada copy yang menyatakan siswa berpindah sistem |
| K-17 | Closed | **CLOSED** | `14` Resource Editor: `completion policy` sebagai field berversi pada resource |
| K-18 | Clarified | **CLOSED** (klarifikasi diterima) | Pembatasan ke operational QA konsisten dengan `03 §6` |

### 3.2 Requirement hilang (M-01 … M-16)

| ID | Register | Status verifikasi | Bukti |
|---|---|---|---|
| M-01 | Structurally closed; legal gate open | **PARTIALLY_CLOSED** + BLOCKED_EXTERNAL | `consent_records` + `users.guardianConsentState` ada; ADR-036. Kebijakan final menunggu OD-07 |
| M-02 | Closed | **CLOSED** | `15A` lengkap; workbook v2; ZIP v2 terverifikasi |
| M-03 | Register created; evidence gate open | **BLOCKED_EXTERNAL** | `05A` dibuat; kelima baris LP-001…LP-005 berstatus `UNVERIFIED` dengan aturan eksplisit bahwa `UNVERIFIED` tidak menghasilkan grant |
| M-04 | Closed | **CLOSED** | `05 §8.1` ecosystem/free grant; `05 §16` invariant 14 melarang bypass authorization |
| M-05 | Closed | **PARTIALLY_CLOSED** | S18 punya route di `12 §2.1`, tetapi spesifikasinya hanya tiga baris bullet di `§23A` yang judulnya sendiri berbunyi "Layar tambahan yang **wajib ditutup desain**" |
| M-06 | Closed | **PARTIALLY_CLOSED** | `attempt_accommodations` + `accommodationDefaults` ada di data/schema. Layar admin masih bullet `§23A`; tidak ada endpoint di `22` maupun OpenAPI |
| M-07 | Closed | **PARTIALLY_CLOSED** | `question_reports` ada. Layar student report masih bullet `§23A` |
| M-08 | Closed | **PARTIALLY_CLOSED** | 4 tabel notifikasi + `19 §10` kategori + consent WhatsApp (D13). Layar admin masih bullet `§23A` |
| M-09 | Closed | **CLOSED** | `05 §8.5` empat mode; `entitlement.postExpiry` identik; default `read_only_history` |
| M-10 | Closed | **CLOSED** | `05 §10` E4; `lifecycle.retainAttemptHistory/retainResultHistory/retainRankingSnapshot` semua `const: true`; ADR-035 |
| M-11 | Closed | **CLOSED** | `08 §9` + `16 §21` metrik "offline backlog/recovery candidates" |
| M-12 | Closed | **CLOSED** | `08` bagian "Incident: void batch dan retake massal", langkah 3–4 |
| M-13 | Closed | **PARTIALLY_CLOSED** | S16/S17 punya route; spesifikasi masih bullet `§23A` |
| M-14 | Closed | **CLOSED** | `02A` dengan MC-001…MC-005, seluruhnya `PROHIBITED` atau `PROHIBITED_PENDING_EVIDENCE` |
| M-15 | Closed | **CLOSED** | `11 §3.4`: `data.1`–`data.5` semua punya hex |
| M-16 | Closed | **CLOSED** | `11`: token `focus.ring` = `brand.900` |

### 3.3 Keputusan ambigu dan risiko UX (A-01 … A-11, R-01 … R-08)

| ID | Register | Status verifikasi | Catatan |
|---|---|---|---|
| A-01, A-03…A-09, A-11 | Closed/defaulted | **CLOSED** | Compact Pass (`05 §4.3`), writer lease eksplisit, result semantics, idempotency impor tiga mode, second approval, attendance, recording, elective blueprint, settled price snapshot |
| A-02 | Defaulted | **PARTIALLY_CLOSED** | D11 diterapkan di `09 §5` ("pilihan pengguna mengalahkan program lain"), tetapi `09 §18` no. 2 masih menanyakannya — lihat N-12 |
| A-10 | Defaulted | **PARTIALLY_CLOSED** | D12 (tiket + eskalasi WA) diterapkan, tetapi `09 §18` no. 6 masih menanyakannya — lihat N-12 |
| R-01 | Partially accepted | **CLOSED** (penerimaan sah) | `11` memisahkan `border.functional` (≥3:1) dari divider dekoratif. Argumen WCAG-nya benar: 1.4.11 berlaku pada objek yang diperlukan untuk memahami komponen |
| R-02 | Closed | **CLOSED** | `09 §12` dan `11` menetapkan reflow 320 CSS px + zoom 200%. Residu kosmetik: N-17 |
| R-03 | Closed | **PARTIALLY_CLOSED** | Focus Not Obscured, Consistent Help, Accessible Authentication, Target Size 44×44 semua eksplisit. **Dragging Movements (2.5.7) dan Redundant Entry (3.3.7) tidak disebut di mana pun** — lihat N-18 |
| R-04 | Closed | **CLOSED** | `09 §12.2` + `15A §5`: `\(...\)` inline, `\[...\]` block, render MathML/accessible annotation |
| R-05 | Closed | **CLOSED** | Diff programatik: 37 nama event `19 §5` == 37 nama `analytics-event-catalog.json`, nol selisih dua arah |
| R-06 | Closed | **CLOSED** | `10`: high-fidelity mencakup Exam Runner dan Bulk Import — dua area risiko bisnis tertinggi |
| R-07 | Closed | **CLOSED** | `11`: `ProgramSwitcher`, `ServerCountdown`, `LeaderboardTable/Card`, `NotificationItem`, `OnboardingStepper`, `SubtestNavigator`, `GenericEmptyState`, `QuestionReportAction`, `AccommodationIndicator` |
| R-08 | Accepted deferral | **CLOSED** (deferral sah) | `10`: dark mode ditunda; low-glare UAT diwajibkan sebagai mitigasi eksplisit |

---

## 4. Temuan Gate 3

### 4.1 Blocker (G3-B01 … G3-B08)

| ID | Register | Status verifikasi | Bukti |
|---|---|---|---|
| G3-B01 | Closed | **CLOSED** | Revisi P0 diterapkan pada file bernomor asli; `02A`/`05A`/`15A` memakai suffix huruf sehingga nomor Gate 4 tidak tertabrak |
| G3-B02 | Closed | **CLOSED** | `exam-blueprint.schema.json` `allOf[0]`: jika `rankingMode ∈ {batch, cohort}` maka `questionOrder: fixed`, `releaseMode ∈ {scheduled_after_review, manual}`, `humanReviewRequired: {"const": true}`. Ditegakkan schema, bukan prosa |
| G3-B03 | Closed | **PARTIALLY_CLOSED** | `16 §16` == `resultStatus` == `ResultState` == ADR-032, keempatnya enam state identik. **`13 §SCR-003` tidak ikut diperbarui** — lihat N-02 |
| G3-B04 | Closed | **CLOSED** | `answer_mutations` menyimpan `answerPayload`, `writerLeaseId`, `expectedRevision`, `resultingRevision`, `lateSyncCandidate`, `adjudicationState`, `requestChecksum`; `SubmissionEnvelope` mengembalikan `recoveryState` (5 nilai) + `recoveryReceiptId` |
| G3-B05 | Closed | **CLOSED** | `recordStatus` enam state termasuk `approved`; sheet `Lookups` `workflow_status` hanya `draft`/`in_review`; `15A §4` menegaskan `published` hanya via workflow |
| G3-B06 | Closed | **CLOSED** | `validity.mode` enam mode == `05 §8.3`; `claim.targetType` sepuluh target == `05 §5` + `TargetType` + `targetType` pgEnum; `download` ada di `actions`; `postExpiry` + `lifecycle` lengkap |
| G3-B07 | Closed | **CLOSED** | `purchaseStatus` delapan nilai == `05 §11.2` == `23 §10` |
| G3-B08 | Closed for contract review | **PARTIALLY_CLOSED** | RBAC, consent, reconciliation, moderation, import row, progress event/projection, live occurrence, ranking, accommodation, incident, notification, analytics, background job **semua kini punya tabel fisik** — itu perbaikan besar. **Tetapi 11 tabel `21` lain tetap tanpa mapping dan tanpa daftar pengecualian** — lihat N-11 |

### 4.2 High (G3-H01 … G3-H22)

| ID | Register | Status verifikasi | Bukti |
|---|---|---|---|
| G3-H01 | Closed | **CLOSED** | `attempts` kini punya `attemptPolicyId` (FK), `attemptPolicySnapshot`, `accommodationSnapshot`, `lateSyncCutoffAt`, `startIdempotencyKey`, FK ke `examForms`/`examBlueprints`/`scoringPolicies`, plus tiga checksum |
| G3-H02 | Closed | **CLOSED** | `selectionRules` nol kemunculan; `questionOrder: {"const":"fixed"}`; `persistPresentedOrder: {"const": true}` |
| G3-H03 | Closed | **CLOSED** | `18 §21` menetapkan batch satu-satunya pemilik; `entitlement.rankingRuleSource: {"const":"batch"}`; `blueprint.rankingAttemptSource: {"const":"batch"}`. Presedensi ditegakkan tiga arah |
| G3-H04 | Closed | **PARTIALLY_CLOSED** | `Attempt` kini membawa `serverNow`, `remainingSeconds`, `lateSyncCutoffAt`, `instances[].optionOrder`, `answers[]`, `flags[]`, `writerLease`. **Masih hilang dari `16 §11`: metadata section, `submissionState`, state insiden/akomodasi, `permittedActions`, current question — dan `additionalProperties: false` tetap menutup penambahan** |
| G3-H05 | Closed | **PARTIALLY_CLOSED** | `Batch.state` kini enum 11 nilai == `18 §21`; `Batch.windows` kini sepuluh window nullable. **Tetapi `examBatches.state` masih `text()` bebas dan `batchWindows.startsAt`/`endsAt` keduanya masih `.notNull()`** — persis dua defect yang audit sebutkan. Lihat N-06 |
| G3-H06 | Contract closed; provider gate open | **CLOSED** (kontrak) + BLOCKED_EXTERNAL (algoritme) | `X-Superlatif-Timestamp`, `X-Superlatif-Key-ID`, `X-Provider-Event-ID` ketiganya `required: true`; `CanonicalCommerceEvent` terpasang sebagai request body; respons `403` ada |
| G3-H07 | Closed | **CLOSED** | `purchases.externalSkuMappingId` FK ke `external_sku_mappings` yang membawa `mappingVersion`, plus `snapshot` jsonb |
| G3-H08 | Closed | **CLOSED** | `audit_logs.beforeRedacted` + `afterRedacted` jsonb, bukan hanya checksum |
| G3-H09 | Closed | **CLOSED** | `outbox_events.idempotencyKey` + `uniqueIndex("outbox_idempotency_uq")` |
| G3-H10 | Closed | **CLOSED** | `results.isCurrent` + `uniqueIndex("result_attempt_one_current_uq").where(isCurrent = true)`; unik pada `(attemptId, version)`, bukan submission; `supersedesResultId` ada |
| G3-H11 | Closed | **CLOSED** | `progress_records` unik pada `(userId, placementId)`; `experiencedResourceVersionId` terpisah sehingga revisi materi tidak memutus completion |
| G3-H12 | Closed | **CLOSED** | `live_sessions.status` + `live_session_occurrences` dengan `occurrenceNumber`, `status`, `rescheduledFromOccurrenceId` |
| G3-H13 | Closed | **CLOSED** | Diff programatik 37/37 identik; event pendukung metrik PRD (`access_activated_from_purchase`, `next_action_impression`, `remediation_started`) semua hadir |
| G3-H14 | Closed | **CLOSED** | `defaultRetentionDays: 395` (13 bulan, == `19 §19`); `user_id` masuk `prohibitedProperties`; `actor_pseudonym` dideskripsikan "never a user UUID"; `analytics_events.expiresAt` + index kedaluwarsa |
| G3-H15 | Closed | **CLOSED** | Advanced workbook punya sheet `Statements` dan `NumericAnswers` dengan data contoh; profil sederhana membawa `stem_image_alt` dan `explanation_image_alt` |
| G3-H16 | Closed with corrected implementation | **CLOSED** | `uniqueIndex("attempt_writer_one_active_uq").on(attemptId).where(isActive = true)`. Koreksi terhadap rekomendasi audit **benar secara teknis**: predikat `expires_at > now()` memang tidak sah sebagai index predicate PostgreSQL karena `now()` bukan `IMMUTABLE`. ADR-037 mendokumentasikan penolakan itu |
| G3-H17 | Closed | **CLOSED** | `question_version_secrets` tabel terpisah: `answerKeyEncrypted`, `optionWeightsEncrypted`, `encryptionKeyVersion` |
| G3-H18 | Closed | **CLOSED** | `grantStatus` enam nilai termasuk `cancelled`, nama `scheduled` dipulihkan == `05 §8.2` |
| G3-H19 | Closed | **CLOSED** | `05 §8.5` + `entitlement.postExpiry` + `lifecycle.refundAction`/`retain*` |
| G3-H20 | Closed | **PARTIALLY_CLOSED** | Struktur `consent_records` + `guardianConsentState` ada. Kebijakan usia/retensi/DSR menunggu OD-07 — deferral yang jujur dan ditandai |
| G3-H21 | Closed | **CLOSED** | `ProgramOverviewEnvelope.tabs` memuat `progress`; `NextAction.kind` memuat `remediation`; `NextAction.reasonCode` memuat `RESULT_REMEDIATION`; `22 §8` mendeklarasikan `GET /programs/{programId}/progress` |
| G3-H22 | Closed | **CLOSED** | `uniqueIndex("enrollment_user_program_uq").on(userId, programId)` — bukan program version |

### 4.3 Medium dan Low (G3-M01 … G3-M18, G3-L01 … G3-L05)

| ID | Register | Status verifikasi | Bukti |
|---|---|---|---|
| G3-M01 | Closed | **PARTIALLY_CLOSED** | `examFamily` kini string berpola, bukan enum tetap — extensible. **Tetapi tabel `exam_families` dari `21 §9` tetap tidak ada di schema fisik**, sehingga `activation state` per family tidak punya rumah |
| G3-M02 | Closed | **CLOSED** | Konfigurasi akomodasi hadir sebagai `accommodationDefaults` di akar blueprint (`extraTimePercent`, `extraTimeSeconds`, `reducedMotion`, `screenReaderOptimized`). Penempatannya berbeda dari `17 §2` tetapi kemampuannya ada |
| G3-M03 | Closed | **PARTIALLY_CLOSED** | Presedensi ditutup dengan tegas: `timing.policyPrecedence: {"const": ["attempt_accommodation","batch_attempt_policy","blueprint_default"]}`. **Validasi jumlah durasi section == `totalDurationSeconds` tetap tidak ada**; `allOf` hanya punya dua cabang (ranked dan production) |
| G3-M04 | Closed | **CLOSED** | `resultPolicy.showCorrectAnswer.default: false` |
| G3-M05 | Closed | **PARTIALLY_CLOSED** | `gracePeriodDays` dan `pooled` hilang. **Tetapi pola pelanggarannya berulang dengan field baru** — lihat N-08 |
| G3-M06 | Closed | **CLOSED** | `AccessDecisionEnvelope` kini punya `attemptsRemaining`, `scheduledStartAt`, `effectiveUntil`, `safeExplanation`, dan `supportingSources[]` yang hanya membawa `label` + `effectiveUntil` — UUID grant mentah tidak lagi terekspos |
| G3-M07 | Closed | **CLOSED** | Parameter `CsrfToken` (`X-CSRF-Token`, `required: true`) terpasang pada **11 dari 11** operasi mutasi cookie-authenticated. `/auth/bridge/exchange` dikecualikan dengan benar (belum ada sesi); webhook memakai signature |
| G3-M08 | Closed | **CLOSED** | `scanning`, `partial`, `blocked` ada di `ImportJobEnvelope.state` dan `importStatus` |
| G3-M09 | Closed | **CLOSED** | `attempt_flags` tabel terpisah dengan unik `(attemptId, instanceId)`; `attemptAnswers.flagged` dihapus |
| G3-M10 | Closed | **PARTIALLY_CLOSED** | `AnswerSaveRequest.answer` kini `oneOf` bertipe. **Tetapi hanya empat kind untuk lima tipe soal** — lihat N-01. Sisi database tetap `jsonb` bebas |
| G3-M11 | Closed | **CLOSED** | `attemptStatus` == `Attempt.status` == `16 §4`, tujuh state persis, `voided` dipulihkan |
| G3-M12 | Closed | **CLOSED** | `offers` kini punya `termsVersion`, `soldCountSource`, `reservationPolicy`, `returnUrlTemplate`, `upgradeFromOfferId` |
| G3-M13 | Partially accepted | **PARTIALLY_CLOSED** (sesuai klaim) | Kolom `activation_scope` ditambahkan; contoh advanced tidak lagi memakai `TPA_TBI` sebagai data aktif. **Tetapi lihat N-04 dan N-05** |
| G3-M14 | False positive + contract enhanced | **CLOSED untuk RC1**; label "false positive" **tidak terverifikasi** | ZIP ada, terekstrak, struktur `images/{questions,explanations,passages}` sesuai `15A §2`, seluruh referensi resolve |
| G3-M15 | Closed | **CLOSED** | `AccessChangeRequest.operation`: `grant`, `suspend`, `resume`, `revoke`, `extend` |
| G3-M16 | Closed | **CLOSED** | `prohibitedProperties` kini 26 entri termasuk `answer_key`, `option_weight`, `private_meeting_url`, `raw_webhook_payload`, `health_inference`; `schema_version` wajib di `commonProperties` dan dinyatakan per event |
| G3-M17 | Closed | **CLOSED** | `targetType` kini `pgEnum` sepuluh nilai, dipakai konsisten |
| G3-M18 | Closed | **CLOSED** | `/attempts/{id}/writer-lease/takeover`, `/submit-summary`, `/flags/{instanceId}`, `/review` keempatnya kini ada di OpenAPI |
| G3-L01 | No change required | **OPEN** (Low) | Naming `hard_deadline_at` vs `deadline_at` **tetap ada**, dan alasan register salah baca temuan — lihat N-15 |
| G3-L02 | Closed | **CLOSED** | `resource_placements` membawa required/release/prerequisite (`21 §6`) |
| G3-L03 | Closed | **PARTIALLY_CLOSED** | `sectionLockMode`: `free`, `section_restricted`, `forward_only` — kini snake_case dari kosakata `16 §12`. **Tetapi `16 §12` punya opsi keempat `configured` yang tidak punya representasi schema** |
| G3-L04 | Closed | **CLOSED** | `21 §12` mewajibkan klasifikasi PII pada migration comment/security catalog sebelum migration produksi; `21 §15` tabel klasifikasi lengkap |
| G3-L05 | Closed | **CLOSED** | `20 §24` tabel SLO ownership: 5 sinyal dengan alert, owner, dan nama runbook. Residu kalibrasi: N-16 |

---

## 5. Cross-Contract Validation

Pemeriksaan horizontal atas aturan yang sama di seluruh kontrak yang diminta.

### 5.1 Yang konsisten penuh

| Konsep | Kontrak yang selaras |
|---|---|
| Result state (6) | `16 §16` · `resultStatus` · `ResultState` · ADR-032 — **kecuali `13 §SCR-003`** |
| Attempt state (7) | `16 §4` · `attemptStatus` · `Attempt.status` |
| Purchase state (8) | `05 §11.2` · `23 §10` · `purchaseStatus` |
| Grant lifecycle (6) | `05 §8.2` · `grantStatus` |
| Validity mode (6) | `05 §8.3` · `entitlement.validity.mode` |
| Target type (10) | `05 §5` · `TargetType` · `targetType` pgEnum · `entitlement.claim.targetType` |
| Post-expiry mode (4) | `05 §8.5` · `entitlement.postExpiry.mode`, default `read_only_history` sama |
| Batch state (11) | `18 §21` · `Batch.state` — **tidak ditegakkan di `examBatches.state`** |
| Batch window (10) | `05 §7` · `18 §3` · `Batch.windows` |
| Import mode (3) | `15A §6` · `ImportCreateRequest.mode` · Lookups `import_mode` |
| Nama event analytics (37) | `19 §5` · `analytics-event-catalog.json` — 37/37 persis |
| Ranking attempt rule | `18 §21` · `entitlement.rankingRuleSource` · `blueprint.rankingAttemptSource` — ketiganya `batch` |
| Practice attempt | `05 §8.4` · kedua JSON Schema — `const 0` |
| Late-sync cutoff | `16 §10` (30 dtk) · `blueprint.timing.lateSyncCutoffSeconds.default: 30` · `attempts.lateSyncCutoffAt` · ADR-034 |
| Retensi analytics | `19 §19` (13 bln) · katalog `395` hari |
| Next action | `09 §5` (7 reason code) · `NextAction.reasonCode` (7) · `NextAction.kind` (7) |
| Access reason code | `05 §13` bahasa siswa · `AccessDecisionEnvelope.reasonCode` (9) + `safeExplanation` |

### 5.2 Yang masih bertabrakan

| # | Subjek | Sumber A | Sumber B | ID |
|---|---|---|---|---|
| 1 | Tipe soal yang dapat dijawab | `15 §4` + `15A §4` + blueprint `allowedQuestionTypes` (5, termasuk `weighted_choice`) | `AnswerSaveRequest.answer` (4 kind) | **N-01** |
| 2 | Result state | `16 §16` + ADR-032 (6, tanpa `failed`) | `13 §SCR-003` (5, dengan `failed`) | **N-02** |
| 3 | Kosakata peran | `02 §5.3` (7) | `07 §12` (6) vs `24 §6` (6 berbeda) | **N-03** |
| 4 | `activation_scope` | blueprint `activationScope`: `draft_only\|staging\|production` | Lookups: `production_candidate\|draft_only` | **N-04** |
| 5 | Exam family aktif | `17 §10`: "Tidak ada `Mandiri PTN universal` di catalogue atau code" | Lookups kedua workbook memuat `MANDIRI_PTN` | **N-05** |
| 6 | Batch state enforcement | `18 §21` + `Batch.state` enum | `examBatches.state` = `text()` bebas | **N-06** |
| 7 | Pseudonimitas ranking | `16 §18` + `21 §10` "pseudonymous reference" | `ranking_entries.userId` FK langsung ke `users` | **N-07** |
| 8 | Progress denominator | `14 §9` formula terkunci | `12 §8` "kecuali dikonfigurasi" + `09 §18` no. 3 terbuka | K-14 |
| 9 | Sheet impor | `15A §3` (7 sheet, tanpa `Assets`) | `15 §8` + workbook advanced (8 sheet, dengan `Assets`) | **N-09** |
| 10 | Randomization | ADR-031 + `16 §6` + blueprint `const fixed` | `17 §2` Presentation masih "question/option randomization" | **N-13** |
| 11 | Pipeline impor | `15A §7` (`uploaded` …) | `importStatus` (`awaiting_upload`, `queued`, `blocked` …) | **N-14** |
| 12 | Naming deadline | `16 §10` `deadline_at` | `hard_deadline_at` / `hardDeadlineAt` | **N-15** |
| 13 | Purchase state string | `23 §10` `refunded`, `partially_refunded` | `purchaseStatus` `refunded_full`, `refunded_partial` | **N-19** |

### 5.3 API ↔ database ↔ OpenAPI

`22` mendeklarasikan sekitar 45 endpoint; `openapi.yaml` memuat 24. Ini **bukan** temuan tersembunyi: `ARTIFACTS_README.md` §Production gates menyatakan eksplisit bahwa artefak API adalah subset dan endpoint admin builder akan diturunkan setelah alur admin diprototipekan. Deferral yang ditandai terbuka saya terima.

Base path konsisten: `22 §16` menulis `/api/v1/integrations/...` dan OpenAPI `servers` sudah membawa `/api/v1`, sehingga path relatif `/integrations/...` benar.

---

## 6. Artifact Validation

| Artefak | Hasil | Detail |
|---|---|---|
| `openapi.yaml` | **LULUS** | Parse OpenAPI 3.1.0 · 24 path · 40 schema · **55 `$ref` resolve, 0 putus** · 0 schema tak terpakai · `security` global `cookieAuth` · CSRF pada 11/11 operasi mutasi berkuki |
| `drizzle-schema.ts` | **LULUS dengan catatan** | 79 `pgTable` · 9 `pgEnum` · partial unique index memakai `sql` predicate boolean (valid PostgreSQL) · catatan: 11 tabel `21` tanpa mapping, 3 kolom state masih `text()` bebas |
| `exam-blueprint.schema.json` | **LULUS dengan catatan** | Draft 2020-12 · parse OK · 11 `$defs` · 2 cabang `allOf` conditional yang menegakkan aturan ranked dan production · catatan: tanpa validasi jumlah durasi section |
| `entitlement-policy.schema.json` | **LULUS dengan catatan** | Parse OK · `validity.allOf` menegakkan field wajib per mode · catatan: kosakata tak tertelusur (N-08) |
| `analytics-event-catalog.json` | **LULUS** | Parse OK · 37 event · 37/37 cocok dengan `19 §5` · retensi 395 · 26 `prohibitedProperties` · `qualityGates` eksplisit |
| `question-import-template.xlsx` | **LULUS dengan catatan** | 4 sheet · header kontrak lengkap · alt text ada · tanpa formula, tanpa error · catatan: Lookups mengiklankan 5 tipe soal yang profil ini tidak dapat bawa (N-10) |
| `question-import-advanced-template.xlsx` | **LULUS dengan catatan** | 8 sheet · seluruh 5 tipe soal punya contoh data · manifest `Assets` konsisten · tanpa formula, tanpa error · catatan: N-04, N-05, N-09 |
| `question-import-example.zip` | **LULUS** | 9 entri · 3 PNG valid (bukan SVG, sesuai `15A §1`) · struktur `images/{questions,explanations,passages}` sesuai `15A §2` · **seluruh referensi asset resolve, nol file yatim** · workbook tertanam byte-identik dengan standalone (SHA-256 `34e0810a…`) · `README.txt` tambahan yang tidak merusak kontrak |

---

## 7. Remaining Internal Issues

Masalah yang **dapat diperbaiki secara internal** tanpa vendor, regulasi, atau bukti eksternal. Sembilan belas temuan baru yang tidak tercatat di register.

### P0 — memblokir jalur ranked exam

**N-01 · `weighted_choice` tanpa jalur jawaban** · Severity: Blocker
`15 §4` menyatakan SKD produksi memakai single choice **dan weighted choice**; blueprint memuatnya di `allowedQuestionTypes`; kedua workbook membawa `SKD-TKP-001` dengan skor per opsi. Tetapi `AnswerSaveRequest.answer` hanya `oneOf` empat schema (`SingleChoiceAnswer`, `MultipleChoiceAnswer`, `StatementAnswer`, `NumericAnswer`) dengan `kind` sebagai `const`, dan `additionalProperties: false`. String `weighted` **nol kemunculan** di `openapi.yaml` dan `drizzle-schema.ts`.
*Dampak:* `16 §8` langkah 4 memvalidasi payload jawaban terhadap tipe soal yang disnapshot. Untuk `weighted_choice` tidak ada schema untuk divalidasi. TKP adalah setengah scope SKD MVP; kontrak saat ini tidak dapat menerima jawabannya.
*Perbaikan minimal:* tambahkan `WeightedChoiceAnswer` dengan `kind: {"const": "weighted_choice"}` dan `optionCode`, **atau** nyatakan eksplisit di `15A §4` dan `16 §8` bahwa `weighted_choice` memakai bentuk respons `single_choice` dan pembobotan murni sisi scoring. Keduanya sah; yang tidak sah adalah membiarkannya tidak dinyatakan.

**N-02 · `13 §SCR-003` tidak ikut diperbarui** · Severity: High
PRD berstatus "1.0-RC1 — audit-resolved candidate" tetapi SCR-003 masih berbunyi "Result memiliki processing, provisional, final, corrected, dan **failed** state". `16 §4` menolak `failed` secara eksplisit. Register mengklaim G3-B03 selaras "di 13/16/OpenAPI/Drizzle" — untuk `13` klaim itu salah.
*Dampak:* PRD adalah dokumen yang dipakai QA menurunkan test case. Test SCR-003 yang ditulis dari PRD akan mencari state yang tidak ada di enum mana pun.

### P1 — memblokir kesiapan build/UAT

**N-03 · Kosakata peran bercabang tiga** · Severity: High
`02 §5.3` (Super admin/ops, Academic admin, Tutor/writer, Moderator, Live-class coordinator, Support) vs `07 §12` (Super admin, Ops admin, Academic admin, Tutor/writer, Moderator, Support) vs `24 §6` (Writer, Moderator, Program Admin, Support, **Finance**, Super Admin). `Finance` hanya ada di 24. `Ops admin`/`Academic admin` hanya di 07. `live_class_coordinator` tidak ada di kedua matrix.
*Dampak paling tajam:* D17 menetapkan "Academic admin dapat menjadi approver kedua" dan `15A §7` mengandalkannya untuk publish ranked. Aktor itu **tidak ada di RBAC matrix Gate 3**. Permission `question.approve` di `24 §6` hanya diberikan ke Moderator dan Super Admin, dengan "Terbatas" untuk Program Admin. Alur second-approval D17 belum dapat diimplementasikan dari kontrak.

**N-06 · Enforcement state batch hanya di API** · Severity: Medium
`examBatches.state` = `text().notNull().default("draft")`; `batchWindows.startsAt`/`endsAt` keduanya `.notNull()`. Perbaikan minimal G3-H05 diterapkan pada OpenAPI tetapi tidak pada Drizzle. Window instan (late-sync cutoff, rilis hasil, akses berakhir) tetap memaksa operator mengisi waktu akhir palsu.

**N-07 · Ranking tidak pseudonim** · Severity: Medium
`ranking_entries` menyimpan `userId: uuid().notNull().references(() => users.id)` bersama `displayAliasRef`. `13 §SCR-008` yang berbunyi "tidak menanam **nama** pengguna" secara harfiah terpenuhi, tetapi `16 §18` dan `21 §10` mensyaratkan "pseudonymous reference" — FK langsung ke `users` bukan itu.

**N-11 · Sebelas tabel ERD tanpa mapping dan tanpa daftar pengecualian** · Severity: Medium
Tidak ada di `drizzle-schema.ts`: `attendances`, `community_links`, `question_assets`, `question_usage`, `exam_families`, `system_config_versions`, `correction_impacts`, `correction_approvals`, `onboarding_responses` (dilebur ke `enrollments.onboardingAnswers` jsonb), serta pemisahan `*_versions` untuk blueprint/scoring/form. `21 §18` memberi caveat umum tetapi bukan daftar pengecualian eksplisit — inti keluhan G3-B08.
*Dampak spesifik:* tanpa `exam_families`, `activation_scope` per family (gate D-`draft_only`) tidak punya tempat tinggal. `question_assets` hilang berarti alt text hasil impor tidak punya target tabel.

**N-08 · Kosakata artefak entitlement tidak tertelusur** · Severity: Medium
`inherit_batch`, `per_batch`, `attemptResolution`, `sum_distinct_sources`, `maximum_allowance`, `batch_policy_only`, `dedupeKey`, `expiryResolution`, `latest_supporting_grant` — kesembilannya **nol kemunculan di seluruh file markdown RC1**. Ini pola persis yang G3-M05 larang lewat `ARTIFACTS_README.md` §Hierarchy: artefak tidak boleh diam-diam menambah requirement. Field lama dihapus, field baru dengan cacat yang sama masuk.
Pola serupa (lebih ringan) di blueprint: `activationScope`, `policyPrecedence`, `watermarkMode`, `persistPresentedOrder`, `question_policy` juga tidak muncul di dokumen induk.

**N-20 · Enam layar terdaftar tetapi belum dispesifikasikan** · Severity: Medium
`12 §23A` berjudul "Layar tambahan yang **wajib ditutup desain**" dan memuat S16 Progres, S17 Komunitas, S18 Leaderboard, Student question report, Admin accommodation, dan Admin notification — masing-masing satu baris bullet. S01–S15 dan A01–A15 punya section penuh dengan Tujuan/Konten/Acceptance. Register mencatat M-05, M-06, M-07, M-08, M-13 sebagai "Closed"; yang sebenarnya terjadi adalah gap-nya **terdaftar dan diberi route**, bukan tertutup.

**N-18 · Dua kriteria WCAG 2.2 belum ditangani** · Severity: Medium
`09 §12` menargetkan WCAG 2.2 AA dan menangani Focus Not Obscured, Consistent Help, Accessible Authentication, dan Target Size. **Dragging Movements (2.5.7)** dan **Redundant Entry (3.3.7)** tidak disebut di 09, 11, maupun 12. 2.5.7 relevan langsung: `SubtestNavigator` dan pemilihan opsi ujian tidak boleh mensyaratkan gerakan seret tanpa alternatif satu-pointer.

### P2 — kebersihan kontrak

**N-04 · `production_candidate` bukan nilai `activationScope` yang sah.** Lookups kedua workbook memakainya; enum blueprint hanya `draft_only|staging|production`. Import yang membawa nilai itu akan lolos validasi workbook tetapi gagal validasi blueprint.

**N-05 · `MANDIRI_PTN` bertentangan dengan `17 §10`.** `17 §10` menyatakan tegas "Tidak ada `Mandiri PTN universal` di catalogue atau code". Kedua workbook memuatnya sebagai kode family yang dapat dipilih, walau `draft_only`.

**N-09 · `15A §3` tidak lengkap.** Tabel sheet kontrak memuat 7 sheet tanpa `Assets`, sementara `15 §8` dan workbook advanced punya 8. Selain itu `15A §3` memperkenalkan `image_role=decorative` sebagai jalan keluar alt text, tetapi lookup `asset_role` hanya punya `stem|option|explanation|passage|other` — tanpa `decorative`, dan namanya `asset_role`, bukan `image_role`.

**N-10 · Lookups profil sederhana terlalu permisif.** Sheet `Lookups` identik di kedua workbook dan mengiklankan kelima tipe soal, tetapi profil sederhana tidak punya sheet `Statements`/`NumericAnswers` maupun kolom `partial_score_policy` yang `15A §4` wajibkan untuk `multiple_choice`.

**N-12 · `09 §18` basi terhadap keputusan RC1.** Daftar "Keputusan yang perlu dikunci" masih menanyakan program utama manual (no. 2), denominator progres (no. 3), dan kanal bantuan (no. 6) — padahal D11, D15, dan D12 sudah memutuskan ketiganya, dan `09 §5` sendiri sudah menerapkan D11. Dokumen bertentangan dengan dirinya sendiri.

**N-13 · `17 §2` masih menyebut question randomization** sebagai kapabilitas Presentation, bertentangan dengan ADR-031, `16 §6`, dan `questionOrder: const fixed`.

**N-14 · Drift kosakata pipeline impor.** `15A §7` mulai dari `uploaded`; artefak memakai `awaiting_upload` + `queued` dan menambah `blocked` yang `15A` tidak sebut.

**N-15 · `hard_deadline_at` vs `deadline_at` tetap ada,** dan alasan register ("camelCase API dan snake_case database adalah boundary naming normal") salah membaca temuan: selisihnya adalah kata `hard`, bukan gaya penulisan. Kolom database benar-benar bernama `hard_deadline_at`.

**N-16 · Kalibrasi SLO belum rapi.** `20 §24` memasang alert answer save di >300 ms sementara SLO `13 §9` adalah <350 ms — alert menyala sebelum target dilanggar. Baris "Attempt resume/read p95 >500 ms" menggabungkan dua target `13 §9` yang berbeda (read <500 ms, start/resume <800 ms).

**N-17 · `11 §22`** checklist komponen masih "Bekerja pada 360 px" sementara kontrak reflow sudah 320.

**N-19 · String purchase state** `23 §10` (`refunded`, `partially_refunded`) berbeda dari `purchaseStatus` (`refunded_full`, `refunded_partial`). Semantik 1:1, tetapi adapter provider perlu satu string kanonik.

---

## 8. External Hard Gates

Gate ini **tidak dapat ditutup dari dokumen** dan tidak boleh diselesaikan dengan asumsi. Saya memverifikasi bahwa keenamnya tetap terlihat dan tidak disamarkan sebagai keputusan final — dan memang demikian. Ini titik terkuat RC1.

| Gate | Status verifikasi | Bukti dibutuhkan | Owner |
|---|---|---|---|
| **OD-01 Sejoli event** | `BLOCKED_EXTERNAL` | Payload nyata, byte signature, skema timestamp/replay, perilaku retry, event refund/chargeback, nominal kupon/afiliasi, ID order/SKU stabil | Commerce/Engineering |
| **OD-02 WordPress bridge** | `BLOCKED_EXTERNAL` | Pertukaran one-time di staging, audience/nonce/expiry, prosedur account link aman, logout/revocation | Identity/Engineering |
| **OD-03 Vendor** | `OPEN` | Decision record + benchmark: hosting, Redis/queue, storage, messaging, provider live class. `20 §24` menandai Supabase sebagai provisional, ADR-010 konsisten | Engineering |
| **OD-04 Aturan SKD** | `EXPECTED_OPEN` | Struktur resmi tahun berjalan, threshold/kategori, sign-off akademik, fixture scoring. Klaim jadwal BKN di `17 §4` butuh sumber primer; **saya tidak memverifikasinya** | Academic/Product |
| **OD-07 Legal/privacy** | `BLOCKED_REVIEW` | Review hukum Indonesia: aturan usia anak, consent wali, retensi, DSR, notifikasi insiden, dasar hukum WhatsApp. Struktur `consent_records` + ADR-036 siap; kebijakannya tidak | Legal/Founder |
| **OD-08 Skala** | `BLOCKED_TEST` | Konkurensi peluncuran, model beban, hasil load/soak/failure. `16 §23` dan `13 §9` menetapkan hipotesis 1.000 attempt konkuren — hipotesis, bukan hasil | Engineering/Ops |
| **M-03 / 05A janji legacy** | `BLOCKED_EXTERNAL` | Kelima baris LP-001…LP-005 `UNVERIFIED`. Butuh sales page terarsip, export offer Sejoli, invoice/terms, atau keputusan founder bertanda tangan | Founder/Commerce |

Catatan positif: `05A §5` aturan 1 ("Janji `UNVERIFIED` tidak menghasilkan grant otomatis") dan `25` yang mewajibkan penutupan `05A` sebelum mapping SKU adalah penanganan gate eksternal yang benar — risiko dikunci di jalur eksekusi, bukan diasumsikan hilang.

---

## 9. Risk Assessment

| Risiko | Kemungkinan | Dampak | Posisi RC1 |
|---|---|---|---|
| **TKP tidak dapat dikerjakan saat build** (N-01) | Tinggi jika tidak ditutup sebelum Gate 4 | Tinggi — separuh scope SKD MVP | Terdeteksi sekarang; perbaikan satu schema. Jika lolos ke build, ia muncul saat integrasi exam runner, titik termahal |
| **Test diturunkan dari PRD yang basi** (N-02) | Sedang | Sedang | Satu baris tabel; murah sekarang, membingungkan nanti |
| **Alur approval ranked tidak dapat diimplementasikan** (N-03) | Sedang | Tinggi | D17 mensyaratkan aktor yang tidak ada di RBAC. Publish ranked tanpa second approver yang sah melanggar ADR-019 |
| **State batch tidak konsisten antar layer** (N-06) | Sedang | Sedang | API ketat, DB longgar. Bug akan muncul lewat jalur tulis non-API (job, migration, manual fix) |
| **Kebocoran identitas via ranking** (N-07) | Rendah | Tinggi jika terjadi | Snapshot ranking dengan FK user langsung menyulitkan pemenuhan DSR di bawah OD-07 |
| **Enam layar belum dirancang** (N-20) | Tinggi | Sedang | Leaderboard dan accommodation adalah surface berisiko tinggi (privasi dan keadilan ujian) yang belum punya acceptance criteria |
| **Artefak menyelinapkan requirement** (N-08) | Sedang | Sedang | Pola berulang, bukan insiden tunggal. Butuh gate proses, bukan hanya perbaikan field |
| **Gate eksternal molor** | Tinggi | Tinggi | Di luar kendali tim. Sudah dimitigasi dengan benar: jalur commerce dan aktivasi ranked dipisahkan dari jalur program/LMS |
| **Regresi kepercayaan pada register** | — | Sedang | 14 dari 56 klaim "closed" tidak didukung file aktual. Register perlu diperlakukan sebagai indeks niat, bukan bukti |

**Yang secara meyakinkan sudah tidak berisiko:** kehilangan jawaban (writer lease + revision CAS + mutation log berpayload + partial unique index yang benar), duplikasi grant dari replay webhook (unique `purchase_event_key` + `access_grant_source_key`), penghapusan sejarah akibat refund (tiga `const: true` di `entitlement.lifecycle` + ADR-035), dan kebocoran kunci jawaban ke siswa (`question_version_secrets` terpisah + serializer allowlist + 26 `prohibitedProperties`). Empat risiko terbesar audit sebelumnya benar-benar ditutup di tingkat kontrak.

---

## 10. Keputusan Akhir

# `CONDITIONAL_GO`

**Alasan.** Tidak ada blocker yang menyisakan kontrak yang tidak dapat dibangun pada inti attempt/exam, entitlement, atau ingress commerce. Kedelapan G3-B ditangani secara substantif; 41 dari 60 temuan benar-benar tertutup dengan bukti yang dapat ditunjuk; seluruh artefak lolos validasi struktural; dan keenam gate eksternal tetap terbuka serta terlihat, tidak disamarkan.

Yang menahan `GO` penuh adalah dua hal konkret: satu tipe soal produksi MVP tanpa jalur jawaban (N-01), dan satu dokumen induk yang tidak ikut diperbarui sehingga PRD bertentangan dengan kontrak engine (N-02). Keduanya kecil untuk diperbaiki dan mahal untuk dibiarkan.

**Syarat kondisional:**

| Jalur | Putusan |
|---|---|
| Program/LMS/live class | **Boleh masuk Gate 4 planning sekarang.** Kontraknya konsisten |
| Ranked exam / tryout | **Ditahan** sampai N-01 dan N-02 ditutup dan N-03 punya keputusan founder |
| Commerce/checkout | **Ditahan** sampai OD-01 dan OD-02 punya bukti staging |
| Aktivasi family non-SKD | **Ditahan** oleh activation gate `17 §3` — sudah benar sebagaimana adanya |
| Migrasi benefit legacy | **Ditahan** sampai `05A` punya sumber primer |

**Yang eksplisit tidak diizinkan oleh putusan ini:** memulai implementasi Gate 4, membekukan kontrak sebagai production-ready, atau memperlakukan gate eksternal mana pun sebagai tertutup.

---

## 11. Tindakan Berikutnya

### P0 — sebelum Gate 4 planning dibuka untuk jalur exam

| # | Tindakan | File | Owner | Butuh keputusan founder? |
|---|---|---|---|---|
| P0-1 | Tutup N-01. Tambahkan `WeightedChoiceAnswer` ke `AnswerSaveRequest`, **atau** nyatakan di `15A §4` + `16 §8` bahwa `weighted_choice` memakai bentuk respons `single_choice` | `openapi.yaml`, `15A`, `16` | Engineering + Academic | Tidak — pilihan teknis |
| P0-2 | Perbaiki `13 §SCR-003` menjadi enam state kanonik; hapus `failed` | `13` | Product | Tidak |
| P0-3 | Tetapkan satu kosakata peran kanonik dan pastikan `live_class_coordinator` serta approver kedua D17 muncul di matrix `07 §12` dan `24 §6` | `02`, `07`, `24` | Product + Security | **Ya** — komposisi tim operasional adalah keputusan bisnis |
| P0-4 | Selaraskan `activation_scope` (N-04) dan putuskan nasib `MANDIRI_PTN` (N-05) | Kedua workbook, `17 §10` | Academic | **Ya** untuk N-05 |

### P1 — selama Gate 4 planning berjalan

| # | Tindakan | File | Owner |
|---|---|---|---|
| P1-1 | Jadikan `examBatches.state` enum; jadikan `batchWindows.endsAt` nullable (N-06) | `drizzle-schema.ts` | Engineering |
| P1-2 | Ganti `ranking_entries.userId` menjadi referensi pseudonim, atau perbarui `16 §18`/`21 §10` bila FK langsung memang disengaja (N-07) | `drizzle-schema.ts` atau `16`/`21` | Engineering + Legal |
| P1-3 | Terbitkan daftar pengecualian eksplisit untuk 11 tabel ERD tanpa mapping (N-11) | `21 §18` | Engineering |
| P1-4 | Turunkan kosakata artefak entitlement ke `05`, atau hapus dari schema (N-08) | `05`, `entitlement-policy.schema.json` | Product |
| P1-5 | Spesifikasikan penuh enam layar `12 §23A` — prioritaskan Leaderboard dan Admin accommodation (N-20) | `12` | Design |
| P1-6 | Tangani WCAG 2.2 Dragging Movements dan Redundant Entry (N-18) | `09 §12`, `11` | Design |
| P1-7 | Sinkronkan `12 §8` S05 dan `09 §18` dengan formula terkunci `14 §9` (K-14) | `09`, `12` | Product |
| P1-8 | Tambahkan `Partially refunded` ke state diagram `08 §3` (K-07) | `08` | Product |
| P1-9 | Tulis copy checkout yang benar-benar transparan tentang perpindahan sistem (K-16) | `12 §14` | Design + Legal |
| P1-10 | Rekonsiliasi IA/route admin `07 §11` vs `12 §23`; tetapkan satu yang kanonik (K-09) | `07`, `12` | Product |
| P1-11 | Lengkapi schema `Attempt` OpenAPI dengan `sections[]`, `submissionState`, `incident`, `permittedActions` (G3-H04) | `openapi.yaml` | Engineering |
| P1-12 | Tambahkan validasi jumlah durasi section == `totalDurationSeconds` (G3-M03) | `exam-blueprint.schema.json` | Engineering |
| P1-13 | Mulai kumpulkan bukti `05A`; tanpa ini migrasi tidak dapat dijadwalkan | `05A` | Founder + Commerce |

### P2 — sebelum UAT

| # | Tindakan | File |
|---|---|---|
| P2-1 | Perbaiki `15A §3`: tambahkan sheet `Assets`; selaraskan `image_role` vs `asset_role` dan nilai `decorative` (N-09) |
| P2-2 | Batasi Lookups profil sederhana ke tipe yang benar-benar didukung, atau tambahkan kolom yang kurang (N-10) |
| P2-3 | Bersihkan `09 §18` dari keputusan yang sudah dikunci D11/D12/D15 (N-12) |
| P2-4 | Hapus "question randomization" dari `17 §2` Presentation (N-13) |
| P2-5 | Selaraskan kosakata pipeline impor `15A §7` dengan `importStatus` (N-14) |
| P2-6 | Putuskan `deadline_at` vs `hard_deadline_at` dan perbaiki alasan G3-L01 di register (N-15) |
| P2-7 | Kalibrasi ulang threshold alert `20 §24` terhadap SLO `13 §9` (N-16) |
| P2-8 | Ubah `11 §22` dari 360 px ke 320 px (N-17) |
| P2-9 | Tetapkan satu string kanonik purchase state antara `23 §10` dan `purchaseStatus` (N-19) |
| P2-10 | Tambahkan opsi `configured` ke `sectionLockMode` atau hapus dari `16 §12` (G3-L03) |
| P2-11 | Perbarui `AUDIT_RESOLUTION_REGISTER.md` agar status mencerminkan verifikasi ini, bukan niat perbaikan |

---

## Lampiran — Rekapitulasi status

| Status | Jumlah | ID |
|---|---:|---|
| `CLOSED` | 41 | K-01…K-06, K-08, K-11…K-13, K-15, K-17, K-18, M-02, M-04, M-09…M-12, M-14…M-16, A-01, A-03…A-09, A-11, R-01, R-02, R-04…R-08, G3-B01, B02, B04…B07, G3-H01…H03, H06…H19, H21, H22, G3-M02, M04, M06…M09, M11, M12, M14…M18, G3-L02, L04, L05 |
| `PARTIALLY_CLOSED` | 14 | K-07, K-09, K-10, K-14, K-16, M-05…M-08, M-13, A-02, A-10, R-03, G3-B03, G3-B08, G3-H04, G3-H05, G3-H20, G3-M01, M03, M05, M10, M13, G3-L03 |
| `OPEN` | 1 | G3-L01 |
| `BLOCKED_EXTERNAL` | 4 | M-01 (aspek legal), M-03, OD-01, OD-02, OD-07, OD-08 |
| `FALSE_POSITIVE` | 0 | — |
| Tidak terverifikasi | 1 | Karakterisasi G3-M14 sebagai "false positive" terhadap paket pra-audit |
| **Temuan baru** | **19** | N-01 … N-20 |

*Catatan: jumlah pada tabel di atas menghitung ID unik; beberapa ID muncul di dua kolom karena aspeknya terbelah (misalnya M-01 tertutup secara struktural tetapi terblokir secara legal).*
