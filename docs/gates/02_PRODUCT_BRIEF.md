# Superlatif Web App - Product Brief

**Versi:** 1.0-RC2 — audit-resolved baseline  
**Tanggal:** 28 Agustus 2026  
**Product owner:** Zulfadhli Ashari / PT Superlatif Juara Indonesia

## 1. Definisi satu kalimat

Superlatif Web App adalah platform pembelajaran mindset-first dan program-centric yang mengubah setiap produk milik siswa menjadi satu perjalanan belajar yang jelas berisi arahan, jadwal, live learning, materi, tryout, hasil, dan aktivitas berikutnya.

## 2. Mengapa produk ini perlu dibuat

Siswa tidak mengalami pendidikan sebagai kumpulan fitur software. Mereka mengalami sebuah tujuan:

- lulus seleksi Kedinasan;
- meningkatkan kemampuan SKD;
- mempersiapkan TKA atau SNBT;
- membangun kembali kepercayaan diri dan konsistensi belajar;
- mengetahui apa yang harus dilakukan berikutnya.

WordPress saat ini efektif untuk akuisisi dan commerce, tetapi tidak harus memikul seluruh pengalaman belajar. Siswa yang sudah membayar membutuhkan satu ruang yang tenang dan jelas, yang langsung menjawab:

1. Program apa yang saya miliki?
2. Apa yang harus saya lakukan berikutnya?
3. Jadwal apa yang paling dekat?
4. Apakah saya berkembang dan apa yang masih perlu diperbaiki?

## 3. Product thesis

Jika Superlatif mengorganisasi pengalaman berdasarkan program dan satu next action yang bermakna, sambil menjaga commerce dan ujian tetap andal, siswa akan lebih percaya diri, menyelesaikan lebih banyak aktivitas belajar, kembali secara konsisten, dan memahami nilai dari pembelian atau upgrade program.

Framework Superlatif harus terlihat dalam perilaku produk:

| Framework | Penerapan di produk |
|---|---|
| Mindset - WHY | Orientasi, tujuan, mentor guidance, makna progres, refleksi, pesan yang membangun kepercayaan diri |
| Skillset - HOW | Roadmap, urutan belajar, jadwal kelas, strategi belajar, feedback topik, remediasi |
| Toolset - WHAT | LMS, live class, rekaman, modul, exam engine, hasil, analytics, notifikasi |

Mindset-first bukan menambahkan kutipan motivasi pada dashboard. Mindset-first berarti mengurangi kebingungan, membantu siswa memahami kegagalan, dan mengubah data menjadi langkah berikutnya yang dapat dilakukan.

## 4. Brand promise di dalam produk

**Janji utama:** Siap ujian, siap bertumbuh.

App harus membuat siswa merasa:

- **jelas:** saya tahu posisi dan langkah berikutnya;
- **mampu:** kelemahan saya masih dapat diperbaiki;
- **didampingi:** program ini membimbing, bukan hanya menjual konten;
- **memegang kendali:** akses, jadwal, attempt, dan hasil mudah dipahami;
- **bergerak:** kemajuan kecil terlihat dan bermakna.

## 5. Pengguna utama

### 5.1 Fokus pasar pertama

- Siswa SMA, lulusan, dan mahasiswa awal yang mempersiapkan seleksi Kedinasan.
- Siswa Kelas Akselerasi Kedinasan atau paket spesialis SKD.
- Siswa yang membeli satu atau beberapa batch tryout SKD.

### 5.2 Pasar ekspansi

- Siswa yang mempersiapkan TKA dan SNBT.
- Pelamar CPNS dan PPPK.
- Siswa yang mempersiapkan ujian mandiri kampus.
- Sekolah atau institusi pengguna program Superlatif.

Pasar ekspansi memengaruhi desain domain, tetapi tidak semuanya menerima production QA pada rilis pertama.

### 5.3 Pengguna operasional

- Super Admin.
- Operations Admin.
- Academic Admin.
- Tutor/Question Writer.
- Moderator/Reviewer.
- Live-Class Coordinator.
- Customer Support.
- Finance/Reconciliation.

Delapan nama di atas adalah role kanonik berbasis permission, bukan jabatan organisasi yang harus diisi delapan orang berbeda. Satu anggota tim dapat menerima beberapa role, tetapi pemisahan tugas tetap berlaku: penulis tidak boleh menyetujui soal sendiri, dan perubahan hasil/akses berisiko tinggi memerlukan approver berbeda.

## 6. Masalah yang diselesaikan

### Masalah siswa

- Pembelian dan fasilitas terpecah di beberapa produk dan sistem.
- Siswa tidak selalu tahu benefit mana berasal dari paket mana.
- Materi, tryout, live class, rekaman, dan jadwal terasa sebagai dunia terpisah.
- Langkah berikutnya tidak jelas setelah login.
- Hasil hanya menjawab "berapa skor saya?", bukan "sekarang saya harus apa?"
- Koneksi buruk atau ganti device mengurangi kepercayaan saat ujian.
- Payment pending atau gagal dapat membuat status akses tidak jelas.

### Masalah bisnis

- WordPress membership menjalankan fungsi yang lebih tepat berada di app khusus.
- Kombinasi produk baru berisiko menyebabkan duplikasi konten dan kerja akses manual.
- Flash-sale tryout memerlukan sale, exam, result, dan review window terpisah.
- Bundle, upgrade, beasiswa, refund, dan pembelian tumpang tindih memerlukan entitlement yang andal.
- Paket teknis lama tidak dapat memodelkan arah program-centric.
- Tim operasional memerlukan bulk import, review gate, dan publishing yang dapat diaudit.

## 7. Bentuk produk yang diusulkan

### Pengalaman siswa

Navigasi utama:

- Beranda
- Program Saya
- Jadwal
- Hasil & Progres
- Bantuan
- Akun

Navigasi mobile dapat dipadatkan menjadi Beranda, Program, Jadwal, Progres, dan Akun.

Program menjadi container utama. Program dapat menampilkan tab berikut jika relevan:

- Ringkasan
- Roadmap
- Jadwal
- Tryout
- Materi & Rekaman
- Komunitas
- Progres

Tab bersifat kontekstual. Produk tryout-only tidak menampilkan tab live class atau materi yang kosong.

### Pengalaman commerce

- Katalog, status kepemilikan, dan status pembelian terlihat di app.
- Checkout diarahkan ke halaman Sejoli dengan branding konsisten.
- Nama, email, dan WhatsApp di-prefill jika aman dan didukung.
- Payment success membuat atau memperbarui akses otomatis.
- Siswa kembali ke app dan melihat onboarding program yang dibeli.
- WordPress Member Area tidak menjadi tujuan belajar utama jangka panjang.

### Pengalaman admin

- Mapping product dan offer ke Sejoli.
- Pengelolaan program, track, roadmap, dan resource.
- Penjadwalan live class dan publikasi rekaman.
- Pengelolaan exam blueprint, form, dan batch.
- Question editor dan import XLSX + ZIP gambar.
- Review dan approval workflow.
- Pencarian, pemberian, pencabutan, dan audit entitlement.
- Monitoring hari-H dan tindakan support.

## 8. Contoh portofolio produk

| Produk yang dijual | Pengalaman siswa | Kapabilitas yang diberikan |
|---|---|---|
| Kelas Akselerasi Kedinasan 2026 | Full program hub | Roadmap, live class, rekaman, modul, SKD tryout, selected advanced tracks, komunitas |
| Paket SKD Intensif | Specialist program | Materi TWK/TIU/TKP, kelas tertentu, SKD tryout, progres |
| Paket TKA | Specialist program | Mapel wajib, mapel pilihan, materi, dan TKA tryout setelah blueprint production-ready |
| Tryout Pass SKD | Compact tryout program | Koleksi batch tertentu |
| TO SKD Batch 01 | Journey event dan hasil | Satu ranked batch, attempt tertentu, hasil dan pembahasan |
| Beasiswa/akses manual | Pengalaman program yang sama | Hanya sumber akses yang berbeda |

## 9. Outcome dan metrik keberhasilan

Baseline perlu ditetapkan setelah instrumentation aktif. Dokumen ini menentukan apa yang diukur, bukan memaksakan target tanpa data.

### Trust dan reliability

| Metrik | Arah yang diinginkan |
|---|---|
| Payment selesai sampai akses terlihat | Mendekati real time; exception memicu alert |
| Insiden jawaban hilang | Nol insiden terkonfirmasi |
| Keberhasilan autosave dan recovery | Tinggi dan dipantau per batch |
| Tiket "akses saya di mana?" | Menurun |
| Reconciliation mismatch | Terdeteksi dan diselesaikan dengan audit trail |

### Aktivasi siswa

| Metrik | Definisi |
|---|---|
| Purchased-to-activated | Pembeli yang membuka programnya |
| First meaningful action | Mulai lesson, masuk kelas, atau memulai tryout eligible pertama |
| Time to first value | Payment success sampai first meaningful action |
| Onboarding completion | Setup wajib selesai, termasuk pilihan mapel jika relevan |

### Learning engagement

| Metrik | Definisi |
|---|---|
| Weekly active program user | Menyelesaikan aktivitas program bermakna dalam 7 hari |
| Next-action completion | Menyelesaikan aktivitas yang direkomendasikan di Beranda |
| Live-class attendance | Peserta eligible yang hadir, disesuaikan dengan program recording-first |
| Tryout completion | Ranked attempt yang dimulai dan submit valid |
| Result-to-remediation | Siswa melakukan perbaikan setelah melihat hasil |

### Business value

| Metrik | Definisi |
|---|---|
| Catalogue-to-checkout | Viewer eligible yang memulai checkout |
| Checkout-to-active access | Order success yang benar-benar menjadi akses aktif |
| Flash-sale conversion | Unique viewer eligible yang membeli sebelum offer berakhir |
| Upgrade conversion | Pemilik paket spesialis yang naik ke program lebih lengkap |
| Repeat purchase | Pembeli membeli offer berbeda tanpa kebingungan akses duplikat |
| Support cost per active student | Beban operasional terkait akses dan delivery pembelajaran |

### Habit dan kepercayaan diri yang etis

| Metrik | Guardrail |
|---|---|
| 7-day meaningful return | Tidak menghitung buka kosong tanpa aktivitas |
| Streak continuation | Tidak menggunakan rasa malu, ancaman, atau kehilangan progres |
| Notification opt-out/complaint | Memantau kelelahan channel |
| Student confidence pulse | Check-in ringan dan opsional; bukan diagnosis kesehatan mental |

## 10. Keunggulan strategis

- Superlatif dapat menjual berbagai kombinasi tanpa menyalin konten atau membuat dashboard baru per campaign.
- WordPress dan Sejoli tetap menjalankan fungsi yang sudah menghasilkan revenue.
- App menjadi lapisan hubungan siswa jangka panjang, bukan hanya antarmuka ujian.
- Program journey menyediakan tempat alami untuk mindset guidance.
- Blueprint berversi memungkinkan ekspansi ke CPNS, PPPK, TKA, SNBT, TPA/TBI, dan ujian mandiri tanpa hardcode satu sistem skor.
- Data akses yang andal memperbaiki support, segmentasi, dan product analytics.

## 11. Constraints

- Rilis pertama harus baik pada Android kelas menengah dan koneksi tidak stabil.
- WordPress, Sejoli, checkout, kupon, affiliate, dan payment yang berjalan tidak boleh terganggu.
- Tim dapat mengelola konten rutin tanpa bantuan engineer.
- Aturan ujian resmi dapat berubah setiap tahun; scoring dan passing rule harus berversi.
- Skor simulasi tidak boleh diklaim sama dengan skor resmi.
- Data pribadi, data ujian, dan perubahan akses harus diaudit dan dibatasi berdasarkan role.

## 12. Risiko utama

| Risiko | Arah mitigasi |
|---|---|
| Scope berubah menjadi rebuild EdTech all-in-one | Tegakkan MVP dan release gate |
| Event Sejoli tidak lengkap/konsisten | Audit payload nyata, idempotency, replay, reconciliation dashboard |
| Katalog dan konten terlalu terikat | Pisahkan product, offer, program, resource, dan access grant |
| Exam engine penuh percabangan khusus | Blueprint dan scoring policy berversi |
| Bulk import menciptakan kesalahan massal | Validate, preview, moderate, lalu publish |
| Gangguan mobile merusak kepercayaan | Offline queue, resume, server time, status jelas, audit support |
| Gamifikasi mengurangi keseriusan | Fokus progres dan next action; tunda energy system |
| Klaim marketing tanpa sumber masuk produk | Evidence register dan copy review |

## 13. Pernyataan untuk penyelarasan internal

Superlatif Web App bukan skin WordPress baru dan bukan LMS generik. Ia adalah learning operating system untuk seluruh program Superlatif. Commerce tetap stabil di belakang; siswa melihat satu identitas, satu perjalanan program, satu jadwal, serta catatan akses dan progres yang dapat dipercaya.
