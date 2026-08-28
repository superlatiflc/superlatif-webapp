# 02A — Register Bukti Klaim Marketing

**Versi:** 1.0-RC2  
**Tanggal:** 28 Agustus 2026  
**Pemilik:** Marketing, Product, dan Legal

## 1. Aturan

Klaim numerik, komparatif, atau superlatif tidak boleh tampil di product UI, onboarding, checkout handoff, atau notifikasi sebelum memiliki definisi, sumber, periode, populasi, metode, dan tanggal kedaluwarsa. Klaim yang belum lolos diberi status `PROHIBITED_PENDING_EVIDENCE`.

## 2. Register awal

| Claim ID | Klaim dari sumber brand | Jenis | Bukti minimum | Status | Aturan copy sementara |
|---|---|---|---|---|---|
| MC-001 | “Pertama di Indonesia” | Superlatif/komparatif | Definisi kategori dan market scan yang dapat diaudit | PROHIBITED_PENDING_EVIDENCE | Jangan digunakan |
| MC-002 | Angka “<2%” | Statistik | Definisi denominator, tahun, sumber resmi, dan metode | PROHIBITED_PENDING_EVIDENCE | Boleh diganti narasi non-numerik yang faktual |
| MC-003 | Angka “80%” | Statistik perilaku/hasil | Populasi, sampel, periode, instrumen, dan margin kesalahan | PROHIBITED_PENDING_EVIDENCE | Jangan digunakan sebagai fakta pengguna |
| MC-004 | Skor simulasi setara skor resmi | Klaim performa | Model scoring resmi atau studi validasi yang disetujui akademik | PROHIBITED | Gunakan “skor estimasi/simulasi Superlatif” |
| MC-005 | Kelulusan dijamin | Outcome | Tidak dapat dijamin oleh platform | PROHIBITED | Gunakan dukungan persiapan dan indikator progres |

## 3. Workflow

`draft → evidence submitted → product/legal review → approved with expiry → archived`

Approval menyimpan versi copy yang diizinkan, kanal, tanggal kedaluwarsa, dan reviewer. Analytics tidak boleh digunakan untuk merekonstruksi klaim outcome tanpa definisi metrik yang telah disetujui.

