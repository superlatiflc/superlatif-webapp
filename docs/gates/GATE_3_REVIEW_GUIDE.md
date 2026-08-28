# Gate 3 — Review Guide 1.0-RC2

**Versi:** 1.0-RC2  
**Tanggal:** 28 Agustus 2026  
**Status:** Siap untuk Gate 4 planning; production activation masih bergate

## 1. Outcome Gate 3

Gate 3 menerjemahkan keputusan produk dan UX ke functional serta technical contract:

- PRD dan acceptance criteria MVP;
- LMS, program, live class, admin CMS, dan bulk question bank;
- exam engine, blueprint/scoring, flash sale, batch, result, dan correction;
- analytics, notification, arsitektur, ERD, API/webhook;
- Sejoli/WordPress bridge, auth/RBAC/security/privacy;
- migration/reconciliation dan architecture decision records;
- artefak API, schema data, schema ujian/entitlement, event catalogue, dan template impor.

## 2. Urutan audit yang disarankan

1. `13_PRD.md` untuk scope, non-goals, acceptance criteria, dan launch gate.
2. `16_EXAM_ENGINE_CORE_CONTRACT.md` serta `17_EXAM_BLUEPRINTS_AND_SCORING.md` untuk integritas ujian.
3. `21_ERD_AND_DATA_DICTIONARY.md` lalu `contracts/drizzle-schema.ts` untuk model data.
4. `22_API_AND_WEBHOOK_CONTRACT.md` lalu `contracts/openapi.yaml` untuk boundary HTTP.
5. `23_SEJOLI_WORDPRESS_INTEGRATION.md` dan `25_MIGRATION_AND_RECONCILIATION_PLAN.md` untuk risiko legacy/commerce.
6. `24_AUTH_RBAC_SECURITY_AND_PRIVACY.md` untuk kontrol keamanan.
7. dokumen 14, 15, 18, 19, 20, 26 dan artefak lain untuk completeness/cross-consistency.

## 3. Keputusan yang sudah diambil

- Web app bersifat program-centric; WordPress/Sejoli tetap menjadi commerce backend pada MVP.
- Produk, offer, program, batch, exam form, dan access grant dipisahkan.
- Access additive dan explainable; refund hanya mencabut grant dari sumber terkait.
- App user ID stabil; identity linking tidak hanya berdasarkan email.
- Arsitektur awal modular monolith TypeScript dengan web dan worker terpisah secara deployment.
- Transactional outbox digunakan untuk side effect lintas batas.
- Satu core exam engine memakai blueprint/scoring policy berversi.
- Attempt menyimpan question version serta urutan soal/opsi yang benar-benar ditampilkan.
- Autosave memakai writer lease, mutation ID, dan expected revision; client timestamp bukan pemenang konflik.
- Ranked result memerlukan review manusia sebelum rilis.
- Soal bulk memakai XLSX multi-sheet dan ZIP media; import tidak langsung publish.
- Active legacy attempt tidak dipindahkan ke engine baru.

## 4. External/open decisions sebelum production activation

| ID | Keputusan | Dampak | Pemilik yang disarankan |
|---|---|---|---|
| OD-01 | Payload, signature, retry, dan status order Sejoli nyata | Adapter, webhook verification, reconciliation | Engineering + operator Sejoli |
| OD-02 | Mekanisme SSO/bridge WordPress yang tersedia | Login, account linking, rollout | Engineering + WordPress owner |
| OD-03 | Provider final hosting, Redis/Valkey, object storage, email/WA, live class | Cost, deployment, data residency, SLA | Founder + Engineering |
| OD-04 | Aturan/passing threshold SKD Sekdin 2026 resmi | Scoring activation dan copy hasil | Academic/Regulatory |
| OD-07 | Retention detail dan mekanisme consent/DSR operasional | Privacy implementation | Founder + Legal/Privacy |
| OD-08 | Batas skala launch dan concurrency target tervalidasi | Load test dan infrastructure sizing | Product + Engineering |

## 5. Temuan yang harus dianggap blocker

Claude harus memberi label **BLOCKER** bila menemukan salah satu hal berikut:

- aturan bisnis yang sama mempunyai hasil berbeda di dua dokumen;
- endpoint dapat mengubah jawaban/nilai tanpa audit dan approval;
- result dapat dirilis ranked sebelum verification/human review;
- webhook dapat membuat grant ganda dari event yang sama;
- refund satu pembelian menghapus akses yang masih didukung pembelian lain;
- attempt resume dapat mengubah question/option order;
- client clock menentukan deadline atau memenangkan answer conflict;
- data sensitif/answer content dikirim ke analytics;
- published version dapat diedit in-place tanpa version baru;
- schema fisik tidak dapat merepresentasikan requirement MVP yang disetujui.

## 6. Prompt audit untuk Claude

Gunakan **Claude Opus, effort/level High**. Upload seluruh folder/ZIP Gate 3 bersama dokumen Gate 1 dan Gate 2 yang sudah disetujui, lalu gunakan prompt berikut:

```text
Anda bertindak sebagai principal product architect, exam-platform engineer,
security reviewer, dan database/API contract auditor untuk Superlatif.

Audit dokumen Gate 3 terhadap Gate 1 dan Gate 2. Jangan menulis ulang dokumen.
Jangan menganggap artefak machine-readable lebih benar daripada dokumen induk.

Lakukan pemeriksaan:
1. kontradiksi requirement dan terminology;
2. scope MVP vs non-goals dan requirement yang tidak punya acceptance criteria;
3. integritas entitlement stacking, refund, expiry, upgrade, dan explain access;
4. integritas exam: timer, autosave, resume, writer lease, revision conflict,
   immutable question/form/blueprint, scoring, ranked release, correction;
5. kesesuaian PRD ↔ ERD ↔ Drizzle schema ↔ API/OpenAPI;
6. idempotency, webhook verification, outbox, retry, reconciliation, dan migration;
7. RBAC/object scope, privacy, auditability, accessibility, observability, dan recovery;
8. apakah XLSX import dan ZIP media dapat mewakili semua tipe soal MVP;
9. keputusan terbuka yang wajib ditutup sebelum build.

Untuk setiap temuan berikan:
- ID dan severity: BLOCKER/HIGH/MEDIUM/LOW;
- bukti berupa file + section heading (jangan mengarang nomor baris);
- konsekuensi nyata;
- satu rekomendasi perubahan paling kecil;
- file mana yang menjadi sumber perbaikan utama;
- daftar file turunan yang harus disinkronkan.

Di akhir berikan:
A. matriks traceability requirement → data → API → test implication;
B. daftar kontradiksi eksplisit;
C. daftar missing decisions;
D. verdict: REJECT / CONDITIONAL PASS / PASS;
E. maksimal 15 perubahan prioritas sebelum Gate 4.

Pisahkan fakta dari asumsi. Jangan menetapkan passing grade atau aturan pemerintah
2026 tanpa sumber resmi yang terdapat di dokumen atau diverifikasi secara eksplisit.
```

## 7. Paket yang diunggah ke Claude

Unggah:

- ZIP Gate 1;
- ZIP Gate 2;
- `Superlatif-Gate-3-Technical-Contract.zip`.

Jika batas konteks tidak cukup, audit Gate 3 dalam tiga pass:

1. Product/functional: dokumen 13–19.
2. Technical/integration: dokumen 20–26.
3. Machine contract: folder `contracts/` plus temuan pass 1–2.

Jangan hanya mengunggah PRD atau OpenAPI; audit konsistensi membutuhkan ketiganya.

## 8. Exit criteria Gate 3

RC2 menutup temuan internal yang dapat diselesaikan dari dokumen dan artefak. Gate 3 baru `approved/frozen` setelah OD-01/OD-02 memiliki bukti staging, legal/security/academic owner menyetujui bagian mereka, dan audit ulang menunjukkan tidak ada blocker/high inconsistency. Gate 4 boleh dimulai sebagai perencanaan, test design, backlog, dan spike terkontrol; coding/aktivasi production untuk commerce dan ranked exam tetap ditahan.

Gate 3 dapat berstatus approved ketika:

- semua BLOCKER/HIGH diselesaikan atau diterima eksplisit sebagai risk;
- OD-01 sampai OD-04 serta OD-07/OD-08 mempunyai keputusan dan bukti yang relevan;
- PRD, ERD, OpenAPI, Drizzle, blueprint, dan entitlement schema sinkron;
- product/academic/security owner menyetujui launch scope;
- Gate 4 dapat menurunkan test plan dan implementation backlog tanpa mengarang kebijakan baru.
