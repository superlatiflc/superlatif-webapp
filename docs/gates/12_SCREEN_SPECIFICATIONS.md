# 12 — Screen Specifications

**Proyek:** Superlatif Web App  
**Status:** Gate 2 — audit-resolved candidate  
**Versi:** 1.0-RC2  
**Tanggal:** 28 Agustus 2026

## 1. Cara membaca dokumen

Dokumen ini mendefinisikan layar, tujuan, struktur konten, aksi, state, responsivitas, event, dan acceptance criteria. Ia tidak menetapkan detail API atau struktur database; kontrak tersebut disusun pada Gate 3.

Kode layar:

- `S` — student-facing;
- `E` — exam focus;
- `A` — admin/tutor/moderator;
- `C` — commerce/access.

## 2. Inventaris layar

### 2.1 Siswa

| Kode | Layar | Route acuan |
|---|---|---|
| S01 | Beranda — program aktif | `/home` |
| S02 | Beranda — belum punya program | `/home` |
| S03 | Program Saya | `/programs` |
| S04 | Program Hub — Ringkasan | `/programs/:programSlug` |
| S05 | Program Hub — Roadmap | `/programs/:programSlug/roadmap` |
| S06 | Program Hub — Jadwal | `/programs/:programSlug/schedule` |
| S07 | Program Hub — Tryout | `/programs/:programSlug/tryouts` |
| S08 | Program Hub — Materi & Rekaman | `/programs/:programSlug/materials` |
| S09 | Materi/rekaman detail | `/programs/:programSlug/materials/:resourceId` |
| S10 | Jadwal global | `/schedule` |
| S11 | Hasil & Progres | `/progress` |
| S12 | Detail hasil | `/progress/attempts/:attemptId` |
| S13 | Akun & keamanan | `/account` |
| S14 | Bantuan | `/help` |
| S15 | Notifikasi | `/account/notifications` |
| S16 | Program Hub — Progres | `/programs/:programSlug/progress` |
| S17 | Program Hub — Komunitas | `/programs/:programSlug/community` |
| S18 | Leaderboard batch | `/programs/:programSlug/tryouts/:batchSlug/leaderboard` |

### 2.2 Commerce dan akses

| Kode | Layar | Route acuan |
|---|---|---|
| C01 | Katalog/penawaran | `/programs` |
| C02 | Detail penawaran | `/catalog/offers/:offerSlug` |
| C03 | Status pembayaran | `/purchases/:purchaseId/status` |
| C04 | Onboarding program | `/programs/:programSlug/start` |
| C05 | Penjelasan akses | Kontekstual/dialog/route bantuan |

### 2.3 Ujian

| Kode | Layar | Route acuan |
|---|---|---|
| E01 | Detail batch & instruksi | `/programs/:programSlug/tryouts/:batchSlug` |
| E02 | Pemeriksaan kesiapan | `/programs/:programSlug/tryouts/:batchSlug/readiness` |
| E03 | Exam runner | `/attempts/:attemptId` |
| E04 | Daftar nomor mobile | Sheet di E03 |
| E05 | Ringkasan submit | Dialog/page di E03 |
| E06 | Menunggu/provisional result | `/progress/attempts/:attemptId` |

### 2.4 Admin

| Kode | Layar | Route acuan |
|---|---|---|
| A01 | Admin dashboard | `/admin` |
| A02 | Product & Offer Builder | `/admin/products/:id` |
| A03 | Program & Curriculum Builder | `/admin/programs/:id` |
| A04 | Live Class & Schedule Manager | `/admin/schedules` |
| A05 | Question Bank | `/admin/questions` |
| A06 | Manual Question Editor | `/admin/questions/:id` |
| A07 | Bulk Import — Upload | `/admin/question-imports/new` |
| A08 | Bulk Import — Validation | `/admin/question-imports/:id` |
| A09 | Review Queue | `/admin/reviews` |
| A10 | Exam Blueprint & Form Builder | `/admin/exams/:id` |
| A11 | Tryout Batch Manager | `/admin/batches/:id` |
| A12 | Access & Reconciliation | `/admin/access` |
| A13 | Live Operations | `/admin/live-ops` |
| A14 | Results & Corrections | `/admin/results` |
| A15 | User detail | `/admin/users/:id` |

## 3. Global shell siswa

### Desktop

- Sidebar: Beranda, Program Saya, Jadwal, Hasil & Progres, Bantuan, Akun.
- Header konten: breadcrumb bila relevan, judul, notifikasi, dan aksi kontekstual.
- Canvas netral dengan permukaan putih.
- Konten maksimal 1200 px.

### Mobile

- Header ringkas: judul/konteks, notifikasi, aksi overflow.
- Bottom navigation: Beranda, Program, Jadwal, Progres, Akun.
- Bantuan berada di Akun dan entry kontekstual.
- Konten diberi ruang bawah agar tidak tertutup bottom navigation.

### Global states

- Shell tetap muncul pada error komponen.
- Saat session hampir habis, banner memberi kesempatan memperpanjang.
- Deep link setelah login kembali ke route yang diminta.
- Offline banner tidak menutup tombol penting.

---

## 4. S01 — Beranda dengan program aktif

### Tujuan

Membuat siswa dapat mengenali program utama dan memulai aktivitas paling tepat dalam beberapa detik.

### Hierarki konten

1. `Halo, {nama}` dan konteks singkat.
2. **Featured Program / Next Action**.
3. Jadwal terdekat.
4. Perjalanan menuju tujuan seleksi.
5. Aktivitas terbaru.
6. Program lain yang dimiliki, bila ada.
7. Penawaran relevan, bila tidak mengganggu aktivitas utama.

### Featured Program

Memuat:

- nama program;
- periode dan status akses;
- progres yang dapat dijelaskan;
- aktivitas berikutnya;
- alasan prioritas;
- waktu/durasi;
- CTA sesuai tipe: `Gabung kelas`, `Lanjutkan belajar`, `Lanjutkan tryout`, atau `Buka roadmap`.

### State penting

| State | Perilaku |
|---|---|
| Live sekarang | CTA `Gabung kelas`; waktu dan status live dominan |
| Attempt belum selesai | CTA `Lanjutkan tryout`; tampilkan waktu tersisa dan save state terakhir |
| Deadline dekat | Gunakan warning; tampilkan batas absolut |
| Tidak ada rekomendasi | Rayakan milestone ringan dan arahkan ke roadmap |
| Multi-program | Program prioritas otomatis; switcher tersedia |
| Akses hampir habis | Banner di dalam konteks program, tidak menutupi aktivitas |
| Data parsial gagal | Section error lokal; section lain tetap tampil |

### Mobile

- Featured program menjadi elemen pertama setelah sapaan.
- Jadwal memakai maksimal tiga baris dengan `Lihat semua`.
- Roadmap menjadi daftar vertikal tahap.
- Aktivitas terbaru dapat ditutup/diringkas.

### Event

`home_viewed`, `next_action_clicked`, `program_switched`, `schedule_item_clicked`, `roadmap_stage_clicked`.

### Acceptance criteria

- [ ] Program dan CTA utama terlihat sebelum scroll pada ponsel umum bila konten memungkinkan.
- [ ] Promo tidak muncul di atas featured program.
- [ ] Sumber progres dapat dibuka.
- [ ] Tidak ada kartu program duplikat dari entitlement bertumpuk.
- [ ] State koneksi dan akses tidak ambigu.

## 5. S02 — Beranda tanpa program

### Tujuan

Mengubah keadaan kosong menjadi orientasi dan pilihan yang jujur, bukan halaman penjualan agresif.

### Konten

- Sapaan dan penjelasan bahwa akun sudah siap.
- Satu kartu `Pilih program persiapan`.
- Diagnostic/free resource jika memang tersedia.
- Ringkasan jenis program: bundle, spesialis, dan tryout satuan.
- Bantuan memilih program.

### State

- Order pending: tampilkan status pembelian sebelum katalog.
- User migrasi belum terhubung: tampilkan flow pencocokan akses.
- Tidak ada offer aktif: sediakan daftar tunggu/bantuan, bukan layar buntu.

### Acceptance

- [ ] Tidak mengklaim siswa tidak punya akses sebelum rekonsiliasi selesai.
- [ ] Pending payment mendapat jalur yang jelas.
- [ ] Penawaran membedakan fasilitas dan masa akses.

## 6. S03 — Program Saya

### Tujuan

Memberi inventaris program tanpa menampilkan kerumitan produk dan entitlement di permukaan.

### Konten

- Filter: Aktif, Akan datang, Selesai/Kedaluwarsa.
- Program cards dengan status, periode, progres, dan next action.
- Link detail akses per program.
- CTA ke katalog sebagai sekunder.

### Rules

- Satu program hanya satu kartu.
- Program yang sama dari beberapa sumber akses digabungkan.
- Track tambahan dapat diberi label `Upgrade aktif` di dalam program.
- Program kedaluwarsa tetap menyimpan riwayat hasil sesuai kebijakan.

### Acceptance

- [ ] Entitlement stacking tidak membuat duplikat.
- [ ] Status expiry menampilkan tanggal, bukan hanya warna.
- [ ] Filter dan posisi gulir bertahan saat kembali dari detail.

## 7. S04 — Program Hub: Ringkasan

### Tujuan

Menjadi ruang utama seluruh fasilitas milik satu program.

### Header program

- nama program;
- periode;
- access status;
- progres;
- next action;
- action secondary: detail akses atau bantuan.

### Tabs

`Ringkasan`, `Roadmap`, `Jadwal`, `Tryout`, `Materi & Rekaman`, `Komunitas`, `Progres`.

Tab tanpa fasilitas disembunyikan. Tab di URL.

### Ringkasan

- next action card;
- roadmap ringkas;
- jadwal berikutnya;
- resource terbaru;
- pengumuman program;
- tutor/komunitas secara sekunder.

### State

- Belum onboarding: CTA menyelesaikan onboarding.
- Program belum mulai: countdown informatif dan resource persiapan.
- Program selesai: summary perjalanan dan akses arsip.
- Access conflict: tidak memblokir data yang masih aman; tampilkan jalur bantuan.

### Acceptance

- [ ] Semua fasilitas memiliki konteks program.
- [ ] Tab kosong tidak memenuhi navigasi.
- [ ] Next action sama dengan resolver beranda.
- [ ] Pengumuman kritis dibedakan dari promosi.

## 8. S05 — Program Hub: Roadmap

### Tujuan

Menjelaskan struktur perjalanan seleksi dan hubungan antaraktivitas.

### Konten tahap

- nama dan tujuan tahap;
- status: selesai, aktif, tersedia, terkunci, opsional;
- jumlah aktivitas wajib selesai/total;
- milestone dan target waktu;
- CTA membuka tahap;
- alasan lock/prerequisite.

### Interaksi

- Expand/collapse tahap.
- Filter `Semua`, `Wajib`, `Belum selesai`.
- Buka aktivitas dan kembali ke posisi yang sama.
- Admin dapat menandai tahap opsional, tetapi siswa melihat artinya.

### Mobile

Vertikal penuh. Tidak memakai roadmap horizontal yang membutuhkan scroll panjang.

### Acceptance

- [ ] Setiap lock dapat dijelaskan.
- [ ] Denominator progres utama hanya menghitung aktivitas wajib yang sudah released; resource opsional tidak pernah masuk denominator utama.
- [ ] Tahap yang berubah tetap mempertahankan riwayat aktivitas selesai.

## 9. S06/S10 — Jadwal program dan global

### Tujuan

Membantu siswa mengetahui apa, kapan, di program mana, dan tindakan yang diperlukan.

### Views

- List — default mobile.
- Week/month calendar — desktop dan pilihan mobile.
- Agenda terdekat.

### Filter

Program, tipe kegiatan, tanggal, status kehadiran. Global schedule memuat semua program; program schedule sudah terfilter.

### Schedule item

- tanggal, waktu, zona;
- tipe;
- judul;
- program;
- tutor;
- status perubahan;
- CTA `Gabung`, `Lihat detail`, atau `Tambahkan ke kalender`.

### Edge states

- Jadwal berubah: waktu lama dicoret/ditampilkan pada detail, waktu baru jelas.
- Dibatalkan: alasan dan pengganti bila ada.
- Link belum tersedia: tampilkan kapan dipublikasikan.
- Live sedang berlangsung: prioritas di atas.

### Acceptance

- [ ] Zona waktu selalu jelas.
- [ ] Perubahan jadwal tidak hanya mengandalkan notifikasi eksternal.
- [ ] Filter global tidak mengubah program schedule permanen.

## 10. S07 — Tab Tryout

### Tujuan

Menampilkan seluruh tryout milik program berdasarkan status pengerjaan, bukan sebagai toko campuran.

### Kelompok

- Sedang berlangsung / dapat dilanjutkan.
- Bisa dikerjakan.
- Akan datang.
- Menunggu hasil.
- Selesai.

### Batch card

Nama, blueprint/jenis ujian, periode pengerjaan, durasi, attempts, status akses, result release, dan CTA.

Offer yang belum dimiliki dapat muncul di section terpisah dan diberi label jelas `Tambahan`, bukan disamarkan sebagai aktivitas program.

### Acceptance

- [ ] Sales period dan attempt period tidak tertukar.
- [ ] Attempt yang dapat dilanjutkan paling mudah ditemukan.
- [ ] Batch dengan hasil menunggu tidak menawarkan start baru jika limit habis.

## 11. S08/S09 — Materi, rekaman, dan detail

### Daftar materi

- Group berdasarkan track/roadmap stage.
- Filter tipe dan status.
- Resource row menampilkan durasi, status, prerequisite, dan progress.
- Search judul/topik.

### Detail materi

- Breadcrumb/context program.
- Judul, metadata, dan objective.
- Content viewer: artikel, video, PDF, recording, atau external link yang tervalidasi.
- Outline atau transcript bila tersedia.
- Navigasi previous/next.
- Complete state dan next action.

### State

- Video processing.
- Media unavailable.
- Resource diperbarui setelah siswa selesai.
- Download tidak diizinkan.
- Prerequisite belum terpenuhi.

### Acceptance

- [ ] Posisi video disimpan dan dapat dilanjutkan.
- [ ] Resource update tidak menghapus riwayat secara diam-diam.
- [ ] Materi dapat dibaca pada 200% zoom.

## 12. S11/S12 — Hasil & Progres

### Hasil & Progres overview

- Progress per program dan track.
- Trend latihan/tryout berdasarkan periode.
- Area kuat dan perlu ditingkatkan.
- Recent results.
- Rekomendasi tindakan.

### Detail hasil

- Status: provisional/final/corrected.
- Nama ujian, waktu, scoring version.
- Total score dan label resmi/estimasi.
- Subscore dan target.
- Answer summary.
- Pembahasan jika rilis.
- Correction notice bila ada.
- Result-to-action.

### Rules

- Passing grade resmi menyebut tahun/aturan.
- Target internal diberi label `Target belajar Superlatif`.
- Ranking menyertakan populasi dan waktu pembaruan.
- Perubahan hasil menyimpan versi sebelumnya di audit internal.

### Acceptance

- [ ] Siswa dapat membedakan skor resmi, estimasi, dan target internal.
- [ ] Grafik memiliki ringkasan tekstual.
- [ ] Hasil rendah tidak memakai bahasa mempermalukan.
- [ ] Correction notice menjelaskan perubahan yang berdampak.

## 13. S13/S14/S15 — Akun, Bantuan, Notifikasi

### Akun

- Profil.
- Zona waktu.
- Preferensi notifikasi per kanal dan kategori.
- Keamanan dan session perangkat.
- Data pembelian dan akses.
- Kebijakan/privasi.

### Bantuan

- Search knowledge base.
- FAQ kontekstual.
- Buat tiket/WhatsApp sesuai keputusan kanal.
- Status permintaan.
- Lampiran yang aman.

### Notifikasi

- Tindakan diperlukan.
- Jadwal.
- Hasil.
- Akses/transaksi.
- Konten.
- Promosi.

### Acceptance

- [ ] Pengguna dapat mematikan promosi tanpa kehilangan notifikasi operasional.
- [ ] Logout perangkat lain menyebut perangkat dan waktu.
- [ ] Bantuan membawa ID konteks tanpa mengekspos token.

---

## 14. C01/C02 — Katalog dan detail penawaran

### Tujuan

Memungkinkan siswa memahami perbedaan bundle, program spesialis, pass, dan batch satuan.

### Katalog

- Program yang dimiliki berada di atas atau diberi label `Sudah dimiliki`.
- Filter: kebutuhan, exam family, format, masa akses.
- Card menampilkan apa yang termasuk, masa akses, dan harga nyata.
- Tidak memakai countdown jika promo tidak berbatas waktu.

### Detail offer

- nama dan hasil yang ditawarkan;
- siapa yang cocok/tidak cocok;
- fasilitas termasuk;
- program/track/batch yang dibuka;
- jadwal dan masa akses;
- batasan attempts;
- harga, promo, dan periode penjualan;
- status kepemilikan/overlap;
- CTA checkout.

### Overlap explanation

Jika siswa sudah memiliki sebagian akses:

- jelaskan bagian yang sudah dimiliki;
- jelaskan nilai tambahan;
- hindari membuat salinan program;
- tampilkan upgrade path jika tersedia.

### Acceptance

- [ ] Bundle dan produk satuan dapat dibandingkan.
- [ ] Overlap akses dijelaskan sebelum checkout.
- [ ] Tidak ada scarcity palsu.
- [ ] Sebelum redirect, tampilkan copy: `Kamu akan diarahkan ke checkout Superlatif yang dijalankan melalui Sejoli/WordPress. Setelah pembayaran, kamu kembali ke aplikasi; akses aktif setelah pembayaran terverifikasi.`
- [ ] CTA redirect menyebut `Lanjut ke checkout`, membuka domain yang telah di-allowlist, dan return page tidak mengklaim sukses sebelum event pembayaran terverifikasi.

## 15. C03 — Status pembayaran

Purchase state dan effective access state ditampilkan sebagai dua panel/field berbeda. `Paid` tidak otomatis berarti `Active`; provisioning dan reconciliation menjembatani keduanya.

### Purchase states

| State | Konten dan aksi |
|---|---|
| Pending | Instruksi, batas bayar, refresh otomatis/manual, ganti metode jika tersedia |
| Paid/settled | Pembayaran diterima; tampilkan nominal gross, discount, net settled, currency, dan timestamp |
| Failed | Alasan aman, coba lagi, bantuan |
| Expired | Invoice berakhir; buat checkout baru |
| Cancelled | Order dibatalkan dan tidak menghasilkan grant |
| Refunded | Status dan dampak akses sesuai kebijakan |
| Partially refunded | Nominal yang dikembalikan dan benefit yang terdampak sesuai event terverifikasi |
| Chargeback/disputed | Sedang ditinjau; tidak menyimpulkan kecurangan siswa |
| Reconciliation needed | Pembayaran ditemukan; akses sedang diperiksa; ID bantuan |

### Access states

`scheduled`, `active`, `expired`, `suspended`, `revoked`, atau `cancelled`, dengan alasan aman-siswa, effective start/end, serta CTA onboarding/program/support. Identifier grant internal tidak ditampilkan.

### Acceptance

- [ ] Refresh tidak membuat order baru.
- [ ] Paid tetapi webhook terlambat tidak tampil sebagai gagal.
- [ ] Status memiliki timestamp.

## 16. C04 — Onboarding program

### Tujuan

Mengumpulkan minimum data yang diperlukan dan mengarahkan siswa ke langkah pertama.

### Struktur

Maksimal tiga layar progresif:

1. **Kenali program:** sambutan, fasilitas, aturan/waktu penting.
2. **Siapkan pengalaman:** hanya profil/zona dan pilihan track/mapel yang benar-benar diperlukan; target, komunitas, serta preferensi opsional memakai progressive disclosure.
3. **Mulai:** ringkasan setup, consent yang diwajibkan, dan first next action.

Onboarding dapat disimpan dan dilanjutkan. Pertanyaan yang tidak memengaruhi pengalaman awal dipindahkan ke profil.

### Acceptance

- [ ] Skip hanya untuk field yang tidak wajib.
- [ ] Jumlah elective berasal dari blueprint berversi, bukan hardcode “dua mapel”.
- [ ] Selesai onboarding langsung membuka program, bukan kembali ke katalog.

## 17. C05 — Penjelasan akses

### Tujuan

Menjawab “mengapa saya bisa/tidak bisa membuka ini?”

### Konten

- item yang diminta;
- status akses efektif;
- sumber akses aktif;
- tanggal berlaku/berakhir;
- syarat atau prerequisite;
- payment/order status jika relevan;
- CTA sesuai sebab;
- link bantuan dengan reference ID.

### Acceptance

- [ ] Tidak membocorkan ID internal yang tidak perlu.
- [ ] Overlapping entitlements diterangkan sebagai satu akses efektif.
- [ ] Admin manual grant dapat diberi label manusiawi, misalnya `Akses khusus`.

---

## 18. E01 — Detail batch & instruksi

### Tujuan

Memastikan siswa memahami format, waktu, percobaan, dan aturan hasil sebelum memulai.

### Konten

- nama batch dan exam family;
- periode start–end dengan zona;
- duration dan jumlah soal/subtes;
- attempts terpakai/tersisa;
- navigation/timer/scoring policy summary;
- kapan nilai dan pembahasan rilis;
- kebutuhan perangkat/koneksi;
- integrity/privacy notice;
- CTA `Periksa kesiapan` atau `Lanjutkan pengerjaan`.

### State

- Belum dibuka.
- Akses belum aktif.
- Bisa dimulai.
- Attempt aktif.
- Attempts habis.
- Batch berakhir.
- Menunggu hasil.

### Acceptance

- [ ] Waktu pengerjaan dan sales tidak tercampur.
- [ ] Sistem penilaian dijelaskan sesuai blueprint.
- [ ] Tombol mulai tidak aktif tanpa penjelasan.

## 19. E02 — Pemeriksaan kesiapan

### Checks

- koneksi;
- browser support;
- server time sync;
- media soal sample;
- input keyboard/touch;
- peringatan baterai/perangkat bersifat saran;
- persetujuan aturan attempt.

Kegagalan nonkritis memberi rekomendasi, bukan memblokir. Kegagalan kritis menjelaskan solusi dan bantuan.

### Acceptance

- [ ] Check tidak meminta izin yang tidak diperlukan.
- [ ] Start attempt baru dilakukan setelah konfirmasi final.
- [ ] Refresh tidak membuat dua attempt.

## 20. E03/E04 — Exam runner dan navigator

### Layout desktop

- Header fokus: exam/subtest, timer, save/connection state, bantuan.
- Main: passage bila ada, question stem, options, actions.
- Aside: question navigator dan legenda.
- Footer/context: previous, flag, dan next. Submit hanya satu kali untuk seluruh attempt, kecuali blueprint resmi berversi secara eksplisit mensyaratkan section locking/finalization.

### Layout mobile

- Header dua baris maksimal; timer tetap terbaca.
- Pertanyaan dan opsi satu kolom.
- Navigation action berada dalam alur/sticky yang tidak menutup opsi.
- Daftar nomor dibuka sebagai sheet.

### Question types

- pilihan tunggal;
- pilihan kompleks;
- benar/salah per pernyataan;
- pilihan berbobot;
- jawaban numerik;
- passage bersama;
- gambar pada stem, opsi, atau passage;
- formula dan tabel.

### State jawaban

- Belum dijawab.
- Dijawab dan tersimpan.
- Dijawab, menunggu sinkronisasi.
- Ditandai/ragu-ragu.
- Gagal sinkronisasi.

### Timer

- Berdasarkan server deadline.
- Warning visual dan aksesibel pada threshold yang dikonfigurasi.
- Tidak di-reset oleh reload.
- Saat habis, UI mengunci perubahan baru dan masuk proses submit.

### Offline

- Jawaban masuk antrean lokal.
- Status berubah menjadi `Menunggu koneksi`.
- Reconnect mengirim berdasarkan sequence/idempotency.
- Siswa tidak dipaksa diam pada soal yang sama.

### Media

- Image dapat diperbesar.
- Alt text tersedia untuk gambar informatif yang dapat dideskripsikan.
- Diagram yang merupakan inti soal tetap ditampilkan visual dengan zoom dan resolusi memadai.
- Media gagal dimuat memberi retry dan report issue.
- Setiap soal memiliki aksi `Laporkan soal` yang menyertakan question instance, kategori masalah, catatan opsional, dan screenshot opsional tanpa membuka kunci jawaban.

### Acceptance

- [ ] Reload melanjutkan attempt yang sama.
- [ ] Timer konsisten lintas tab/perangkat sesuai policy.
- [ ] Autosave tidak memblokir navigasi.
- [ ] Tidak ada navigasi aplikasi/promo umum.
- [ ] Seluruh tipe MVP dapat digunakan dengan keyboard.
- [ ] Navigator membedakan current, answered, unanswered, flagged, dan sync issue tanpa warna saja.

## 21. E05 — Ringkasan submit

### Konten

- dijawab/total;
- belum dijawab;
- ditandai;
- masalah sinkronisasi;
- waktu tersisa;
- konsekuensi submit;
- CTA kembali ke soal dan submit final.

Jika ada jawaban belum sinkron, submit mencoba sinkronisasi dan menjelaskan apakah server dapat menerima finalisasi. Jangan memberi klaim palsu.

Waktu tunggu maksimum adalah 30 detik. Setelah itu sistem mengirim submit idempotent atas state server yang sah, menampilkan receipt/reference, dan menyimpan payload terlambat sebagai recovery candidate untuk adjudikasi—bukan otomatis mengubah skor.

### Acceptance

- [ ] Siswa dapat membuka kelompok soal belum dijawab/ditandai.
- [ ] Submit ganda idempotent.
- [ ] Tidak ada checkbox jebakan atau label ambigu.

## 22. E06 — Menunggu/provisional result

### State

- Submitted, result scheduled.
- Processing.
- Provisional result.
- Final result.
- Corrected result.
- Manual review needed.

Tampilkan timestamp submit, waktu rilis yang dijanjikan, dan tindakan yang dapat dilakukan. Jangan menghitung ulang countdown berdasarkan browser bila jadwal berasal dari server.

---

## 23. Admin shell

### Desktop-first

Admin dirancang desktop-first tetapi tetap dapat melakukan approval ringan di tablet. Bulk editing kompleks tidak diprioritaskan untuk ponsel.

### Global

- Sidebar berbasis domain dan konsisten dengan IA: Ringkasan, Produk & Penawaran, Program & Kurikulum, Konten, Bank Soal, Import Soal, Ujian & Blueprint, Batch Tryout, Jadwal & Live Class, Live Ops, Akses & Rekonsiliasi, Pengguna, Hasil & Koreksi, Notifikasi, Laporan, Sistem.
- Global search untuk user, product, program, question, batch, dan order.
- Environment indicator untuk production/staging.
- Draft/published status selalu terlihat pada builder.
- Unsaved changes guard.
- Audit trail tersedia pada objek penting.
- Item navigasi mengikuti area dan route kanonik `07 §11`; `Live-Class Coordinator` hanya melihat jadwal/live/occurrence/recording/attendance yang menjadi tanggung jawabnya.

## 23A. Layar tambahan — kontrak tertutup

Enam layar berikut adalah bagian scope Gate 2 dan memiliki acceptance criteria lengkap. Route student mengikuti `07 §3`; route admin mengikuti `07 §11`.

### 23A.1 S16 — Progres program

**Tujuan:** menjelaskan apa yang sudah selesai, apa yang tertinggal, dan tindakan pemulihan berikutnya tanpa menjadikan persentase sebagai penilaian diri siswa.

**Konten:**

- program/version dan periode;
- `completed_required / released_required` sebagai numerator/denominator utama;
- progres per track/stage;
- tren hasil final/corrected yang dapat dibandingkan;
- remediasi aktif dan next action;
- timestamp projection dan penjelasan definisi progres.

**State:** loading per panel, belum ada aktivitas, projection sedang dibangun ulang, data hasil belum final, dan akses historis read-only. Resource opsional boleh tampil sebagai aktivitas tambahan tetapi tidak masuk denominator utama.

**Acceptance:**

- [ ] Angka persen selalu disertai pecahan aktivitas wajib dan definisinya.
- [ ] Perubahan resource version tidak menghapus riwayat completion yang sah.
- [ ] Klik track membuka daftar aktivitas yang membentuk angka tersebut.
- [ ] Corrected result mengganti titik current tanpa menghapus riwayat hasil lama.
- [ ] Pada 320 CSS px tidak ada grafik yang menjadi satu-satunya sumber informasi.

### 23A.2 S17 — Komunitas

**Tujuan:** memberikan pintu masuk aman ke komunitas eksternal yang memang termasuk akses siswa.

**Konten:** provider, nama komunitas, program/track, availability window, aturan singkat, privacy notice, status membership yang diketahui aplikasi, dan CTA `Buka komunitas`.

**State:** tersedia, belum mulai, kedaluwarsa, provider tidak tersedia, membership perlu dipulihkan, atau link sedang diperbarui. URL asli tidak ditanam permanen pada HTML/cache publik; aplikasi meminta redirect/token aman saat CTA dipilih.

**Acceptance:**

- [ ] Hanya effective grant dengan action yang sesuai dapat meminta link.
- [ ] Siswa memahami bahwa WhatsApp/Telegram/provider lain adalah sistem eksternal dengan kebijakan privasinya sendiri.
- [ ] Pencabutan akses aplikasi membuat case operasional bila provider tidak mendukung revoke otomatis.
- [ ] Link privat tidak masuk analytics, notifikasi push, atau log umum.

### 23A.3 S18 — Leaderboard

**Tujuan:** memperlihatkan posisi batch secara adil dan menjaga pilihan privasi siswa.

**Konten:** batch, snapshot version/time, aturan attempt dan tie-break, score/percentile yang sah, posisi siswa, daftar ranking terpaginasikan, label provisional/final/corrected, serta kontrol opt-in alias publik.

**State:** belum dirilis, sedang dihitung, provisional, final, corrected, disembunyikan karena privacy preference, atau batch tanpa leaderboard. Default publik adalah tidak menampilkan identitas; siswa tetap dapat melihat posisi sendiri jika policy mengizinkan.

**Acceptance:**

- [ ] Data publik hanya membawa alias aman dari ranking subject, bukan nama, user ID, email, atau nomor telepon.
- [ ] Mengubah opt-in tidak mengubah score/rank snapshot dan berlaku pada pembacaan berikutnya.
- [ ] Tie memiliki penjelasan singkat dan menunjuk policy version.
- [ ] Correction menghasilkan snapshot version baru; waktu dan label perubahan terlihat.
- [ ] Tabel desktop berubah menjadi kartu ringkas di mobile tanpa kehilangan posisi/score/status.

### 23A.4 Student question report

**Tujuan:** memungkinkan siswa melaporkan soal bermasalah tanpa membuka kunci atau menghentikan attempt.

**Entry point:** aksi `Laporkan soal` pada E03 dan halaman review. Bottom sheet memuat kategori (`typo`, `gambar_tidak_tampil`, `opsi_ambigu`, `dugaan_kunci`, `aksesibilitas`, `lainnya`), catatan opsional, dan screenshot opsional yang dipindai.

**State:** draft lokal, mengirim, diterima dengan reference, sedang ditinjau, ditutup tanpa perubahan, atau ditautkan ke correction case. Saat attempt aktif, receipt tidak mengonfirmasi benar/salahnya jawaban.

**Acceptance:**

- [ ] Context attempt/question instance diisi server; siswa tidak memasukkan ID internal.
- [ ] Report idempotent dan dapat dilihat kembali melalui Bantuan.
- [ ] Screenshot tidak boleh menangkap panel lain, token, atau kunci jawaban.
- [ ] Moderator dapat menghubungkan report duplikat tanpa menghapus provenance.
- [ ] Tindakan koreksi mengikuti workflow correction dan tidak mengedit attempt answer.

### 23A.5 Admin accommodation

**Tujuan:** memberi penyesuaian attempt yang terdokumentasi tanpa edit database manual.

**Konten:** student/attempt/batch, policy saat ini, reason code dan catatan terbatas, before/after deadline, extra time, reduced motion/screen-reader flags, evidence reference, impact preview, requester, approver, dan audit timeline.

**State:** draft, pending approval, approved/applied, rejected, revoked, expired, dan superseded. Ranked attempt membutuhkan approver berbeda dari requester; extension setelah deadline tidak otomatis menghidupkan kembali attempt yang sudah final.

**Acceptance:**

- [ ] Server menghitung deadline baru; admin tidak mengetik timestamp akhir secara bebas.
- [ ] Preview menampilkan dampak ke attempt window, late-sync cutoff, ranking eligibility, dan notifikasi siswa.
- [ ] Apply/revoke idempotent, memerlukan reason, dan menghasilkan audit before/after.
- [ ] Academic Admin atau Super Admin menjadi approver kedua; aktor yang sama tidak dapat request dan approve.
- [ ] Siswa hanya melihat kebutuhan fungsional, bukan catatan medis/evidence internal.

### 23A.6 Admin notification

**Tujuan:** menjadwalkan komunikasi operasional/promosi yang dapat diaudit dan menghormati consent.

**Konten:** category/channel, template version, audience rule, preview recipient count, exclusion/suppression, consent filter, estimasi biaya provider bila tersedia, schedule/timezone, sample preview, approval, delivery log, retry, dan cancel.

**State:** draft, validating, scheduled, sending, completed, partial, failed, cancelled, dan suppressed. Preview audience adalah snapshot terhitung; audience final dievaluasi kembali saat pengiriman untuk opt-out/suspension terbaru.

**Acceptance:**

- [ ] Promosi hanya menargetkan consent category/channel yang aktif.
- [ ] Template dan audience version terkunci saat job disetujui.
- [ ] Pengiriman memiliki idempotency key per recipient/template/job.
- [ ] Retry hanya untuk kegagalan yang aman diulang dan tidak menggandakan pesan settled.
- [ ] URL privat, raw token, jawaban, dan data sensitif dilarang pada template/payload.
- [ ] Cancel sebelum dispatch menghentikan delivery yang belum diserahkan ke provider.

## 24. A01 — Admin dashboard

### Tujuan

Menampilkan pekerjaan yang perlu tindakan, bukan vanity metrics.

### Konten

- validation/import jobs gagal;
- review queue;
- batch/live class dalam 24 jam;
- payment/access reconciliation;
- reported questions;
- service health ringkas;
- recent administrative activity.

### Acceptance

- [ ] Angka dapat dibuka ke daftar terfilter.
- [ ] Masalah kritis dibedakan dari pekerjaan rutin.
- [ ] Permission membatasi data sensitif.

## 25. A02 — Product & Offer Builder

### Sections

1. Identity: nama, kode, jenis.
2. Offer: harga, period jual, flash sale, kuota nyata.
3. Grants: program, track, batch, resource, attempts.
4. Access policy: start, expiry, stacking, upgrade.
5. Commerce mapping: Sejoli product ID/variant.
6. Preview.
7. Validation & publish.

### Safeguards

- Warning overlap/duplicate grant.
- Harga lama tidak ditampilkan sebagai diskon tanpa data pembanding valid.
- Perubahan published offer memiliki effective date/audit.
- Mapping commerce unik sesuai policy.

## 26. A03 — Program & Curriculum Builder

### Layout

- Program outline/roadmap di kiri.
- Selected stage/module editor di tengah.
- Preview/metadata di kanan atau drawer.

### Actions

- Tambah/reorder track, stage, module, resource.
- Mark required/optional.
- Set prerequisite dan release rule.
- Reuse existing resource.
- Preview student view.
- Publish version.

### Acceptance

- [ ] Reorder tidak mengubah historical completion secara keliru.
- [ ] Resource reuse tidak membuat copy.
- [ ] Dependency cycle dicegah.

## 27. A04 — Live Class & Schedule Manager

### Views

- Calendar.
- List.
- Live today.
- Conflicts.

### Editor

Program/track, title, tutor, start/end, timezone, provider link, capacity if real, recording policy, reminders, recurrence.

### Safeguards

- Conflict tutor/time warning.
- Perubahan jadwal menunjukkan audience yang terdampak.
- Notification preview sebelum kirim.
- Link rahasia tidak terekspos pada audience tanpa akses.

## 28. A05 — Question Bank

### Toolbar

- Search kode/stem/topik.
- Filter family, subject, topic, type, difficulty, status, author, usage.
- Saved views.
- Import, create, bulk actions.

### Table columns

Code, preview stem, type, subject/topic, difficulty, status, quality flags, usage count, updated, owner.

### Actions

Preview, edit, duplicate, submit review, approve sesuai role, archive, report/export.

### Acceptance

- [ ] Filter bertahan saat kembali dari editor.
- [ ] Bulk action menyebut jumlah soal.
- [ ] Soal used/published tidak dapat diubah destruktif tanpa versioning.

## 29. A06 — Manual Question Editor

### Sections

1. Classification.
2. Passage/shared stimulus.
3. Stem and media.
4. Options/response schema.
5. Answer/scoring.
6. Explanation and source.
7. Accessibility metadata.
8. Preview desktop/mobile.
9. Review status.

### Type-aware behavior

- Field berubah sesuai question type.
- Weighted choice menerima skor per opsi.
- Complex choice menerima multiple correct rules.
- Numeric answer menerima tolerance/unit policy bila berlaku.
- Gambar dapat di stem, option, passage, explanation.

### Safeguards

- Autosave draft.
- Warn missing key/score/media/alt metadata.
- Sanitized rich text.
- Versioning after use.

## 30. A07/A08 — Bulk Import

### Step 1: Upload

- Download current template.
- Upload XLSX.
- Upload optional ZIP media.
- Select default classification/status.
- Start upload.

### Step 2: Validation

Summary:

- total rows/questions;
- ready;
- warning;
- error;
- missing/unused media;
- duplicate/new/update counts.

Table error memuat sheet, row, question code, severity, message, dan resolution hint.

### Step 3: Preview

- Sample valid questions.
- Mobile student preview.
- Media zoom.
- Scoring preview.

### Step 4: Import

- Background job.
- Progress and safe leave page.
- Idempotent re-run by import ID/question code.
- Final report and links to imported questions.

### Acceptance

- [ ] Error baris tepat dan dapat diekspor.
- [ ] Warning tidak disamakan dengan failure.
- [ ] File besar tidak membutuhkan tab tetap terbuka.
- [ ] ZIP path traversal dan media berbahaya ditolak.
- [ ] Import ulang tidak menggandakan soal valid.
- [ ] Admin dapat memilih hanya import rows yang valid sesuai policy.

## 31. A09 — Review Queue

### Layout

- Queue/filter di kiri.
- Student preview di tengah.
- Metadata, scoring, checklist, dan comment di kanan.

### Actions

Approve, request changes, comment, assign, skip, open history.

### Checklist minimum

- klasifikasi tepat;
- stem jelas;
- opsi lengkap;
- jawaban/scoring benar;
- pembahasan memadai;
- media terbaca;
- sumber dan hak penggunaan;
- accessibility metadata;
- tidak duplikat nyata.

## 32. A10 — Exam Blueprint & Form Builder

### Blueprint

- family/version;
- sections/subtests;
- duration rules;
- question types;
- scoring policy;
- thresholds/targets;
- navigation dan option-order policy;
- result policy.

### Exam form

- select/manual compose questions;
- composition target by topic/difficulty;
- fixed immutable question set untuk ranked MVP;
- validation;
- preview;
- lock/publish version.

### Safeguards

- Published scoring is immutable; correction via new policy/result process.
- Composition mismatch blocks publish.
- Used question exposure warning.
- Form yang review/kuncinya sudah rilis diblokir dari ranked batch baru.
- Blueprint version attached to attempts.

## 33. A11 — Tryout Batch Manager

### Sections

- identity and exam form;
- sales/offer links;
- registration/attempt window;
- attempt limit;
- result and explanation release;
- leaderboard cohort;
- notification schedule;
- capacity only if real;
- publish checklist.

### Timeline preview

Admin melihat urutan sales, access grant, attempt, result, explanation, dan expiry pada satu timeline agar periode tidak bertabrakan.

### Acceptance

- [ ] End harus setelah start pada setiap periode.
- [ ] Result tidak rilis sebelum policy mengizinkan.
- [ ] Perubahan batch aktif menunjukkan jumlah peserta terdampak.

## 34. A12/A15 — Access, reconciliation, dan user detail

### Search

Email, nomor WhatsApp, user ID, order ID, product ID.

### User access view

- identity/link status;
- orders;
- raw grants;
- effective access;
- program enrollment;
- expiry/refund history;
- sessions/audit yang diizinkan.

### Actions

Reprocess webhook, reconcile order, manual grant, extend, revoke, annotate, merge/link with strict policy.

### Safeguards

- Manual grant memerlukan reason dan expiry.
- Revoke menunjukkan akses lain yang masih berlaku.
- Refund event tidak menghapus akses dari source lain.
- High-risk merge requires elevated permission.

## 35. A13 — Live Operations

### Tujuan

Memantau batch ujian dan live class yang sedang berlangsung tanpa mengubah jawaban atau hasil secara sembarangan.

### Konten

- active attempts count;
- save latency/error rate;
- connection incidents;
- submit queue;
- live class join health;
- incident banner and status notes;
- action runbook links.

### Guardrails

- No direct answer editing.
- Pause/extend/cancel actions mengikuti policy dan audit.
- Bulk communication memiliki preview audience.

## 36. A14 — Results & Corrections

### Konten

- attempts/results search;
- processing status;
- scoring version;
- anomalies;
- correction batches;
- notification status.

### Correction flow

1. Define cause and affected questions/attempts.
2. Preview impact.
3. Peer approval.
4. Recalculate idempotently.
5. Publish corrected results.
6. Notify affected users.
7. Preserve audit and prior result.

## 37. Cross-screen state inventory

Setiap high-fidelity berikutnya wajib menyertakan minimum state:

| Layar | State wajib |
|---|---|
| Beranda | active, no program, multi-program, partial error, offline |
| Program Hub | active, upcoming, expired, locked item, onboarding incomplete |
| Jadwal | normal, empty, changed, cancelled, live now |
| Tryout | upcoming, available, in progress, waiting result, finished |
| Exam | normal, save pending, offline, media error, time warning, time ended |
| Hasil | processing, provisional, final, corrected, explanation locked |
| Payment | pending, paid provisioning, active, failed, expired, reconciliation |
| Question Import | upload, validating, partial, failed, complete |
| Admin builder | draft, validation error, publishing, published, version conflict |

## 38. Prioritas high-fidelity

### P0 — sebelum Gate 3 dikunci

- S01 Beranda aktif — desktop dan mobile.
- S04 Program Hub — desktop dan mobile.
- E01 Detail batch.
- E03 Exam runner — desktop dan mobile.
- S12 Detail hasil.
- A07/A08 Bulk import.

### P1 — selama technical contract

- S03 Program Saya.
- S05 Roadmap.
- S10 Jadwal.
- C01/C02 Katalog dan offer.
- C03 Payment status.
- A05 Question Bank.
- A10/A11 Exam and Batch Builder.
- A12 Access reconciliation.

### P2 — sebelum UAT lengkap

- Semua state tambahan, Akun, Bantuan, Notifikasi, reporting admin, dan operational views.

## 39. Uji kegunaan Gate 2

Prototype berikutnya diuji dengan minimal lima skenario:

1. Siswa kembali dan melanjutkan aktivitas yang benar.
2. Siswa menemukan live class malam ini.
3. Siswa multi-produk menemukan tryout yang termasuk dalam satu program.
4. Siswa memahami batch yang dijual dan waktu pengerjaan yang berbeda.
5. Admin mengunggah XLSX + ZIP, menemukan error, dan mengimpor baris valid.

Target kualitatif:

- pengguna dapat menjelaskan struktur `Program → fasilitas`;
- tidak salah mengira masa promo sebagai masa ujian;
- tidak bingung antara target internal dan passing grade resmi;
- dapat memulihkan diri dari state error tanpa instruksi moderator.

## 40. Definition of done layar

Sebuah layar siap masuk build ketika:

- [ ] Tujuan dan aksi utama jelas.
- [ ] Data yang diperlukan terdefinisi.
- [ ] Semua state penting didesain.
- [ ] Desktop/mobile behavior didokumentasikan.
- [ ] Keyboard, screen reader, kontras, dan touch target diaudit.
- [ ] Copy Indonesia final tersedia.
- [ ] Event analitik disetujui.
- [ ] Acceptance criteria dapat diuji.
- [ ] Hubungan ke program, akses, dan policy ujian tidak ambigu.
- [ ] Tidak ada keputusan bisnis tersembunyi di visual.
