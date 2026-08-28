# Start Here

## Pilihan yang direkomendasikan: Claude Code lokal

1. Ekstrak ZIP sehingga folder `superlatif-webapp` menjadi root proyek.
2. Buka Terminal pada folder tersebut.
3. Jalankan:

```bash
node scripts/validate-starter.mjs
git init
git add .
git commit -m "docs: initialize Superlatif build-ready specification"
claude --permission-mode plan
```

Jika Git sudah aktif, jangan jalankan `git init` ulang. Jika Claude Code dipakai melalui aplikasi/IDE, buka folder `superlatif-webapp` sebagai project root dan aktifkan Plan Mode sebelum prompt pertama.

## Jika menggunakan Claude Project/Cowork

Upload ZIP ini sebagai konteks proyek. Jika ZIP tidak dapat dibaca penuh, ekstrak terlebih dahulu lalu upload folder/file hasil ekstraknya dengan struktur tetap. Jangan memisahkan `CLAUDE.md`, `.claude/skills/`, dokumen, dan kontrak ke proyek yang berbeda.

Claude Project cocok untuk review dan diskusi. Untuk implementasi yang mengubah banyak file, menjalankan test, dan memakai Git, gunakan Claude Code pada folder lokal/repository.

## Sesi pertama

Gunakan prompt di `PROMPT_PERTAMA_CLAUDE.md`. Sesi pertama hanya mengaudit dan merencanakan Phase P0. Setelah rencana disetujui, implementasikan satu task backlog per sesi atau pull request.

Urutan awal:

```text
GOV-001 → GOV-002 → GOV-003 → GOV-004
```

## Jangan dilakukan pada sesi pertama

- membangun seluruh aplikasi sekaligus;
- menghubungkan credential atau data production;
- menebak payload/signature Sejoli;
- menetapkan passing grade SKD tanpa bukti OD-04;
- melakukan deployment, migration, atau refund nyata;
- menandai Gate A–D sebagai lulus tanpa evidence.

## Model kerja

Gunakan reasoning/model terkuat yang tersedia untuk bootstrap dan keputusan arsitektur. Setelah fondasi dikunci, model coding yang lebih cepat dapat mengerjakan task atomik, tetapi acceptance criteria dan validator tetap wajib.
