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

## Access grants and entitlement policies (ENT-001)

- **Grant status is derived, never stored**: `access_grants` tidak punya kolom `status`. Perubahan hanya bisa terjadi lewat baris baru di `grant_events` (append-only: `activated | suspended | reinstated | revoked | cancelled`); `packages/domain/src/access/grant-status.ts#deriveGrantStatus` menghitung `scheduled | active | suspended | expired | revoked | cancelled` murni dari `(grant, events, now)` setiap kali dibaca. Lihat ADR-047.
- **Policy versioning**: `access_policies` unik per `(code, version)` — versi baru selalu baris baru, tidak pernah edit di tempat. `config` (JSONB) divalidasi saat runtime terhadap `contracts/entitlement-policy.schema.json` (AJV) sebelum baris manapun ditulis, dan dikunci oleh checksum SHA-256 kanonik (`packages/domain/src/access/policy-checksum.ts`) yang diverifikasi ulang saat `publishPolicyVersion` — config yang berubah di luar API repository ini ditolak sebagai `PolicyChecksumMismatchError`, bukan diam-diam dipublikasikan.
- **Validity modes** (`packages/domain/src/access/policy-validity.ts`): `fixed_window`, `duration_after_purchase`, `duration_after_activation` (menunggu event `activated`), `through_program_or_batch_end` (mensyaratkan `lifecycleEndsAt` eksplisit — belum ada tabel program/batch di scope task ini), `lifetime`, `manual`.
- **Ownership-scoped events**: `recordGrantEvent` menolak event yang `(sourceType, sourceId)`-nya tidak cocok dengan sumber yang menerbitkan grant (`isOwnedBy`), dan mensyaratkan `reason` ketika `lifecycle.manualChangeRequiresReason` true pada policy terkait — grant dari `purchase` tidak bisa direvoke oleh aktor yang mengklaim sebagai `scholarship`.
- **Duplicate content tidak tampil dua kali**: `packages/domain/src/access/dedupe.ts#distinctTargets` mengumpulkan klaim dari sumber berbeda yang menunjuk `(target, action)` yang sama menjadi satu entri, tetap menyimpan seluruh sumber pendukungnya.
- **Test negatif wajib** (`packages/db/src/access/grant-repository.integration.test.ts`): revoked access ditolak, expired access ditolak tepat di batas waktu, grant yang overlap dari sumber berbeda independen satu sama lain (ENT-SYN-002), ownership mismatch ditolak (ENT-SYN-004), duplicate content tidak tampil dua kali.
- **Schema (migration kedua)**: `packages/db/src/schema/access.ts` — `access_policies`, `access_grants`, `grant_events`. Sengaja lebih sempit dari `contracts/drizzle-schema.ts`; `grant_claims`, `effective_access` (materialized view), dan `access_change_requests` milik ENT-002/003/004 (lihat ADR-047).
- Tidak ada bridge WordPress/Sejoli hidup dan tidak ada pembukaan akses dari email semata pada task ini — keduanya di luar scope ENT-001 secara eksplisit.

## Product, offer, SKU, bundle, dan validity policy (COM-001)

- **Immutability diselaraskan dengan ENT-001**: `products` (identitas komersial stabil, `type` bebas teks — Kelas Akselerasi, SKD-only, TKA-only, Tryout Pass, batch flash-sale tunggal cukup jadi nilai `type` baru, bukan migration), `product_versions`, dan `offers` immutable sejak dibuat — checksum SHA-256 kanonik (`packages/domain/src/shared/checksum.ts`, dipromosikan dari ENT-001) di-stamp saat draft, diverifikasi ulang saat `publishProductVersion`/`publishOffer`. "Edit draft" berarti membuat versi N+1, bukan mengubah versi N. Lihat ADR-048 untuk alasan menyimpang dari `checksum` nullable pada `contracts/drizzle-schema.ts`.
- **Bundle tanpa duplikasi konten**: `product_components` menaut `product_version` ke target (`targetType`/`targetRef`/`includeDescendants`) plus `access_policy` (ENT-001) yang membawa aturan validity/attemptAllowance/postExpiry/stacking — komponen tidak pernah menyalin konten. Seluruh component set satu versi dikunci bersama checksum versi itu (tidak bisa ditambah/dihapus setelah dibuat).
- **Komposisi & overlap**: `packages/domain/src/commerce/bundle-composition.ts#composeProductTargets` mengumpulkan klaim komponen — dari satu product version atau lintas product version (bundle + paket spesialis yang overlap) — menjadi target unik; target yang sama dari dua produk berbeda tampil satu kali dengan seluruh source tetap terlihat.
- **Offer sale-state derived, bukan disimpan**: `offers.status` adalah lifecycle editorial (draft/published/archived, sama seperti `access_policies`). Status yang dilihat pembeli (`scheduled | on_sale | sold_out | ended | hidden | archived` — dok 05 §6/dok 18 §4) dihitung oleh `packages/domain/src/commerce/offer-status.ts#deriveOfferSaleState` dari status editorial + visibility + sale window + quota/soldCount setiap kali dibaca — `sold_out` hanya mungkin muncul jika `quota` benar-benar diisi (enforced).
- **SKU mapping berversi**: `external_sku_mappings` adalah baris append-only (`mappingVersion` baru untuk setiap remap). `packages/domain/src/commerce/sku-mapping.ts#resolveSkuMapping` memilih mapping yang berlaku pada satu instant — prioritas lalu mapping version terbaru sebagai tie-break — mendukung ID Sejoli lama & baru dan pemulihan duplicate catalogue entry. Tidak ada webhook atau checkout URL yang dipanggil pada task ini.
- **Test wajib** (`packages/db/src/commerce/*.integration.test.ts`): bundle composition (Kelas Akselerasi membuka banyak target dari satu product version), overlapping product (bundle + paket spesialis sama-sama mencakup `track:skd`, tampil sekali), expired offer, flash sale window (scheduled → on_sale → ended), mapping version test (SKU remap terhadap waktu).
- **Schema (migration ketiga)**: `packages/db/src/schema/commerce.ts` — `products`, `product_versions`, `product_components`, `offers`, `external_sku_mappings`. Sengaja lebih sempit dari `contracts/drizzle-schema.ts`; `checkout_intents`, `purchases`, `purchase_events`, `reconciliation_cases` milik COM-002/COM-003 (lihat ADR-048).
- Tidak ada checkout/live Sejoli bridge dan tidak menyentuh payment provider pada task ini — keduanya di luar scope COM-001 secara eksplisit.

## RBAC dan object-level authorization (IDN-004)

- **Delapan role kanonik** (dok 02 §5.3/dok 21 §3/dok 24 §6, sama persis dengan `CLAUDE.md`): `super_admin`, `operations_admin`, `academic_admin`, `tutor_writer`, `moderator_reviewer`, `live_class_coordinator`, `support`, `finance_reconciliation`. Instruksi founder memakai istilah lebih sederhana ("student, admin, tutor, moderator, owner/founder") — pemetaannya (student = tanpa role sama sekali; tutor→`tutor_writer`; moderator→`moderator_reviewer`; owner/founder→`super_admin`) didokumentasikan di `packages/domain/src/authorization/roles.ts` dan ADR-049.
- **Permission matrix versioned di kode, bukan tabel runtime-editable**: `packages/domain/src/authorization/permissions.ts#ROLE_PERMISSION_MATRIX` transkripsi langsung dari matriks dok 24 §6, default-deny (permission yang tidak tercantum = ditolak). `permissions`/`role_permissions` sengaja tidak dibuat sebagai tabel DB — belum ada admin UI untuk mengeditnya (di luar scope task ini).
- **Object-level check tiga sumbu independen** (`packages/domain/src/authorization/object-scope.ts`): `isOwner` (kepemilikan), `isWithinAssignedScope` (scope role — array assignment kosong berarti unscoped), `isEntitled` (entitlement, sebuah boolean yang dihitung caller dengan mengompos ENT-001's `deriveGrantStatus`, bukan dihitung di dalam domain authorization). Dikomposisi oleh `packages/domain/src/authorization/authorize.ts#authorize` — fungsi murni, tanpa I/O.
- **Maker-checker bersifat universal**: `authorize()` menolak `MAKER_CHECKER_VIOLATION` setiap kali `object.creatorUserId === actor.userId`, terlepas dari role — bahkan `super_admin` tidak bisa approve soal buatannya sendiri.
- **Privileged mutation tidak bisa melewati audit trail**: aksi `highRiskType` (dok 24 §7) ditolak `AUDIT_FIELDS_REQUIRED` bila `reason`/`correlationId`/`actorId` kosong — ditegakkan di dua lapis: `authorize()` (domain) dan `packages/db/src/authorization/role-repository.ts#assignRole`/`revokeRoleAssignment` (DB, `RoleAssignmentAuditRequiredError`).
- **Schema (migration keempat)**: `packages/db/src/schema/authorization.ts` — `roles`, `user_roles` (immutable sejak dibuat, sama seperti `access_grants`), `role_assignment_scopes` (tabel assignment terpisah untuk scope, sesuai dok 21 §3), `role_assignment_events` (append-only `revoked`/`reinstated`; status derived, tidak disimpan).
- **Test negatif wajib** (`packages/domain/src/authorization/authorize.test.ts`, `packages/db/src/authorization/role-repository.integration.test.ts`): siswa membaca attempt siswa lain (SEC-SYN-001), tutor di luar scope program, moderator mengubah entitlement, admin melewati audit trail — plus SEC-SYN-002/003/004 dari `test/fixtures/contracts/privacy-rbac.cases.json`.
- Tidak ada bridge WordPress/Sejoli hidup, tidak ada UI admin, dan tidak ada akses berbasis email semata pada task ini — ketiganya di luar scope IDN-004 secara eksplisit. Lihat ADR-049.

## Effective-access resolver, cache, dan explanation trace (ENT-002)

- **Tidak ada migration baru**: resolver membaca apa yang sudah disimpan ENT-001 (`access_grants`, `grant_events`, `access_policies.config.claims`) — `grant_claims` dan `effective_access` (materialized/rebuildable) sengaja tidak dibuat di task ini; tidak ada consumer nyata untuk `grant_claims`, dan rebuild/drift detection untuk `effective_access` adalah scope ENT-003. Lihat ADR-050.
- **Resolver mengembalikan keputusan + explanation, bukan boolean**: `packages/domain/src/access/effective-access.ts#resolveEffectiveAccess` selalu mengembalikan `{allowed, decisiveGrantIds, ignoredGrantIds, reasonCode, effectiveFrom, effectiveTo, studentReason, diagnostic}` (dok 05 §9) — fungsi murni, dikompos dari daftar grant yang statusnya sudah di-derive lewat `deriveGrantStatus` (ENT-001).
- **Duplicate target tidak tampil dua kali**: dua grant aktif yang sama-sama meng-claim target/action yang sama menghasilkan **satu** keputusan dengan `decisiveGrantIds` berisi keduanya — bukan dua keputusan terpisah. `effectiveTo` mengikuti `expiryResolution=latest_supporting_grant` (akhir terjauh di antara grant aktif yang mendukung).
- **Revoked/expired/suspended/cancelled ditolak dengan explanation trace jelas**: setiap grant yang meng-claim target tapi tidak decisive muncul di `ignoredGrantIds` plus `diagnostic` (status derived tiap grant) — support tetap bisa melihat semua sumber, bukan hanya yang menang.
- **Attempt allowance terpisah dari content visibility (ENT-005)**: `packages/domain/src/access/attempt-allowance.ts#resolveAttemptAllowance` adalah fungsi **terpisah**, tidak pernah digabung ke `EffectiveAccessDecision` — default MVP `ownedByBatch:true` (batch adalah satu-satunya pemilik limit) sesuai dok 05 §8.4, tidak pernah mengarang angka.
- **Cache in-process, mudah diganti**: `EffectiveAccessCache` (`packages/domain/src/access/effective-access-cache.ts`) adalah interface tiga method; `createInMemoryEffectiveAccessCache` (Map-based, `now` di-inject, tanpa `Date.now()`) satu-satunya implementasi — tidak ada Redis/Valkey. Invalidasi hanya lewat `issueGrantAndInvalidate`/`recordGrantEventAndInvalidate` (`packages/db/src/access/effective-access-service.ts`), yang membungkus `issueGrant`/`recordGrantEvent` ENT-001 tanpa mengubahnya.
- **`includeDescendants` tetap butuh ancestry dari caller**: sama seperti `lifecycleEndsAt` di ENT-001, `isDescendantOf` adalah parameter opsional yang harus disuplai caller — belum ada tabel hierarki program/track (PRG series).
- **Gate A tidak diklaim PASS**: task ini hanya melengkapi ENT-003/004/005 requirement; `planning/release-gates.json` tidak diubah — status gate tetap keputusan founder/owner terhadap requirement set lengkap. Lihat ADR-050.

## Manual grant, extension, dan revocation dengan reasoned approval (ENT-004)

- **Dua tabel append-only, bukan satu row berstatus mutable**: `access_change_requests` (ask immutable — changeType, target, requester, reason, correlationId, payload, previewSnapshot) + `access_change_decisions` (append-only — approve/reject plus hasil eksekusi). Status (`pending_approval|rejected|executed|execution_failed`) di-derive lewat `packages/domain/src/access/manual-change.ts#deriveManualChangeStatus`, tidak pernah disimpan. Lihat ADR-051.
- **Preview adalah before-state nyata**: `requestManualChange` menghitung `previewSnapshot` — effective access SEBELUM perubahan untuk setiap target/action yang di-cover policy yang diminta (lewat ENT-002's `getEffectiveAccess`) — dihitung sekali saat request, disimpan verbatim.
- **`authorize()` (IDN-004) menggerbangi setiap langkah**: `requestManualChange` menolak sebelum menulis apa pun bila actor tidak punya `access.manual.change` atau `reason`/`correlationId` kosong (`AUDIT_FIELDS_REQUIRED`, action type `manual_grant_revoke_extension` — high-risk per dok 24 §7). `decideManualChange` memanggil `authorize()` lagi untuk approver, dengan `object.creatorUserId = requester` — self-approval ditolak `MAKER_CHECKER_VIOLATION` secara struktural, berlaku untuk semua role.
- **Melengkapi nuance IDN-004 yang sengaja ditunda**: `access.manual.change` untuk `academic_admin`/`operations_admin` dinaikkan dari `scoped_nuance` ke `granted` (`requiresApproval:true`) — "Terbatas" sekarang berarti "wajib peer approval", ditegakkan universal oleh workflow ini, bukan oleh flag matrix per role. `support`'s "Request terbatas" sengaja tetap belum diselesaikan (request-only, di luar scope task ini).
- **Manual grant memakai `sourceId` stabil per-siswa**: setiap manual grant memakai `sourceId=targetUserId` (bukan id request) + `sourceKey=changeRequestId` — membuat revocation manual TERHADAP GRANT MANUAL manapun untuk siswa itu selalu bisa (ownership match), sekaligus membuat revocation manual terhadap grant **purchase** gagal secara struktural (`GrantOwnershipMismatchError`, `"manual" !== "purchase"`) — inilah yang menegakkan "jangan pernah rewrite purchase grant asli" pada level eksekusi, bukan hanya konvensi.
- **Kegagalan eksekusi tidak melempar exception mentah**: bila approval disetujui tapi eksekusi gagal (mis. ownership mismatch), decision tetap tercatat dengan `executionStatus:"execution_failed"` — keputusan manusia tetap teraudit, mutasi tidak pernah terjadi.
- **Cache invalidation diwarisi, bukan diimplementasi ulang**: eksekusi hanya memanggil `issueGrantAndInvalidate`/`recordGrantEventAndInvalidate` (ENT-002) — satu-satunya fungsi yang menyentuh cache di seluruh codebase.
- **Test negatif wajib** (`packages/db/src/access/manual-change-service.integration.test.ts`): unauthorized actor, missing reason, self-approval, revoking purchase grant by mutation, stale effective access cache — semua lulus lewat DB nyata.
- Tidak ada UI admin dan tidak ada WordPress/Sejoli bridge pada task ini — keduanya di luar scope ENT-004 secara eksplisit.

## Struktur

| Path                                | Fungsi                                                                                                                                    |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `CLAUDE.md`                         | Instruksi persistent yang dibaca Claude Code                                                                                              |
| `.claude/skills/`                   | Empat skill domain Superlatif                                                                                                             |
| `docs/gates/`                       | Dokumen canonical Gates 1–4                                                                                                               |
| `docs/audit/`                       | Findings dan audit closure                                                                                                                |
| `docs/source/`                      | Instruksi awal dan deck brand                                                                                                             |
| `contracts/`                        | OpenAPI, JSON Schema, template import, kontrak Gate 3                                                                                     |
| `planning/`                         | Backlog implementasi dan release-gate evidence contract                                                                                   |
| `test/fixtures/contracts/`          | Fixture sintetis untuk contract/integration tests                                                                                         |
| `scripts/`                          | Validator starter, boundary check, migration guard                                                                                        |
| `apps/web`                          | Deployment unit student/admin web dan BFF (Next.js App Router)                                                                            |
| `apps/worker`                       | Deployment unit background worker                                                                                                         |
| `packages/contracts`                | Tipe kontrak bersama turunan `contracts/`                                                                                                 |
| `packages/domain`                   | Modul domain murni; tanpa UI dan tanpa vendor SDK                                                                                         |
| `packages/domain/src/identity`      | Pure domain: session crypto, identity-linking policy (IDN-001)                                                                            |
| `packages/domain/src/access`        | Pure domain: validity, grant status, dedupe, checksum (ENT-001); effective-access resolver, attempt allowance, in-process cache (ENT-002) |
| `packages/domain/src/commerce`      | Pure domain: bundle composition, offer sale-state, SKU mapping resolution (COM-001)                                                       |
| `packages/domain/src/authorization` | Pure domain: RBAC matrix, object-scope/entitlement/maker-checker checks, `authorize()` (IDN-004)                                          |
| `packages/domain/src/shared`        | Canonical-JSON checksum shared by access/ and commerce/ (promoted in COM-001)                                                             |
| `packages/db`                       | Drizzle schema dan migration (IDN-001: identity; ENT-001: access; COM-001: commerce; IDN-004: authorization; ENT-004: access-change)      |
| `packages/db/src/schema`            | Drizzle schema TypeScript — sumber kebenaran, bukan SQL                                                                                   |
| `packages/db/drizzle/`              | Migration SQL ter-generate — **commit**, jangan diedit manual                                                                             |
| `packages/ui`                       | Primitive design system student/admin                                                                                                     |
| `packages/observability`            | Structured logging, redaksi, correlation ID, manifest evidence                                                                            |
| `packages/integrations`             | Adapter vendor di boundary; kosong sampai OD-01/OD-02/OD-03                                                                               |
| `packages/testing`                  | Factory, clock injection, seeded randomness, provider fake                                                                                |
| `.gitleaks.toml`                    | Konfigurasi Gitleaks repo-lokal (BD-08)                                                                                                   |
| `.cache/gitleaks/`                  | Binary Gitleaks ter-cache lokal; gitignored, dibuat oleh `secrets:scan`                                                                   |

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
