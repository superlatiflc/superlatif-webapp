# Superlatif Web App

**Versi spesifikasi:** Gates 1–4 Build-Ready RC1/RC2  
**Status implementasi:** Phase P0 — `GOV-001` selesai (bootstrap, toolchain lock, workspace boundaries)  
**Produksi:** `NO_GO` sampai release gate dan external gate lulus

Repository ini berisi source of truth produk, UX, arsitektur, kontrak machine-readable, backlog, fixture sintetis, project instructions, project skills, **dan kerangka monorepo aplikasi**.

Belum ada perilaku domain, schema database, route API, atau adapter provider. Semuanya dibangun per task backlog, satu per satu.

## Prasyarat

| Alat | Versi terkunci | Sumber lock |
|---|---|---|
| Node.js | 24.x (dikembangkan pada `v24.15.0`) | `.nvmrc`, `engines` |
| pnpm | 11.x (dikembangkan pada `11.20.0`) | `packageManager`, `engines` |

Aktifkan pnpm melalui Corepack agar versinya tidak bergantung pada mesin:

```bash
corepack enable
```

## Setup dari clone bersih

```bash
pnpm install
```

Lalu verifikasi seluruh repository:

```bash
pnpm run verify
```

`verify` menjalankan `lint` → `typecheck` → `build` → `db:check` → `validate:starter`. Seluruhnya harus hijau.

## Script

| Script | Status | Keterangan |
|---|---|---|
| `lint` | Aktif | Workspace dan import-boundary check (`scripts/check-workspace-boundaries.mjs`) |
| `typecheck` | Aktif | `tsc` pada seluruh sembilan workspace project |
| `build` | Aktif | `next build` untuk web, `tsc` emit untuk worker |
| `db:check` | Aktif sebagai guard | `NOT_APPLICABLE` selama belum ada schema/migration; **gagal** begitu schema/migration muncul tanpa tooling BD-05 |
| `validate:starter` | Aktif | Pemeriksaan kelengkapan starter bundle |
| `verify` | Aktif | Komposisi seluruh pemeriksaan yang sudah ada |
| `test:unit`, `test:contract`, `test:integration`, `test:e2e`, `test:a11y` | Dideklarasikan, belum dikonfigurasi | Dipasang oleh `GOV-002`; saat ini keluar dengan kode error dan menyebut task pemiliknya |
| `db:generate`, `db:migrate` | Dideklarasikan, belum dikonfigurasi | Menunggu lock BD-05 pada P1 |

Script yang belum dikonfigurasi sengaja **gagal**, bukan lulus diam-diam. `CLAUDE.md` melarang menjalankan atau mengarang script yang belum ada; dependensi bootstrap harus dilaporkan.

## Struktur

| Path | Fungsi |
|---|---|
| `CLAUDE.md` | Instruksi persistent yang dibaca Claude Code |
| `.claude/skills/` | Empat skill domain Superlatif |
| `docs/gates/` | Dokumen canonical Gates 1–4 |
| `docs/audit/` | Findings dan audit closure |
| `docs/source/` | Instruksi awal dan deck brand |
| `contracts/` | OpenAPI, JSON Schema, template import, kontrak Gate 3 |
| `planning/` | Backlog implementasi dan release-gate evidence contract |
| `test/fixtures/contracts/` | Fixture sintetis untuk contract/integration tests |
| `scripts/` | Validator starter, boundary check, migration guard |
| `apps/web` | Deployment unit student/admin web dan BFF (Next.js App Router) |
| `apps/worker` | Deployment unit background worker |
| `packages/contracts` | Tipe kontrak bersama turunan `contracts/` |
| `packages/domain` | Modul domain murni; tanpa UI dan tanpa vendor SDK |
| `packages/db` | Drizzle schema dan migration; kosong sampai BD-05 dikunci di P1 |
| `packages/ui` | Primitive design system student/admin |
| `packages/observability` | Structured logging, redaksi, correlation ID, manifest evidence |
| `packages/integrations` | Adapter vendor di boundary; kosong sampai OD-01/OD-02/OD-03 |
| `packages/testing` | Factory, clock injection, seeded randomness, provider fake |

Layout ini dikunci oleh **ADR-042** dan merekonsiliasi `CLAUDE.md`/BD-02 dengan `20_TECHNICAL_ARCHITECTURE.md` §5.

## Batas arsitektur yang ditegakkan mesin

`pnpm run lint` gagal jika:

- sebuah paket melanggar matriks layering (misalnya `packages/domain` bergantung pada `packages/ui`);
- sebuah file mengimpor paket yang tidak dideklarasikan di `package.json` (phantom dependency);
- `packages/domain` memperoleh dependency runtime eksternal apa pun (aturan "tanpa vendor SDK");
- ada direktori workspace tanpa `package.json` atau tanpa script `typecheck`.

## Batas keselamatan

- Jangan mengaktifkan commerce production tanpa OD-01 dan OD-02.
- Jangan mengaktifkan ranked SKD production tanpa OD-04, academic sign-off, Gate C, dan OD-08.
- Jangan menjalankan production migration tanpa legacy evidence, rehearsal, reconciliation, dan Gate D.
- `drizzle-kit push` hanya untuk database lokal yang disposable.
- Semua fixture dalam repository ini sintetis dan tidak menggantikan bukti resmi/provider.
