# Gate 2 — Review Guide 1.0-RC2

**Paket:** UX dan Design Superlatif Web App  
**Status:** Siap dianalisis  
**Tanggal:** 28 Agustus 2026

## 1. Hasil Gate 2

Gate 2 mengubah keputusan produk Gate 1 menjadi pengalaman pengguna yang konkret. Fondasi utamanya:

> Superlatif adalah web app program-centric. Materi, live class, tryout, rekaman, jadwal, komunitas, dan progres berada di dalam konteks program yang dimiliki siswa.

Paket ini mencakup:

| File | Fungsi |
|---|---|
| `06_USER_JOURNEYS.md` | Journey siswa, pembelian, multi-produk, flash sale, admin, dan bulk import |
| `07_INFORMATION_ARCHITECTURE_AND_SITEMAP.md` | Navigasi, sitemap, route, hierarki program, dan admin IA |
| `08_USER_FLOWS_AND_EDGE_CASES.md` | Flow normal, state gagal, akses bertumpuk, ujian, dan koreksi |
| `09_UX_SPECIFICATION.md` | Perilaku halaman, state, responsive, accessibility, copy, dan analytics |
| `10_UI_DESIGN_BRIEF.md` | Arah visual Calm Momentum dan batas orisinalitas benchmark |
| `11_DESIGN_SYSTEM.md` | Token, komponen, state, exam UI, admin UI, dan governance |
| `12_SCREEN_SPECIFICATIONS.md` | Spesifikasi 40+ layar/state siswa, commerce, exam, dan admin |
| Prototype interaktif | Uji struktur Beranda, Program Hub, dan mobile navigation |

## 2. Keputusan desain yang sudah direkomendasikan

1. Navigasi siswa tidak memisahkan tryout, materi, dan live class menjadi aplikasi terpisah.
2. Dashboard mengutamakan satu aktivitas berikutnya.
3. Promo berada setelah aktivitas belajar aktif.
4. Progres harus dapat dijelaskan dengan aktivitas wajib selesai/total.
5. Entitlement yang bertumpuk tidak membuat program atau konten ganda.
6. Roadmap seleksi menjadi struktur khas Superlatif.
7. Exam runner memakai mode fokus tanpa navigasi dan promo umum.
8. Mobile memakai lima tujuan utama: Beranda, Program, Jadwal, Progres, Akun.
9. Admin memakai editor manual serta bulk XLSX + ZIP media dengan validation job.
10. Arah visual `Calm Momentum` memakai deep teal, green accent, mint, dan netral hangat.
11. Aksesibilitas menargetkan WCAG 2.2 AA.
12. Benchmark hanya menjadi audit clarity/warmth; tidak disalin secara literal.

## 3. Keputusan yang perlu disetujui Fadhli

Keputusan ini tidak menghalangi review Gate 2, tetapi harus dikunci sebelum Gate 3 final:

| No. | Keputusan | Rekomendasi |
|---:|---|---|
| 1 | Sidebar desktop dapat diperkecil? | Ya, tetapi default terbuka pada desktop lebar |
| 2 | Program utama dapat dipilih manual? | Ya; sistem tetap memberi default berdasarkan urgensi |
| 3 | Rumus progres program | Hanya aktivitas wajib; opsional ditampilkan terpisah |
| 4 | Download/offline materi | PDF terpilih dan video hanya jika kebijakan konten mengizinkan |
| 5 | Rilis pembahasan | Konfigurabel per batch, default setelah periode pengerjaan selesai |
| 6 | Kanal bantuan | Tiket in-app sebagai pencatatan + WhatsApp sebagai eskalasi |
| 7 | Kekuatan palet | Gunakan versi tenang; bright green hanya sebagai aksen |
| 8 | Maskot | Tidak masuk MVP |

## 4. Urutan review yang paling efektif

1. Baca dokumen 06–08 untuk memeriksa logika pengalaman.
2. Buka prototype dan nilai hierarki Beranda/Program Hub/mobile.
3. Baca dokumen 09–11 untuk menguji konsistensi UX dan visual.
4. Audit dokumen 12 terhadap flow dan edge case.
5. Putuskan delapan hal pada bagian 3.
6. Catat kontradiksi atau keputusan baru sebelum memulai Gate 3.

## 5. Prompt audit untuk Claude

Gunakan prompt berikut bersama seluruh dokumen Gate 1 dan Gate 2:

```text
Audit paket Superlatif Gate 1 dan Gate 2 sebagai product architect, senior UX designer,
dan exam-platform specialist. Jangan menulis ulang dokumen dahulu.

Periksa:
1. kontradiksi antara product catalog/entitlement dengan user journey dan screen specs;
2. apakah seluruh flow purchase → payment → access → onboarding tertutup;
3. apakah multi-product dan overlapping entitlement dapat dipahami siswa;
4. apakah flash-sale batch membedakan sales, attempt, result, dan explanation period;
5. apakah exam runner menangani autosave, resume, offline, timeout, dan correction;
6. apakah admin bulk import mendukung XLSX, ZIP gambar, preview, review, dan idempotency;
7. apakah mobile navigation dan program-centric IA konsisten;
8. apakah accessibility dan error states cukup untuk masuk technical design;
9. keputusan bisnis/teknis yang masih ambigu;
10. requirement yang tidak memiliki acceptance criteria.

Keluaran:
- Critical contradictions
- Missing requirements
- Ambiguous decisions
- UX risks
- Technical implications for Gate 3
- Recommended document-level edits

Sertakan nama file dan heading untuk setiap temuan. Bedakan fakta dokumen dari inferensi.
Jangan mengubah keputusan bisnis tanpa menandainya sebagai rekomendasi.
```

## 6. Gate 2 acceptance checklist

- [x] User journeys mencakup siswa baru, migrasi, multi-produk, flash sale, dan admin.
- [x] IA desktop/mobile dan program hub terdefinisi.
- [x] Flow akses, payment, attempt, dan correction memiliki edge cases.
- [x] UX states dan accessibility terdokumentasi.
- [x] Arah visual memiliki batas terhadap benchmark.
- [x] Token dan component inventory tersedia.
- [x] Layar student, commerce, exam, dan admin dipetakan.
- [x] Prototype struktural Beranda, Program Hub, dan mobile tersedia.
- [ ] Persetujuan owner atas keputusan terbuka.
- [ ] Audit silang Claude/Fadhli selesai.
- [ ] High-fidelity P0 disetujui.

## 7. Batas Gate 2

Paket ini belum mengunci:

- framework frontend/backend;
- struktur database;
- API dan webhook;
- algoritma entitlement final;
- storage dan queue;
- angka SLA/performance teknis;
- formula scoring per regulasi;
- high-fidelity visual final.

Hal tersebut masuk Gate 3 setelah pengalaman dan keputusan terbuka Gate 2 disetujui.
