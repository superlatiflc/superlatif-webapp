# 09 — UX Specification

**Proyek:** Superlatif Web App  
**Status:** Gate 2 — audit-resolved candidate  
**Versi:** 1.0-RC2  
**Tanggal:** 28 Agustus 2026  
**Dokumen terkait:** `06_USER_JOURNEYS.md`, `07_INFORMATION_ARCHITECTURE_AND_SITEMAP.md`, `08_USER_FLOWS_AND_EDGE_CASES.md`

## 1. Tujuan dokumen

Dokumen ini menerjemahkan arsitektur informasi dan alur pengguna menjadi perilaku antarmuka yang dapat dirancang, diuji, dan diimplementasikan. Fokusnya bukan warna atau ilustrasi, melainkan apa yang harus terjadi ketika pengguna membuka halaman, melakukan aksi, kehilangan koneksi, belum memiliki data, atau menemui kegagalan.

Prinsip utama:

> Setiap layar membantu pengguna memahami posisi saat ini, tindakan terbaik berikutnya, dan konsekuensi dari tindakannya.

## 2. UX invariants

Aturan berikut berlaku pada seluruh aplikasi dan tidak boleh diubah per halaman tanpa keputusan desain baru.

1. **Satu aksi utama per konteks.** Sebuah halaman boleh memiliki banyak aksi, tetapi hanya satu yang memperoleh penekanan utama.
2. **Program lebih utama daripada fitur.** Materi, tryout, jadwal, rekaman, dan komunitas ditampilkan sebagai fasilitas milik program.
3. **Status tidak boleh hanya dibedakan oleh warna.** Selalu sertakan teks, ikon, atau pola lain.
4. **Progres menjelaskan arti.** Angka progres harus memiliki definisi, misalnya “8 dari 42 aktivitas wajib selesai”, bukan persentase tanpa konteks.
5. **Waktu kritis berasal dari server.** Timer ujian, batas batch, jadwal kelas, dan waktu promo memakai waktu server dengan zona waktu yang ditampilkan.
6. **Kegagalan parsial tidak memblokir seluruh halaman.** Bagian yang berhasil dimuat tetap dapat digunakan.
7. **Aksi yang berisiko memberi kesempatan membatalkan.** Submit ujian, keluar perangkat, atau membatalkan perubahan harus memiliki konfirmasi yang proporsional.
8. **Pengguna tidak disalahkan.** Bahasa error menjelaskan kondisi dan cara melanjutkan tanpa mempermalukan siswa.
9. **Mobile bukan versi yang dipotong.** Seluruh aktivitas inti tersedia dan aman digunakan pada layar kecil.
10. **Hak akses dijelaskan dengan sumbernya.** Jika terkunci, aplikasi menjelaskan produk, masa akses, atau kondisi yang diperlukan.
11. **UTC di penyimpanan, zona jelas di layar.** Server menyimpan dan membandingkan waktu dalam UTC. UI merender zona akun pengguna; deadline nasional menampilkan WIB sebagai label otoritatif dan boleh menampilkan ekuivalen lokal.
12. **Satu resolver, satu vocabulary.** Beranda, Program Hub, API, dan analytics memakai reason code serta tie-break yang sama dari §5.

## 3. Kerangka halaman

### 3.1 Desktop

- Navigasi utama berada di sisi kiri dan dapat diperkecil setelah lebar konten terbatas.
- Area konten memiliki lebar baca maksimum; tabel admin dapat memakai lebar penuh.
- Header halaman memuat judul, konteks program bila relevan, dan aksi utama.
- Informasi yang mendukung keputusan diletakkan dekat dengan aksinya, bukan di sidebar terpisah.
- Panel kanan hanya digunakan jika benar-benar kontekstual, misalnya daftar nomor pada exam runner.

### 3.2 Tablet

- Navigasi sisi kiri berubah menjadi ikon atau drawer.
- Tata letak tiga kolom menjadi dua atau satu kolom sesuai prioritas.
- Tabel admin dapat digulir horizontal dengan kolom identitas tetap terlihat.

### 3.3 Mobile

- Navigasi utama menggunakan lima tujuan: Beranda, Program, Jadwal, Progres, dan Akun.
- Judul dan aksi utama muncul sebelum informasi sekunder.
- Kartu tidak ditumpuk berlebihan; daftar sederhana dipilih ketika konten bersifat berulang.
- Sheet dari bawah digunakan untuk filter, pemilih tanggal, dan aksi kontekstual.
- Aksi penting tidak bergantung pada hover.
- Bottom navigation tidak menutupi konten dan memperhitungkan safe area perangkat.

### 3.4 Breakpoint acuan

| Rentang | Mode | Perilaku utama |
|---|---|---|
| 0–479 px | Mobile sempit | Satu kolom, bottom navigation, kontrol ringkas |
| 480–767 px | Mobile lebar | Satu kolom, beberapa kontrol boleh sejajar |
| 768–1199 px | Tablet | Drawer/rail, maksimal dua kolom |
| ≥1200 px | Desktop | Sidebar, grid 12 kolom, panel kontekstual bila perlu |

Breakpoint adalah acuan implementasi, bukan alasan untuk memaksakan komponen yang tidak muat. Komponen juga harus responsif terhadap ruang yang tersedia.

## 4. Hierarki aksi

| Tingkat | Bentuk | Penggunaan |
|---|---|---|
| Utama | Filled button | Tindakan yang paling tepat pada layar saat ini |
| Sekunder | Outline/tonal button | Alternatif yang tetap penting |
| Tersier | Text/ghost button | Aksi pendukung, navigasi lokal |
| Destruktif | Danger button | Aksi yang menghapus atau mengakhiri sesuatu |
| Inline | Text link | Detail, bantuan, atau referensi dalam konten |

Aturan:

- Jangan menampilkan dua tombol utama berdampingan.
- Label memakai kata kerja yang konkret: “Lanjutkan belajar”, “Mulai tryout”, “Periksa 18 kesalahan”.
- Hindari label generik seperti “Submit”, “OK”, atau “Klik di sini”.
- Tombol tidak boleh dinonaktifkan tanpa penjelasan. Jika syarat belum terpenuhi, tampilkan alasan di dekat kontrol.

## 5. Penentuan “aktivitas berikutnya”

Dashboard dan program hub memakai resolver yang sama. Kandidat yang tidak accessible atau tidak released dikeluarkan lebih dulu. Urutan dan reason code:

| Prioritas | Reason code | Threshold/aturan |
|---:|---|---|
| 1 | `LIVE_NOW` | Occurrence berstatus live dan join window terbuka |
| 2 | `DEADLINE_SOON` | Aktivitas wajib/batch masih dapat dikerjakan dan deadline ≤24 jam |
| 3 | `RESUME_IN_PROGRESS` | Attempt atau resource pernah dimulai dan belum selesai |
| 4 | `REQUIRED_WITHIN_24H` | Live/batch wajib mulai ≤24 jam tetapi belum live |
| 5 | `ROADMAP_NEXT` | Aktivitas wajib released pertama yang prerequisite-nya terpenuhi |
| 6 | `RESULT_REMEDIATION` | Remediasi latest final/corrected result yang belum dimulai |
| 7 | `OPTIONAL_RECOMMENDATION` | Aktivitas optional eligible; tidak mengalahkan kewajiban |

Tie-break dalam prioritas yang sama: deadline/start terdekat, lalu item wajib, lalu urutan roadmap, lalu stable ID ascending. Program utama pilihan pengguna mengalahkan program lain kecuali urgent item program lain ditampilkan sebagai banner; resolver tidak mengganti program utama secara diam-diam. Hasil resolver menyimpan `generated_at`, `reason_code`, kandidat terpilih, dan versi policy untuk pengujian.

Setiap rekomendasi harus menampilkan:

- nama aktivitas;
- hubungannya dengan program/track;
- alasan direkomendasikan;
- estimasi durasi atau waktu mulai;
- status progres bila pernah dimulai;
- satu aksi utama.

Jika resolver tidak menemukan aktivitas, tampilkan milestone yang sudah dicapai dan pilihan ringan untuk melanjutkan. Jangan memunculkan halaman kosong.

## 6. State antarmuka global

### 6.1 Loading

- Gunakan skeleton yang menyerupai struktur akhir, bukan spinner satu halaman.
- Navigasi dan identitas halaman tampil terlebih dahulu.
- Hindari skeleton untuk operasi kurang dari kira-kira 300 ms agar tidak berkedip.
- Pada tombol, pertahankan lebar dan ubah label menjadi status seperti “Menyimpan…”.
- Aksi ganda dicegah saat request masih berjalan.

### 6.2 Empty state

Empty state menjawab tiga pertanyaan:

1. Apa yang belum ada?
2. Mengapa kondisi ini terjadi?
3. Apa tindakan yang dapat dilakukan?

Contoh:

- Belum punya program: jelaskan manfaat program dan arahkan ke katalog.
- Jadwal kosong: nyatakan tidak ada agenda pada periode ini dan tawarkan melihat seluruh bulan.
- Belum ada hasil: arahkan ke tryout yang tersedia, jika pengguna memiliki akses.
- Filter tidak menemukan hasil: pertahankan filter, tampilkan tombol reset.

### 6.3 Error

| Cakupan | Pola |
|---|---|
| Field | Pesan di bawah input, fokus ke field pertama yang salah |
| Komponen | Panel error di posisi komponen dengan tombol coba lagi |
| Halaman | Halaman status yang tetap memiliki navigasi dan bantuan |
| Sistem | Banner persisten dengan status layanan dan alternatif aman |

Pesan error memuat kondisi, dampak, dan tindakan. ID referensi ditampilkan untuk bantuan teknis tanpa mengekspos detail internal.

### 6.4 Offline dan koneksi lemah

- Banner “Koneksi terputus” muncul tanpa menutup layar.
- Data terakhir diberi label waktu sinkronisasi.
- Jawaban ujian disimpan ke antrean lokal terenkripsi bila koneksi hilang, lalu dikirim ulang otomatis.
- Pengguna dapat melihat status `Tersimpan`, `Menunggu sinkronisasi`, atau `Gagal disimpan`.
- Aplikasi tidak mengklaim jawaban tersimpan di server sebelum ada konfirmasi.

### 6.5 Stale data

Jika data berubah di server sejak halaman dibuka:

- tampilkan bahwa versi baru tersedia;
- pertahankan input pengguna bila aman;
- minta pengguna membandingkan atau memuat ulang untuk konflik yang tidak dapat digabungkan;
- jangan menimpa perubahan tanpa pemberitahuan.

### 6.6 Success

- Gunakan toast untuk aksi kecil dan dapat dipulihkan.
- Gunakan konfirmasi dalam konteks untuk aksi besar seperti pembayaran atau publikasi batch.
- Pesan keberhasilan menyebut hasil, bukan hanya “Berhasil”.

### 6.7 Konfirmasi dan undo

- Gunakan undo untuk perubahan ringan seperti mengarsipkan filter tersimpan.
- Gunakan dialog untuk submit final ujian, publikasi, pencabutan akses, atau perubahan scoring.
- Dialog memuat objek, dampak, dan apakah aksi dapat dibatalkan.
- Konfirmasi dengan mengetik hanya untuk tindakan administratif yang berdampak luas.

## 7. Perilaku navigasi

### 7.1 Navigasi utama

- Item aktif memiliki label dan indikator visual.
- Badge hanya untuk hal yang perlu tindakan, bukan jumlah konten total.
- Kembali dari detail mempertahankan filter, posisi gulir, dan tab sebelumnya.
- Deep link mengarahkan ke login lalu kembali ke tujuan semula.

### 7.2 Tab program

- Tab kosong disembunyikan kecuali diperlukan untuk menjelaskan fasilitas yang akan datang.
- Tab aktif tersimpan pada URL agar dapat dibagikan.
- Pada mobile, tab dapat digulir horizontal dengan item aktif terlihat.
- Perubahan tab tidak menghapus progres input yang belum disimpan tanpa peringatan.

### 7.3 Breadcrumb

Digunakan pada desktop untuk kedalaman minimal tiga tingkat, terutama di admin dan materi. Pada mobile, gunakan tombol kembali dengan label konteks yang jelas.

## 8. Spesifikasi pengalaman per area

### 8.1 Beranda

Urutan konten:

1. sapaan ringkas;
2. program utama dan aktivitas berikutnya;
3. jadwal terdekat;
4. perjalanan seleksi;
5. aktivitas terbaru;
6. program lain yang dimiliki;
7. penawaran yang relevan.

Aturan:

- Jika hanya ada satu program, program itu dipilih otomatis.
- Jika ada beberapa program dan pengguna sudah memilih program utama, pilihan itu dipertahankan. Jika belum ada pilihan, resolver memilih kandidat terbaik; aktivitas mendesak dari program lain tampil sebagai banner dan tidak mengganti program utama secara diam-diam.
- Promo tidak boleh mendahului program aktif.
- Streak, poin, atau pencapaian bersifat sekunder dan tidak menggeser aktivitas belajar.

### 8.2 Program Saya

- Pisahkan `Aktif`, `Akan datang`, dan `Selesai/kedaluwarsa`.
- Setiap kartu menampilkan program, masa akses, progres, dan aktivitas berikutnya.
- Produk yang memberi akses ke program yang sama tidak membuat kartu ganda.
- Sumber akses dapat dilihat melalui detail, bukan memenuhi kartu utama.

### 8.3 Program Hub

- Header menampilkan nama program, periode, status akses, progres yang dapat dijelaskan, dan aksi berikutnya.
- Roadmap memperlihatkan tahap selesai, aktif, terkunci, dan opsional.
- Penguncian harus menjelaskan syarat: jadwal, prerequisite, atau hak akses.
- Konten yang sama hanya muncul sekali meski diberikan beberapa produk.

### 8.4 Jadwal

- Mode daftar menjadi default pada mobile; kalender tersedia sebagai alternatif.
- Warna kategori selalu disertai label atau ikon.
- Jadwal global dapat difilter berdasarkan program dan jenis kegiatan.
- Waktu menampilkan zona pengguna; bila berbeda dengan penyelenggara, keduanya dijelaskan.
- Kelas yang berubah jadwal menampilkan waktu lama dan baru pada notifikasi perubahan.

### 8.5 Materi dan rekaman

- Halaman materi mengutamakan keterbacaan dan kelanjutan progres.
- Video menyimpan posisi terakhir secara periodik.
- PDF dapat diunduh bila kebijakan konten mengizinkan; jika tidak, alasan ditampilkan.
- Tombol “Tandai selesai” hanya digunakan jika penyelesaian tidak dapat dideteksi.
- Materi berikutnya direkomendasikan setelah penyelesaian, tetapi pengguna tetap dapat kembali.

### 8.6 Tryout dan batch

- Daftar batch memisahkan status: akan datang, dapat dikerjakan, sedang berlangsung, menunggu hasil, dan selesai.
- Detail batch menjelaskan format, durasi, jumlah soal, percobaan, periode, aturan hasil, dan perangkat yang disarankan.
- Harga/promo hanya muncul jika pengguna belum memiliki akses.
- Pembelian tidak mengaburkan waktu pengerjaan; dua periode ditampilkan terpisah.

### 8.7 Exam runner

Exam runner menggunakan mode fokus dan tidak membawa navigasi aplikasi normal.

Wajib tersedia:

- nama ujian dan subtes;
- timer server;
- status simpan;
- nomor soal dan jumlah total;
- pertanyaan, media, dan pilihan;
- tandai/ragu-ragu;
- navigasi sebelumnya/berikutnya;
- daftar nomor dengan legenda;
- bantuan teknis yang tidak menghentikan timer;
- ringkasan sebelum submit.

Aturan kritis:

- Perubahan jawaban langsung masuk antrean autosave.
- Pindah soal tidak bergantung pada selesainya request simpan.
- Jika waktu habis, server melakukan submit berdasarkan jawaban terakhir yang diterima dan antrean lokal mencoba sinkronisasi terakhir sesuai kontrak ujian.
- Modal tidak boleh menutupi timer secara permanen.
- Aplikasi tidak menghukum siswa karena berpindah aplikasi; jika audit aktivitas diperlukan, jelaskan transparan dan jangan membuat klaim kecurangan otomatis.

### 8.8 Hasil dan progres

- Bedakan hasil sementara, final, dan dikoreksi.
- Ringkasan menjawab: hasil apa, artinya apa, dan apa yang dilakukan berikutnya.
- Untuk simulasi SNBT atau format nonresmi, gunakan label “Skor estimasi/simulasi Superlatif”.
- Passing grade resmi harus menyebut tahun dan versi aturan.
- Ranking tidak ditampilkan sebagai satu-satunya ukuran kemajuan.
- Pembahasan dapat dirilis terpisah dari nilai dan statusnya dijelaskan.

### 8.9 Akun, perangkat, dan bantuan

- Pengguna dapat mengubah profil, preferensi notifikasi, zona waktu, dan keamanan.
- Daftar sesi menunjukkan perangkat, lokasi perkiraan, serta waktu aktif terakhir.
- Keluar dari perangkat lain memerlukan konfirmasi.
- Bantuan membawa konteks halaman, program, batch, atau attempt agar pengguna tidak perlu menjelaskan ulang.

### 8.10 Admin

- Kepadatan informasi boleh lebih tinggi, tetapi hierarki dan status harus tetap jelas.
- Filter, kolom, dan urutan dapat disimpan per pengguna.
- Draft dan publikasi dipisahkan.
- Perubahan aturan ujian yang sudah digunakan membuat versi baru.
- Import besar berjalan sebagai job; admin boleh meninggalkan halaman dan mendapat notifikasi saat selesai.
- Setiap aksi berdampak mencatat pelaku, waktu, objek, perubahan, dan alasan bila diperlukan.

## 9. Form dan input

- Label selalu terlihat; placeholder hanya contoh.
- Input wajib ditandai dengan teks, bukan asterisk tanpa legenda.
- Validasi format dilakukan ketika pengguna selesai mengisi, bukan setiap karakter.
- Input tanggal dan waktu menerima keyboard serta picker.
- Pilihan dengan lebih dari sekitar tujuh item menggunakan pencarian.
- Perubahan panjang disimpan sebagai draft otomatis jika aman.
- Editor soal memiliki preview siswa dan memperingatkan media hilang atau opsi tidak lengkap.

## 10. Filter, pencarian, dan tabel

- Filter aktif terlihat sebagai chip dan dapat dihapus satu per satu.
- URL menyimpan filter penting agar hasil dapat dibagikan.
- Pencarian memberi tahu cakupan, misalnya “Cari judul, kode soal, atau topik”.
- Tabel admin memiliki header tetap, pemilihan baris, bulk action, pagination, dan total hasil.
- Bulk action selalu menyebut jumlah objek yang akan dipengaruhi.
- Export mengikuti filter aktif dan diproses di belakang layar untuk data besar.

## 11. Notifikasi

Pusat notifikasi mengelompokkan:

- tindakan diperlukan;
- jadwal dan perubahan;
- hasil dan pembahasan;
- konten baru;
- transaksi dan akses;
- promosi.

Aturan:

- Promosi dapat dimatikan tanpa mematikan notifikasi operasional.
- Status “dibaca” tersinkron lintas perangkat.
- Klik notifikasi membuka objek spesifik, bukan halaman umum.
- Pesan yang sama tidak dikirim berulang melalui in-app, email, dan WhatsApp tanpa kebijakan frekuensi.

## 12. Aksesibilitas

Target minimum: **WCAG 2.2 level AA**.

### 12.1 Input dan navigasi

- Semua fungsi dapat digunakan dengan keyboard.
- Urutan fokus mengikuti urutan visual dan logis.
- Focus ring terlihat jelas dan tidak dihapus.
- Touch target minimum 44 × 44 px dengan jarak memadai.
- Skip link tersedia pada aplikasi desktop dan exam runner.
- Fokus tidak boleh tertutup bottom navigation, sticky footer, cookie/incident banner, atau sheet (WCAG 2.2 Focus Not Obscured).
- Bantuan tetap dapat ditemukan konsisten: desktop melalui navigasi dan mobile melalui Akun serta context-help (Consistent Help).
- Authentication tidak memakai tes kognitif atau CAPTCHA yang mengandalkan hafalan/transkripsi tanpa alternatif aksesibel.
- Interaksi tidak boleh mensyaratkan dragging. Navigator subtes, pengurutan, slider, atau kontrol seret selalu memiliki alternatif satu-pointer/keyboard seperti tombol, select, atau input angka (WCAG 2.2 Dragging Movements 2.5.7).
- Informasi yang sudah dimasukkan atau tersedia dalam sesi/proses yang sama tidak diminta ulang; sistem mengisi otomatis atau menyediakan pilihan untuk menggunakan nilai sebelumnya, kecuali pengulangan diperlukan untuk keamanan dan dijelaskan (WCAG 2.2 Redundant Entry 3.3.7).

### 12.2 Konten

- Kontras teks dan komponen memenuhi rasio AA.
- Heading membentuk struktur, bukan sekadar gaya.
- Gambar informatif memiliki alt text; dekoratif diabaikan pembaca layar.
- Grafik hasil menyediakan ringkasan tekstual dan tabel data.
- Rumus matematika memiliki representasi yang dapat dibaca teknologi bantu.
- Source matematika menggunakan Markdown + LaTeX subset (`\(...\)` inline, `\[...\]` block) dan dirender sebagai HTML tersanitasi dengan MathML/accessible annotation.

### 12.3 Gerak dan media

- Preferensi `prefers-reduced-motion` dihormati.
- Tidak ada animasi berkedip atau perubahan otomatis yang mengganggu.
- Video memiliki caption; transkrip disediakan bila memungkinkan.
- Waktu ujian dan peringatan tidak hanya diumumkan secara visual.

### 12.4 Exam runner

- Opsi dapat dipilih melalui keyboard dan pembaca layar mengumumkan statusnya.
- Daftar nomor mengumumkan belum dijawab, dijawab, atau ditandai.
- Peringatan waktu menggunakan live region yang tidak berlebihan.
- Zoom browser tidak merusak navigasi dan tombol submit.

## 13. Bahasa dan microcopy

Karakter suara Superlatif:

- tenang dan meyakinkan;
- langsung, tidak birokratis;
- suportif, tidak menggurui;
- jujur tentang ketidakpastian;
- menggunakan istilah seleksi yang akurat.

| Hindari | Gunakan |
|---|---|
| “Kamu gagal!” | “Target bagian ini belum tercapai.” |
| “Error 422” | “Beberapa data belum lengkap.” |
| “Submit” | “Kirim jawaban” / “Publikasikan batch” |
| “Waktu habis!!!” | “Waktu selesai. Jawaban terakhir sedang dikirim.” |
| “Akses ditolak” | “Program ini belum termasuk dalam aksesmu.” |
| “Beli sekarang sebelum terlambat” | “Harga promo berlaku sampai Jumat, 21.00 WIB.” |

Tanggal menggunakan bentuk `27 Agu 2026, 19.00 WIB`. Durasi menggunakan bahasa manusia seperti `1 jam 40 menit`, bukan `100 mins`.

## 14. Performa yang dirasakan pengguna

Target UX awal:

- konten utama muncul secepat mungkin pada jaringan seluler menengah;
- perpindahan halaman inti tidak mengosongkan shell aplikasi;
- gambar disajikan responsif dan lazy-loaded di luar viewport;
- media soal prioritas di-prefetch dengan batas aman;
- input dan pilihan merespons dalam satu frame yang terasa langsung;
- autosave tidak memblokir navigasi ujian;
- halaman admin besar menggunakan pagination atau virtualisasi.

Angka teknis final ditetapkan di Gate 3, tetapi desain tidak boleh bergantung pada koneksi ideal.

## 15. Privasi dan keamanan dalam UX

- Alasan pengumpulan nomor WhatsApp, data sekolah, atau informasi lain dijelaskan di dekat input.
- Data sensitif tidak ditampilkan penuh pada tempat publik atau notifikasi push.
- Session timeout memperingatkan pengguna lebih dahulu jika ada input belum tersimpan.
- Tidak ada pola menipu untuk persetujuan pemasaran.
- Audit perangkat dan aktivitas ujian dijelaskan transparan dalam kebijakan yang mudah ditemukan.
- Pengguna di bawah ambang umur legal diarahkan ke flow consent wali; status menunggu tidak boleh membuka pemrosesan opsional.
- Opt-in WhatsApp terpisah per kategori dan dapat dicabut tanpa mematikan notifikasi layanan wajib.
- Hak akses, koreksi, ekspor, dan penghapusan data tersedia melalui Akun/Bantuan sesuai kebijakan retensi yang disetujui.

## 16. Event UX minimum

Nama event kanonik, envelope, prohibited properties, dan retensi berada di `19_ANALYTICS_HABIT_AND_NOTIFICATION.md` serta `analytics-event-catalog.json`. Tabel berikut hanya memetakan layar ke event kanonik dan tidak boleh membuat alias baru.

| Area | Event utama |
|---|---|
| Beranda | `home_viewed`, `next_action_clicked`, `program_switched` |
| Program | `program_opened`, `roadmap_step_opened`, `resource_started`, `resource_completed` |
| Jadwal | `schedule_filtered`, `live_class_joined`, `calendar_added` |
| Tryout | `batch_opened`, `attempt_started`, `answer_saved`, `attempt_resumed`, `attempt_submitted` |
| Hasil | `result_viewed`, `explanation_opened`, `remediation_started` |
| Commerce | `offer_viewed`, `checkout_started`, `payment_status_viewed` |
| Admin | `question_imported`, `review_completed`, `batch_published`, `access_adjusted` |

Event tidak boleh merekam isi jawaban, token, atau data sensitif tanpa kebutuhan dan kebijakan khusus.

## 17. Checklist penerimaan UX

Gate 2 dianggap memenuhi spesifikasi apabila:

- [ ] Semua layar inti memiliki loading, empty, error, dan success state yang relevan.
- [ ] Tindakan berikutnya konsisten antara beranda dan program hub.
- [ ] Program dengan beberapa produk tidak tampil ganda.
- [ ] Status akses dan alasan penguncian dapat dipahami tanpa menghubungi admin.
- [ ] Exam runner aman digunakan saat koneksi tidak stabil.
- [ ] Seluruh alur inti dapat diselesaikan dan reflow pada lebar 320 CSS px tanpa scrolling dua dimensi, kecuali konten yang memang dikecualikan WCAG.
- [ ] Seluruh fungsi inti dapat dijalankan dengan keyboard.
- [ ] Bahasa tidak menggunakan tekanan palsu atau rasa malu.
- [ ] Hasil simulasi dan hasil resmi dibedakan.
- [ ] Admin dapat meninggalkan proses import tanpa kehilangan job.
- [ ] Setiap layar memiliki satu aksi utama yang jelas.

## 18. Keputusan tersisa setelah review visual

Keputusan berikut sudah terkunci dan tidak boleh dibuka ulang tanpa ADR: pilihan program utama manual menang, urgensi program lain menjadi banner; denominator progres hanya aktivitas wajib yang released; bantuan utama adalah tiket in-app dengan eskalasi WhatsApp.

Yang masih membutuhkan prototype/UAT:

1. Apakah navigasi desktop terbuka penuh atau diperkecil secara default pada rentang lebar tertentu?
2. Seberapa jauh jenis resource tertentu boleh diunduh untuk penggunaan offline sesuai content policy?
3. Apakah pembahasan dapat dibuka per soal atau sekaligus setelah `explanation_releases_at`? Waktu rilis tetap milik batch.
