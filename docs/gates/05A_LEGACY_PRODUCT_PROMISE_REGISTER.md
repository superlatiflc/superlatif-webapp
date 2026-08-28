# 05A — Register Janji Produk Legacy

**Versi:** 1.0-RC2 — evidence collection required  
**Tanggal:** 28 Agustus 2026  
**Pemilik:** Founder/Product, dengan verifikasi Commerce dan Legal

## 1. Tujuan

Register ini mencegah migrasi atau perubahan entitlement menghapus benefit yang pernah dijanjikan kepada pembeli. Entri `UNVERIFIED` bukan fakta produk dan tidak boleh diterjemahkan menjadi akses sampai sumber primer ditemukan.

## 2. Aturan bukti

Sumber yang diterima adalah sales page yang diarsipkan, export produk/offer Sejoli, invoice/terms saat pembelian, email atau pesan kampanye yang dapat diatribusikan, dan keputusan manual founder yang ditandatangani. Deck company profile Maret 2026 yang tersedia tidak memuat daftar benefit SKU secara rinci; karenanya ia tidak cukup untuk mengesahkan janji komersial.

Status bukti:

- `VERIFIED`: ada sumber primer dan populasi pembeli dapat ditentukan.
- `PARTIAL`: copy ditemukan tetapi periode/SKU/populasi belum lengkap.
- `UNVERIFIED`: disebut dalam audit atau percakapan, tetapi tidak ada sumber primer yang disuplai.
- `REJECTED`: klaim terbukti bukan janji pembeli atau salah atribusi.

## 3. Register awal

| Promise ID | Produk/SKU | Janji yang perlu diverifikasi | Sumber saat ini | Status | Dampak sistem bila terverifikasi | Owner/tindakan |
|---|---|---|---|---|---|---|
| LP-001 | Kelas Akselerasi Kedinasan 2026 | “Free Akses Record Seumur Program” | Disebut pada audit Claude; tidak ditemukan pada deck company profile yang disuplai | UNVERIFIED | Grant `recording` sampai lifecycle program atau sesuai wording asli | Founder: unggah sales page/export offer dan periode jual |
| LP-002 | Kelas Akselerasi Kedinasan 2026 | “25 Paket TO: 15 SKD, 5 TPA, 5 TBI” | Disebut pada audit Claude; tidak ditemukan pada deck yang disuplai | UNVERIFIED | Named batch collection; kekurangan batch menjadi fulfillment exception | Academic + Commerce: berikan daftar batch dan pembeli terdampak |
| LP-003 | Kelas Akselerasi Kedinasan 2026 | “Bimbingan semua tahapan: TPA/TBI, kebugaran, psikotes, wawancara” | Disebut pada audit Claude; tidak ditemukan pada deck yang disuplai | UNVERIFIED | Track/content/live entitlement; bukan otomatis exam entitlement | Product: petakan janji per track dan format layanan |
| LP-004 | Ekosistem Superlatif/free tier | “Free Access” atau “Free Dashboard Updates” | Disebut pada audit Claude; tidak ditemukan sebagai terms SKU pada sumber yang disuplai | UNVERIFIED | Ecosystem/free grant berversi | Founder: tetapkan resource/capability yang benar-benar gratis |
| LP-005 | Seluruh produk legacy aktif | Masa akses, start rule, serta kebijakan pasca-expiry | Belum ada export katalog/order/terms | UNVERIFIED | Migrasi grant, end date, dan read-only policy | Commerce: export SKU, order, terms, dan campaign dates |

## 4. Data minimum per janji terverifikasi

Setiap baris final harus memiliki `promise_id`, external SKU/offer, exact copy, URL/file/hash sumber, tanggal mulai/akhir penjualan, populasi order, target entitlement, validity, post-expiry policy, pengecualian, pemilik approval, serta tanggal verifikasi.

## 5. Aturan migrasi

1. Janji `UNVERIFIED` tidak menghasilkan grant otomatis.
2. Janji `VERIFIED` dipetakan ke policy/version eksplisit; tidak di-hardcode pada nama produk.
3. Jika copy ambigu, pilih interpretasi yang tidak mengurangi hak pembeli sampai founder/legal memutuskan.
4. Setiap order menyimpan offer version dan SKU mapping version yang berlaku ketika transaksi terjadi.
5. Sebelum cutover, reconciliation membandingkan jumlah pembeli yang berhak dengan jumlah grant hasil migrasi.

## 6. Exit criteria

Register dianggap siap migrasi ketika semua SKU aktif 2026 memiliki sumber primer, exact promise, periode penjualan, populasi pembeli, policy mapping, dan approval. Sampai itu tercapai, migrasi benefit legacy tetap hard gate.

