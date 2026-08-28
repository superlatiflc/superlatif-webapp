# User Research, Persona, dan Jobs to Be Done

**Versi:** 1.0-RC2 — baseline hipotesis, riset tetap wajib  
**Tanggal:** 28 Agustus 2026

## 1. Status riset

Persona dalam dokumen ini adalah hipotesis produk yang disusun dari konteks bisnis, operasional produk, arah brand, dan diskusi produk terbaru. Dokumen ini bukan pengganti interview, observasi, analisis tiket support, dan behavioral data.

Setiap persona memiliki tingkat keyakinan:

- **Tinggi:** berulang kali didukung oleh konteks operasional atau informasi langsung founder.
- **Sedang:** masuk akal untuk desain tetapi masih perlu validasi.
- **Rendah:** hipotesis ekspansi; tidak boleh sendirian memperbesar scope MVP.

## 2. Jobs lintas pengguna

### Functional jobs siswa

- Memahami akses yang saya miliki setelah membeli.
- Mengetahui apa yang harus dilakukan berikutnya tanpa menyusun seluruh perjalanan sendiri.
- Menemukan kelas, tryout, materi, atau rekaman terdekat dengan cepat.
- Belajar dan mengikuti ujian dengan andal melalui HP.
- Memahami hasil dan bagian yang perlu diperbaiki.
- Mempertahankan seluruh akses yang memang termasuk dalam pembelian saya.

### Emotional jobs siswa

- Tidak merasa tertinggal tanpa mengetahui penyebabnya.
- Merasa masih mampu berkembang setelah skor rendah.
- Percaya bahwa Superlatif tidak akan menghilangkan jawaban atau akses.
- Mengurangi cemas karena link, grup, dan jadwal tersebar.
- Merasa berada dalam perjalanan belajar serius, bukan gudang konten.

### Social jobs siswa

- Menunjukkan kepada orang tua bahwa saya mengikuti program yang terstruktur.
- Membandingkan progres tanpa dipermalukan di depan publik.
- Bergabung dengan cohort atau komunitas ketika mendukung tujuan.

### Jobs pengguna operasional

- Publish konten belajar dan ujian dengan cepat serta akurat.
- Menggunakan ulang konten untuk banyak produk tanpa menyalin.
- Mengetahui siswa berhak mengakses resource apa dan alasannya.
- Memperbaiki kesalahan tanpa menghapus sejarah.
- Mendukung siswa saat ujian high-stakes menggunakan bukti yang andal.

## 3. Persona utama A - Alya, siswa Kelas Akselerasi

**Keyakinan:** Tinggi  
**Peran:** Lulusan SMA yang menargetkan Kedinasan  
**Device utama:** Android kelas menengah  
**Kepemilikan:** Kelas Akselerasi Kedinasan, mungkin ditambah satu flash-sale tryout

### Konteks

Alya ambisius tetapi mudah overwhelmed oleh banyaknya tahap seleksi. Ia membeli program lengkap karena membutuhkan struktur dan live guidance, bukan sekadar bank soal. Ia belajar malam hari dan mengandalkan WhatsApp untuk informasi penting.

### Jobs to be done

> Ketika membuka Superlatif setelah hari yang sibuk, tunjukkan satu aktivitas paling berguna agar saya tetap bergerak menuju Kedinasan tanpa merasa tersesat.

> Ketika kelas, tryout, atau deadline mendekat, tunjukkan apa kegiatannya, kapan berlangsung, dan cara bergabung agar saya tidak terlewat karena informasi tersebar.

> Ketika skor rendah, jelaskan maknanya dan tindakan berikutnya agar saya tidak menganggap satu hasil sebagai bukti bahwa saya tidak mampu lulus.

### Masalah

- Terlalu banyak pilihan menu.
- Link kelas tenggelam di chat WhatsApp.
- Perbedaan progres program dan skor ujian tidak jelas.
- Takut koneksi buruk menghilangkan jawaban.
- Tidak yakin tahap lanjutan sudah termasuk atau belum.

### Outcome yang diinginkan

- Satu roadmap utuh dari persiapan sampai tahap akhir.
- Jadwal dan reminder yang dapat dipercaya.
- Label akses jelas: termasuk, tersedia nanti, perlu upgrade, atau berakhir.
- Progres bermakna dan next-step guidance.

### Implikasi desain

- Beranda memimpin dengan Kelas Akselerasi dan satu CTA.
- Roadmap menunjukkan status dan relevansi, bukan persentase palsu.
- Jadwal memiliki join, add-to-calendar, reschedule, dan recording state.
- Hasil memakai bahasa konstruktif dan remediasi langsung.
- Bantuan terlihat saat ada masalah ujian.

## 4. Persona utama B - Raka, pembeli tryout-only

**Keyakinan:** Tinggi  
**Peran:** Pejuang Kedinasan yang belajar mandiri  
**Device utama:** Android  
**Kepemilikan:** Satu batch TO SKD atau Tryout Pass bulanan

### Konteks

Raka belajar dari beberapa sumber. Ia membeli Superlatif untuk simulasi, ranking, dan diagnosis. Ia belum membutuhkan kelas lengkap, tetapi pengalaman hasil yang baik dapat mendorong upgrade.

### Jobs to be done

> Ketika membeli tryout terbatas, jelaskan waktu pengerjaan, jumlah attempt, serta waktu hasil dan pembahasan agar saya dapat merencanakan dengan pasti.

> Ketika tryout selesai, tunjukkan posisi dan subtest penghambat agar saya dapat memutuskan apakah membutuhkan bantuan lebih lanjut.

> Ketika membeli bundle kemudian, pertahankan hasil lama dan jangan tampilkan konten ganda.

### Masalah

- Deadline sale tertukar dengan deadline ujian.
- Waktu rilis hasil tidak jelas.
- Akses hilang padahal masih ada paket aktif lain.
- Dipaksa melewati LMS yang tidak relevan.
- Scarcity atau ranking claim yang menyesatkan.

### Outcome yang diinginkan

- Tampilan program ringkas berfokus tryout.
- Status batch dan countdown yang tepat.
- Ujian andal dan label hasil transparan.
- Rekomendasi upgrade relevan, bukan generic upsell.

### Implikasi desain

- Sembunyikan tab materi/live yang kosong.
- Bedakan `sale berakhir`, `ujian dibuka`, `ujian ditutup`, `hasil rilis`, dan `pembahasan rilis`.
- Tampilkan jumlah attempt dan status ranked/practice sebelum mulai.
- Upsell mempertimbangkan result gap dan produk yang sudah dimiliki.

## 5. Persona ekspansi C - Sinta, siswa TKA/SNBT

**Keyakinan:** Sedang  
**Peran:** Siswa kelas 12  
**Device utama:** HP; sesekali laptop untuk tryout panjang

### Konteks

Sinta membutuhkan persiapan mapel wajib dan pilihan. Struktur ujiannya berbeda dari SKD dan satu universal score dapat menyesatkan. Ia menghadapi bacaan, tabel, diagram, rumus, dan pilihan kompleks.

### Jobs to be done

> Ketika masuk program TKA, bantu saya memilih mapel pilihan yang benar dan sesuaikan program dengan pilihan itu.

> Ketika mengikuti simulasi SNBT/TKA, pertahankan struktur per bagian yang relevan dan beri label jelas jika skor hanya estimasi Superlatif.

### Masalah

- Konten mapel pilihan salah setelah membeli.
- Istilah passing grade SKD muncul di ujian akademik.
- Diagram tidak terbaca di mobile.
- Skor estimasi ditampilkan seolah resmi.

### Implikasi desain

- Elective onboarding menjadi prasyarat aktivasi program TKA.
- Result view mengikuti blueprint.
- Shared passage dan rich asset menjadi first-class.
- Persona ini tidak memperbesar MVP tanpa persetujuan OQ-001.

## 6. Persona sekunder D - Orang tua sebagai decision influencer

**Keyakinan:** Sedang  
**Peran:** Pembayar dan pendukung, bukan pengguna harian

### Jobs to be done

> Ketika membayar program, jelaskan isi paket dan pastikan akses sudah aktif.

> Ketika mendukung anak, berikan ringkasan yang menghormati consent tanpa membuka semua aktivitas atau skor rendah.

### Perlakuan MVP

- Receipt dan activation communication yang jelas melalui channel commerce.
- Tidak ada parent dashboard pada MVP.
- Progress sharing di masa depan membutuhkan consent siswa dan legal review.

## 7. Persona operasional E - Nisa, admin operasional program

**Keyakinan:** Tinggi  
**Peran:** Mengelola jadwal, produk, akses, announcement, dan support siswa

### Jobs to be done

> Ketika program atau batch baru diluncurkan, izinkan saya mengatur apa yang dijual, hak aksesnya, dan waktu tampilnya tanpa meminta engineer.

> Ketika siswa melaporkan akses hilang, tunjukkan order, grant, effective access, dan kegagalan dalam satu tempat agar saya dapat memperbaikinya dengan aman.

> Ketika kelas berubah, izinkan saya memperbarui jadwal sekali dan memberi tahu hanya siswa terdampak.

### Masalah

- Pengecekan manual antara WordPress dan app.
- Menyalin konten untuk setiap paket.
- Tidak ada penjelasan mengapa akses aktif atau expired.
- Perbaikan support memerlukan direct database edit.

### Outcome yang diinginkan

- Product/offer mapping dengan preview grant.
- Access timeline dan reconciliation action.
- Tools aman berdasarkan role.
- Audit trail untuk setiap koreksi manual.

### Implikasi desain

- Bahasa admin memakai istilah bisnis, bukan nama tabel.
- Tindakan destruktif memperlihatkan impact preview dan meminta alasan.
- Bulk action menampilkan user/resource yang terdampak sebelum commit.

## 8. Persona operasional F - Dimas, tutor/question writer

**Keyakinan:** Tinggi  
**Peran:** Membuat lesson, soal, pembahasan, dan materi live class

### Jobs to be done

> Ketika menerima satu set soal, izinkan saya mengimport secara bulk bersama gambar dan berikan error yang presisi agar sumber dapat diperbaiki cepat.

> Ketika membuat soal manual, izinkan paste teks, gambar, tabel, dan rumus serta preview versi mobile.

> Ketika selesai menulis, izinkan submit untuk review tanpa hak publish langsung.

### Masalah

- Menginput ratusan soal satu per satu.
- Filename gambar tidak cocok dengan referensi spreadsheet.
- Pilihan kompleks atau bobot TKP diratakan menjadi satu jawaban benar.
- Soal tidak sengaja tayang sebelum review.

### Outcome yang diinginkan

- Template XLSX dan aturan nama ZIP yang dapat digunakan ulang.
- Validasi per baris dan preview.
- Draft dan review queue.
- Duplicate detection pada fase berikutnya.

## 9. Persona operasional G - Maya, moderator akademik

**Keyakinan:** Tinggi  
**Peran:** Memverifikasi akurasi dan kesiapan publish

### Jobs to be done

> Ketika satu batch soal disubmit, bantu saya menemukan error berisiko tinggi lebih dulu agar review efisien tanpa menurunkan kualitas.

> Ketika soal yang sudah digunakan dipersoalkan, tampilkan version, riwayat pemakaian, laporan, statistik, dan dampak koreksi sebelum saya bertindak.

### Masalah

- Tidak ada pemisahan typo fix dan revisi yang mengubah kunci.
- Koreksi diam-diam mengubah hasil historis.
- Beban review tidak diprioritaskan.

### Implikasi desain

- Review checklist berubah menurut tipe soal dan exam family.
- Perubahan material membuat revision baru.
- Koreksi pasca-pemakaian menjalankan impact analysis dan versioning hasil.

## 10. Persona operasional H - Support saat batch berlangsung

**Keyakinan:** Sedang  
**Peran:** Membantu siswa tanpa hak academic publishing

### Jobs to be done

> Ketika siswa melaporkan kendala teknis, tunjukkan session state, save health, device change, dan tindakan yang diizinkan tanpa membocorkan kunci.

> Ketika exception sah, izinkan admin berwenang memberi retake atau perpanjangan dengan alasan dan audit record.

### Implikasi desain

- Support melihat bukti operasional, bukan kunci atau data pribadi berlebihan.
- Force submit, retake, dan window extension memerlukan elevated permission.
- Semua tindakan yang memengaruhi ujian dapat diatribusikan.

## 11. Anti-persona dan perilaku non-target

- Siswa yang mencoba membocorkan kunci atau mengeksploitasi multi-device.
- Admin yang melewati moderation demi kecepatan.
- Marketer yang membuat kuota palsu atau countdown berulang.
- Tutor yang menggunakan platform sebagai file dump tanpa struktur.
- Institusi yang mengharapkan full multi-tenant reporting pada MVP.

Sistem mengurangi abuse tanpa menghukum interupsi mobile yang normal.

## 12. Hipotesis journey yang perlu divalidasi

| Hipotesis | Bukti yang dibutuhkan |
|---|---|
| Siswa lebih memilih satu next action daripada feature grid | Prototype test dengan siswa Kedinasan aktif |
| Roadmap mengurangi pertanyaan support | Perbandingan task success dan confidence kualitatif |
| Pembeli tryout-only tidak membutuhkan navigasi LMS penuh | Usability test dengan pembeli batch terbaru |
| WhatsApp tetap menjadi reminder paling bernilai | Delivery, conversion, opt-out, dan complaint data |
| Remediasi hasil meningkatkan return dan upgrade intent | Controlled experiment per batch |
| Tim mampu menjaga disiplin XLSX + ZIP | Moderated import test menggunakan file soal nyata |
| Webhook Sejoli cukup untuk reliable mapping | Sampel payload, replay, dan reconciliation spike |

## 13. Rencana riset minimum sebelum Gate 2 disetujui

### Interview

- 5 siswa aktif Kelas Akselerasi.
- 5 pembeli tryout-only, mencakup skor rendah dan tinggi.
- 3 siswa yang membeli tetapi menjadi tidak aktif.
- 2 staf operasional/support.
- 2 question writer dan 1 moderator.

### Tugas observasi

- Menemukan kelas malam ini dan rekamannya.
- Menjelaskan isi paket yang dibeli.
- Memulai dan memulihkan tryout yang terinterupsi.
- Memahami hasil dan memilih next action.
- Mengimport 50 soal nyata dengan minimal 10 gambar.
- Menyelesaikan satu kasus missing access dari order sampai grant.

### Data review

- 50 pertanyaan support WhatsApp teratas.
- Jalur login sampai first action pada sistem sekarang.
- Distribusi device dan viewport.
- Payment-to-access delay dan exception rate.
- Tryout start, completion, result view, dan repeat behavior.
- Product overlap di antara pembeli lama.

## 14. Pertanyaan riset yang tidak boleh dijawab dengan asumsi

- Apakah siswa ingin global Home atau langsung masuk program terakhir?
- Tahap roadmap mana yang berguna sebelum waktunya dekat?
- Seberapa detail hasil membantu tanpa membuat siswa overwhelmed?
- Apakah Tryout Pass tampil sebagai program atau koleksi di dalam tryout hub?
- Notifikasi apa yang cukup bernilai untuk biaya dan interupsi WhatsApp?
- Apakah tutor menyiapkan soal di Excel, Word, Google Docs, atau format campuran?
- Identifier order dan produk apa yang benar-benar stabil dalam payload Sejoli?
