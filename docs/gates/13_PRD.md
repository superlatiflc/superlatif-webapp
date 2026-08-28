# 13 — Product Requirements Document

**Produk:** Superlatif Web App  
**Versi:** 1.0-RC2 — audit-resolved candidate  
**Tanggal:** 28 Agustus 2026  
**Status:** Kontrak terselaraskan; hard gate eksternal tetap terbuka  
**Prioritas rilis:** Kedinasan dan SKD

## 1. Ringkasan produk

Superlatif Web App adalah ruang belajar program-centric yang menyatukan roadmap, materi, live class, rekaman, jadwal, tryout, hasil, progres, dan bantuan dalam satu perjalanan. WordPress dan Sejoli tetap menjalankan marketing, checkout, pembayaran, kupon, affiliate, serta proses commerce yang sudah bekerja. Web app menjadi pengalaman utama siswa dan pusat operasi akademik.

> Product adalah yang dijual, Program adalah yang dialami, dan Access Grant adalah alasan siswa dapat membuka fasilitas tertentu.

## 2. Status dokumen dan source of truth

Urutan otoritas:

1. Keputusan eksplisit founder setelah audit.
2. Gate 1: Product Brief, Scope, dan Catalog & Entitlement.
3. Gate 2: Journey, IA, Flow, UX, dan Screen Specifications.
4. PRD ini dan kontrak Gate 3.
5. Artefak machine-readable Gate 3.
6. Legacy package hanya sebagai riset historis.

Jika artefak machine-readable bertentangan dengan dokumen domain, implementasi berhenti dan ADR baru dibuat. Database tidak otomatis menjadi otoritas atas keputusan produk.

## 3. Problem statement

### Siswa

- Pengalaman belajar tersebar antara member area, tautan kelas, tryout, file, dan grup.
- Siswa sulit mengetahui langkah paling penting berikutnya.
- Produk bundle dan produk satuan berisiko membuat konten ganda atau akses membingungkan.
- Tryout berisiko kehilangan jawaban, menampilkan skor yang tidak tepat, atau tidak menjelaskan hasil.

### Operasional

- Admin membutuhkan cara aman mengelola program, jadwal, live class, konten, dan akses.
- Tim akademik membutuhkan bulk import soal bergambar dengan review dan versioning.
- Support membutuhkan alasan akses yang dapat dijelaskan tanpa mengedit database.
- Produk flash sale membutuhkan periode jual, ujian, hasil, dan pembahasan yang independen.

### Bisnis

- Sejoli tetap diperlukan untuk commerce, tetapi member area WordPress tidak cukup sebagai experience layer.
- Superlatif perlu merangkai banyak produk dari domain yang sama tanpa membangun aplikasi baru per produk.
- Fokus awal harus tetap Kedinasan/SKD agar scope dapat dikendalikan.

## 4. Product goals

| Goal | Outcome |
|---|---|
| G1 — One learning home | Siswa menemukan program dan next action dalam satu tempat |
| G2 — Trustworthy access | Pembayaran yang valid menghasilkan akses tepat dan dapat dijelaskan |
| G3 — Program delivery | Bundle Kedinasan berjalan dari onboarding sampai tahap akhir |
| G4 — Reliable SKD | Tryout SKD aman, akurat, resumeable, dan mobile-first |
| G5 — Efficient academic ops | Soal dan konten dapat dikelola cepat tanpa melewati quality gate |
| G6 — Reusable domain | Paket, upgrade, pass, dan batch memakai komponen yang sama |

## 5. Non-goals MVP

- Mengganti checkout, payment gateway, affiliate, kupon, komisi, wallet, atau refund engine Sejoli.
- Video conference native.
- Social feed atau chat komunitas native.
- Proctoring webcam dan hukuman otomatis karena pindah tab.
- IRT, adaptive testing, atau klaim skor resmi tanpa bukti.
- AI publishing tanpa review manusia.
- Battle tryout realtime.
- Parent dashboard dan multi-tenant sekolah penuh.
- Native mobile app; web app/PWA responsif lebih dahulu.
- Dark mode dan maskot sebagai dependency peluncuran.

## 6. Pengguna dan role

| Role | Tujuan utama |
|---|---|
| Student | Mengikuti program dan tryout yang dimiliki |
| Tutor/Writer | Membuat materi dan soal |
| Moderator/Reviewer | Meninjau kualitas akademik dan menjadi first approver |
| Academic Admin | Menyusun/mempublikasikan program, blueprint, form, dan batch; dapat menjadi second approver |
| Operations Admin | Menjalankan katalog, jadwal, live ops, dan akses sesuai policy |
| Live-Class Coordinator | Mengelola occurrence, recording, attendance, dan komunikasi kelas |
| Support | Menjelaskan dan memulihkan akses/attempt sesuai policy |
| Finance/Reconciliation | Memeriksa proyeksi order dan mismatch |
| Super Admin | Mengelola konfigurasi sensitif dan permission |
| System Worker | Menjalankan sync, scoring, notification, dan projections |

Permission mengikuti least privilege. Role bukan satu-satunya kontrol; action sensitif juga memerlukan permission eksplisit. Role operasional dapat digabung pada satu anggota tim, tetapi penulis tidak dapat menyetujui versinya sendiri dan requester/approver high-risk action harus berbeda.

## 7. Scope MVP berdasarkan slice

### Slice A — Access dan program shell

- Identity linking WordPress/app.
- Purchase event ingestion dan reconciliation.
- Product, offer, external SKU mapping, dan purchase projection.
- Access grant, policy, effective access, serta explanation.
- Beranda, Program Saya, Program Hub shell.
- Admin access search dan manual grant dengan audit.

### Slice B — Learning operations

- Program, track, stage, module, dan resource.
- Artikel, PDF/file, video, recording, dan external link.
- Jadwal, live class, reschedule/cancel, dan recording.
- Progress dan next-action projection.
- Notification preference dan delivery log.

### Slice C — Trustworthy SKD

- Question bank, stimulus, asset, version, moderation.
- XLSX + ZIP import, validation, preview, dan background job.
- SKD blueprint, exam form, batch, attempt policy.
- Exam runner, autosave, resume, timer, submit, scoring, result.
- Live operations dan correction workflow.

### Slice D — Conversion dan insight

- Katalog dan offer detail.
- Checkout handoff dan purchase status.
- Flash-sale state dan upgrade explanation.
- Result-to-action, learning analytics, dan operational dashboards.

## 8. Functional requirements

### 8.1 Identity dan session

| ID | Requirement | Prioritas |
|---|---|---|
| IDN-001 | App memiliki `user_id` stabil yang tidak bergantung pada email | P0 |
| IDN-002 | WordPress bridge menukar token satu-kali, signed, dan berumur pendek dengan app session | P0 |
| IDN-003 | Account linking menyimpan external user ID dan provenance | P0 |
| IDN-004 | Konflik email/nomor tidak digabung otomatis | P0 |
| IDN-005 | Session dapat dilihat dan dicabut per perangkat | P0 |
| IDN-006 | Deep link kembali ke tujuan setelah autentikasi | P0 |

Acceptance: siswa yang sudah login di jalur yang didukung tidak diminta membuat akun kedua; token replay ditolak; support dapat melihat status link tanpa melihat credential.

### 8.2 Beranda dan program

| ID | Requirement | Prioritas |
|---|---|---|
| PRG-001 | Beranda menampilkan program utama dan satu next action | P0 |
| PRG-002 | Resolver mengikuti prioritas Gate 2 dan memberikan reason code | P0 |
| PRG-003 | Program yang sama dari beberapa grant tampil satu kali | P0 |
| PRG-004 | Program Hub hanya menampilkan tab yang memiliki fasilitas | P0 |
| PRG-005 | Roadmap mendukung required, optional, prerequisite, lock, dan release rule | P0 |
| PRG-006 | Program/track/module/resource dipublikasikan dalam version yang dapat diaudit | P0 |
| PRG-007 | Perubahan curriculum tidak menghapus completion historis | P0 |
| PRG-008 | Onboarding mendukung field program-specific dan dapat dilanjutkan | P1 |

### 8.3 Materi dan progres

| ID | Requirement | Prioritas |
|---|---|---|
| LRN-001 | Resource mendukung article, file/PDF, video, recording, external link, quiz link, dan announcement | P0 |
| LRN-002 | Asset disimpan terpisah dengan ownership dan access policy | P0 |
| LRN-003 | Progress menyimpan started, in-progress, completed, dan last position | P0 |
| LRN-004 | Persentase program menghitung aktivitas wajib secara default | P0 |
| LRN-005 | Satu resource reusable tidak disalin untuk setiap product | P0 |
| LRN-006 | Download dikontrol per resource/policy | P1 |

### 8.4 Jadwal dan live class

| ID | Requirement | Prioritas |
|---|---|---|
| SCH-001 | Schedule item terkait program/track dan timezone eksplisit | P0 |
| SCH-002 | Live session mendukung scheduled, live, ended, cancelled, rescheduled | P0 |
| SCH-003 | Join link hanya tersedia bagi user dengan access aktif dan pada window yang diizinkan | P0 |
| SCH-004 | Reschedule menyimpan waktu lama, waktu baru, reason, dan notification status | P0 |
| SCH-005 | Recording dapat ditautkan setelah session dan mengikuti policy akses | P0 |
| SCH-006 | Attendance ringan dapat dicatat tanpa menjadi dependency progress MVP | P1 |

### 8.5 Product, offer, purchase, dan access

| ID | Requirement | Prioritas |
|---|---|---|
| COM-001 | Product, product version, offer, dan external SKU mapping dipisahkan | P0 |
| COM-002 | Product version immutable setelah digunakan purchase berbayar | P0 |
| COM-003 | Offer memiliki visibility, price snapshot, sale window, real quota, dan terms version | P0 |
| COM-004 | Purchase menyimpan product/offer/mapping version saat transaksi | P0 |
| COM-005 | Commerce event disimpan raw, diverifikasi, dan idempotent | P0 |
| COM-006 | Paid event menghasilkan grant dalam transaksi/proses yang recoverable | P0 |
| COM-007 | Refund/revoke hanya memengaruhi grant dari source tersebut | P0 |
| COM-008 | Pending payment tidak membuka protected capability | P0 |
| COM-009 | Checkout handoff membawa return URL dan correlation ID aman | P0 |
| COM-010 | Unknown SKU/user/state masuk reconciliation queue | P0 |

### 8.6 Entitlement

| ID | Requirement | Prioritas |
|---|---|---|
| ENT-001 | Grant mendukung purchase, bundle, upgrade, scholarship, promo, manual, dan migration | P0 |
| ENT-002 | Validity mendukung fixed, duration-from-purchase, first-activation, lifecycle, lifetime, dan manual | P0 |
| ENT-003 | Resolver menggabungkan grant secara union dan mengembalikan explanation | P0 |
| ENT-004 | Revocation satu grant tidak menutup access yang didukung grant lain | P0 |
| ENT-005 | Attempt allowance dinilai terpisah dari content visibility | P0 |
| ENT-006 | Projection dapat dibangun ulang dari source records | P0 |
| ENT-007 | Manual action memerlukan actor, reason, dan before/after | P0 |

### 8.7 Question bank dan import

| ID | Requirement | Prioritas |
|---|---|---|
| QST-001 | Question memiliki immutable version dan stable question identity | P0 |
| QST-002 | Stimulus/passage reusable dan berversi | P0 |
| QST-003 | Soal mendukung stem/option/explanation image, formula, dan alt metadata | P0 |
| QST-004 | Workflow: draft → in review → approved → published → archived | P0 |
| QST-005 | Import menerima XLSX multi-sheet dan ZIP media | P0 |
| QST-006 | Validation menghasilkan row-level error/warning yang dapat diekspor | P0 |
| QST-007 | Import re-run idempotent berdasarkan import ID dan question code policy | P0 |
| QST-008 | Moderator melihat student preview mobile sebelum approval | P0 |
| QST-009 | Perubahan soal yang sudah dipakai menghasilkan version baru | P0 |
| QST-010 | Tidak ada kunci/bobot sensitif pada payload siswa sebelum review release | P0 |

### 8.8 Blueprint, form, dan batch

| ID | Requirement | Prioritas |
|---|---|---|
| EXM-001 | Exam family, blueprint version, exam form, dan batch dipisahkan | P0 |
| EXM-002 | Blueprint menyimpan sections, question types, timer, navigation, scoring, interpretation, dan result policy | P0 |
| EXM-003 | Exam form immutable setelah batch menerima attempt | P0 |
| EXM-004 | Batch memiliki sale/visibility, attempt, result, leaderboard, review, dan access windows terpisah | P0 |
| EXM-005 | SKD Kedinasan blueprint lulus regulatory review dan fixtures sebelum produksi | P0 |
| EXM-006 | Family selain SKD tidak aktif hanya karena schema mendukungnya | P0 |

### 8.9 Attempt dan exam runner

| ID | Requirement | Prioritas |
|---|---|---|
| ATM-001 | User dapat memiliki lebih dari satu attempt sesuai policy | P0 |
| ATM-002 | Start attempt idempotent dan mengikat blueprint/form/policy snapshots | P0 |
| ATM-003 | Deadline dihitung server dan tidak reset saat reload | P0 |
| ATM-004 | Jawaban memakai monotonic revision/sequence dan autosave idempotent | P0 |
| ATM-005 | Client dapat queue jawaban saat offline dan sync kembali | P0 |
| ATM-006 | Resume mengembalikan state server-authoritative dan conflict information | P0 |
| ATM-007 | Submit idempotent; scoring berjalan dari snapshot final yang diaudit | P0 |
| ATM-008 | Time expiry menghasilkan controlled auto-submit | P0 |
| ATM-009 | Visibility telemetry pasif, tidak menjadi verdict cheating otomatis | P0 |
| ATM-010 | Accommodation/extension membutuhkan permission, reason, dan audit | P1 |

### 8.10 Scoring, result, dan correction

| ID | Requirement | Prioritas |
|---|---|---|
| SCR-001 | Scoring policy berversi dan attached ke attempt | P0 |
| SCR-002 | Scoring engine bersifat deterministic dan fixture-tested | P0 |
| SCR-003 | Result memakai enam state kanonik: processing, provisional, final, corrected, withheld, dan voided; kegagalan worker adalah job/error state | P0 |
| SCR-004 | SKD mendukung binary cognitive score dan weighted situational option | P0 |
| SCR-005 | Threshold/category tidak di-hardcode ke UI atau source umum | P0 |
| SCR-006 | Correction mempertahankan result lama, cause, approver, dan affected scope | P0 |
| SCR-007 | Hasil simulasi nonresmi diberi label estimasi | P0 |
| SCR-008 | Ranking snapshot tidak menanam nama pengguna sebagai data immutable | P1 |

### 8.11 Admin, audit, dan support

| ID | Requirement | Prioritas |
|---|---|---|
| ADM-001 | Semua builder memisahkan draft, validation, dan publish | P0 |
| ADM-002 | Aksi sensitif dicatat pada append-oriented audit log | P0 |
| ADM-003 | Support dapat mensimulasikan dampak revoke/expiry sebelum commit | P0 |
| ADM-004 | Tidak ada UI admin generik untuk edit row database | P0 |
| ADM-005 | Live Ops read-mostly; answer tidak dapat diedit | P0 |
| ADM-006 | Correction dan perubahan massal memerlukan peer approval | P1 |

### 8.12 Notification dan analytics

| ID | Requirement | Prioritas |
|---|---|---|
| NTF-001 | Preference dipisahkan per kanal dan kategori | P0 |
| NTF-002 | Notifikasi operasional tidak ikut mati saat promosi dimatikan | P0 |
| NTF-003 | Delivery idempotent dan menyimpan template version/status | P0 |
| ANL-001 | Event catalog berversi dan tidak menyimpan jawaban atau token | P0 |
| ANL-002 | Core funnel dapat dihitung tanpa menggabungkan PII ke event mentah | P0 |

## 9. Non-functional requirements

### Reliability

- Tidak ada acknowledged answer yang hilang.
- Attempt start, autosave, submit, webhook, scoring, grant, dan notification memakai idempotency.
- Projection dapat dibangun ulang dari source records.
- Degraded component tidak memblokir seluruh app jika tidak kritis.

### Performance targets awal

| Area | Target p95 awal | Catatan |
|---|---:|---|
| Student read API | < 500 ms | Di region utama, cache hit/miss normal |
| Access decision | < 150 ms | Projection/cache; explanation tersedia |
| Answer save | < 350 ms | Server acknowledge, tidak termasuk jaringan client |
| Start/resume attempt | < 800 ms | Tidak termasuk download seluruh media |
| Submit acknowledgement | < 1 s | Scoring dapat async bila dijelaskan |
| Admin search | < 1.5 s | Dataset MVP dan filter wajar |

Target ini SLO design, bukan klaim kapasitas sebelum load test.

### Capacity hypothesis

- Baseline MVP: 5.000 monthly active learners.
- Event load test: 1.000 concurrent active attempts.
- Design headroom: 3.000 concurrent attempts tanpa redesign domain.
- Angka final mengikuti traffic dan jadwal batch nyata.

### Security dan privacy

- TLS, secure cookies, CSRF defense, rate limit, input validation, least privilege.
- Secrets tidak tersimpan di client atau repository.
- Kunci jawaban/bobot tidak keluar sebelum policy rilis.
- PII dipisahkan dari analytic payload sejauh praktis.
- Audit log untuk akses data sensitif dan perubahan hak.

### Accessibility

- Target WCAG 2.2 AA untuk flow P0.
- Keyboard, focus, screen reader labels, 44px touch targets, reduced motion.
- Exam runner diuji pada zoom dan pembaca layar.

### Observability

- Structured logs dengan correlation ID.
- Metrics: access sync, webhook lag, answer save, submit, scoring, import, notification.
- Trace sampling untuk hot path.
- Alert memiliki owner dan runbook.

## 10. Data retention awal

| Data | Retensi awal | Catatan |
|---|---|---|
| Purchase dan access audit | Sesuai kebutuhan legal/finance; minimum 5 tahun sebagai hipotesis | `OQ-RET-01` perlu review hukum |
| Attempt, answer, result | Minimum 2 tahun | History belajar dan dispute |
| Raw webhook | 180 hari aktif + archive | Redact secret/irrelevant PII |
| App audit log | Minimum 2 tahun | Sensitif, akses terbatas |
| Notification delivery | 180 hari | Content snapshot terbatas |
| Session/device | 90 hari setelah berakhir | Security review |
| Import files | 30–90 hari setelah import | Question provenance disimpan permanen |

## 11. Metrics dan success criteria

### Activation

- Paid-to-access activation rate.
- Time from payment settled to active access.
- Onboarding completion.
- First meaningful action within 24 hours.

### Learning

- Next-action click-to-start.
- Required resource completion.
- Live class join rate.
- Tryout start-to-submit rate.
- Remediation start after result.

### Reliability

- Access mismatch rate.
- Answer-save error rate.
- Forced support intervention rate.
- Scoring correction rate.
- Import validation failure by cause.

### Guardrails

- Notification opt-out/complaint.
- Duplicate purchase incidence.
- Refund caused by access confusion.
- Support complaints related to lost answers.

## 12. Release gates

### Gate A — Access

- Synthetic paid/refund/replay fixtures pass.
- Reconciliation queue and manual recovery work.
- One source revoked while another remains is tested.

### Gate B — Learning

- Program, roadmap, resource, schedule, and recording mobile UAT pass.
- Progress rebuild returns expected result.

### Gate C — SKD

- Academic owner signs blueprint version.
- Scoring fixtures and correction test pass.
- Offline/resume/time-expiry E2E pass.
- Load test and incident drill pass.

### Gate D — Commerce/launch

- Branded checkout return flow works.
- Flash-sale timeline is validated.
- Support and monitoring runbook ready.

## 13. Dependencies

- Access to WordPress/Sejoli staging and representative order payload.
- Stable external product/user/order identifiers.
- Agreement on identity bridge mechanism.
- Provider links/APIs for video/live/recording.
- Object storage/CDN.
- Academic approval for SKD blueprint and fixtures.
- WA/email provider credentials and approved templates.

## 14. Risks

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Sejoli tidak memberi event/signature cukup | Access terlambat/salah | WP bridge plugin + reconciliation poll/spike |
| Email menjadi identity key | Akun salah gabung | Stable external ID + manual conflict queue |
| Blueprint berubah | Hasil historis rusak | Version snapshots immutable |
| Offline sync conflict | Jawaban salah | Sequence/revision, server ack, deterministic merge policy |
| Admin melewati review | Salah kunci massal | Permission, validation, moderation gate |
| Scope multi-exam melebar | Rilis terlambat | SKD production gate; family lain disabled |
| Flash-sale overload | Exam terganggu | Pisahkan sale dan exam windows; load test hot path |

## 15. Open questions

| ID | Keputusan | Default draft |
|---|---|---|
| OQ-PRG-01 | Program utama manual atau otomatis | Otomatis + user override |
| OQ-LRN-01 | Resource dapat diunduh/offline | Per-resource; default tidak untuk video |
| OQ-EXM-01 | Pembahasan sebelum batch selesai | Tidak; configurable setelah exam window |
| OQ-SUP-01 | Kanal support utama | In-app case + WhatsApp escalation |
| OQ-IDN-01 | Bridge SSO final | Signed one-time token via WP bridge |
| OQ-HST-01 | Database managed provider | Supabase Postgres provisional |
| OQ-RET-01 | Retention legal final | Review legal sebelum produksi |

## 16. MVP definition of done

### Audit resolution RC2

- Result state kanonik: `processing`, `provisional`, `final`, `corrected`, `withheld`, `voided`.
- Ranked MVP memakai immutable fixed form, tidak memiliki question pool, dan rilis hasil/ranking memerlukan human review.
- TPA/TBI masuk sebagai track materi/live/rekaman/progres; engine ujian TPA/TBI belum production-active.
- Consent anak/wali, DSR, notification opt-in, retensi, serta incident notification harus memiliki struktur data sebelum build; kebijakan hukum final adalah release gate.
- Jalur commerce tidak boleh production-active sebelum payload/signature/retry Sejoli dan mekanisme bridge WordPress dibuktikan di staging.

MVP selesai jika seorang siswa dapat membeli Kelas Akselerasi/TO SKD melalui Sejoli, memperoleh akses benar, melihat next action, mengikuti materi/live class, mengerjakan tryout dengan aman di mobile, melihat hasil yang akurat, dan melanjutkan ke rekomendasi; sementara support dapat menjelaskan serta memulihkan akses/attempt melalui workflow terkontrol tanpa edit database langsung.
