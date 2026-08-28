# Superlatif Web App - Peta Induk Dokumentasi

**Paket:** Gate 1–3 — Source of Truth Superlatif Web App  
**Versi:** 1.0-RC2 — audit-resolved candidate  
**Tanggal:** 28 Agustus 2026  
**Pemilik:** PT Superlatif Juara Indonesia  
**Arah produk:** Web app pembelajaran program-centric dengan commerce terintegrasi

## 1. Tujuan paket ini

Paket ini menetapkan ulang fondasi produk sebelum desain UI dan engineering dimulai. Arah Superlatif diubah dari "TO System" yang berpusat pada fitur menjadi platform pembelajaran berpusat pada program yang mampu mendukung:

- program lengkap seperti Kelas Akselerasi Kedinasan 2026;
- paket spesialis seperti SKD-only atau TKA-only;
- Tryout Pass dan tryout satuan per batch;
- live class, rekaman, modul, jadwal, dan komunitas;
- beberapa produk yang dimiliki satu siswa secara bersamaan;
- WordPress dan Sejoli sebagai mesin commerce pada rilis awal;
- satu core exam engine dengan aturan berversi untuk jenis ujian yang berbeda.

Paket ini adalah baseline produk, UX, dan technical contract setelah audit Claude Gate 1–3 serta remediasi RC2. Gate 4 planning boleh dimulai. Implementasi produksi pada jalur commerce dan aktivasi ranked exam tetap tertahan oleh external production gates pada §8. Artefak teknis Juni 2026 tetap menjadi referensi sejarah dan tidak boleh memandu implementasi baru.

## 2. Sumber yang diaudit

| Sumber | Tanggal/versi | Pemakaian | Perlakuan |
|---|---|---|---|
| `Instruksi superlatif.txt` | Instruksi proyek saat ini | Positioning, framework, audiens, tone | Otoritatif untuk arah brand |
| `Deck Compro Superlatif (Mar 2026).pdf` | Maret 2026 | Brand essence, movement, values, pathways | Dipakai selektif; klaim angka tanpa sumber ditandai |
| `00_README_Architecture_Freeze.md` | 10 Juni 2026 | Traceability dan keputusan teknis lama | Referensi legacy; status freeze ditarik |
| `01_PRD_v5.0.md` | 10 Juni 2026 | CBT, SDR, Sejoli bridge, fokus MVP | Sebagian dipertahankan; scope diubah signifikan |
| `02_ERD_v3.1.md` | 10 Juni 2026 | Model data lama | Bukan baseline implementasi |
| `03_TDD_v3.1.md` | 10 Juni 2026 | Infrastruktur dan reliability | Dievaluasi ulang di Gate 3 |
| `04_Exam_Engine_Contract_v1.3.md` | 10 Juni 2026 | Prinsip integritas ujian | Draft bernilai; perlu audit domain dan security |
| `05_openapi_v1.yaml` | 10 Juni 2026 | API lama | Tidak lengkap untuk arah produk baru |
| `06_drizzle_schema.ts` | 10 Juni 2026 | SSOT schema lama | Tidak lagi menjadi SSOT global |
| `07_ADRs.md` | 10 Juni 2026 | Alasan keputusan | Setiap ADR harus dinyatakan dipertahankan, direvisi, ditunda, atau diganti |
| Diskusi produk sampai 27 Agustus 2026 | Saat ini | UX program-centric, bundle, flash sale, multi-exam, import soal | Keputusan kerja terbaru |

## 3. Dokumen Gate 1

| No. | File | Status | Keputusan yang dibahas |
|---:|---|---|---|
| 00 | `00_MASTER_README.md` | Approved baseline RC | Peta dokumen dan aturan source of truth |
| 01 | `01_LEGACY_AUDIT_AND_GAP_ANALYSIS.md` | Approved baseline RC | Bagian paket Juni yang dapat dan tidak dapat dipakai |
| 02 | `02_PRODUCT_BRIEF.md` | Approved baseline RC | Visi, outcome, pengguna, konteks bisnis, metrik |
| 02A | `02A_MARKETING_EVIDENCE_REGISTER.md` | Evidence register | Klaim numerik, komparatif, dan superlatif yang memerlukan bukti |
| 03 | `03_PRODUCT_PRINCIPLES_AND_SCOPE.md` | Approved baseline RC | Prinsip produk, MVP, non-goals, release gate |
| 04 | `04_USER_RESEARCH_PERSONAS_JTBD.md` | Baseline hipotesis | Persona, JTBD, masalah, dan kebutuhan riset |
| 05 | `05_PRODUCT_CATALOG_AND_ENTITLEMENT.md` | Implementation baseline RC | Produk, offer, program, komponen, access grant, stacking |
| 05A | `05A_LEGACY_PRODUCT_PROMISE_REGISTER.md` | Evidence register | Janji produk legacy yang harus dibuktikan dan dipenuhi |
| 15A | `Gate 3/15A_QUESTION_IMPORT_TEMPLATE_CONTRACT.md` | Implementation baseline RC | Kontrak XLSX, media ZIP, formula, numeric, dan matrix |
| A12 | `AUDIT_GATE_1_2_FINDINGS.md` | Input audit read-only | Temuan audit awal Gate 1–2 |
| A3 | `AUDIT_GATE_3_FINDINGS.md` | Input audit read-only | Temuan audit awal Gate 3 |
| AR | `AUDIT_RESOLUTION_REGISTER.md` | Audit trail | Disposisi temuan Claude dan keputusan yang diadopsi |
| FV | `FINAL_RC1_VERIFICATION.md` | Input audit read-only | Verifikasi independen atas paket RC1 |
| CR | `RC2_AUDIT_CLOSURE_REPORT.md` | Closure evidence | Penutupan N-01–N-20, validasi RC2, dan keputusan Gate 4 planning |

## 4. Keputusan kerja yang digunakan

Keputusan berikut menjadi baseline kecuali Fadhli mengubahnya ketika review.

| ID | Keputusan |
|---|---|
| PF-001 | Pengalaman siswa bersifat program-centric. Tryout, materi, rekaman, dan live class berada di dalam konteks program. |
| PF-002 | WordPress tetap menjadi website publik, landing page, SEO, checkout, kupon, affiliate, dan payment layer pada MVP. |
| PF-003 | Sejoli tetap menjadi sistem commerce utama pada MVP. Web app memiliki ledger hak akses pembelajaran yang sudah direkonsiliasi. |
| PF-004 | Setelah migrasi, WordPress Member Area tidak lagi menjadi dashboard belajar utama siswa. |
| PF-005 | Produk yang dijual dipisahkan dari resource yang diberikan. Konten dibuat sekali lalu digunakan melalui kebijakan akses. |
| PF-006 | Offer flash sale, batch tryout, exam form, dan exam blueprint adalah objek berbeda dengan lifecycle berbeda. |
| PF-007 | Satu core exam engine mendukung banyak blueprint berversi; scoring dan timer tidak di-hardcode secara global. |
| PF-008 | Kedinasan/SKD menjadi fokus MVP yang production-ready. Family lain baru diaktifkan setelah blueprint-nya lulus QA. |
| PF-009 | Admin soal mendukung editor manual serta bulk import XLSX + ZIP gambar dengan validasi dan review. |
| PF-010 | Gamifikasi dibuat halus. Progres, streak, dan reminder membantu momentum tanpa mendominasi pengalaman. |
| PF-011 | Urgency dan scarcity wajib benar. Waktu promo dan kuota hanya ditampilkan jika sungguh diberlakukan. |
| PF-012 | Grant yang habis atau di-refund tidak boleh menghapus akses yang masih diperoleh siswa dari sumber aktif lain. |
| PF-013 | Ranked exam memakai immutable form; tidak memakai pool randomization pada MVP. Urutan opsi hanya boleh diacak jika blueprint menyatakannya aman dan urutan tersimpan. |
| PF-014 | Form tidak boleh dipakai pada batch baru setelah pembahasan atau kunci form itu dirilis. |
| PF-015 | Practice attempt ditunda; MVP hanya ranked attempt dengan aturan ranking milik batch. |
| PF-016 | Leaderboard memakai display name aman dan opt-in; hasil historis serta snapshot ranking tetap disimpan setelah refund, sedangkan akses pembahasan mengikuti grant. |
| PF-017 | Post-expiry dikonfigurasi per produk; default mempertahankan riwayat dan hasil dalam read-only tanpa membuka konten berhak akses. |
| PF-018 | Akun gratis menerima ecosystem grant yang hanya membuka resource eksplisit, bukan seluruh program berbayar. |
| PF-019 | Materi, live class, rekaman, dan progres TPA/TBI dapat hadir pada MVP; exam TPA/TBI baru diaktifkan setelah blueprint/scoring gate lulus. |
| PF-020 | Jawaban yang tiba maksimal 30 detik setelah deadline disimpan sebagai recovery candidate, tidak otomatis dinilai, dan memerlukan adjudikasi terkontrol. |
| PF-021 | Siswa di bawah 18 tahun mempunyai status consent wali yang tercatat; kebijakan final tetap memerlukan review hukum Indonesia sebelum produksi. |

## 5. Hierarki source of truth

Hierarki lama menempatkan Drizzle schema di atas PRD. Itu tidak aman selama keputusan produk masih berubah. Hierarki baru:

1. Keputusan bisnis dan produk yang sudah disetujui.
2. Kontrak domain yang sudah disetujui, terutama entitlement dan exam contract.
3. User flow dan screen specification yang sudah disetujui.
4. PRD dan acceptance criteria yang sudah disetujui.
5. ADR yang merekam pilihan teknis.
6. ERD dan data dictionary.
7. OpenAPI dan schema machine-readable.
8. Database migration dan kode implementasi.

Jika lapisan bawah bertentangan dengan lapisan di atasnya, implementasi dihentikan sampai konflik diselesaikan secara eksplisit. Kode tidak boleh diam-diam menjadi definisi produk.

## 6. Status dokumen

| Status | Arti |
|---|---|
| Working draft | Isi masih dapat berubah secara material. |
| Draft untuk keputusan | Cukup lengkap untuk review founder; keputusan terbuka ditampilkan. |
| Approved baseline | Keputusan produk diterima dan boleh menjadi dasar tahap berikutnya. |
| Implementation contract | Spesifikasi dapat diuji mesin; perubahan memerlukan versioning dan ADR. |
| Superseded | Hanya arsip sejarah; tidak boleh memandu implementasi baru. |

`1.0-RC2` berarti seluruh temuan internal dari verifikasi RC1 telah ditriase dan ditutup dengan perubahan dokumen, artefak, atau keputusan eksplisit. External spike, review hukum, aturan resmi, dan production activation gate belum selesai. Label `Final` hanya diberikan setelah seluruh hard gate yang relevan ditutup.

## 7. Keputusan dan status konfirmasi

| ID | Pertanyaan | Rekomendasi default di draft ini |
|---|---|---|
| OQ-001 | Apakah tipe soal kompleks TKA wajib rilis di produksi pertama? | Diputuskan: tidak. Schema/import disiapkan, activation gate tetap tertutup. |
| OQ-002 | Berapa masa berlaku setiap produk Sejoli yang masih aktif? | Diatur per offer; jangan memakai satu durasi universal. |
| OQ-003 | Apakah siswa dapat membeli dari dalam app pada MVP? | Diputuskan: ya, melalui handoff transparan ke checkout Sejoli, bukan payment native. |
| OQ-004 | Apakah direct Duitku wajib pada MVP? | Tidak. Ditunda sampai Sejoli terbukti menjadi hambatan. |
| OQ-005 | Domain canonical app? | Diputuskan: `app.superlatif.id`. |
| OQ-006 | Apakah Kelas Akselerasi selalu mencakup seluruh track seleksi lanjutan? | Dibuat configurable; isi offer menentukan track yang benar-benar termasuk. |
| OQ-007 | Apakah tutor dapat publish langsung? | Diputuskan: tidak. Tutor submit, moderator/academic admin berbeda approve, admin menjadwalkan/publish. |
| OQ-008 | Apakah nama peserta leaderboard tampil publik secara default? | Diputuskan: tidak. Display name aman hanya tampil setelah opt-in. |
| OQ-009 | Apakah data payload/signature/retry Sejoli sudah terverifikasi? | Belum; OD-01 hard gate melalui staging spike. |
| OQ-010 | Apakah WordPress one-time bridge/SSO tersedia dan aman? | Belum; OD-02 hard gate melalui staging spike. |
| OQ-011 | Apakah aturan SKD Sekdin 2026 final tersedia? | Belum; benar tetap terbuka sampai sumber resmi terverifikasi. |
| OQ-012 | Apakah review hukum minor/consent/retention selesai? | Belum; struktur data disiapkan, production gate tetap tertutup. |

## 8. Urutan gate

### Gate 1 - Fondasi Produk

Setujui dokumen 00-05. Output wajib: model produk, scope MVP, dan keputusan terbuka yang jelas.

### Gate 2 - UX dan Desain

Buat user journeys, information architecture, edge cases, UX specification, UI brief, design system, dan screen specification. Prototype minimal:

- home siswa;
- program hub;
- jadwal;
- katalog tryout/detail batch;
- exam runner;
- hasil dan progres;
- bulk import soal admin.

### Gate 3 - Kontrak Fungsional dan Teknis

Dokumen 13–26 dan artefak machine-readable telah dibuat, diaudit, dan diremediasi pada RC2. Keputusan saat ini adalah `GO_TO_GATE_4_PLANNING`: seluruh jalur boleh diturunkan menjadi test plan dan backlog, tetapi aktivasi ranked exam tetap memerlukan OD-04/OD-08 serta review akademik/security/UAT. Jalur commerce tetap diblokir sampai OD-01 dan OD-02 memiliki bukti staging.

Gate 3 dijalankan sebagai tiga jalur yang saling ditelusuri:

1. product/entitlement/program/LMS;
2. exam/question/import;
3. commerce/identity/integration.

Perubahan pada satu jalur harus menyebut artefak turunan yang ikut berubah.

### Gate 4 - Kesiapan Build

Buat testing, UAT, roadmap, rencana eksekusi Claude Code, runbook, `CLAUDE.md`, skill domain, dan fixture. Gate 4 boleh disusun setelah RC ini diverifikasi; coding production tidak boleh dimulai sampai blocker external yang relevan tercatat sebagai closed atau accepted risk oleh pemilik.

## 9. Cara meminta Claude mereview Gate 1

Gunakan Claude sebagai auditor, bukan penulis ulang berdasarkan preferensi teknisnya sendiri.

> Audit paket Gate 1 ini untuk menemukan kontradiksi, aturan domain yang hilang, istilah ambigu, dan requirement yang tidak dapat diuji. Pertahankan arah bisnis yang sudah disetujui: pengalaman program-centric, WordPress/Sejoli untuk commerce MVP, access-grant stacking, dan fokus produksi Kedinasan/SKD. Kembalikan: (1) blocker, (2) ambiguitas berisiko tinggi, (3) usulan edit beserta file dan section, dan (4) pertanyaan yang membutuhkan keputusan founder. Jangan menciptakan harga, masa akses, passing grade, atau isi paket.

## 10. Definisi Gate 1 disetujui

Gate 1 selesai ketika:

- keputusan PF-001 sampai PF-012 disetujui atau diedit;
- setiap pertanyaan terbuka memiliki keputusan, pemilik, atau default yang diterima;
- istilah product, offer, program, resource, batch, blueprint, dan access grant tidak dipertukarkan;
- scope MVP sesuai waktu, tim, dan dominasi revenue Kedinasan;
- aturan entitlement mencakup bundle, tryout satuan, upgrade, refund, beasiswa, akses manual, expiry, dan pembelian ganda;
- tidak ada dokumen teknis yang masih mengklaim paket Juni 2026 siap implementasi tanpa revisi.
