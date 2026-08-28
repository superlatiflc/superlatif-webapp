# Prinsip Produk dan Scope

**Versi:** 1.0-RC2 — audit-resolved candidate  
**Tanggal:** 28 Agustus 2026

## 1. Prinsip produk

### P1. Mulai dari tujuan siswa, bukan daftar fitur

Layar pertama menjawab "apa yang harus saya lakukan berikutnya di program ini?" Siswa tidak dipaksa memilih antara dunia Tryout, Belajar, dan Live Class yang terpisah.

**Implikasi**

- Beranda memimpin dengan program aktif dan satu CTA utama.
- Shortcut selalu membuka resource dalam konteks program yang benar.
- Beberapa program milik siswa terlihat tanpa menggandakan konten yang sama.

### P2. Calm software membangun kepercayaan diri

Sejalan dengan filosofi software sederhana dan opinionated, interface mengurangi keputusan dan noise administratif.

**Implikasi**

- Satu primary action yang kuat per bagian.
- Progressive disclosure untuk detail lanjutan.
- Tidak ada dashboard padat berisi score, badge, promo, dan alert sekaligus.
- Error menjelaskan apa yang terjadi, apa yang tetap aman, dan apa yang dapat dilakukan siswa.

### P3. Mindset adalah perilaku produk

Mindset-first berarti mengubah kesulitan menjadi arah.

**Implikasi**

- Hasil memberi langkah perbaikan, bukan hanya lulus/tidak.
- Bahasa progres konstruktif dan spesifik.
- App tidak mempermalukan siswa karena absen atau skor rendah.
- Mentor guidance hadir pada momen penting: onboarding, setback, milestone, dan completion.

### P4. Bangun lebih sedikit, tetapi pastikan core dapat dipercaya

MVP berfokus pada learning loop terkecil yang tetap utuh:

> Mendapat akses -> tahu langkah berikutnya -> belajar/hadir -> latihan/tryout -> memahami hasil -> melanjutkan.

Checkout, affiliate, kupon, dan payment tetap di WordPress/Sejoli sampai data membuktikan perlu migrasi.

### P5. Mobile adalah lingkungan utama

Desain harus mengakomodasi thumb reach, layar kecil, interupsi, koneksi tidak stabil, dan device bersama.

**Implikasi**

- Preview mobile wajib untuk setiap resource dan soal yang akan dipublish.
- State ujian selamat dari refresh dan kehilangan koneksi sementara.
- Tabel besar berubah menjadi ringkasan dan drill-down.
- Instruksi penting terbaca tanpa zoom.

### P6. Model domain sekali, rangkai banyak produk

Konten tidak disalin untuk membuat paket baru. Produk memberikan akses ke program, track, batch, live class, dan resource yang sudah ada.

**Implikasi**

- Edit shared module memperbarui semua produk yang merujuk versi tersebut secara sah.
- Historical exam form immutable setelah digunakan.
- Harga dan campaign dapat berubah tanpa mengubah konten belajar.

### P7. Aturan berubah; sejarah tidak

Regulasi, scoring, passing grade, dan jadwal dapat berubah menurut tahun dan kategori.

**Implikasi**

- Setiap attempt menyimpan blueprint version dan form version.
- Hasil lama dapat direproduksi dengan aturan saat attempt berlangsung.
- Koreksi menghasilkan result/snapshot version baru dengan audit trail.
- Copy membedakan aturan resmi, target internal, dan skor estimasi.

### P8. Akses bersifat additive dan dapat dijelaskan

Siswa dapat menerima resource yang sama dari bundle, paket spesialis, beasiswa, upgrade, atau grant manual.

**Implikasi**

- Effective access adalah union dari grant aktif.
- Mencabut satu grant tidak menghapus akses yang ditopang grant lain.
- Support dapat melihat alasan akses tanpa membuka data payment yang tidak perlu.
- Perubahan manual mencatat aktor, alasan, dan waktu.

### P9. Urgency harus nyata secara operasional

Flash sale boleh digunakan, tetapi hanya sale window dan kuota nyata yang ditampilkan.

**Implikasi**

- Offer window, registration window, exam window, result release, dan review release menjadi field berbeda.
- Countdown berasal dari waktu server.
- Offer yang berakhir tidak menerima harga kedaluwarsa secara diam-diam.

### P10. Kecepatan admin tidak boleh melewati quality gate

Bulk import penting, tetapi soal hasil import tidak langsung publish.

**Implikasi**

- Import -> validate -> preview -> review -> approve -> use.
- Error menunjuk baris workbook dan asset yang hilang.
- Provenance dan revisi soal tetap tercatat.

### P11. Ukur aktivitas belajar, bukan engagement kosong

Membuka app bukan keberhasilan. Menyelesaikan aktivitas bermakna adalah keberhasilan.

**Implikasi**

- Analytics membedakan view dan completion.
- Streak hanya menghitung meaningful action dengan policy jelas.
- Notifikasi dinilai dari downstream value dan complaint, bukan CTR saja.

### P12. Accessibility dan support adalah reliability

Siswa dalam tekanan ujian memerlukan kontrol yang konsisten, konten terbaca, dan jalur pemulihan.

**Implikasi**

- Keyboard dan screen-reader support ditentukan untuk exam runner.
- Warna bukan satu-satunya indikator status.
- Time accommodation dan override operasional dapat diaudit.
- Bantuan sesuai konteks purchase, learning, dan exam.

## 2. Ethical habit model

Hook Model hanya digunakan sebagai framework pendukung belajar.

| Tahap | Implementasi etis | Pola yang dilarang |
|---|---|---|
| Trigger | Kelas akan mulai, hasil tersedia, roadmap belum selesai, waktu belajar yang direncanakan | Emergency palsu dan reminder berlebihan |
| Action | Satu tap menuju aktivitas berikutnya | Endless feed dan task switching acak |
| Reward | Pemahaman baru, peningkatan terlihat, feedback berguna, milestone | Reward seperti judi, mystery purchase, XP tanpa makna |
| Investment | Pekerjaan selesai, tujuan tersimpan, pilihan mapel, study plan, refleksi | Sunk-cost pressure atau ancaman menghapus progres |

Streak bersifat opsional dan sekunder. Melewatkan hari tidak menghapus progres atau mengunci akses.

## 3. Definisi MVP

MVP adalah rilis produksi pertama yang mampu mengantarkan program Kedinasan berbayar dan batch tryout SKD satuan secara end-to-end tanpa menjadikan WordPress Member Area dashboard belajar utama.

### 3.1 MVP siswa

- Satu identitas dengan account linking WordPress/Sejoli.
- Beranda dengan program aktif, next action, jadwal terdekat, ringkasan roadmap, dan aktivitas baru.
- Program Saya dengan status aktif, pending, expired, dan offer yang dapat dibeli.
- Program hub dengan tab kontekstual.
- Struktur roadmap dan track.
- Materi: artikel, PDF/file, video, rekaman, dan external link.
- Jadwal live class, join link, status, notice pembatalan/reschedule, dan recording link.
- Katalog tryout dalam konteks program.
- Detail batch dengan sale/access/exam/result state.
- Exam runner SKD andal: single choice, weighted option, gambar, rumus, server time, autosave, resume, submit, review gate.
- Hasil TWK/TIU/TKP, passing rule configurable, insight topik, dan satu rekomendasi next action.
- Akun, device/session, notification preference, dan bantuan.
- Mobile-first dan accessibility dasar.

### 3.2 MVP commerce dan akses

- Handoff ber-brand ke checkout Sejoli.
- Mapping external SKU yang mengizinkan beberapa ID Sejoli untuk satu product/offer internal.
- Ingestion event order/payment secara idempotent.
- Purchase status terlihat di app.
- Access grant untuk purchase, bundle component, manual, scholarship, migration, promo, dan upgrade.
- Policy fixed-date, relative-duration, first-activation, dan lifetime.
- Stacking, deduplication, expiry, refund/revocation, dan reconciliation.
- Alasan effective access dapat dilihat support.

### 3.3 MVP admin

- Navigasi admin berdasarkan role.
- Pengelolaan product, offer, program, track, module, dan resource.
- Schedule dan live-session management.
- Pemilihan exam family/blueprint; SKD Kedinasan production-ready.
- Question editor dengan teks, gambar, option image, pembahasan, stimulus, dan formula.
- Bulk import XLSX multi-sheet + ZIP gambar.
- Validation summary, row error, preview, dan review workflow.
- Exam form builder dan batch scheduler.
- Search akses, grant/revoke manual, reason, dan audit history.
- Order/webhook reconciliation.
- Live status hari-H dan tindakan support terbatas.

### 3.4 MVP platform

- Audit log untuk tindakan admin dan akses sensitif.
- Object storage dan CDN untuk asset/media terlindungi.
- Monitoring access sync, exam save, submission, scoring, dan notification failure.
- Backup dan recovery yang diuji untuk data inti.
- Analytics event untuk activation dan learning loop.

#### Privasi, usia, dan persetujuan

- Sistem menyimpan tanggal lahir atau atribut umur minimum yang benar-benar diperlukan untuk menentukan jalur persetujuan; nilainya tidak boleh masuk analytics umum.
- Jika pengguna termasuk anak menurut kebijakan hukum yang berlaku, aktivasi fitur yang memerlukan persetujuan ditahan sampai status persetujuan wali sah tercatat.
- Consent record harus berversi dan menyimpan subjek, wali bila relevan, tujuan pemrosesan, versi notice/terms, kanal, waktu, serta bukti pencabutan.
- Preferensi notifikasi pemasaran, termasuk WhatsApp, terpisah dari notifikasi transaksional dan hanya aktif melalui opt-in eksplisit.
- Produk menyediakan jalur permintaan akses, koreksi, ekspor, dan penghapusan data. Detail umur, retensi, serta bentuk consent tetap menjadi hard gate review hukum sebelum produksi.
- Notifikasi insiden keamanan kepada pengguna mengikuti playbook dan kewajiban hukum yang telah disetujui, bukan copy yang di-hardcode.

## 4. Gate aktivasi produksi per exam family

Core bersifat configurable, tetapi setiap family baru aktif setelah semua gate lulus.

| Family | Status MVP | Syarat aktivasi |
|---|---|---|
| SKD Kedinasan | Target produksi | Review aturan resmi, scoring fixture, mobile UAT, load test, content QA |
| CPNS SKD | Dirancang, tidak otomatis sama | Blueprint version terpisah, review category/passing policy, content QA |
| Kedinasan TPA/TBI | Track belajar MVP; ujian belum aktif | Materi, live class, rekaman, dan progres boleh dirilis. Exam family baru aktif setelah blueprint, sumber aturan, scoring fixture, dan review akademik tersedia. |
| TKA | Schema/import ready; keputusan OQ-001 | UI tipe kompleks, elective onboarding, scoring fixture, review struktur resmi |
| SNBT | Dirancang untuk fase berikutnya | Section timer, item type, disclaimer skor estimasi, content QA |
| PPPK | Dirancang untuk fase berikutnya | Blueprint per jenis jabatan dan review scoring |
| Ujian mandiri | Dirancang untuk fase berikutnya | Satu blueprint per institusi/tahun; tidak ada format Mandiri universal |

## 5. Non-goals MVP

- Membangun ulang checkout, kupon, affiliate, wallet, cashback, komisi, refund, atau financial reporting Sejoli.
- Payment native langsung kecuali blocker terukur disetujui.
- Mengganti landing page, blog, SEO, dan public marketing WordPress.
- Klaim IRT atau kesetaraan skor resmi tanpa model dan bukti nyata.
- Publish soal AI tanpa review manusia.
- Menjadikan AI diagnostic PDF dependency untuk hasil inti.
- Battle Tryout atau kompetisi realtime head-to-head.
- Social feed, public chat, atau platform komunitas baru.
- Parent dashboard dan multi-tenancy institusi penuh.
- Video conference native; gunakan provider eksternal melalui jadwal/link.
- Proctoring berfriksi tinggi seperti webcam recording atau hukuman pindah tab.
- Certificate, badge, marketplace, dan tutor payout kompleks.
- Migrasi seluruh akun historis tidak aktif sebelum migrasi produk aktif terbukti.

## 6. Fitur yang ditunda

### Fase 1.1 - Kedalaman produk

- Practice mode untuk tryout selesai.
- Item-quality dashboard.
- Remediasi dan narasi diagnostik lanjutan.
- Announcement dan mentor check-in.
- Attendance dan recording analytics.

### Fase 2 - Ekspansi multi-exam

- TKA complex choice dan elective pathway.
- SNBT section policy dan score estimation.
- CPNS/PPPK dan blueprint institusi.
- Penyusunan form otomatis berdasarkan komposisi blueprint.

### Fase 3 - Retention dan institusi

- Streak etis dan misi ringan setelah tervalidasi.
- Parent/mentor view dengan consent.
- School organization, cohort, teacher dashboard, dan bulk enrollment.
- Native commerce jika keterbatasan Sejoli sudah terbukti.

## 7. Scope guardrail

Setiap request baru yang ingin masuk MVP wajib menjawab:

1. Apakah fitur ini menyelesaikan core learning loop?
2. Apakah wajib untuk program Kedinasan berbayar atau batch SKD pertama?
3. Apakah sistem lama masih dapat menjalankannya dengan aman?
4. Versi paling sederhana apa yang memberi sebagian besar nilainya?
5. Metrik atau insiden apa yang membuktikan hasilnya?
6. Apa yang harus dikeluarkan atau ditunda untuk memberi ruang?

Jika nomor 1 dan 2 sama-sama tidak, fitur ditunda secara default.

## 8. Release slice

### Slice A - Access dan program shell

Identity link, commerce event, effective access, Beranda, Program Saya, program overview, admin grant, dan reconciliation.

### Slice B - Learning operations

Roadmap, materi, jadwal, live-class link, rekaman, progres, dan notifikasi.

### Slice C - Trustworthy SKD

Question bank, bulk import, blueprint SKD, form/batch, exam runner, scoring, hasil, dan live-ops.

### Slice D - Conversion dan insight

Katalog, checkout handoff, flash-sale state, upgrade, remediasi, analytics, dan operational dashboard.

Tidak ada slice yang dipublikasi sebelum access dan support recovery path diuji.

## 9. Ringkasan acceptance MVP

MVP berhasil hanya jika siswa baru dapat:

1. membeli melalui Sejoli;
2. menerima program yang benar tanpa intervensi manual;
3. masuk app tanpa form registrasi kedua;
4. memahami next action;
5. bergabung ke kelas atau menyelesaikan lesson;
6. mengikuti tryout SKD dengan aman di mobile;
7. melihat hasil yang akurat dan dapat dijelaskan;
8. melanjutkan ke aktivitas rekomendasi;

dan support dapat menjelaskan serta memperbaiki akses tanpa mengedit database langsung.
