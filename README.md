# Superlatif Web App

**Versi spesifikasi:** Gates 1–4 Build-Ready RC1/RC2  
**Status implementasi:** P0 governance foundation selesai (`GOV-001`–`GOV-004`); P1 dimulai dengan `IDN-001` (identity, session, deterministic login mapping — schema/migration pertama)  
**Produksi:** `NO_GO` sampai release gate dan external gate lulus

Repository ini berisi source of truth produk, UX, arsitektur, kontrak machine-readable, backlog, fixture sintetis, project instructions, project skills, kerangka monorepo aplikasi, dan (mulai `IDN-001`) domain identity/session pertama dengan schema database sungguhan.

Belum ada route HTTP/API, adapter provider, atau live WordPress/Sejoli bridge. Semuanya dibangun per task backlog, satu per satu.

## Prasyarat

| Alat    | Versi terkunci                      | Sumber lock                 |
| ------- | ----------------------------------- | --------------------------- |
| Node.js | 24.x (dikembangkan pada `v24.15.0`) | `.nvmrc`, `engines`         |
| pnpm    | 11.x (dikembangkan pada `11.20.0`)  | `packageManager`, `engines` |

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

`verify` menjalankan seluruh pemeriksaan (format → lint → typecheck → build → secret scan → unit → integration → contract → contract-artifact → determinism → migration-drift → starter-bundle) secara berurutan — lihat tabel Script di bawah untuk rincian tiap langkah. Seluruhnya harus hijau.

## Script

| Script                    | Status                              | Keterangan                                                                                                  |
| ------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `format` / `format:check` | Aktif                               | Prettier (ADR-043)                                                                                          |
| `lint`                    | Aktif                               | ESLint flat config + workspace/import-boundary check                                                        |
| `typecheck`               | Aktif                               | `tsc` pada seluruh sembilan workspace project                                                               |
| `build`                   | Aktif                               | `next build` untuk web, `tsc` emit untuk worker                                                             |
| `test:unit`               | Aktif                               | Vitest, project `unit`                                                                                      |
| `test:integration`        | Aktif                               | Vitest, project `integration` — database pglite (WASM, embedded, tanpa Docker); IDN-001                     |
| `test:contract`           | Aktif                               | Vitest, project `contract`                                                                                  |
| `contracts:validate`      | Aktif                               | OpenAPI parse + `$ref` + path parameter + secret scan; JSON Schema compile                                  |
| `secrets:scan`            | Aktif                               | Gitleaks (ter-pin versi + checksum/digest, BD-08) terhadap working tree                                     |
| `check:determinism`       | Aktif                               | Menjalankan digest fixture pada dua proses terpisah dan membandingkannya                                    |
| `evidence:generate`       | Aktif                               | Membangkitkan manifest evidence rilis (GOV-004, BD-06) — hanya di CI, bukan bagian `verify` lokal           |
| `fixtures:digest`         | Aktif                               | Mencetak digest korpus fixture dan sequence ter-seed                                                        |
| `db:generate`             | Aktif                               | `drizzle-kit generate` — schema TypeScript → migration SQL (BD-05, IDN-001)                                 |
| `db:migrate`              | Aktif                               | `drizzle-kit migrate` — apply migration ke `DATABASE_URL`                                                   |
| `db:check`                | Aktif sebagai guard                 | Membandingkan hash `packages/db/drizzle/` sebelum/sesudah `drizzle-kit generate`; **gagal** kalau ada drift |
| `validate:starter`        | Aktif                               | Pemeriksaan kelengkapan starter bundle                                                                      |
| `verify`                  | Aktif                               | Komposisi seluruh pemeriksaan di atas; sama persis dengan yang dijalankan CI                                |
| `test:e2e`, `test:a11y`   | Dideklarasikan, belum dikonfigurasi | Playwright + axe menunggu P2 (permukaan UI nyata pertama)                                                   |

Script yang belum dikonfigurasi sengaja **gagal**, bukan lulus diam-diam. `CLAUDE.md` melarang menjalankan atau mengarang script yang belum ada; dependensi bootstrap harus dilaporkan.

## Continuous integration

`.github/workflows/ci.yml` menjalankan langkah yang sama dengan `pnpm run verify`, memakai Node dari `.nvmrc` dan pnpm dari `packageManager`, dengan `--frozen-lockfile`.

"Failures block merge" baru benar-benar berlaku setelah workflow ini dijadikan **required status check** pada branch default — itu setelan repository, bukan sesuatu yang bisa dijamin oleh file ini.

## Configuration and secrets (GOV-003)

- `.env.example` adalah satu-satunya sumber nama variabel; `packages/contracts/src/env-spec.ts` mendeklarasikan tipe, tingkat keharusan (`required` / `optional-default` / `optional-no-default`), dan status secret untuk **setiap** variabel — jumlahnya diuji identik dengan `.env.example` (`env.test.ts`).
- `loadCoreEnv()` divalidasi **fail-closed** saat startup (`apps/web/instrumentation.ts`, `apps/worker/src/index.ts`): variabel wajib yang hilang atau tidak valid membuat proses gagal start dengan daftar lengkap pelanggaran, tidak pernah dengan tebakan diam-diam.
- Variabel bertanda `secret: true` tidak pernah memiliki default yang di-hardcode di kode — diperiksa mesin, bukan hanya konvensi.
- Feature flag (`packages/contracts/src/flags.ts`) hanya bisa menjawab hidup/mati (`FeatureFlag.read(): boolean`); tidak ada field yang bisa membawa role/permission/bypass — dibuktikan lewat `@ts-expect-error` di `flags.test.ts`. Flag bukan kontrol otorisasi.
- Kedelapan flag produksi-sensitif (`FEATURE_*`, `SKD_PRODUCTION_ACTIVATION`, `PRODUCTION_WRITES_ENABLED`) default `false` bila tidak diset — diperiksa di dua lapis: `scripts/validate-starter.mjs` (isi `.env.example`) dan `env.test.ts` (skema).
- Secret scanning memakai **Gitleaks 8.30.1**, di-download dan diverifikasi checksum SHA-256-nya sendiri oleh `scripts/install-gitleaks.mjs` (bukan dipercayakan ke Action pihak ketiga) sebelum biner dijalankan. Lihat ADR-044.

## Observability and release evidence (GOV-004)

- `@superlatif/observability` (server/worker only — lihat `packages/observability/src/redaction.ts`, tidak boleh diimpor dari komponen `"use client"`) menyediakan:
  - **correlation ID** (`correlation.ts`) — `AsyncLocalStorage`-based, propagasi terbukti lewat smoke test API → job (worker) → provider dalam satu proses, tanpa dependensi baru.
  - **structured logger** (`logger.ts`) — JSON per baris, level `LOG_LEVEL`-aware, memfilter lewat `redact()` sebelum sampai ke sink. Tidak memilih vendor/exporter (OD-03 tetap terbuka).
  - **redaction** (`redaction.ts`) — denylist diturunkan dari `contracts/analytics-event-catalog.json` + `SECRET_ENV_NAMES`, dengan satu override beralasan (`user_id`, lihat ADR-045) dan default-deny berbasis pola nilai (Bearer/JWT/AWS-key) untuk field yang belum dikenal.
  - **release evidence manifest** (`release-evidence.ts`) — **menolak** (bukan meredaksi) field yang memuat secret/PII/answer payload/webhook mentah; dikunci oleh `releaseId` + `commitSha`.
- `apps/web/src/lib/register-node.ts` dan `apps/worker/src/index.ts` mencatat `startup.config_validated` (sukses) atau `startup.config_invalid` (gagal, `fatal`) lewat logger ini — startup yang sukses maupun gagal sama-sama teramati.
- `scripts/generate-release-evidence.mjs` membangun manifest CI-run (bukan `verify` lokal), diupload sebagai **GitHub Actions artifact** (retensi 90 hari) oleh `ci.yml`. Salinan durable ke repo private `superlatif-ops-evidence` (founder + eng lead, per ADR-042/044) adalah tindakan operator — tidak dibuat atau di-push otomatis oleh kode ini.

## Identity, session, and database (IDN-001)

- **Schema (BD-05, migration pertama)**: `packages/db/src/schema/identity.ts` — `users`, `external_identities`, `user_sessions`, `identity_conflicts`. Sengaja lebih sempit dari `contracts/drizzle-schema.ts`; RBAC (`roles`/`permissions`) milik `IDN-004`, consent/guardian milik task yang belum ditentukan (lihat ADR-046).
- **Merge-key policy** (`packages/domain/src/identity/identity-linking.ts`): `(provider, externalSubject)` adalah **satu-satunya** jalur `link_existing` secara struktural dalam kode — kecocokan email/telepon terhadap user lain hanya bisa menghasilkan `conflict`, tidak pernah auto-link. Diuji tegas di level pure function (`identity-linking.test.ts`) dan level database nyata (`service.integration.test.ts`).
- **Session** (`packages/domain/src/identity/session.ts`): hanya `secret_hash` (SHA-256) yang pernah disimpan; perbandingan `timingSafeEqual`; tidak ada field "session ID yang diberikan caller" di `DeterministicLoginInput` — fixation dicegah oleh bentuk API, bukan sekadar konvensi.
- **Test database**: `packages/db/src/test-client.ts` memakai `@electric-sql/pglite` (WASM Postgres embedded) untuk `test:integration` — cepat, tanpa Docker, tetap menegakkan constraint/FK/unique-index nyata. CI **juga** menjalankan `db:migrate` terhadap **Postgres service container sungguhan** (`postgres:18`, di-pin per digest) untuk parity staging (dok 27 §4).
- **`db:check`** sekarang guard nyata: menjalankan `drizzle-kit generate` dan membandingkan hash isi `packages/db/drizzle/` sebelum/sesudah — gagal kalau schema berubah tapi migration belum di-generate ulang.
- Belum ada route HTTP/API yang memanggil layer ini — `apps/web`/`apps/worker` tidak diubah pada task ini. Wiring HTTP (`/auth/bridge/exchange`, cookie) menyusul di task berikutnya.

## Struktur

| Path                           | Fungsi                                                                  |
| ------------------------------ | ----------------------------------------------------------------------- |
| `CLAUDE.md`                    | Instruksi persistent yang dibaca Claude Code                            |
| `.claude/skills/`              | Empat skill domain Superlatif                                           |
| `docs/gates/`                  | Dokumen canonical Gates 1–4                                             |
| `docs/audit/`                  | Findings dan audit closure                                              |
| `docs/source/`                 | Instruksi awal dan deck brand                                           |
| `contracts/`                   | OpenAPI, JSON Schema, template import, kontrak Gate 3                   |
| `planning/`                    | Backlog implementasi dan release-gate evidence contract                 |
| `test/fixtures/contracts/`     | Fixture sintetis untuk contract/integration tests                       |
| `scripts/`                     | Validator starter, boundary check, migration guard                      |
| `apps/web`                     | Deployment unit student/admin web dan BFF (Next.js App Router)          |
| `apps/worker`                  | Deployment unit background worker                                       |
| `packages/contracts`           | Tipe kontrak bersama turunan `contracts/`                               |
| `packages/domain`              | Modul domain murni; tanpa UI dan tanpa vendor SDK                       |
| `packages/domain/src/identity` | Pure domain: session crypto, identity-linking policy (IDN-001)          |
| `packages/db`                  | Drizzle schema dan migration (IDN-001: identity subset)                 |
| `packages/db/src/schema`       | Drizzle schema TypeScript — sumber kebenaran, bukan SQL                 |
| `packages/db/drizzle/`         | Migration SQL ter-generate — **commit**, jangan diedit manual           |
| `packages/ui`                  | Primitive design system student/admin                                   |
| `packages/observability`       | Structured logging, redaksi, correlation ID, manifest evidence          |
| `packages/integrations`        | Adapter vendor di boundary; kosong sampai OD-01/OD-02/OD-03             |
| `packages/testing`             | Factory, clock injection, seeded randomness, provider fake              |
| `.gitleaks.toml`               | Konfigurasi Gitleaks repo-lokal (BD-08)                                 |
| `.cache/gitleaks/`             | Binary Gitleaks ter-cache lokal; gitignored, dibuat oleh `secrets:scan` |

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
