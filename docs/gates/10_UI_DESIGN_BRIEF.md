# 10 — UI Design Brief

**Proyek:** Superlatif Web App  
**Arah desain:** Calm Momentum  
**Status:** Gate 2 — siap ditinjau  
**Versi:** 1.0-RC2  
**Tanggal:** 28 Agustus 2026

## 1. Ringkasan

Superlatif membutuhkan antarmuka belajar yang terasa terarah, dewasa, dan tetap hangat. Produk ini tidak boleh terlihat sebagai kumpulan fitur edtech generik, dashboard penjualan, maupun tiruan produk referensi.

Arah yang direkomendasikan bernama **Calm Momentum**:

> Ruang persiapan seleksi yang menenangkan, menunjukkan kemajuan secara jujur, dan selalu memberi satu langkah berikutnya yang masuk akal.

## 2. Tujuan emosional

Saat membuka aplikasi, siswa seharusnya merasa:

- **tenang** — tahu apa yang penting tanpa dibombardir informasi;
- **mampu** — progres dan kekurangan dijelaskan sebagai sesuatu yang dapat diperbaiki;
- **terarah** — melihat langkah berikutnya, tenggat, dan hubungannya dengan tujuan;
- **didampingi** — bahasa, jadwal, dan bantuan terasa manusiawi;
- **bergerak** — ada momentum kecil setiap kali kembali.

Antarmuka tidak mengejar rasa “seru” dengan poin, energi, atau ledakan warna. Motivasi dibentuk lewat kejelasan tujuan, kemajuan yang terlihat, dan pengalaman yang dapat dipercaya.

## 3. Sasaran utama desain

1. Membuat program yang dibeli menjadi pusat pengalaman.
2. Menjadikan aktivitas berikutnya terlihat dalam beberapa detik.
3. Menyatukan materi, jadwal, live class, tryout, rekaman, dan progres di dalam konteks program.
4. Menjaga exam runner fokus dan kredibel.
5. Memungkinkan admin mengelola konten padat tanpa terlihat seperti form WordPress lama.
6. Menghasilkan identitas visual yang khas Superlatif dan dapat berkembang ke CPNS, kedinasan, TKA, SNBT, maupun program lain.

## 4. Benchmark dan batas orisinalitas

Referensi visual diperlakukan sebagai bahan audit, bukan template.

### 4.1 SainsIn

Yang layak dipelajari:

- jarak dan pengelompokan komponen yang relatif rapi;
- state komponen yang mudah dikenali;
- konsistensi bentuk kartu dan kontrol;
- penyajian data belajar yang ringkas.

Yang tidak diikuti:

- navigasi yang memecah Tryout, Latihan, Belajar, dan Program sebagai dunia terpisah;
- dominasi XP, streak, energi, dan kuota pada beranda;
- dashboard tiga kolom yang padat untuk layar siswa;
- susunan, ikon, warna, dan bentuk komponen secara literal.

### 4.2 Alternatifa

Yang layak dipelajari:

- kehangatan dan keberanian memberi kepribadian;
- empty state yang tidak terasa teknis;
- hubungan yang lebih ramah antara produk dan siswa.

Yang tidak diikuti:

- bidang warna oranye/ungu yang sangat dominan;
- pemisahan Habit, Airdrop, Program, Tryout, dan Live Class yang memperbesar kompleksitas mental;
- mata uang/gamifikasi sebagai pusat pengalaman;
- ruang dekoratif besar yang menggeser informasi penting;
- karakter, ilustrasi, layout, atau gaya merek secara literal.

### 4.3 Prinsip turunan

Superlatif mengambil **clarity** dari benchmark pertama dan **warmth** dari benchmark kedua, lalu menyusun identitasnya sendiri melalui narasi perjalanan seleksi, palet hijau yang tenang, dan hierarki program-centric.

## 5. Konsep visual: Calm Momentum

### 5.1 Metafora utama

Metafora desain adalah **perjalanan terarah**:

- jalur menunjukkan roadmap;
- penanda menunjukkan milestone;
- kompas menunjukkan arah berikutnya;
- horizon menunjukkan tujuan;
- ritme langkah menunjukkan progres.

Metafora digunakan secara abstrak dan hemat. Jangan memenuhi UI dengan gunung, peta, atau garis perjalanan dekoratif.

### 5.2 Karakter bentuk

- Sudut membulat sedang: ramah tanpa terlihat kekanak-kanakan.
- Permukaan bersih dengan border halus.
- Bayangan tipis hanya untuk hierarki, bukan ornamen.
- Bidang warna besar digunakan pada satu hero program, bukan di setiap kartu.
- Garis progres dan roadmap lebih khas daripada badge koleksi.

### 5.3 Kepadatan

Tiga mode kepadatan:

| Mode | Pengguna | Karakter |
|---|---|---|
| Student calm | Siswa pada aplikasi normal | Ruang lega, satu aksi utama, ringkasan terkurasi |
| Exam focus | Siswa saat ujian | Sangat fokus, minim ornamen, informasi kritis persisten |
| Admin productive | Admin/tutor/moderator | Lebih padat, filter dan tabel efisien, state eksplisit |

## 6. Palet warna awal

Palet lengkap berada di `11_DESIGN_SYSTEM.md`. Arah penggunaannya:

- **Deep teal** untuk kepercayaan, navigasi, dan aksi utama.
- **Bright green** untuk momentum, progres, dan aksen; bukan untuk teks putih kecil.
- **Mint** untuk permukaan yang menenangkan.
- **Warm cream** untuk selingan konten dan pengumuman nonkritis.
- **Blue** untuk informasi.
- **Amber** untuk perhatian dan tenggat.
- **Red** hanya untuk error atau aksi destruktif.

Hijau tidak digunakan untuk semua hal. Warna status mengikuti makna, bukan dekorasi.

## 7. Tipografi

Rekomendasi utama: **Plus Jakarta Sans** sebagai satu keluarga untuk seluruh aplikasi.

Alasan:

- karakter Indonesia yang modern dan mudah dibaca;
- tersedia dalam banyak bobot;
- cukup hangat untuk siswa dan cukup netral untuk admin;
- numeralia jelas untuk timer dan hasil.

Aturan:

- Heading singkat dan informatif.
- Body minimal 16 px pada pengalaman belajar utama.
- Angka timer memakai tabular numerals.
- Tidak menggunakan huruf kapital seluruhnya untuk heading.
- Rumus dirender sebagai matematika, bukan gambar jika memungkinkan.

Fallback: `Inter, ui-sans-serif, system-ui, sans-serif`.

## 8. Ikonografi

- Gunakan satu keluarga ikon outline dengan ketebalan konsisten.
- Ikon selalu mendukung label pada navigasi utama.
- Status kritis tidak mengandalkan ikon tanpa teks.
- Ikon program boleh memiliki bidang lembut untuk membedakan kategori.
- Hindari campuran emoji, ikon 3D, dan ikon outline pada area yang sama.

Kategori visual yang perlu tersedia:

- program dan track;
- materi, video, live class, rekaman;
- tryout, timer, hasil, pembahasan;
- progres dan milestone;
- transaksi dan hak akses;
- bantuan dan keamanan.

## 9. Ilustrasi dan fotografi

### 9.1 Ilustrasi

Gaya yang dianjurkan:

- geometris lembut;
- komposisi sederhana;
- outline atau bidang datar dengan palet terbatas;
- tema perjalanan, fokus, belajar, dan dukungan;
- dapat digunakan pada empty state dan onboarding.

Gaya yang dihindari:

- maskot yang terlalu dominan;
- karakter anak-anak untuk audiens dewasa muda;
- gradien neon atau 3D glossy generik;
- ilustrasi detail yang memperlambat layar;
- elemen budaya/institusi yang dapat dianggap sebagai klaim afiliasi resmi.

Maskot bukan kebutuhan MVP. Jika dikembangkan kemudian, maskot harus berfungsi sebagai pemandu ringan, bukan sumber reward atau pop-up konstan.

### 9.2 Fotografi

Gunakan fotografi untuk marketing atau profil pengajar, bukan sebagai latar setiap layar. Foto tutor harus konsisten dalam pencahayaan, crop, dan latar.

## 10. Tata letak

### 10.1 Grid

- Desktop: grid 12 kolom dengan konten utama yang tidak terlalu lebar.
- Tablet: 8 kolom.
- Mobile: 4 kolom.
- Gutters mengikuti skala spacing, minimal 16 px pada mobile.

### 10.2 Hierarki beranda

Elemen paling dominan adalah kartu program utama dengan aktivitas berikutnya. Setelah itu:

1. jadwal terdekat;
2. roadmap perjalanan;
3. aktivitas terbaru;
4. program lain;
5. penawaran relevan.

Tidak ada widget XP besar, leaderboard global, atau banner penjualan di atas aktivitas utama.

### 10.3 Program hub

Program hub menggunakan header program yang tenang, tab kontekstual, dan konten sesuai fase. Roadmap harus terasa sebagai struktur program, bukan daftar kartu fitur.

### 10.4 Exam runner

- Header tipis berisi identitas, timer, dan status simpan.
- Soal menjadi fokus visual terbesar.
- Panel nomor dapat runtuh pada layar kecil.
- Warna pilihan terpilih, benar, dan salah dibedakan dengan label/ikon.
- Tidak ada sidebar program, promo, streak, atau notifikasi umum.

### 10.5 Admin

- Filter dan aksi bulk dekat dengan tabel.
- Toolbar tetap ringkas saat menggulir daftar panjang.
- Warna status lebih banyak digunakan, tetapi selalu semantik.
- Builder kompleks memakai langkah atau section, bukan satu halaman form tanpa struktur.

## 11. Komponen pembeda Superlatif

### 11.1 Next Action Card

Komponen tanda tangan produk. Memuat:

- konteks program;
- nama aktivitas;
- alasan prioritas;
- waktu/durasi;
- progres jika dilanjutkan;
- satu aksi utama.

Desain harus bekerja untuk live class, materi, attempt, roadmap, dan rekomendasi pemulihan.

### 11.2 Journey Roadmap

Roadmap memperlihatkan hubungan antara SKD, TPA–TBI, administrasi, kesehatan/kebugaran, wawancara, dan tahap akhir. Ia tidak boleh sekadar stepper kosmetik; setiap tahap dapat dibuka dan memiliki status nyata.

### 11.3 Access Explanation

Ketika konten terkunci, komponen menjelaskan:

- apa yang terkunci;
- sebabnya;
- produk atau syarat yang membuka;
- apakah pengguna sudah memiliki akses dari sumber lain;
- jalur bantuan bila data terasa salah.

### 11.4 Result-to-Action

Hasil tidak berhenti pada angka. Komponen menghubungkan kelemahan dengan aktivitas berikutnya, misalnya “Latih deret angka selama 20 menit”.

## 12. Motion

Motion hanya membantu orientasi dan feedback:

- transisi 120–240 ms;
- perubahan tab dan accordion tidak melompat;
- progres boleh bergerak sekali saat data masuk;
- success kecil dapat memakai perubahan ikon;
- tidak ada confetti pada hasil ujian rutin;
- pengaturan reduced motion dihormati.

Momentum berasal dari alur, bukan animasi berlebihan.

## 13. Visualisasi data

- Gunakan grafik hanya jika memudahkan perbandingan atau tren.
- Skor utama selalu tersedia sebagai teks.
- Radar chart tidak menjadi default karena sulit dibandingkan; bar atau line chart lebih mudah dibaca.
- Baseline, target, dan periode harus jelas.
- Warna seri konsisten antarlayar.
- Ranking menyertakan ukuran populasi dan waktu pembaruan.

## 14. Responsivitas

Desain dibuat mulai dari mobile, kemudian diperluas.

Pada mobile:

- next action muncul sebelum statistik;
- jadwal memakai daftar;
- roadmap memakai daftar vertikal;
- tabel hasil berubah menjadi ringkasan dan detail expandable;
- filter menjadi bottom sheet;
- daftar nomor ujian menjadi sheet penuh yang mudah ditutup;
- bottom navigation tetap memiliki label.

## 15. Nada visual per keadaan

| Keadaan | Nada visual |
|---|---|
| Aktivitas normal | Tenang, dominan netral dan teal |
| Live sekarang | Aksen kuat tetapi tidak berkedip |
| Tenggat dekat | Amber, waktu eksplisit |
| Berhasil | Hijau lembut, fokus pada langkah berikutnya |
| Hasil di bawah target | Netral-suportif, tidak dominan merah |
| Error sistem | Merah semantik, instruksi pemulihan jelas |
| Akses terkunci | Netral/amber, sebab dan jalur penyelesaian |
| Ujian | Fokus tinggi, kontras kuat, tanpa dekorasi |

## 16. Prinsip desain konten

- Judul menjelaskan tujuan halaman, bukan nama fitur internal.
- Status menggunakan bahasa waktu nyata: `Bisa dikerjakan sampai 30 Agu, 21.00 WIB`.
- Hindari scarcity palsu dan klaim keberhasilan absolut.
- Gunakan `program`, `track`, `batch`, dan `attempt` secara konsisten di sistem internal; antarmuka siswa boleh memakai padanan yang lebih manusiawi.
- Jangan menggunakan “passing grade” untuk target internal Superlatif.

## 17. Deliverable desain berikutnya

Setelah brief disetujui, desainer membuat:

1. eksplorasi moodboard dan dua variasi intensitas palet;
2. fondasi token dan komponen inti;
3. responsive high-fidelity untuk Beranda, Program Hub, Exam Runner, Hasil, dan Bulk Import;
4. state loading, empty, error, locked, dan offline;
5. prototype alur pembelian–akses dan tryout;
6. uji reflow dan keterbacaan pada lebar 320 CSS px;
7. audit aksesibilitas awal.

## 18. Kriteria penerimaan

- [ ] Desain tidak menyerupai susunan layar benchmark secara literal.
- [ ] Dalam lima detik, siswa dapat mengenali program aktif dan tindakan berikutnya.
- [ ] Promo tidak lebih dominan daripada aktivitas belajar.
- [ ] Program, track, dan fasilitas memiliki hierarki visual yang jelas.
- [ ] Mobile bukan sekadar desktop yang diperkecil.
- [ ] Exam runner memiliki mode visual yang fokus.
- [ ] Admin dapat bekerja dengan data padat tanpa kehilangan status dan konteks.
- [ ] Semua status penting terbaca tanpa warna.
- [ ] Arah visual terasa dewasa muda, hangat, dan kredibel.
- [ ] Komponen khas Superlatif terlihat pada next action, journey roadmap, dan result-to-action.

## 19. Hal yang tidak dilakukan pada Gate 2

Dark mode penuh ditunda sebagai keputusan sadar. Karena persona utama belajar malam hari, high-fidelity dan UAT wajib menguji low-glare light theme: surface tidak menyilaukan, brightness tidak menjadi satu-satunya kontrol, serta kontras teks/komponen tetap AA. Hasil UAT menentukan prioritas dark mode fase berikutnya.

Konten matematika memakai Markdown + LaTeX subset yang sama dengan kontrak impor, lalu dirender sebagai HTML tersanitasi dan output aksesibel; screenshot rumus tidak boleh menjadi format utama.

- Finalisasi logo atau identitas merek korporat.
- Produksi ilustrasi lengkap.
- Pembuatan maskot.
- Dark mode final.
- Animasi marketing.
- High-fidelity untuk seluruh layar admin.

Dokumen ini mengunci arah, bukan menggantikan eksplorasi visual terukur sebelum implementasi.
