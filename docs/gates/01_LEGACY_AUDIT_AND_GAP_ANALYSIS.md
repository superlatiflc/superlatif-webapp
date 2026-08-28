# Audit Legacy dan Analisis Gap

**Versi:** 1.0-RC2 — audit-resolved baseline  
**Tanggal audit:** 28 Agustus 2026  
**Scope:** Paket arsitektur Juni 2026, instruksi brand saat ini, dan company deck Maret 2026

## 1. Kesimpulan eksekutif

Paket Juni 2026 berisi pemikiran yang kuat tentang reliability ujian, security, integrasi Sejoli, QC soal, dan operasional hari-H. Namun paket tersebut tidak aman jika langsung diimplementasikan sebagai hasil freeze karena bentuk produknya sudah berubah secara material.

Paket lama memodelkan Superlatif terutama sebagai sistem tryout dengan LMS kecil. Arah terbaru adalah platform pembelajaran program-centric yang harus menangani program lengkap, paket spesialis, live class, modul, rekaman, tryout satuan per batch, Tryout Pass, beasiswa, upgrade, dan beberapa produk aktif per siswa.

Perlakuan yang tepat:

- simpan file lama tanpa perubahan sebagai arsip keputusan;
- tarik status `implementation-ready` dan SSOT globalnya;
- pertahankan prinsip exam dan integrasi yang sudah kuat;
- bangun ulang domain produk, entitlement, program, konten, batch, dan admin sebelum kontrak teknis ditulis ulang.

## 2. Bagian yang tetap bernilai

| Area | Keputusan bernilai | Perlakuan |
|---|---|---|
| Kontinuitas commerce | Pertahankan WordPress dan Sejoli agar checkout, kupon, affiliate, dan payment tidak dibangun ulang terlalu dini | Pertahankan |
| Identity bridge | Hindari registrasi kedua dan provision akses dari event commerce | Pertahankan niatnya; metode teknis perlu diverifikasi |
| Keamanan webhook | Proses event idempotent dan reconciliation | Pertahankan |
| Reliability ujian | Server-authoritative timer, autosave, resume, audit trail, tampilan deterministik | Pertahankan niatnya; kontrak perlu diaudit ulang |
| Keamanan jawaban | Whitelist serializer; kunci dan bobot TKP tidak keluar sebelum pembahasan dibuka | Pertahankan |
| Realitas mobile | Offline-aware, lite mode, dan exam runner mobile-first | Pertahankan |
| QC soal | Draft-review-publish, laporan soal, dan item analysis | Pertahankan dan perluas |
| Bacaan bersama | Stimulus dipisahkan dari soal | Pertahankan |
| Psikometri yang jujur | Jangan menyebut statistik soal klasik sebagai IRT | Pertahankan |
| Operasional hari-H | Live stats, retake, perpanjangan waktu, dan incident tools yang diaudit | Pertahankan |
| Privasi | Nama tidak ditanam di immutable ranking snapshot | Pertahankan prinsip |
| Fokus | Kedinasan/SKD sebagai family ujian pertama yang production-ready | Pertahankan |

## 3. Gap kritis terhadap arah produk baru

| Severity | Gap | Mengapa menghambat implementasi |
|---|---|---|
| Critical | Tidak ada domain `program` dan `track` | Kelas Akselerasi tidak bisa direpresentasikan sebagai satu perjalanan belajar |
| Critical | Subscription level paket terlalu kasar | Satu pembelian dapat memberi banyak track, exam, live class, rekaman, dan komunitas dengan kebijakan berbeda |
| Critical | Product, offer, batch, dan exam form tercampur | Waktu jual, waktu ujian, scoring, dan akses tidak dapat berubah independen |
| Critical | `UNIQUE(user,event)` hanya mengizinkan satu sesi | Retake, practice attempt, dan grant attempt tambahan tidak dapat berjalan benar |
| Critical | Exam family hanya tiga enum | CPNS SKD, Kedinasan SKD, PPPK, TKA, SNBT, TPA/TBI, dan ujian mandiri butuh blueprint berversi |
| High | Tidak ada live-class dan schedule model | Dashboard tidak bisa menjawab "apa jadwal terdekat?" |
| High | LMS hanya course dan lesson video/artikel | Tidak ada program, roadmap, PDF, rekaman, external link, announcement, dan komunitas |
| High | Tidak ada import job dan asset model | XLSX + ZIP gambar, validasi, preview, retry, dan audit tidak dapat dimodelkan dengan baik |
| High | Status entitlement tidak lengkap | Pending, beasiswa, lifetime, refund, upgrade, suspension, dan sumber tumpang tindih tidak terwakili |
| High | Satu `sejoli_product_id` per package | SKU legacy, campaign variant, upsell, dan beberapa ID produk tidak dapat dipetakan rapi |
| High | Tidak ada offer dan sale window | Flash sale akan di-hardcode ke event atau Sejoli |
| High | API tidak memiliki program, katalog, jadwal, konten, import, dan entitlement manager | Pengalaman produk baru tidak dapat dibangun dari frozen API |
| Medium | Gamifikasi mendahului validasi | Energy dan anti-skip dapat bertentangan dengan produk belajar yang tenang dan berbasis kepercayaan |
| Medium | Direct Duitku terlalu dini | Menambah scope payment tanpa bukti bahwa Sejoli menghambat |

## 4. Penilaian per file

### 4.1 `00_README_Architecture_Freeze.md`

**Kekuatan**

- Traceability matrix jelas.
- Konflik dicatat dan diselesaikan eksplisit.
- Kultur dokumentasi risiko dan invariant sangat baik.

**Masalah**

- Mengklaim `implementation-ready` sebelum arah produk terbaru muncul.
- Menempatkan database code di atas PRD sebagai otoritas.
- Konsistensi hanya diuji di dalam dokumen lama, bukan terhadap kebutuhan produk sekarang.

**Keputusan:** Diganti sebagai master document; tetap disimpan sebagai bukti audit.

### 4.2 `01_PRD_v5.0.md`

**Kekuatan**

- Fokus pada reliability SKD dan hasil.
- Sejoli bridge, analytics, QC soal, dan live-ops dipikirkan dengan baik.
- Menolak klaim IRT prematur.

**Masalah**

- Positioning "CBT & diagnostic analytics" mengecilkan visi mindset-first dan program journey.
- Dashboard, program hub, roadmap, jadwal, live class, rekaman, dan multi-product tidak ada.
- LMS diposisikan sebagai fitur belakangan, bukan surface inti program.
- SDR AI PDF menjadi P0 sebelum pengalaman program dasar terbukti.
- `Anti-skip` menyamakan waktu tonton dengan belajar dan berpotensi menghukum perilaku wajar.
- Direct Duitku memperbesar MVP walau Sejoli dipertahankan.
- Aktivasi tipe soal TKA/SNBT belum selaras dengan diskusi multi-product terbaru.

**Keputusan:** Tulis ulang PRD setelah Gate 1 dan Gate 2.

### 4.3 `02_ERD_v3.1.md`

**Kekuatan**

- Pemisahan stimulus, soal, sesi, hasil, dan audit sudah baik.
- Rationale denormalisasi dan access control dijelaskan.
- Idempotensi webhook dan QC soal tercakup.

**Masalah**

- Tidak ada relasi product-offer-program-component-access.
- Tidak ada program, track, roadmap, schedule, live session, attendance, recording, community, announcement, atau asset.
- Tidak ada import job, validation row, import error, dan media asset.
- `packages -> user_subscriptions` tidak dapat menjelaskan grant granular atau sumber akses tumpang tindih.
- Tidak ada pemisahan blueprint, form, dan batch.
- Attempt policy dan beberapa sesi per event tidak tersedia.

**Keputusan:** Jangan membuat migration atau kode dari ERD ini. Bangun ulang di Gate 3.

### 4.4 `03_TDD_v3.1.md`

**Kekuatan**

- Hot path, connection pooling, observability, incident handling, dan load testing dibahas serius.
- Pemisahan route umum dan path ujian khusus masuk akal.
- Security dan recovery mindset kuat.

**Masalah**

- Stack dan vendor dibekukan sebelum domain dan kapasitas tim disetujui.
- Beberapa komponen operasional mungkin terlalu dini untuk MVP.
- Tidak ada arsitektur content scheduling, access resolution, catalogue projection, import processing, media lifecycle, atau live class.
- Detail SSO mengasumsikan kemampuan WordPress/Sejoli yang harus dibuktikan lewat spike.

**Keputusan:** Simpan sebagai technical research; tulis ulang setelah domain disetujui.

### 4.5 `04_Exam_Engine_Contract_v1.3.md`

**Kekuatan**

- Non-negotiable dan test invariant jelas.
- Offline queue, idempotensi, keamanan kunci, resume, dan correction workflow dipikirkan baik.
- Tidak menghukum siswa hanya karena aplikasi masuk background.

**Masalah yang perlu diaudit**

- Pilihan MD5/Mulberry32 dibekukan seolah requirement produk; requirement sebenarnya adalah determinisme.
- Client-timestamp LWW dan stale-device flush membuka kompleksitas konflik dan manipulasi.
- Grace window dan pola H+1 seharusnya configurable.
- Belum mencakup attempt policy, practice/ranked attempts, pause, accommodation, dan keputusan proctor.
- `UNIQUE(user,event)` bertentangan dengan retake di bagian lain.

**Keputusan:** Pertahankan sebagai input Exam Contract v2; audit security dan domain wajib.

### 4.6 `05_openapi_v1.yaml`

**Kekuatan**

- Versioning dan payload type eksplisit.
- Mencakup lifecycle sesi, hasil, laporan soal, dan live-ops dasar.

**Masalah**

- Tidak ada home, my programs, catalogue, offer, purchase status, schedule, roadmap, content, live session, recording, notification preference, atau community endpoint.
- Tidak ada product builder, program builder, entitlement manager, batch manager, question import, media upload, dan moderation endpoint.
- `TryoutEvent` mencampur konsep dan menggunakan exam enum sempit.
- Payment API mengasumsikan Duitku native masuk scope.

**Keputusan:** Diganti di Gate 3.

### 4.7 `06_drizzle_schema.ts`

**Kekuatan**

- Type dan constraint konkret membuat asumsi tersembunyi terlihat.
- Sejumlah kontrol integritas ujian terdokumentasi baik.

**Masalah schema yang memblokir**

- `package_type = TRYOUT|LMS|BUNDLE` terlalu kasar.
- `packages.sejoli_product_id` mengasumsikan mapping satu-ke-satu.
- `duration_days NOT NULL` tidak dapat mewakili fixed-date, lifetime, first-use, atau manual validity.
- `subscription_status = ACTIVE|EXPIRED|REVOKED` tidak mencakup scheduled, pending, suspended, dan merged-source.
- `user_subscriptions` menunjuk paket, bukan resource claim.
- `courses.subject_id NOT NULL` memaksa semua konten menjadi subject-based.
- Lesson hanya video atau artikel.
- Tidak ada inventory media asset walau gambar disimpan dalam JSON.
- `exam_type = SKD|UTBK|MANDIRI` tidak cukup.
- `scoring_model` event-wide, padahal section dan tipe soal dapat membutuhkan policy berbeda.
- Satu user hanya dapat memiliki satu sesi per tryout event.
- Tidak ada sale window, offer version, quota, waitlist, atau purchase projection.

**Keputusan:** Tidak lagi menjadi SSOT global. Hanya bagian terpilih yang boleh direuse setelah redesign.

### 4.8 `07_ADRs.md`

| ADR | Perlakuan saat ini |
|---|---|
| 001 Sejoli dan identity bridge | Pertahankan arah; revisi model akses dan verifikasi mekanisme SSO |
| 002 Webhook idempotency | Pertahankan |
| 003 Passive visibility telemetry | Pertahankan |
| 004 Whitelist question serializer | Pertahankan |
| 005 Polymorphic question answers | Pertahankan arah; ubah kebijakan aktivasi MVP |
| 006 Tanpa klaim IRT prematur | Pertahankan |
| 007 Deterministic option shuffling | Pertahankan tujuan; algoritma belum difreeze |
| 008 Shared stimuli | Pertahankan |
| 009 Question revision | Pertahankan dan perluas ke asset/import provenance |
| 010 Question QC | Pertahankan dan perluas untuk XLSX/ZIP |
| 011 Diagnostic results | Pertahankan; prioritas SDR AI PDF dievaluasi ulang |
| 012 B2B insurance | Tunda; jangan mempersulit authorization MVP |
| 013 Gamification table | Tunda; desain ulang dengan ethical habit principles |
| 014 Privacy-safe ranking | Pertahankan prinsip |
| 015 Battle engine | Tunda; bukan bagian Gate 1 sekarang |
| 016 No early partitioning | Pertahankan kecuali data load membuktikan sebaliknya |
| 017 Dedicated hot-path container | Evaluasi setelah load model dan hosting dipilih |
| 018 SKD focus dan target skala | Pertahankan fokus SKD; validasi kembali angka concurrency |

## 5. Audit sumber brand

Instruksi brand dan deck Maret selaras dalam hal:

- mindset sebelum tools;
- purpose, excellence, resilience, integrity, dan empowerment;
- jalur akademik, profesional, dan entrepreneur;
- misi yang lebih luas daripada kelulusan ujian.

Klaim deck berikut tidak boleh diulang di PRD, sales copy, atau investor material tanpa sumber dan metodologi:

- hanya `<2%` siswa masuk PTN/Kedinasan elite;
- `80%` perusahaan besar mengeluhkan krisis SDM;
- "pertama di Indonesia" sebagai ekosistem edukasi dan karier mindset-first.

Dokumen produk dapat mempertahankan narasi masalah tanpa memakai angka tersebut, atau memberi label sebagai hipotesis.

## 6. Domain konseptual baru yang dibutuhkan

| Domain | Konsep minimum |
|---|---|
| Commerce projection | Product, offer, external SKU mapping, sale window, purchase status |
| Struktur belajar | Program, track, roadmap stage, module, resource, prerequisite |
| Live learning | Schedule item, live session, attendance, recording, cancellation, timezone |
| Akses | Access policy, access grant, grant claim, effective access, source, expiry, revocation |
| Konfigurasi ujian | Exam family, blueprint version, exam form, batch, section, scoring policy, attempt policy |
| Operasional konten | Question bank, passage, asset, import job, import row, validation issue, moderation |
| Pengalaman siswa | Home projection, next action, progress, activity feed, multi-program ownership |
| Notifikasi | Trigger, channel, preference, template version, delivery log |

## 7. Cara memigrasikan ide, bukan menyalin file

1. Simpan folder legacy sebagai read-only historical material.
2. Setujui bahasa produk dan aturan akses Gate 1.
3. Desain UX Gate 2 berdasarkan program dan next action.
4. Tulis PRD baru tanpa menyalin urutan modul lama.
5. Tulis kontrak entitlement dan exam domain sebelum ERD baru.
6. Evaluasi setiap ADR lama sebagai `retained`, `revised`, `superseded`, atau `deferred`.
7. Hasilkan ERD, OpenAPI, dan schema baru dari aturan domain yang sudah disetujui.
8. Jalankan audit konsistensi lintas dokumen sebelum menyebutnya implementation-ready.

## 8. Putusan audit Gate 1

Paket Juni adalah technical prototype yang kuat, bukan arsitektur final Superlatif Web App. Sekitar separuh prinsip exam dan operasionalnya dapat dipakai kembali; model produk, entitlement, program, katalog, dan batch harus dirancang ulang sebelum coding.
