# Gate 3 — Machine-readable Artifacts 1.0-RC2

**Versi:** 1.0-RC2  
**Status:** Draft untuk audit kontrak; belum menjadi migration/build specification final

## Isi

Artefak telah diregenerasi setelah audit Claude. `question-import-example.zip` tersedia pada RC2 dan memakai struktur `images/questions`, `images/explanations`, serta `images/passages`. Dokumen ini tidak membuat klaim tentang apakah file tersebut tersedia pada salinan yang diterima auditor sebelum RC2.

| File | Fungsi | Source of truth utama |
|---|---|---|
| `contracts/openapi.yaml` | Subset kontrak HTTP student, exam, admin import, access, dan commerce webhook | Dokumen 22 |
| `contracts/drizzle-schema.ts` | Draft physical mapping aggregate kritis PostgreSQL/Drizzle | Dokumen 21 |
| `contracts/exam-blueprint.schema.json` | Schema konfigurasi format ujian berversi | Dokumen 16–17 |
| `contracts/entitlement-policy.schema.json` | Schema kebijakan grant dan claim akses | Dokumen 05, 13, 21 |
| `contracts/analytics-event-catalog.json` | Katalog event dengan klasifikasi dan larangan payload sensitif | Dokumen 19, 24 |
| `contracts/question-import-template.xlsx` | Template bulk import sederhana v2.1 | Dokumen 15/15A |
| `contracts/question-import-advanced-template.xlsx` | Template bulk import advanced v2.1 dengan passage dan manifest asset | Dokumen 15/15A |
| `contracts/question-import-example.zip` | Contoh XLSX advanced v2.1 + tiga gambar | Dokumen 15/15A |

## Hierarchy

Jika terjadi konflik:

1. keputusan bisnis yang telah disetujui Fadhli;
2. dokumen Gate 1–2 yang berstatus locked/approved;
3. dokumen Gate 3 bernomor 13–26;
4. artefak machine-readable Gate 3;
5. asumsi implementasi.

Artefak tidak boleh diam-diam mengubah requirement. Ketidaksesuaian harus menjadi issue audit dan diselesaikan pada dokumen induk terlebih dahulu.

## Validation performed

- JSON schema/catalogue dapat diparse sebagai JSON;
- OpenAPI dapat diparse sebagai YAML dan seluruh local `$ref` diperiksa;
- TypeScript schema diperiksa syntax/transpile;
- kedua workbook dirender pada seluruh sheet;
- tidak ditemukan formula error pada kedua workbook;
- ZIP contoh diperiksa manifest dan dapat diekstrak.
- Semantic validator/fixture wajib menegakkan invariant lintas-elemen yang tidak dapat diekspresikan portabel oleh JSON Schema, termasuk jumlah `sections[].durationSeconds == timing.totalDurationSeconds` untuk mode `per_section`.
- Workbook simple hanya mengiklankan tipe yang dapat direpresentasikan; advanced mengiklankan seluruh lima tipe.

## Production gates

- Kontrak JSON/YAML/TypeScript adalah release candidate, bukan izin production activation.
- Sejoli/WordPress staging spike, legal review, load/security/accessibility test, dan official SKD rule review tetap wajib.
- Family selain SKD Sekdin memakai `draft_only` sampai activation gate lulus.

- Belum ada migration SQL yang disetujui.
- Belum ada payload Sejoli staging yang terverifikasi.
- Belum ada final 2026 SKD regulatory/scoring configuration yang boleh diaktifkan.
- API artifact adalah subset; endpoint admin builder lengkap perlu diturunkan ke OpenAPI setelah alur admin diprototipekan.
- Security, load, recovery, dan restore test menjadi Gate 4/build acceptance, bukan otomatis terpenuhi oleh schema ini.
