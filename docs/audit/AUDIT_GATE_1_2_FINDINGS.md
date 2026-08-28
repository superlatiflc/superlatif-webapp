# Audit Gate 1 & Gate 2 — Temuan dan Register Keputusan

**Tanggal audit:** 27 Agustus 2026
**Cakupan:** Dokumen 00–12 + `GATE_2_REVIEW_GUIDE.md` + Deck Compro Superlatif Mar 2026 (2 berkas)
**Peran auditor:** product architect, senior UX designer, LMS/exam-platform specialist, system integration architect, critical independent reviewer
**Laporan lengkap (versi terbaca):** https://claude.ai/code/artifact/0bb4a1a3-ace3-4cd0-884e-08d4f7a9c076

**Status:** Audit saja. Tidak ada dokumen yang diubah. Seluruh usulan menunggu persetujuan founder sesuai instruksi proyek.

---

## A. Putusan

**Approved with Revisions (bersyarat).**

Gate 1 sehat secara substansi. Gate 2 lengkap sebagai peta pengalaman tetapi belum konsisten sebagai kontrak. Rekomendasi: **jangan buka Gate 3 sebagai satu paket** — pecah menjadi tiga jalur.

| Jalur Gate 3 | Status | Syarat |
|---|---|---|
| Entitlement, IA, design system | Boleh mulai | Selesaikan revisi P0 (K-01, K-07, K-08, K-09, R-01) |
| Kontrak exam | Diblokir | Keputusan D1–D4 + penulisan `Exam Contract v2` |
| Kontrak commerce | Diblokir | Spike payload Sejoli nyata (sudah diminta di 05 §11.3, 04 §14) |

### Lima risiko terbesar

1. **Integrasi Sejoli masih hipotesis tetapi sudah menjadi fondasi UX.** 08 §3 dan 12 §15 C03 dibangun di atas asumsi return-reference dan webhook bersignature yang 05 §11.3 sendiri nyatakan belum diverifikasi.
2. **Ranking tryout berpotensi tidak sah.** "randomization pool" (12 §32) + leaderboard per batch (05 §7, 12 §33) + larangan klaim kesetaraan skor (03 §5) tidak dapat berlaku bersamaan.
3. **Janji produk legacy 2026 belum pernah didaftar.** Deck Mar 2026 sudah menjual "Free Akses Record Seumur Program", "25 Paket TO (15 SKD, 5 TPA, 5 TBI)", "Bimbingan Semua Tahapan: TPA & TBI, Kebugaran, Psikotest & Wawancara", sementara 03 §4 menempatkan TPA/TBI di luar produksi MVP dan 05 §5 mewajibkan janji historis dihormati.
4. **Perlindungan data anak tidak disebut sama sekali.** Target 02 §5.1 "Siswa SMA" sebagian besar di bawah 18 tahun; tidak ada UU PDP, consent wali, retensi, atau hak penghapusan di dokumen mana pun.
5. **Kontrak template soal ditunda ke Gate 4** padahal validasi 08 §11, editor A06, checklist A09, dan enam tipe soal E03 semuanya turunan darinya.

### Batasan audit

`Instruksi superlatif.txt` (sumber otoritatif #1 menurut 00 §2) dan prototype interaktif (diklaim tersedia dan tercentang di GATE_2_REVIEW_GUIDE §1 dan §6) **tidak ada di Project Knowledge**. Temuan tentang nada brand dan hierarki visual Beranda/Program Hub tidak dapat diverifikasi terhadap sumbernya.

---

## B. Kontradiksi kritis (18)

| ID | Sev | Judul | Konflik | Founder? |
|---|---|---|---|---|
| K-01 | Critical | Route katalog dan program hub bertabrakan | 07 §3 (`/programs/:programSlug`, `/catalog/offers/:offerSlug`) vs 12 §2.1–2.2 (S04 `/program/:slug`, C01 `/program`, C02 `/program/:offer`). `/program/:offer` dan `/program/:slug` pola URL identik untuk dua entitas berbeda; dua bahasa route | Tidak |
| K-02 | Critical | Batch tryout keluar dari konteks program | 07 §1 prinsip 3, §3 (`/programs/:slug/tryouts/:batchSlug`), §17 acceptance vs 12 §2.3 E01 `/tryout/:batch`. 05 §3 menyatakan satu batch bisa milik beberapa product → konteks tak dapat di-resolve | Tidak |
| K-03 | Critical | Randomization pool vs ranked leaderboard | 12 §32 A10 "randomization pool" vs 05 §2 (form immutable) + 05 §7/12 §33 (leaderboard) + 03 §5 (larangan klaim kesetaraan). 08 §9 tidak menyebut randomization sama sekali | **Ya** |
| K-04 | Critical | Exam form boleh dipakai ulang setelah pembahasan rilis | 05 §3 ("beberapa batch terkontrol") + 05 §7 ritme mingguan + window review. Tidak ada aturan larangan; 12 §32 hanya punya exposure warning level soal | **Ya** |
| K-05 | Critical | Tiga definisi next-action resolver | 06 §5 vs 08 §6 vs 09 §5. Attempt belum selesai vs deadline <24h dibalik; live "<30 menit" (06) vs "berlangsung"/"24 jam" (09); `DEADLINE_SOON` tanpa ambang. Acceptance 12 §7 S04 tak dapat diuji | Tidak |
| K-06 | High | Onboarding 3 langkah vs 6 bagian | 06 §3 + 08 §5 ("maksimal tiga langkah") vs 12 §16 C04 (6 bagian) | Tidak |
| K-07 | High | C03 mencampur purchase state dan access state | 05 §6 + §8.2 (harus terpisah) vs 12 §15 C03 (memuat "Active"). "Partially refunded" & "Chargeback" hilang dari C03 dan dari state diagram 08 §3 | Tidak |
| K-08 | High | Zona waktu tetap vs zona pengguna | 07 §8 + 05 §8.3 (Asia/Jakarta) vs 09 §8.4 + 12 §13 S13 (zona pengguna). Indonesia 3 zona; risiko salah baca deadline ujian | Tidak |
| K-09 | High | Dua versi IA dan route admin | 07 §11 (12 area, Indonesia) vs 12 §23 (10 item, Inggris). "Import Soal" dan "Live Ops" hilang sebagai area top-level di 12 | Tidak |
| K-10 | High | Peran live-class coordinator hilang | 02 §5.3 (7 peran) vs 07 §12 (6 kolom). A04 tanpa role pemilik | **Ya** |
| K-11 | High | Practice attempt: ada di entitlement, ditunda di scope, hilang di UX | 05 §8.4 + 04 §4 vs 03 §6 Fase 1.1 vs 12 §18 E01 & 11 §13.6 (attempts tunggal) | **Ya** |
| K-12 | High | Late-sync dapat mengubah skor tanpa state hasil | 05 §7 cutoff + 08 §9 vs 09 §8.7 (submit dari jawaban yang diterima). 08 §10 mendefinisikan `Corrected` hanya untuk ralat soal | Tidak |
| K-13 | High | "Tahan completion screen" tanpa batas waktu | 08 §9 vs 09 §2 invariant 6 dan 12 §21 E05. Tidak ada timeout untuk koneksi mati permanen | Tidak |
| K-14 | High | Rumus progres: tetap vs configurable | GATE_2 §2 no.4 + 09 §2 invariant 4 vs 12 §8 S05 ("kecuali dikonfigurasi"). 12 §26 A03 tidak punya field-nya | **Ya** |
| K-15 | Medium | Submit per subtes vs submit satu ujian | 12 §20 E03 ("submit section") vs 11 §14.6 + 12 §21 E05 (ringkasan seluruh ujian). Navigasi antar-subtes tak ditentukan; 12 §32 field "navigation" tanpa nilai | **Ya** |
| K-16 | Medium | Copy checkout menyamarkan perpindahan sistem | 00 §7 OQ-003 + 02 §7 + 06 §3 (handoff Sejoli) vs 12 §14 ("sistem commerce Superlatif/mitra"). Bertabrakan dengan 09 §15 larangan dark pattern | **Ya** |
| K-17 | Medium | Aturan completion video tanpa tempat konfigurasi | 08 §8 ("threshold atau tombol sesuai policy") vs 09 §8.5 (prefer deteksi otomatis); 12 §26 A03 tanpa field | Tidak |
| K-18 | Medium | Item analysis ditunda tetapi dipakai layar | 03 §6 Fase 1.1 vs 12 §24 A01 "reported questions" + 12 §28 A05 "quality flags" + 08 §12 langkah 1 | Tidak |

---

## C. Requirement yang hilang (16)

| ID | Sev | Judul | Bukti | Founder? |
|---|---|---|---|---|
| M-01 | Critical | Perlindungan data anak dan consent | 02 §5.1 target "Siswa SMA"; 03 §3.4, 09 §15, 12 §13 tidak menyebut UU PDP, consent wali, retensi, hak penghapusan, notifikasi insiden | **Ya** |
| M-02 | Critical | Template XLSX + konvensi ZIP tidak dispesifikasikan | 03 §3.3 + 08 §11 + 12 §30 A07 mengasumsikan template; sheet/kolom/kode soal/referensi gambar/bobot TKP/passage tidak pernah didefinisikan. 00 §8 menaruhnya di Gate 4 | Tidak |
| M-03 | Critical | Register janji produk legacy 2026 | 00 §7 OQ-002, 05 §17, 04 §14 menunjuk daftar yang belum dibuat. Deck sudah menjual janji spesifik yang mengikat menurut 05 §5 | **Ya** |
| M-04 | High | Tidak ada model akses gratis | 05 §8.1 tanpa tier free; 12 §5 S02 menyebut free resource tanpa model. Deck menjanjikan "Free Access" dan "Free Dashboard Updates" ke seluruh ekosistem | **Ya** |
| M-05 | High | Leaderboard tanpa layar, komponen, atau opt-in | 00 §7 OQ-008 + 01 §2 + 05 §7 + 12 §33 mensyaratkan opt-in; 12 §2 tanpa layar, 11 §13 tanpa komponen, 12 §13 S13 tanpa pengaturan display name | **Ya** |
| M-06 | High | Akomodasi waktu ujian per siswa tanpa surface | 05 §8.4 + 08 §9 + 04 §10 + 03 P12 mensyaratkan; 12 §34 A12 hanya extend akses, 12 §35 A13 level batch | Tidak |
| M-07 | High | Siswa tak punya cara melaporkan soal | 01 §2 + 07 §11 + 12 §24 + 08 §12 mengandalkan laporan; tak ada aksi siswa. 12 §20 E03 hanya report media gagal | Tidak |
| M-08 | High | Notifikasi tanpa surface admin & tanpa consent WhatsApp | 01 §6 + 09 §11 + 03 §3.4 mensyaratkan template/delivery log/monitoring; tak ada layar admin. WhatsApp tanpa opt-in, kategori template, atau biaya | **Ya** |
| M-09 | High | Kebijakan pasca-expiry tak dapat dikonfigurasi | 06 §9, 08 §8, 12 §6 S03, 07 §5 semua bergantung pada "policy" yang tak pernah didefinisikan; 12 §25 A02 tanpa field retensi/read-only | **Ya** |
| M-10 | High | Nasib attempt, hasil, dan ranking setelah refund | 05 §10 E4 hanya mengatur grant. Attempt selesai, hasil, dan posisi di snapshot ranking tak diatur; 01 §2 menyiratkan snapshot immutable | **Ya** |
| M-11 | Medium | Tak ada mekanisme deteksi "jawaban hilang" | 02 §9 menargetkan nol insiden tanpa definisi deteksi; 12 §35 A13 hanya memantau latency/error rate, bukan rekonsiliasi antrean klien vs jawaban tersimpan | Tidak |
| M-12 | Medium | Tak ada flow void batch dan retake massal | 12 §35 A13 + 08 §10 + 05 §8.4 menyiratkan; tak ada flow/layar grant retake massal maupun matriks keputusan insiden hari-H | Tidak |
| M-13 | Medium | Dua dari tujuh tab Program Hub tanpa layar | 07 §6 + 12 §7 S04 mendefinisikan 7 tab; 12 §2.1 hanya menyediakan 5 (S04–S08). Komunitas dan Progres program kosong. Catatan: keanggotaan grup eksternal tak dapat dicabut app saat akses berakhir → 05 §5 "link validity" tidak enforceable | Tidak |
| M-14 | Medium | Evidence register klaim marketing tak dibuat | 02 §12 menetapkan mitigasinya; 01 §5 menandai 3 klaim deck (<2%, 80%, "pertama di Indonesia"); tak ada artefak, pemilik, atau aturan copy di 09 §13 | Tidak |
| M-15 | Low | Palet data viz belum lengkap | 11 §3.4 menyebut 5 seri; "violet gelap" dan "coral gelap" tanpa hex. 10 §13 mensyaratkan konsistensi seri antarlayar | Tidak |
| M-16 | Low | Tak ada token warna focus ring | 11 §16 + §7 + §18 mensyaratkan ring 2px ≥3:1; 11 §3 tak memuat tokennya | Tidak |

---

## D. Keputusan ambigu (11)

| ID | Ambiguitas | Isi | Sumber |
|---|---|---|---|
| A-01 | Tryout Pass: program atau koleksi | 04 §14 menyatakan belum dijawab; 02 §8 "compact tryout program"; 05 §4.3 aturan koleksi; 12 tanpa layar. Notifikasi batch baru masuk Pass (05 §12 Contoh D) tak ditentukan | 02 §8, 04 §14, 05 §4.3/§12, 07 §6 |
| A-02 | Program utama: manual vs urgensi | 09 §8.1 otomatis + dapat diganti; 06 §7 diganti dari Program Saya; 12 §4 switcher di Beranda. Apakah manual mengalahkan LIVE_NOW? Per-akun atau per-perangkat? | 06 §7, 09 §8.1, 12 §4 |
| A-03 | Batas "single active UI session" | 08 §9 satu sesi + takeover vs 12 §20 E03 "timer konsisten lintas tab/perangkat". Tab kedua di perangkat sama tak dibedakan; grace/konfirmasi/audit tak ditentukan | 04 §11, 08 §9, 12 §20 |
| A-04 | Semantik provisional → final | 08 §10 + 12 §22 memuat keduanya tanpa definisi apa yang membuat final dan apakah skor bisa berubah; 05 §7 memisahkan window tanpa aturan isi | 05 §7, 08 §10, 12 §22 |
| A-05 | Idempotency import punya 3 mekanisme | 12 §30 (import ID/question code) vs 08 §11 (retry + larangan overwrite published) vs 06 §12 (pilihan update draft/revision). Perilaku job baru dengan kode lama tak ditentukan padahal 12 §30 menampilkan "update counts" | 06 §12, 08 §11, 12 §30 |
| A-06 | Approver kedua pada tim satu moderator | 08 §12 langkah 5 + 12 §36 mewajibkan; 07 §12 tanpa peran kedua; 04 §9 mendeskripsikan satu moderator. Tanpa pengecualian, prosedur akan dilanggar diam-diam | 04 §9, 07 §12, 08 §12, 12 §36 |
| A-07 | Kehadiran live sebagai progres | 08 §8 "jika policy mengizinkan"; 07 §9 "jika relevan"; 12 §27 A04 tanpa field. Cara konfirmasi attendance bergantung provider yang belum dipilih (08 §7 langkah 5) | 07 §9, 08 §7/§8, 12 §27 |
| A-08 | Istilah "program recording-first" | Dipakai di 02 §9 untuk menyesuaikan metrik attendance; tak didefinisikan di mana pun. Deck menjanjikan "Free Akses Record Seumur Program" → kemungkinan janji produk | 02 §9, 05 §17, Deck |
| A-09 | Elective TKA "dua mapel" di-hardcode | 12 §16 C04 acceptance vs 06 §10 (configurable) vs 03 P7 (aturan berversi) vs 00 §7 OQ-001 (TKA di luar produksi pertama) | 00 §7, 03 §1, 06 §10, 12 §16 |
| A-10 | Kanal bantuan utama | GATE_2 §3 no.6 masih terbuka; 12 §13 S14 sudah mengasumsikan tiket + lampiran; 09 §11 sudah mengasumsikan WhatsApp. Mengunci M-08 | 09 §11, 12 §13, GATE_2 §3 |
| A-11 | Harga ditampilkan vs harga dibayar | 05 §6 price snapshot + 06 §8 "nominal snapshot" vs sistem affiliate deck (komisi 25%, kupon unik). Tak ada aturan rekonsiliasi; 12 §15 C03 tak menampilkan nominal | 05 §6, 06 §8, 12 §15, Deck |

---

## E. Risiko UX dan produk

### R-01 — Seluruh token border gagal kontrak kontras milik design system sendiri

11 §18 mensyaratkan komponen dan focus indicator ≥3:1. Hasil pengukuran token 11 §3 (formula relative luminance WCAG):

| Pasangan | Rasio | Syarat | Status |
|---|---|---|---|
| `neutral.150` #D9E5E2 di atas canvas #F6FAF9 | 1.23:1 | 3:1 | Gagal (border standar) |
| `neutral.150` di atas putih | 1.29:1 | 3:1 | Gagal |
| `brand.200` #A9EED5 di atas putih | 1.32:1 | 3:1 | Gagal (indikator brand) |
| `neutral.250` #C7D5D1 di atas putih | 1.51:1 | 3:1 | Gagal (border kuat) |
| Warning border #F0CD83 di atas putih | 1.53:1 | 3:1 | Gagal |
| Success border #91DFC2 di atas putih | 1.55:1 | 3:1 | Gagal |
| Info border #ABC3F5 di atas putih | 1.77:1 | 3:1 | Gagal |
| Danger border #F2A6A0 di atas putih | 1.96:1 | 3:1 | Gagal |
| `brand.500` #03D37B di atas putih | 1.98:1 | 3:1 | Gagal (warna progres) |
| `neutral.400` #91A6A1 sebagai ikon pasif | 2.57:1 | 3:1 | Gagal jika bermakna |
| Info strong #2D6CDF di atas #E8F0FF | 4.24:1 | 4.5:1 | Gagal (teks normal) |
| Success strong #087A55 di atas #DFF8EC | 4.78:1 | 4.5:1 | Lolos tipis |
| Danger strong #B42318 di atas #FEE4E2 | 5.45:1 | 4.5:1 | Lolos |
| Warning strong #8A4B00 di atas #FFF3D6 | 6.17:1 | 4.5:1 | Lolos |
| `brand.700` #087A63 di atas putih | 5.28:1 | 4.5:1 | Lolos |
| `brand.900` #0B4F45 ↔ putih | 9.47:1 | 4.5:1 | Lolos |

Implikasi: 11 §4 menyatakan bayangan tidak menggantikan border untuk keterbacaan → border adalah pembatas komponen dan tunduk pada 3:1. 10 §6 menugaskan `brand.500` sebagai warna momentum/progres, padahal pada 1.98:1 warna itu tak boleh membawa makna di atas putih tanpa pendamping. **Perbaiki token sebelum komponen dibangun.**

### R-02 — Target reflow 360 px, WCAG 2.2 mensyaratkan 320 px
09 §17 dan 11 §22 menetapkan 360 px; 09 §12 menargetkan WCAG 2.2 AA (1.4.10 Reflow = 320 CSS px). Zoom 200% pada layar 640 px juga jatuh ke 320 px.

### R-03 — Kriteria baru WCAG 2.2 belum ditangani eksplisit
2.4.11 Focus Not Obscured (bottom nav sticky 11 §12.2 dan aksi sticky E03 di 12 §20); 3.2.6 Consistent Help (Bantuan di nav desktop tetapi tersembunyi di Akun pada mobile, 07 §2); 3.3.8 Accessible Authentication (magic link tepat, tetapi tak ada larangan captcha kognitif).

### R-04 — Format matematika tak ditentukan
09 §12.2 dan 10 §7 mensyaratkan rumus terbaca AT dan dirender sebagai matematika; 08 §11 hanya "dapat diparse" tanpa sintaks; 12 §29 A06 tanpa input format. Pilihan LaTeX vs MathML berdampak pada screen reader, template import, dan rendering mobile.

### R-05 — Tiga taksonomi event analytics
06 §13 vs 09 §16 vs 12 §4: `next_action_opened`/`next_action_clicked`; `activity_completed`/`resource_completed`; `batch_viewed`/`batch_opened`; `join_clicked`/`live_class_joined`; `roadmap_step_opened`/`roadmap_stage_clicked`. `first_meaningful_action`, `access_activated`, `payment_success`, `next_action_generated` hanya ada di 06 — padahal metrik 02 §9 ("Time to first value", "Next-action completion", "Checkout-to-active access") bergantung padanya.

### R-06 — Prioritas high-fidelity tak sejalan dengan risiko bisnis
12 §38 menempatkan C03 dan A12 di P1 dan C05 jatuh ke P2, padahal 02 §12 menempatkan event Sejoli sebagai risiko utama, 03 §9 menjadikan kemampuan support memperbaiki akses syarat MVP, dan 10 §11.3 menyebut Access Explanation sebagai komponen pembeda. **Naikkan C03, C05, A12 ke P0.**

### R-07 — Inventaris komponen belum menutup layar yang sudah dispesifikasikan
11 §13/§14 belum memuat: program switcher (S01), countdown server non-ujian (P9, C01/C02), leaderboard, notification item, onboarding stepper (C04), navigasi antar-subtes (E03), empty state generik.

### R-08 — Dark mode ditunda sementara persona utama belajar malam hari
04 §3 (Alya belajar malam hari) vs 11 §20 dan 10 §19. Sah sebagai prioritas; catat sebagai keputusan sadar dengan mitigasi pada UAT.

---

## F. Implikasi teknis untuk Gate 3

1. **Spike Sejoli mendahului semua kontrak commerce.** Harus menjawab: signature webhook; identifier order/produk yang stabil lintas campaign; ketersediaan event refund dan chargeback; apakah return URL membawa reference; keamanan prefill lintas domain; pengaruh kupon dan komisi affiliate pada nominal. Sampai selesai, OpenAPI commerce tidak ditulis.
2. **`Exam Contract v2` menjadi deliverable Gate 3 bernama.** 08 §9 sudah merujuknya sebagai otoritatif tetapi 00 §8 tidak mendaftarkannya. Isi minimum: merge semantics antrean offline, sequence/idempotency key, late-sync cutoff dan pengaruhnya pada state hasil, definisi provisional vs final, takeover policy, determinisme randomization, akomodasi per attempt.
3. **Domain yang belum tercakup di 05 §15:** notification (trigger, template version, delivery log, consent record); free/ecosystem grant; question report dari siswa; accommodation grant per attempt; leaderboard snapshot + display-name policy; legacy SKU dan promise register.
4. **Enum yang harus dipisah sejak awal:** purchase state vs access state (K-07); result state perlu menyimpan alasan perubahan (late-sync vs koreksi soal); sepuluh window batch 05 §7 tetap kolom terpisah.
5. **Waktu:** satu sumber (server), simpan UTC, render zona pengguna, label WIB otoritatif untuk deadline. Naikkan menjadi invariant di 09 §2.
6. **Immutability dan versioning:** product, offer, external SKU mapping, program, blueprint, exam form, question, result snapshot — plus aturan eksposur form lintas batch (K-04).
7. **Idempotency key eksplisit:** webhook event id; grant creation (source+target); answer save (attempt, question, sequence); submit; import job; re-score.
8. **Authorization:** 07 §12 menjadi matriks role × resource × action yang dapat diuji mesin, termasuk peran kedua approval (A-06) dan pemisahan "support tidak melihat kunci" (08 §13).
9. **NFR yang belum punya angka:** ukuran maksimum XLSX/ZIP, jumlah baris per job, dimensi/bobot gambar, concurrency peserta per batch, RPO/RTO, retensi audit log, retensi data siswa.
10. **Frontend:** satu modul resolver next-action dipakai bersama Beranda dan Program Hub; satu skema route; token kontras diperbaiki sebelum komponen dibangun.

---

## G. Register keputusan founder (17)

| No. | Keputusan | Pilihan | Rekomendasi | Konsekuensi | Dokumen terdampak |
|---|---|---|---|---|---|
| D1 | Randomization dan ranking | (a) urutan soal tetap, acak opsi saja; (b) pool tanpa ranking; (c) pool + equating | **(a)** untuk MVP | Ranking sah; A10 kehilangan fitur pool; eksposur soal dikelola lewat rotasi form | 05 §2/§7, 12 §32, 03 §5 |
| D2 | Reuse exam form lintas batch | (a) larang jika review sudah rilis; (b) izinkan dengan menunda pembahasan | **(a)** + validasi lintas batch di A11 | Kebutuhan form baru per minggu naik; beban bank soal dan review meningkat | 05 §3/§7/§16, 12 §33 |
| D3 | Practice attempt di MVP | (a) tidak; (b) ya | **(a)**, field disimpan, UI hanya ranked | Persona Raka kehilangan latihan ulang; prioritaskan di fase 1.1 | 03 §6, 04 §4, 05 §8.4, 12 §18 |
| D4 | Navigasi antar-subtes SKD | (a) satu sesi bebas; (b) terkunci per subtes; (c) linear | Ikuti **aturan resmi tahun berjalan**; simpan sebagai field blueprint | Menentukan bentuk exam runner P0 dan komponen navigator | 12 §20/§32, 11 §14.6 |
| D5 | Leaderboard dan nama tampil (OQ-008) | (a) opt-in display name; (b) anonim penuh; (c) publik default | **(a)** | Butuh layar leaderboard, pengaturan di S13, kolom pada snapshot | 00 §7, 05 §7, 11 §13, 12 §13/§33 |
| D6 | Hasil dan ranking setelah refund | (a) hasil disimpan, tetap di ranking; (b) disimpan, keluar dari ranking; (c) akses hasil dicabut | **(a)** untuk integritas snapshot, pembahasan dicabut | Peserta refund tetap di papan peringkat; harus dijelaskan di terms | 05 §10 E4/§16, 12 §6 |
| D7 | Kebijakan pasca-expiry | (a) read-only + riwayat; (b) terkunci total; (c) per-produk | **(c)** sebagai field di A02, default (a) | Menentukan nilai jual "akses seumur program" dan biaya storage | 05 §8.3, 06 §9, 08 §8, 12 §25 |
| D8 | Tier gratis ekosistem | (a) grant "Ekosistem" untuk semua akun; (b) tidak ada konten gratis di MVP | **(a)** — sudah dijanjikan di deck | Menambah satu sumber grant; membuka funnel akuisisi di S02 | 05 §8.1, 12 §5, Deck |
| D9 | TPA/TBI di MVP | (a) production-ready bersama SKD; (b) tetap di WordPress sampai fase 2 | Tentukan setelah register M-03 selesai | (b) berarti pembeli Bootcamp memakai dua sistem — persis masalah yang ingin dihapus | 02 §8, 03 §4, 05 §17 |
| D10 | Bentuk Tryout Pass | (a) program ringkas; (b) koleksi di tryout hub | **(a)** dengan aturan koleksi terlihat siswa | Perlu validasi riset; menentukan layar baru dan aturan notifikasi batch baru | 04 §14, 05 §4.3/§12, 07 §6 |
| D11 | Program utama: manual vs urgensi | (a) manual menetapkan default, urgensi memunculkan banner; (b) urgensi selalu menang | **(a)** | Lebih dapat diprediksi siswa; resolver menjadi dua lapis | 06 §7, 09 §8.1, 12 §4 |
| D12 | Kanal bantuan utama | (a) tiket in-app + WhatsApp eskalasi; (b) WhatsApp saja; (c) tiket saja | **(a)** sesuai rekomendasi review guide | S14 harus lengkap sebelum UAT; butuh SLA dan jam operasional | 09 §11, 12 §13, GATE_2 §3 |
| D13 | WhatsApp sebagai kanal notifikasi | (a) ya dengan opt-in tercatat + kategori template; (b) email + in-app saja | **(a)** | Biaya per pesan, persetujuan template, kewajiban consent; butuh area admin baru | 01 §6, 09 §11, 12 §16 |
| D14 | Copy dan domain checkout | (a) sebut perpindahan secara jujur; (b) samarkan sebagai satu sistem | **(a)** | Menurunkan tiket "apakah ini penipuan?"; konsisten dengan larangan dark pattern | 00 §7, 09 §15, 12 §14 |
| D15 | Rumus progres program | (a) hanya aktivitas wajib; (b) configurable per program | **(a)** untuk MVP, opsional ditampilkan terpisah | Menghapus klaim "kecuali dikonfigurasi" dari acceptance S05 | 09 §2, 12 §8, GATE_2 §3 |
| D16 | Perlindungan data anak dan consent wali | (a) catat usia, consent wali <18, retensi eksplisit; (b) tunda | **(a)** dengan review hukum sebelum Gate 3 | Menambah langkah onboarding dan kontrol data; menghindari risiko legal | 03 §3.4, 09 §15, 12 §13/§16 |
| D17 | Approver kedua saat moderator tunggal | (a) wajib, blokir; (b) academic admin boleh menjadi approver kedua | **(b)** dengan audit penuh | Prosedur tetap dapat dijalankan tim kecil tanpa dilanggar diam-diam | 04 §9, 07 §12, 08 §12, 12 §36 |

---

## H. Rencana revisi dokumen

### P0 — sebelum Gate 3 dibuka

| File | Heading | Jenis | Isi |
|---|---|---|---|
| 05_PRODUCT_CATALOG_AND_ENTITLEMENT.md | §16 Invariant | Tambah | Larangan reuse exam form setelah review release (K-04); invariant randomization determinism (K-03) |
| 05_PRODUCT_CATALOG_AND_ENTITLEMENT.md | §8.1 Sumber grant | Tambah | Sumber grant "Ekosistem/Free" (M-04) |
| 05_PRODUCT_CATALOG_AND_ENTITLEMENT.md | §8.3 Validity policy, §17 | Tambah | Field kebijakan pasca-expiry dan aturan hasil setelah refund (M-09, M-10) |
| 09_UX_SPECIFICATION.md | §5 Aktivitas berikutnya | Ganti | Jadikan satu-satunya definisi resolver dengan ambang eksplisit + tie-break lintas program; 06 §5 dan 08 §6 menjadi rujukan (K-05) |
| 09_UX_SPECIFICATION.md | §2 UX invariants | Tambah | Invariant waktu: UTC, render zona pengguna, WIB otoritatif (K-08) |
| 12_SCREEN_SPECIFICATIONS.md | §2 Inventaris layar | Ganti | Selaraskan route dengan 07 §3; hilangkan tabrakan `/program/:offer`; kembalikan konteks program pada route batch (K-01, K-02) |
| 12_SCREEN_SPECIFICATIONS.md | §15 C03 States | Ganti | Pisahkan status pembayaran dan akses; tambahkan chargeback dan partial refund (K-07) |
| 12_SCREEN_SPECIFICATIONS.md | §20 E03, §21 E05 | Ganti | Satu model submit + batas waktu tunggu sinkronisasi (K-13, K-15) |
| 11_DESIGN_SYSTEM.md | §3 Token warna | Ganti | Perbaiki border/indikator ke ≥3:1; tambahkan token focus; lengkapi dua seri data viz (R-01, M-15, M-16) |
| 03_PRODUCT_PRINCIPLES_AND_SCOPE.md | §3.4 MVP platform | Tambah | Bagian "Perlindungan data dan consent" (M-01) |
| **Dokumen baru** | `13_LEGACY_PRODUCT_PROMISE_REGISTER.md` | Buat | Satu baris per SKU aktif 2026: janji, masa berlaku, jumlah pembeli, status pemenuhan MVP (M-03) |
| **Dokumen baru** | `14_QUESTION_IMPORT_TEMPLATE_CONTRACT.md` | Buat | Sheet, kolom, kode soal, referensi gambar, konvensi ZIP, layout bobot, penautan passage (M-02) |

### P1 — selama Gate 3 berjalan

| File | Heading | Jenis | Isi |
|---|---|---|---|
| 07_INFORMATION_ARCHITECTURE_AND_SITEMAP.md | §11 IA admin, §12 Permission matrix | Ganti | Satukan dengan 12 §23; peran live-class coordinator; tambahkan area Notifikasi (K-09, K-10, M-08) |
| 08_USER_FLOWS_AND_EDGE_CASES.md | §10 Hasil dan correction | Tambah | Definisi provisional vs final + alasan perubahan skor karena late-sync (K-12, A-04) |
| 08_USER_FLOWS_AND_EDGE_CASES.md | §9 Batch/attempt, §11 Bulk import | Tambah | Aturan randomization dan stabilitas nomor soal saat resume; satu aturan idempotency import (K-03, A-05) |
| 12_SCREEN_SPECIFICATIONS.md | §2.1, §38 Prioritas | Tambah | Layar Komunitas, Progres program, leaderboard, laporan soal siswa, akomodasi waktu; naikkan C03, C05, A12 ke P0 (M-05, M-06, M-07, M-13, R-06) |
| 12_SCREEN_SPECIFICATIONS.md | §16 C04 Onboarding | Ganti | Tiga langkah wajib; hapus angka "dua mapel" dari acceptance (K-06, A-09) |
| 11_DESIGN_SYSTEM.md | §13, §14 Component inventory | Tambah | Program switcher, countdown server, leaderboard, notification item, onboarding stepper, section navigation, empty state (R-07) |
| 09_UX_SPECIFICATION.md | §12, §16, §17 | Ganti | Target reflow 320 px; tangani 2.4.11/3.2.6/3.3.8; satukan taksonomi event (R-02, R-03, R-05) |
| 00_MASTER_README.md | §8 Urutan gate | Tambah | Daftarkan `Exam Contract v2` dan spike Sejoli sebagai artefak Gate 3; tandai Gate 3 berjalan tiga jalur |

### P2 — sebelum UAT

| File | Heading | Jenis | Isi |
|---|---|---|---|
| 02_PRODUCT_BRIEF.md | §9 Metrik, §12 Risiko | Tambah | Definisi deteksi "insiden jawaban hilang"; evidence register + pemilik (M-11, M-14) |
| 04_USER_RESEARCH_PERSONAS_JTBD.md | §13 Rencana riset | Tambah | Uji bentuk Tryout Pass dan pemahaman window batch sebagai tugas observasi wajib (A-01) |
| 08_USER_FLOWS_AND_EDGE_CASES.md | §13 Admin access support | Tambah | Flow void batch, retake massal, matriks keputusan insiden hari-H (M-12) |
| 10_UI_DESIGN_BRIEF.md | §7 Tipografi, §13 Data viz | Tambah | Tetapkan format rumus (LaTeX/MathML) dan konsekuensi aksesibilitasnya (R-04) |

---

## I. Skor kesiapan akhir

| Dimensi | Skor | Alasan |
|---|---:|---|
| Product clarity | 80 | Visi, non-goals, scope guardrail, release slice sangat disiplin. Ditahan register janji legacy (M-03), tier gratis (M-04), status TPA/TBI dan Tryout Pass |
| Entitlement model | 82 | Artefak terkuat. Pemisahan product/offer/program/grant, 10 invariant, dan acceptance 05 §18 mendekati kualitas kontrak. Ditahan kebijakan pasca-expiry dan refund |
| UX completeness | 70 | Cakupan state, edge case, dan copy sangat baik. Ditahan tiga resolver, dua skema route, onboarding 3 vs 6, lima layar yang tak pernah dispesifikasikan |
| Accessibility | 64 | Niat dan struktur di atas rata-rata industri. Ditahan fakta terukur: seluruh token border gagal 3:1, reflow 360 px, tanpa token focus, kriteria 2.2 belum ditangani |
| Admin readiness | 62 | Inventaris layar luas dan safeguard dipikirkan. Ditahan template import, tiga aturan idempotency, approver kedua tanpa peran, absennya surface notifikasi/komunitas/akomodasi/retake massal |
| Exam readiness | 58 | Prinsip reliability paket Juni dipertahankan tepat. Ditahan randomization vs ranking, reuse form, model submit, semantik late-sync dan provisional/final, `Exam Contract v2` yang belum ditulis |
| Commerce integration | 55 | Model mapping dan reconciliation queue benar arahnya. Ditahan ketergantungan penuh pada kemampuan Sejoli yang belum diverifikasi, pencampuran purchase/access state, harga snapshot vs kupon affiliate |
| **Gate 3 readiness** | **66** | **Approved with Revisions.** Jalur entitlement/IA/design system dapat dibuka setelah revisi P0. Kontrak exam dan commerce menunggu D1–D4 dan spike Sejoli |

---

## Langkah berikutnya yang disarankan

1. Founder memutuskan D1–D17 (prioritas: D1, D2, D3, D4, D9, D16).
2. Jalankan spike Sejoli dan buat register janji legacy (M-03) secara paralel — keduanya tidak saling menunggu.
3. Setelah keputusan masuk, minta revisi P0 dilakukan per file, bukan penulisan ulang paket.
4. Baru buka Gate 3 dalam tiga jalur terpisah.
