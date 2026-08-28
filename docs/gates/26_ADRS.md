# 26 — Architecture Decision Records

**Versi:** 1.0-RC2  
**Status:** Audit-resolved candidate; decisions marked provisional need founder/spike approval

## ADR format

- **Status:** proposed, accepted, provisional, deferred, superseded.
- **Context:** problem and constraints.
- **Decision:** chosen direction.
- **Consequences:** benefits/costs.
- **Validation:** evidence needed.

---

## ADR-001 — Program-centric experience

**Status:** Accepted  
**Decision:** Program is student experience container; tryout, material, live class, recording, schedule, and progress are contextual facilities.  
**Consequences:** Navigation is simpler; content and access models must be reusable and hierarchical.

## ADR-002 — Keep WordPress/Sejoli commerce for MVP

**Status:** Accepted  
**Decision:** Do not rebuild checkout, payment, affiliate, coupon, commission, or finance reporting.  
**Consequences:** Faster launch, but bridge/reconciliation become critical dependencies.

## ADR-003 — Separate product, offer, program, batch, form, and access

**Status:** Accepted  
**Decision:** Each concept has a separate lifecycle/version.  
**Consequences:** More domain records, but flash sale, bundle, upgrade, and exam history remain coherent.

## ADR-004 — Additive explainable access grants

**Status:** Accepted  
**Decision:** Effective access is the union of active source grants; revoking one source does not remove access supported by another.  
**Consequences:** Requires resolver/projection and support explanation; prevents destructive subscription overwrite.

## ADR-005 — External identity linking, not email-only identity

**Status:** Accepted  
**Decision:** App user ID is stable; WordPress/Sejoli subjects are linked identities. Email/phone are attributes and conflict signals.  
**Consequences:** More conflict workflow; significantly lowers incorrect merges.

## ADR-006 — Signed one-time WordPress bridge code

**Status:** Provisional  
**Decision:** Use a minimal bridge/plugin to exchange an authenticated WordPress identity for an app session.  
**Consequences:** Seamless login; requires plugin security/key rotation.  
**Validation:** Staging spike of available WordPress/Sejoli hooks and auth capability.

## ADR-007 — Modular monolith

**Status:** Accepted  
**Decision:** TypeScript modular monolith with separate web and worker deployment; no MVP microservices.  
**Consequences:** Lower operational complexity; code boundaries and outbox discipline required.

## ADR-008 — Next.js App Router web layer

**Status:** Accepted (version-locked at kickoff by ADR-042)  
**Decision:** Next.js 16 App Router for student/admin web and BFF. Kickoff lock resolved the provisional major to **Next.js 16.3.3**, recorded in `pnpm-lock.yaml`.  
**Consequences:** Productive full-stack TypeScript and Vercel compatibility; exam hot path must still pass latency/load test before the hosting decision in OD-03 is closed. Hosting provider remains provisional; only the framework version is locked.

## ADR-009 — PostgreSQL transactional source of truth

**Status:** Accepted  
**Decision:** PostgreSQL stores authoritative transactional state. Cache/projections are rebuildable.  
**Consequences:** Strong transactions/integrity; connection and query discipline required.

## ADR-010 — Supabase Postgres as provisional managed provider

**Status:** Provisional  
**Decision:** Evaluate Supabase Postgres first because it aligns with current team tooling; app does not depend on exposing generic Data API directly to clients.  
**Consequences:** Fast managed start; provider decision requires backup/PITR/pooling/load/cost validation.

## ADR-011 — Drizzle schema plus reviewed SQL migrations

**Status:** Accepted  
**Decision:** Codebase-first schema, generated SQL reviewed and applied through migrations; `push` local only.  
**Consequences:** Typed schema and auditable history; schema artifact is not itself migration-ready until checks pass.

## ADR-012 — Transactional outbox for side effects

**Status:** Accepted  
**Decision:** Business state and outbox event commit together; workers execute scoring, notifications, projections, and integration actions idempotently.  
**Consequences:** Reliable recovery; additional worker/storage complexity.

## ADR-013 — S3-compatible protected asset storage

**Status:** Accepted, vendor provisional  
**Decision:** Media/import/export in object storage with metadata DB, quarantine/processing, signed access, and CDN.  
**Consequences:** Scalable assets; lifecycle/security/scan pipeline required.

## ADR-014 — Version rules; history never mutates

**Status:** Accepted  
**Decision:** Product, program, question, blueprint, form, scoring, template, and result changes create versions where historical behavior matters.  
**Consequences:** More storage and migration mapping; reliable audit/correction.

## ADR-015 — One core exam engine, activation gate per family

**Status:** Accepted  
**Decision:** Core is configurable; SKD Kedinasan only production target at MVP. Other families remain disabled until regulatory/academic/technical gates.  
**Consequences:** Avoids duplicated engines and premature claims.

## ADR-016 — Persist presented question and option order

**Status:** Accepted  
**Decision:** Server generates and persists order; do not depend solely on MD5/Mulberry/reconstructable algorithm.  
**Consequences:** More attempt rows; exact historical presentation and algorithm independence.

## ADR-017 — Writer lease + revision CAS for answers

**Status:** Accepted for prototype; security review pending  
**Decision:** One active writer lease; answer mutation has idempotency ID and expected revision. Client timestamp never wins conflicts.  
**Consequences:** Explicit takeover UX and offline conflict handling; avoids silent stale overwrite.

## ADR-018 — Server deadline with reviewable late-sync candidates

**Status:** Provisional  
**Decision:** Saves received after deadline do not silently score; they become recovery candidates until configurable cutoff.  
**Consequences:** Trustworthy deadline and recoverability; policy/operations burden.  
**Validation:** Mobile offline and abuse test.

## ADR-019 — Human review before ranked question publication

**Status:** Accepted  
**Decision:** Writer cannot approve own ranked question by default; bulk import goes to bank/review, not directly to batch.  
**Consequences:** Quality assurance with additional operational throughput need.

## ADR-020 — XLSX multi-sheet + ZIP media import

**Status:** Accepted  
**Decision:** MVP bulk format uses versioned XLSX sheets and optional ZIP assets with validation/preview/background import.  
**Consequences:** Familiar to academic team; robust parser/security/error reporting required.

## ADR-021 — Student serializer protects exam secrets

**Status:** Accepted  
**Decision:** Allowlisted serializers by release state; keys, weights, and explanations remain server-side until policy release.  
**Consequences:** Separate response contracts/tests; prevents accidental leakage.

## ADR-022 — No IRT or official-score claim without evidence

**Status:** Accepted  
**Decision:** Use descriptive/classical analytics and clearly labeled simulated scores until methodology is validated.  
**Consequences:** More honest product; marketing/product copy guardrails required.

## ADR-023 — Passive exam telemetry

**Status:** Accepted  
**Decision:** Visibility/device/network telemetry supports diagnostics, not automatic cheating verdict. No webcam proctoring in MVP.  
**Consequences:** Lower friction/privacy risk; no claim of strong remote proctoring.

## ADR-024 — Ethical habit model

**Status:** Accepted  
**Decision:** Next action, real schedule/deadline, useful feedback, and visible progress drive return. Streak/XP are secondary/deferred.  
**Consequences:** Product remains calm and trust-based.

## ADR-025 — Analytics excludes answers and generic PII

**Status:** Accepted  
**Decision:** Use pseudonymous event envelope and property allowlist; server events are truth for critical funnel.  
**Consequences:** Privacy and lower leak risk; additional identity/warehouse joining controls.

## ADR-026 — API REST v1 and idempotent commands

**Status:** Accepted  
**Decision:** REST/JSON `/api/v1`; idempotency keys for attempt, submit, checkout, publish, webhook, and background commands.  
**Consequences:** Clear contracts; idempotency storage/request hashing required.

## ADR-027 — No active attempt migration across engines

**Status:** Accepted  
**Decision:** Launch new engine on new batch; active legacy batch completes in old system unless a dedicated compatibility project proves safe.  
**Consequences:** Safer cutover; temporary parallel systems.

## ADR-028 — Progress counts released required activities

**Status:** Accepted  
**Decision:** Default percentage = completed/waived required divided by released required; optional shown separately.  
**Consequences:** Explainable dan fair; perubahan denominator membutuhkan ADR baru dan migration/projection plan.

## ADR-029 — Support workflow, no direct database editor

**Status:** Accepted  
**Decision:** Access/attempt/correction operations use typed commands with dry-run, permission, reason, and audit.  
**Consequences:** Safer operations; emergency runbooks must use controlled scripts/commands.

## ADR-030 — ASVS level 2 and WCAG 2.2 AA targets

**Status:** Accepted  
**Decision:** P0 flows target OWASP ASVS level 2 verification coverage and WCAG 2.2 AA.  
**Consequences:** Testing and implementation effort become release requirements.

## Deferred legacy decisions

| Legacy direction | Current status |
|---|---|
| Direct Duitku/native payment | Deferred; Sejoli remains |
| Battle engine | Deferred |
| Energy/anti-skip gamification | Superseded by ethical habit model |
| IRT claim | Deferred until evidence |
| Dedicated hot-path service on day one | Provisional after load test |
| Early partitioning | Deferred until measurement |
| B2B multi-tenancy | Deferred |

## Decision log required after Claude audit

## ADR-031 — Ranked MVP uses immutable fixed forms

**Status:** Accepted. **Decision:** Tidak ada question pool/random-per-attempt untuk ranked MVP; option order hanya mengikuti question policy dan disimpan. Form retired dari ranked reuse setelah review/kunci dirilis.

## ADR-032 — Result lifecycle has six canonical states

**Status:** Accepted. **Decision:** `processing → provisional → final`, dengan cabang `corrected`, `withheld`, dan `voided`; koreksi/adjudikasi membuat version baru dan current pointer atomik.

## ADR-033 — Batch owns ranking-attempt rule

**Status:** Accepted. **Decision:** Product entitlement memberi allowance, blueprint memberi default presentasi, tetapi batch memilih attempt yang masuk snapshot ranking.

## ADR-034 — Late sync is evidence, not automatic scoring

**Status:** Accepted. **Decision:** Cutoff awal 30 detik; payload terlambat disimpan sebagai candidate dan perlu adjudikasi. Angka dikalibrasi lewat test tetapi default aman tidak berubah otomatis.

## ADR-035 — Preserve historical results after refund/expiry

**Status:** Accepted. **Decision:** Attempt, result version, dan ranking snapshot tetap ada; akses resource/pembahasan mengikuti effective grant dan post-expiry policy.

## ADR-036 — Store consent structure before legal policy freeze

**Status:** Accepted with legal gate. **Decision:** Model consent/wali dan DSR dibuat sekarang; umur, retensi, legal basis, serta notice final tidak diaktifkan tanpa review hukum.

## ADR-037 — Writer lease uniqueness uses explicit active state

**Status:** Accepted. **Decision:** Partial unique index memakai `is_active=true`; service menutup lease kedaluwarsa sebelum acquire/takeover. Predicate `expires_at > now()` ditolak karena fungsi waktu volatile tidak sah sebagai PostgreSQL index predicate.

## ADR-038 — Delapan role operasional kanonik

**Status:** Accepted. **Decision:** Role bundle adalah Super Admin, Operations Admin, Academic Admin, Tutor/Writer, Moderator/Reviewer, Live-Class Coordinator, Support, dan Finance/Reconciliation. Satu user boleh memiliki beberapa role, tetapi separation of duties dievaluasi berdasarkan actor ID.

## ADR-039 — Weighted choice memakai payload single-choice

**Status:** Accepted. **Decision:** `weighted_choice` membedakan scoring policy, bukan interaction shape; student mengirim `kind=single_choice` + `optionCode`, sementara option weight hanya tersedia pada restricted server-side secret.

## ADR-040 — Ranking memakai subject pseudonim terpisah

**Status:** Accepted. **Decision:** Immutable ranking entry menunjuk `ranking_subject`, bukan langsung `users`; mapping user↔subject berada di tabel restricted dan public serializer hanya meresolve alias bila opt-in.

## ADR-041 — Semantic validation melengkapi JSON Schema

**Status:** Accepted. **Decision:** Invariant lintas-elemen yang tidak dapat diekspresikan portabel oleh JSON Schema—termasuk jumlah durasi section—dideklarasikan sebagai semantic invariant dan wajib diuji oleh publication validator/contract fixtures.

## ADR-042 — P0 kickoff lock: toolchain, workspace layout, and delivery guards

**Status:** Accepted  
**Date:** 28 August 2026  
**Supersedes nothing. Locks:** BD-01, BD-02, BD-03, BD-06, BD-07, BD-08 from `GATE_4_READINESS_REGISTER.md` §4.

### Context

GOV-001 cannot create a workspace without resolving one conflict and several open kickoff decisions. `CLAUDE.md` and `GATE_4_READINESS_REGISTER.md` BD-02 name the packages `domain|db|contracts|ui|testing`, while `20_TECHNICAL_ARCHITECTURE.md` §5 names `domain/<subdomain>`, `database`, `contracts`, `observability`, and `integrations/*`. Left unresolved, the difference becomes a cross-repository rename during P1.

### Decision

**Runtime and package manager (BD-01).** Node 24 (Active LTS; local `v24.15.0`) and pnpm 11 (`11.20.0`), pinned through `packageManager`, `engines`, and `.nvmrc`. Corepack is the intended activation path so the pnpm version does not depend on a developer machine.

**Framework version.** `next@16.3.3`, `react@19.2.8`, `react-dom@19.2.8`, taken from the real installation and recorded in `pnpm-lock.yaml`. This closes the "provisional until kickoff version lock" qualifier on ADR-008. The major matches the `Next.js 16` written in `CLAUDE.md`; it was verified against the registry rather than assumed.

**TypeScript.** Pinned to `5.9.3`, not the `latest` tag. At kickoff the `latest` tag is TypeScript 7.0.2, a compiler re-implemented in Go. Adopting a newly-rewritten compiler at the foundation would place unverified toolchain risk under every downstream task with no benefit to P0. Migration to TypeScript 6 or 7 is a separate, evaluated decision and requires its own ADR. `@types/node` is pinned to the `24.x` line so the types track the locked runtime major.

**Workspace layout (BD-02).** The superset of both sources is created at bootstrap:

```text
apps/web  apps/worker
packages/domain  db  contracts  ui  testing  observability  integrations
```

Mapping: `20 §5 packages/database` → `packages/db`; the domain subdomains in `20 §5` (`identity/`, `commerce/`, `access/`, `programs/`, `content/`, `schedules/`, `questions/`, `exams/`, `attempts/`, `results/`, `notifications/`) are folders **inside** `packages/domain`, not separate packages; the `integrations` vendor adapters (`wordpress-sejoli/`, `object-storage/`, `messaging/`) are folders inside `packages/integrations`. Those folders are created by the backlog task that owns each adapter, so that no empty scaffolding claims a boundary nobody has designed yet. `ui` and `testing` from BD-02 are kept.

**Test tools (BD-03).** Vitest for unit/contract/integration, Playwright for E2E, axe-core through Playwright for accessibility. GOV-001 reserves the script names only; GOV-002 configures the runners. Determinism uses injected clock and seeded randomness driven by the existing `TEST_FIXTURE_SEED`.

**Code style tooling.** Deferred from this ADR and decided in **ADR-043** during GOV-002, per the dependency rule in `29_CLAUDE_CODE_EXECUTION_PLAN.md` §6.

**Evidence location (BD-06).** GitHub Actions artifacts for CI evidence, plus a separate private repository `superlatif-ops-evidence` as the restricted operational record, keyed by release ID and commit SHA, restricted to founder and engineering lead. That record must never contain secrets, PII, answer payloads, or raw webhook bodies, consistent with `24_AUTH_RBAC_SECURITY_AND_PRIVACY.md` §17 and `30_LAUNCH_AND_OPERATIONS_RUNBOOK.md` §2.

**Git host and CI (BD-07).** GitHub and GitHub Actions, with required status checks on `main`.

**Secret scanning (BD-08).** Gitleaks as the primary scanner, pinned by version and checksum/digest, with a repository-local configuration. GitHub Secret Scanning and Push Protection may act as an additional layer where available, never as a replacement. Gitleaks is the "approved scanner" contemplated by `27_QA_TESTING_AND_UAT_PLAN.md` §4.

### Enforcement

Two guards make the decisions falsifiable instead of aspirational:

- `scripts/check-workspace-boundaries.mjs` fails the build on a layering violation, on an import that is used but not declared, and on any external runtime dependency inside `packages/domain`. This is how ADR-007 and the `20 §5` rule are enforced by machine rather than by convention.
- `scripts/db-check.mjs` reports `NOT_APPLICABLE` only while no implementation schema or migration exists, and fails as soon as one appears while the BD-05 migration tooling is still unconfigured. A permanent no-op is therefore impossible.

### Consequences

Several packages stay empty until their owning backlog task arrives. They are still covered by `typecheck` so they cannot rot unnoticed, and they carry no placeholder tests, because a test without behaviour proves nothing. The `db:generate`, `db:migrate`, and `test:*` scripts are declared but exit non-zero with the owning task named, so an unconfigured step can never be mistaken for a passing one.

### Validation

Fresh-checkout install, build, and typecheck across all nine workspace projects; negative tests proving the boundary guard and the migration guard both fail when violated. BD-04 and BD-05 remain open by design; their lock point is P1.

## ADR-043 — Prettier for formatting, ESLint flat config for correctness

**Status:** Accepted  
**Date:** 28 August 2026  
**Decided during:** GOV-002. Deferred from ADR-042.

### Context

`27_QA_TESTING_AND_UAT_PLAN.md` §3 makes formatting and lint mandatory static checks on every merge, and §17 makes "no new secret, critical dependency issue, broken schema/ref" a merge exit criterion. ADR-042 deliberately left the choice open because a formatter and a linter are new dependencies, and `29_CLAUDE_CODE_EXECUTION_PLAN.md` §6 requires a rationale for each one.

### Decision

**Prettier** owns formatting. **ESLint** with flat config (`eslint.config.mjs`) owns correctness rules, composed with `typescript-eslint`. `eslint-config-prettier` is applied last so the two tools never disagree about layout: formatting is mechanical and must not consume review attention. All four are pinned in `pnpm-lock.yaml`.

The rule set is deliberately narrow at P0. It covers TypeScript correctness, forbids untyped unused bindings, enforces `import type` so `verbatimModuleSyntax` stays honest, and blocks stray `console` in library code while allowing it in command-line governance scripts, configs, and tests. React, accessibility, and Next.js rule sets are **not** added yet: at P0 there is no real UI surface for them to check, and adding them now would mean maintaining configuration that nothing exercises. They arrive in P2 with the first screens, alongside the accessibility tooling that ADR-042 reserved.

### Scope exclusion

Delivered starter artifacts are excluded from both tools: `CLAUDE.md`, `START_HERE.md`, `STARTER_VALIDATION.md`, `PROMPT_PERTAMA_CLAUDE.md`, and `scripts/validate-starter.mjs`, together with `docs/`, `contracts/`, `planning/`, and `test/fixtures/`. Those files were shipped as source of truth and evidence. Reformatting them produces diff noise on documents this repository consumes rather than owns, and a reformatted evidence table is harder to compare against the record it documents.

### Consequences

Formatting disagreements stop being review comments. The exclusion list must be revisited if a Gate document ever becomes generated rather than authored. The narrow rule set means a UI-specific class of defect is not yet caught by lint; that gap closes in P2 and is recorded here so it is not mistaken for coverage that already exists.

Audit findings must update ADR status rather than silently editing conclusions. Minimum founder confirmations:

- ADR-006 identity bridge;
- ADR-008/010 hosting stack;
- ADR-018 late sync;
- ADR-028 progress formula;
- review/support/download policies from Gate 2.
