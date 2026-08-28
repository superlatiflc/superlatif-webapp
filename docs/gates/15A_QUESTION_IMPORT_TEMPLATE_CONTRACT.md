# 15A — Kontrak Template Impor Soal

**Versi:** 1.0-RC2  
**Tanggal:** 28 Agustus 2026  
**Status:** Source of truth untuk workbook XLSX dan ZIP media

## 1. Input dan batas awal

- Satu job menerima satu `.xlsx` dan maksimal satu `.zip` media.
- Batas awal: workbook 20 MB, ZIP 250 MB, 5.000 soal/job, 25.000 opsi/pernyataan/job, dan 5 MB/asset. Nilai ini wajib diuji dengan load test sebelum produksi.
- Format gambar MVP: PNG, JPEG, dan WebP. SVG ditolak sampai sanitizer disetujui.
- Semua nama file bersifat relatif, case-sensitive, tanpa `..`, path absolut, executable, atau symlink.
- `template_version` wajib; artefak RC2 memakai versi `2.1` dan job ditolak jika versi tidak didukung.

## 2. Struktur ZIP

```text
question-import.zip
├── question-import-advanced-template.xlsx
└── images/
    ├── questions/Q-001-stem.png
    ├── options/Q-001-A.png
    ├── passages/P-001.png
    └── explanations/Q-001-explanation.png
```

Workbook dapat diunggah terpisah dari ZIP. Referensi asset selalu memakai path di bawah `images/`; basename ganda dilarang untuk mencegah pencocokan ambigu.

## 3. Sheet kontrak

| Sheet | Wajib | Kunci | Fungsi |
|---|---:|---|---|
| Instructions | Ya | — | Versi, format, delimiter rumus, dan aturan status |
| Questions | Ya | `question_code` | Identitas, tipe, klasifikasi, stem, alt text, pembahasan |
| Options | Untuk tipe beropsi | `question_code + option_code` | Teks/gambar opsi, alt text, benar/bobot |
| Statements | Untuk benar/salah per pernyataan | `question_code + statement_code` | Pernyataan dan expected boolean/category |
| NumericAnswers | Untuk jawaban angka | `question_code + answer_code` | Nilai/rentang, toleransi, unit |
| Passages | Opsional | `passage_code` | Stimulus bersama dan asset/alt text |
| Assets | Wajib pada profil advanced bila ada media | `file_name` | Manifest placement, `image_purpose`, alt text, provenance media |
| Lookups | Ya | — | Value yang diperbolehkan dan activation scope |

Profil sederhana tetap membawa alt text dan kolom purpose untuk media pada Questions/Options. Asset informatif (`image_purpose=informative`) wajib memiliki alt text. Gambar dekoratif memakai string alt kosong yang disengaja dan `image_purpose=decorative`; `asset_role` tetap menyatakan placement (`stem`, `option`, `explanation`, `passage`, atau `other`) dan tidak boleh dipakai sebagai purpose.

## 4. Question type dan payload

| `question_type` | Sheet detail | Aturan minimum |
|---|---|---|
| `single_choice` | Options | Tepat satu opsi benar |
| `weighted_choice` | Options | Setiap opsi memiliki score; tidak memakai `is_correct` sebagai kebenaran tunggal. Jawaban siswa memakai payload API `kind=single_choice`; pembobotan murni server-side. |
| `multiple_choice` | Options | Satu atau lebih opsi benar; `partial_score_policy` wajib |
| `statement_true_false` | Statements | Minimal satu pernyataan dan expected value per baris |
| `numeric` | NumericAnswers | Exact value atau min/max; tolerance tidak negatif |

Status dari workbook hanya `draft` atau `in_review`. `approved`, `published`, `changes_requested`, dan `archived` hanya dapat diberikan oleh workflow aplikasi.

## 5. Rich content dan matematika

Field rich text menggunakan Markdown subset yang didokumentasikan. Matematika inline memakai `\(...\)` dan block memakai `\[...\]`; HTML arbitrer, script, iframe, dan external embed ditolak. Renderer menghasilkan HTML tersanitasi dan output matematika yang dapat diakses (MathML/accessible annotation).

## 6. Idempotency dan versi

- `import_job_id` unik untuk upload; retry byte-identik mengembalikan job yang sama.
- `question_code` adalah stable identity dalam tenant/domain akademik.
- Kode baru membuat question + draft version.
- Kode lama dengan latest version `draft` atau `changes_requested` dapat di-update hanya jika mode job `update_draft` dipilih.
- Kode lama yang `approved`, `published`, atau pernah digunakan tidak ditimpa; mode `create_revision` membuat version baru.
- Row valid boleh di-commit pada mode partial; row error tidak di-commit. Job menyimpan jumlah created, updated, revised, skipped, warning, dan failed.

## 7. Pipeline dan keamanan

`awaiting_upload → queued → scanning → parsing → validating → preview_ready → blocked|importing → completed|partial|failed|cancelled`

`awaiting_upload` menunggu objek; `queued` berarti file lengkap dan job siap diproses; `blocked` menunggu tindakan keamanan/operator yang dapat dipulihkan. Sistem memindai malware, mendeteksi zip bomb/path traversal, memverifikasi MIME, mencocokkan seluruh asset, memvalidasi schema per tipe, lalu menampilkan preview mobile. Publish ranked tetap memerlukan Moderator/Reviewer yang bukan penulis dan Academic Admin sebagai approver kedua; aktor yang sama tidak boleh mengisi kedua approval.

## 8. Activation gate

Lookup boleh memuat exam family masa depan sebagai `draft_only`. Import kontennya diperbolehkan, tetapi form/batch family tersebut tidak dapat dipublish ke produksi sampai gate blueprint, scoring, regulasi, academic review, dan test fixture berstatus lulus.

Nilai activation scope kanonik hanya `draft_only`, `staging`, atau `production`. Kode family ujian mandiri harus spesifik institusi/format, misalnya `SIMAK_UI`; kode universal `MANDIRI_PTN` dilarang.

## 9. Profil sederhana dan advanced

- Simple mendukung `single_choice` dan `weighted_choice`, termasuk gambar pada stem/option/explanation.
- Advanced mendukung seluruh lima tipe karena memiliki `Statements`, `NumericAnswers`, `partial_score_policy`, `Passages`, dan `Assets`.
- Sheet `Lookups` setiap workbook hanya mengiklankan tipe yang dapat direpresentasikan oleh profil tersebut.
