# 11 — Design System

**Nama kerja:** Superlatif Calm Momentum  
**Status:** Audit-resolved candidate — menunggu validasi visual  
**Versi:** 1.0-RC2  
**Tanggal:** 28 Agustus 2026

## 1. Tujuan

Design system ini memberi bahasa bersama untuk desain dan implementasi Superlatif. Ia mencakup token, pola komponen, state, responsivitas, aksesibilitas, dan aturan konten. Nilai warna dan ukuran masih dapat disempurnakan melalui uji kontras dan high-fidelity, tetapi semantik dan struktur komponennya menjadi acuan Gate 3.

## 2. Prinsip sistem

1. **Semantic first:** nama token menjelaskan fungsi, bukan sekadar warna.
2. **Program-centric:** komponen umum selalu dapat membawa konteks program.
3. **State complete:** setiap komponen mendefinisikan default, hover, focus, active, disabled, loading, dan error bila relevan.
4. **Mobile complete:** komponen bukan hanya mengecil, tetapi mengubah pola interaksi sesuai ruang.
5. **Accessible by default:** aksesibilitas dibangun di primitive, bukan ditambahkan di akhir.
6. **Density aware:** satu fondasi mendukung student calm, exam focus, dan admin productive.

## 3. Token warna awal

Nilai berikut adalah proposal awal dan harus diverifikasi pada mockup final.

### 3.1 Brand

| Token | Nilai | Peran |
|---|---:|---|
| `brand.900` | `#0B4F45` | Aksi utama, navigasi, teks brand kuat |
| `brand.700` | `#087A63` | Hover/active, ikon, progres kuat |
| `brand.500` | `#03D37B` | Aksen momentum dan visual progres |
| `brand.200` | `#A9EED5` | Border/indikator brand lembut |
| `brand.100` | `#DDF8EE` | Tonal surface, selected state |
| `brand.50` | `#EFFBF7` | Latar brand sangat lembut |

`brand.500` tidak digunakan sebagai latar tombol dengan teks putih kecil sebelum lulus uji kontras. Aksi utama menggunakan `brand.900`.

### 3.2 Neutral

| Token | Nilai | Peran |
|---|---:|---|
| `neutral.950` | `#102522` | Teks utama |
| `neutral.700` | `#38544E` | Teks sekunder kuat |
| `neutral.600` | `#55706A` | Teks sekunder |
| `neutral.500` | `#6D817C` | Batas fungsional/ikon bermakna di surface putih |
| `neutral.400` | `#91A6A1` | Placeholder/ikon pasif |
| `neutral.250` | `#C7D5D1` | Border kuat |
| `neutral.150` | `#D9E5E2` | Border standar |
| `neutral.75` | `#EDF3F1` | Divider/surface muted |
| `neutral.25` | `#F6FAF9` | Canvas aplikasi |
| `white` | `#FFFFFF` | Surface utama |

### 3.3 Semantic

| Semantik | Strong | Surface | Border | Penggunaan |
|---|---:|---:|---:|---|
| Success | `#087A55` | `#DFF8EC` | `#91DFC2` | Selesai, tersimpan, akses aktif |
| Info | `#2D6CDF` | `#E8F0FF` | `#ABC3F5` | Informasi, perubahan jadwal |
| Warning | `#8A4B00` | `#FFF3D6` | `#F0CD83` | Tenggat, perlu perhatian |
| Danger | `#B42318` | `#FEE4E2` | `#F2A6A0` | Error, destruktif, masalah sinkronisasi |

### 3.4 Data visualization

Urutan seri awal:

| Token | Nilai |
|---|---:|
| `data.1` | `#087A63` |
| `data.2` | `#2D6CDF` |
| `data.3` | `#B36B00` |
| `data.4` | `#6D4AFF` |
| `data.5` | `#C2415D` |

Grafik tidak memakai lebih dari lima warna tanpa grouping atau kontrol. Target dan baseline menggunakan pola/garis yang tetap dapat dibedakan tanpa warna.

## 4. Token permukaan dan elevasi

| Token | Definisi |
|---|---|
| `surface.canvas` | `neutral.25` |
| `surface.default` | `white` |
| `surface.subtle` | `neutral.75` |
| `surface.brand` | `brand.50` |
| `surface.inverted` | `brand.900` |
| `border.default` | `neutral.150` |
| `border.strong` | `neutral.250` |
| `border.functional` | `neutral.500` |
| `focus.ring` | `brand.900` |

Elevasi:

- `elevation.0`: tanpa bayangan, border opsional;
- `elevation.1`: kartu interaktif atau toolbar;
- `elevation.2`: popover, menu, sticky control;
- `elevation.3`: dialog.

Bayangan harus lembut dan tidak menggantikan border untuk keterbacaan.

`border.default` dan divider lembut hanya dekoratif dan tidak boleh menjadi satu-satunya cara mengenali kontrol, state, atau batas yang bermakna. Input, focus, selected state, ikon/status bermakna, serta boundary yang diperlukan untuk memahami komponen memakai `border.functional`, label/shape, atau token semantic strong dengan kontras non-text minimal 3:1. `brand.500` hanya aksen dekoratif/progres yang juga memiliki teks atau track berkontras; ia tidak membawa makna sendirian.

## 5. Tipografi

### 5.1 Keluarga

```text
font.sans = "Plus Jakarta Sans", Inter, ui-sans-serif, system-ui, sans-serif
font.mono = "IBM Plex Mono", ui-monospace, SFMono-Regular, monospace
```

Font mono hanya untuk kode soal, ID referensi, dan data teknis tertentu. Timer menggunakan sans dengan tabular numerals.

### 5.2 Skala

| Token | Ukuran/line-height | Bobot | Penggunaan |
|---|---|---:|---|
| `display.sm` | 36/44 | 700 | Hero marketing terbatas |
| `heading.xl` | 28/36 | 700 | Judul halaman besar |
| `heading.lg` | 24/32 | 700 | Header program |
| `heading.md` | 20/28 | 600 | Judul section |
| `heading.sm` | 18/26 | 600 | Judul kartu |
| `body.lg` | 18/30 | 400 | Materi baca |
| `body.md` | 16/24 | 400 | Body utama |
| `body.sm` | 14/20 | 400 | Metadata |
| `label.md` | 14/20 | 600 | Button/input |
| `label.sm` | 12/16 | 600 | Chip/status |
| `caption` | 12/16 | 400 | Bantuan sekunder |

Pada mobile, `heading.xl` dapat turun menjadi 24/32, tetapi body utama tidak turun di bawah 16 px untuk materi dan soal.

## 6. Spacing dan ukuran

Sistem memakai dasar 4 px.

| Token | Nilai |
|---|---:|
| `space.0` | 0 |
| `space.1` | 4 px |
| `space.2` | 8 px |
| `space.3` | 12 px |
| `space.4` | 16 px |
| `space.5` | 20 px |
| `space.6` | 24 px |
| `space.8` | 32 px |
| `space.10` | 40 px |
| `space.12` | 48 px |
| `space.16` | 64 px |

Aturan:

- Padding kartu siswa umumnya 20–24 px desktop dan 16–20 px mobile.
- Jarak antarsection 32–48 px.
- Jarak label–input 8 px.
- Touch target minimum 44 × 44 px.
- Toolbar admin boleh menggunakan kontrol tinggi 36–40 px; pengalaman siswa 44–48 px.

## 7. Radius dan border

| Token | Nilai | Penggunaan |
|---|---:|---|
| `radius.sm` | 8 px | Input, chip, kontrol kecil |
| `radius.md` | 12 px | Kartu dan popover |
| `radius.lg` | 16 px | Hero program, dialog |
| `radius.full` | 999 px | Avatar, pill |

Border standar 1 px. Border 2 px hanya untuk focus, selected, atau state penting.

## 8. Motion

| Token | Nilai | Penggunaan |
|---|---:|---|
| `duration.fast` | 120 ms | Hover, pressed |
| `duration.base` | 180 ms | Accordion, tab |
| `duration.slow` | 240 ms | Drawer, dialog |
| `easing.standard` | `cubic-bezier(.2,0,0,1)` | Transisi umum |

Tidak ada animasi yang wajib untuk memahami state. Reduced motion menghapus transform/gerak dan mempertahankan feedback instan.

## 9. Layout tokens

| Token | Nilai awal |
|---|---:|
| `layout.content.max` | 1200 px |
| `layout.reading.max` | 760 px |
| `layout.sidebar` | 248 px |
| `layout.exam.aside` | 280 px |
| `layout.gutter.mobile` | 16 px |
| `layout.gutter.tablet` | 24 px |
| `layout.gutter.desktop` | 32 px |

Grid: 4 kolom mobile, 8 tablet, 12 desktop.

## 10. Icon system

- Ukuran: 16, 20, 24, dan 32 px.
- Stroke konsisten.
- `aria-hidden=true` untuk ikon dekoratif.
- Icon-only button wajib memiliki accessible name dan tooltip desktop.
- Ikon status dipasangkan dengan label atau teks tersembunyi.

## 11. Primitive components

### 11.1 Button

Varian:

- `primary` — aksi utama;
- `secondary` — alternatif penting;
- `ghost` — aksi ringan;
- `danger` — destruktif;
- `link` — navigasi inline;
- `icon` — dengan accessible name.

Ukuran: small 36, medium 44, large 48 px. State: default, hover, focus-visible, pressed, disabled, loading.

### 11.2 Input

Jenis: text, number, password, search, date, time, file, textarea, rich text, select, combobox.

Struktur:

1. label;
2. optional hint;
3. control;
4. validation/error;
5. character count jika relevan.

Disabled digunakan hanya ketika kontrol benar-benar tidak dapat diubah. Read-only memiliki tampilan berbeda dan masih dapat disalin.

### 11.3 Checkbox, radio, switch

- Checkbox: memilih nol atau lebih.
- Radio: memilih tepat satu.
- Switch: mengubah keadaan yang berlaku segera.
- Switch tidak digunakan untuk keputusan yang memerlukan `Simpan`.

### 11.4 Badge dan status chip

Badge adalah metadata ringkas. Status chip memiliki semantik dan label jelas, misalnya `Aktif`, `Menunggu pembayaran`, `Berakhir 2 hari lagi`, `Perlu review`.

### 11.5 Tooltip, popover, dialog, sheet

- Tooltip hanya penjelasan singkat dan bukan tempat informasi wajib.
- Popover untuk kontrol kontekstual kecil.
- Dialog untuk keputusan terfokus.
- Bottom sheet menggantikan popover/filter kompleks pada mobile.
- Focus trap dan pengembalian fokus wajib.

### 11.6 Toast dan banner

- Toast maksimal dua aksi dan hilang otomatis hanya jika informasinya tidak kritis.
- Banner berada dekat cakupan masalah.
- Error sinkronisasi ujian tidak pernah hanya berupa toast sementara.

## 12. Navigation components

### 12.1 Desktop sidebar

- Logo/wordmark.
- Enam tujuan utama.
- Item aktif, hover, focus, dan badge.
- Profil ringkas di bagian bawah.
- Dapat menjadi rail bila keputusan Gate 2 menyetujuinya.

### 12.2 Mobile bottom navigation

- Lima item berlabel.
- Tinggi memperhitungkan safe area.
- Label tidak disembunyikan.
- Badge hanya untuk tindakan yang perlu perhatian.

### 12.3 Tabs

- Underline atau tonal tab, satu pola per konteks.
- Scrollable pada mobile.
- State aktif terlihat tanpa hanya warna.
- Tab map ke URL.

### 12.4 Breadcrumb

- Maksimal empat tingkat terlihat.
- Tingkat tengah dapat diringkas.
- Tingkat terakhir adalah label, bukan link.

## 13. Student domain components

### 13.1 Program Card

Properti:

- program name;
- category/period;
- access status;
- explainable progress;
- next activity;
- primary action;
- optional thumbnail/accent.

Varian: active, upcoming, expired, compact, featured.

### 13.2 Next Action Card

Properti:

- priority type;
- program/track context;
- title;
- reason;
- date/duration;
- resume progress;
- CTA.

Varian: live now, deadline, resume, roadmap, remediation, complete.

### 13.3 Journey Roadmap

Properti tahap:

- label;
- summary;
- completion count;
- state: completed/current/available/locked/optional;
- prerequisite/lock explanation;
- target date.

Desktop dapat horizontal jika tahap sedikit, tetapi default yang paling fleksibel adalah vertikal.

### 13.4 Schedule Item

Properti: date, time, timezone, category, title, program, attendance state, join/add-calendar action, change indicator.

### 13.5 Resource Row/Card

Jenis: article, PDF, video, recording, quiz, exercise. Memuat durasi, status, prerequisite, progres, dan accessibility metadata bila relevan.

### 13.6 Batch Card

Properti: exam family, batch name, sales period, attempt period, result period, access state, attempts, price if needed, CTA.

### 13.7 Result Summary

Memuat status result, score/estimate label, comparison/target, subscore, release/correction timestamp, next action, dan link pembahasan.

### 13.8 Access Explanation

Varian: pending payment, expired, not included, prerequisite, schedule locked, manual review. CTA harus sesuai penyebab.

## 14. Exam components

### 14.1 Exam Header

Memuat ujian/subtes, timer, save state, connection state, help, dan exit sesuai policy.

### 14.2 Question Stem

Mendukung rich text yang disanitasi, rumus, tabel, satu atau beberapa gambar, bacaan bersama, alt text, dan zoom media.

### 14.3 Answer Option

Varian:

- single choice;
- multi choice;
- true/false category;
- weighted choice (bobot tersembunyi dari siswa);
- numeric input.

State selama ujian: default, hover, focus, selected, disabled. State pembahasan: correct, incorrect selected, correct answer, neutral, weighted explanation.

### 14.4 Question Navigator

State nomor: current, unanswered, answered, flagged, sync pending, error. Legenda wajib tampil. Mobile menggunakan full-height sheet atau panel.

### 14.5 Save Status

State:

- `Menyimpan…`;
- `Tersimpan` + waktu opsional;
- `Menunggu koneksi`;
- `Gagal disimpan` + retry.

### 14.6 Submit Review

Menampilkan total dijawab, belum dijawab, ditandai, waktu tersisa, dan dampak submit. Pengguna dapat kembali ke kategori nomor.

## 15. Admin components

### 15.1 Data Table

Fitur: sort, filter, column visibility, selection, bulk action, pagination, sticky header, empty/error/loading, dan export.

### 15.2 Filter Bar

Mendukung pencarian, filters, saved view, reset, jumlah hasil, dan indikator filter aktif.

### 15.3 Builder Shell

Untuk product, program, blueprint, exam form, dan batch. Menampilkan:

- status draft/published;
- section navigation;
- validation summary;
- autosave state;
- preview;
- publish action.

### 15.4 Import Job

Tahap: select files, uploading, validating, preview, importing, complete/partial/failed. Ringkasan menunjukkan jumlah valid, warning, dan error, serta laporan yang dapat diunduh.

### 15.5 Review Panel

Question preview di satu sisi dan metadata/checklist di sisi lain pada desktop; bertahap pada mobile/tablet. Mendukung approve, request changes, comment, dan next item.

### 15.6 Audit Timeline

Menampilkan pelaku, waktu, action, perubahan sebelum/sesudah, alasan, dan source/system.

## 16. State matrix minimum

Setiap komponen interaktif diuji terhadap state relevan berikut:

| State | Visual | Behavior |
|---|---|---|
| Default | Normal | Siap digunakan |
| Hover | Perubahan halus | Desktop pointer only |
| Focus-visible | Ring 2 px | Keyboard focus |
| Pressed | Elevasi/warna berubah | Feedback langsung |
| Selected | Label/ikon/border | Nilai terpilih |
| Disabled | Kontras berkurang | Tidak interaktif, alasan tersedia |
| Loading | Label/status stabil | Aksi ganda dicegah |
| Error | Danger semantic + teks | Pemulihan tersedia |
| Offline | Warning + status antrean | Tidak membuat klaim server |

## 17. Responsiveness by component

| Komponen | Desktop | Mobile |
|---|---|---|
| Sidebar | Penuh/rail | Bottom nav + drawer konteks |
| Hero program | Dua kolom | Satu kolom, CTA penuh |
| Roadmap | Vertikal/kompak | Vertikal |
| Schedule | Kalender + daftar | Daftar default |
| Tabs | Inline | Scroll horizontal |
| Results | Chart + summary | Summary dulu, chart opsional |
| Exam navigator | Panel kanan | Sheet |
| Admin table | Table | Bukan target utama; card/scroll terbatas |
| Dialog | Centered | Full-width dialog/sheet |

## 18. Accessibility contract

- Reflow diuji pada 320 CSS px dan zoom 200%; sticky control tidak boleh menutupi fokus.
- Focus indicator memakai `focus.ring`, minimal 2 px, dan tetap terlihat pada semua surface.
- Bantuan konsisten tersedia pada desktop dan mobile, serta autentikasi tidak bergantung pada tes kognitif tanpa alternatif.
- Warna semantic surface yang lembut selalu dipasangkan dengan strong text/icon dan label; border lembut tidak dianggap indikator status.

- Kontras teks normal ≥ 4.5:1; teks besar ≥ 3:1.
- Kontras komponen dan focus indicator ≥ 3:1.
- Touch target minimum 44 × 44 px.
- Heading dan landmarks semantik.
- Semua form memiliki label terprogram.
- Error dikaitkan dengan field melalui atribut aksesibilitas.
- Live region dibatasi agar pembaca layar tidak dibanjiri perubahan timer/autosave.
- Data visual memiliki teks/tabel alternatif.
- Warna bukan satu-satunya pembeda.

## 19. Content tokens

Terminologi siswa:

| Konsep internal | Label siswa |
|---|---|
| entitlement | Akses |
| attempt | Pengerjaan / Percobaan |
| exam form | Paket soal |
| batch | Batch tryout |
| resource | Materi / Rekaman / Latihan |
| scoring policy | Aturan penilaian |
| reconciliation | Pemeriksaan akses |

Format:

- tanggal: `27 Agu 2026`;
- waktu: `19.00 WIB`;
- tanggal dan waktu: `27 Agu 2026, 19.00 WIB`;
- durasi: `1 jam 40 menit`;
- angka Indonesia: separator ribuan titik, desimal koma;
- mata uang: `Rp49.000`.

## 20. Tema

Arsitektur token harus mendukung tema gelap di masa depan, tetapi dark mode bukan scope MVP. Exam runner boleh memiliki opsi kontras tinggi setelah pengujian aksesibilitas. Jangan membuat tema gelap parsial yang menghasilkan state tidak konsisten.

## 21. Governance

Komponen wajib tambahan untuk RC2: `ProgramSwitcher`, `ServerCountdown`, `LeaderboardTable/Card` dengan opt-in display name, `NotificationItem`, `OnboardingStepper`, `SubtestNavigator`, `GenericEmptyState`, `QuestionReportAction`, dan `AccommodationIndicator`.

Perubahan design system:

1. jelaskan masalah pengguna;
2. audit apakah komponen sudah ada;
3. buat proposal dan state lengkap;
4. uji pada student, exam, dan admin jika lintas domain;
5. audit aksesibilitas;
6. dokumentasikan versi dan migrasi.

Komponen baru tidak dibuat hanya karena satu layar membutuhkan variasi kosmetik.

## 22. Checklist implementasi komponen

- [ ] Memakai token, bukan nilai acak.
- [ ] State keyboard dan screen reader tersedia.
- [ ] Reflow dan tetap dapat digunakan pada lebar 320 CSS px.
- [ ] Interaksi seret memiliki alternatif klik/tap/keyboard.
- [ ] Input yang sudah tersedia dalam satu proses tidak diminta ulang tanpa alasan keamanan.
- [ ] Mendukung teks panjang dan bahasa Indonesia.
- [ ] Memiliki loading, empty, dan error jika data-driven.
- [ ] Tidak mengandalkan hover.
- [ ] Tidak mengandalkan warna saja.
- [ ] Mencatat event hanya jika diperlukan.
- [ ] Snapshot/visual regression tersedia.
- [ ] Dokumentasi contoh dan anti-contoh tersedia.

## 23. Keputusan terbuka

- Validasi final palet dan kontras pada perangkat nyata.
- Apakah sidebar desktop dapat diperkecil.
- Keluarga ilustrasi dan kepemilikan aset.
- Batas penggunaan gradien brand.
- Apakah admin memakai density switch.
- Apakah dark mode masuk fase pasca-MVP atau tidak diprioritaskan.
