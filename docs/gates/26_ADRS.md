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

## ADR-044 — Self-verified Gitleaks install; env contract derived from .env.example

**Status:** Accepted  
**Date:** 28 August 2026  
**Decided during:** GOV-003. Implements the BD-06/BD-08 decisions ADR-042 already locked.

### Context

ADR-042 locked Gitleaks, pinned by version and checksum/digest, as the BD-08 scanner. Implementing that during GOV-003 raised two decisions ADR-042 did not go deep enough to settle.

### Decision 1: verify the binary ourselves, do not trust a third-party Action's internal pinning

`gitleaks/gitleaks-action` exists and downloads Gitleaks internally, but auditing exactly what it pins and verifies means reading and trusting that action's own supply chain. Instead, `scripts/gitleaks-pin.mjs` records the exact release version (`8.30.1`) and a SHA-256 digest per platform, read directly from that release's own `gitleaks_8.30.1_checksums.txt` and cross-checked on 2026-08-28 by downloading both the `linux_x64` (CI) and `darwin_arm64` (local development) assets and comparing computed digests byte for byte. `scripts/install-gitleaks.mjs` refuses to extract or execute a download whose digest does not match, and writes a `.verified-sha256` marker next to the cached binary so a stale, unverified cache can never be silently trusted on a later run. GitHub Actions is still pinned to a commit SHA for `actions/checkout`, `pnpm/action-setup`, and `actions/setup-node` (recorded in `.github/workflows/ci.yml`), but the security-relevant download - the scanner itself - is verified by this repository's own code, not delegated.

### Decision 2: the environment contract is derived from `.env.example`, not duplicated by hand

`packages/contracts/src/env-spec.ts` declares one entry per variable, and `env.test.ts` asserts the schema's variable names are exactly the set found in `.env.example` (49 variables on both sides at time of writing). This makes `.env.example` the single source of truth for which variables exist; the schema cannot silently drift from the template that ships as evidence. Each field is one of three requirement tiers: `required` (no safe default exists - APP_ENV, LOG_LEVEL, and the three base URLs), `optional-default` (a coded, non-secret safe default - all boolean flags, TTLs, `OTEL_SERVICE_NAME`, `TEST_FIXTURE_SEED`), or `optional-no-default` (a secret or an undecided-provider variable nothing consumes yet - DATABASE_URL, SESSION_*, WP_BRIDGE_*, and similar). `env.test.ts` asserts mechanically that no field marked `secret: true` ever carries a coded default, and that every `FEATURE_*`/`SKD_PRODUCTION_ACTIVATION`/`PRODUCTION_WRITES_ENABLED` default is exactly `"false"` - the acceptance criterion "production-sensitive capability defaults off" as a test, not only a convention.

`apps/web/instrumentation.ts` and `apps/worker/src/index.ts` call `loadCoreEnv()` at startup, validating only the subset of fields real code reads today (the six `required` fields). Marking `DATABASE_URL` or `SESSION_SIGNING_SECRET` required now, before anything connects to a database or issues a session, would invent a requirement P0 cannot honestly enforce; each field's comment in `env-spec.ts` names the task expected to extend `CORE_REQUIRED_FOR_STARTUP` when it starts consuming that variable.

A near-miss (edit-distance) typo detector flags an unrecognized variable that is almost certainly a misspelling of a declared one (for example `FEATURE_QUESTON_IMPORT`). An earlier prefix-based design was rejected after it false-positived in this repository's own development shell, which already had an unrelated `API_TIMEOUT_MS` variable set - a name that merely shared the generic `API_` prefix with `API_BASE_URL`. That failure is kept as a named regression test (`env.test.ts`, `startup.contract.test.ts`).

### Consequences

Bumping the Gitleaks version means updating `GITLEAKS_VERSION` and every per-platform digest in `scripts/gitleaks-pin.mjs` together, sourced from that release's own checksums file - never typed from memory. Adding an environment variable means adding it to `.env.example` and `env-spec.ts` together, or `env.test.ts` fails. Feature flags additionally require an entry in `packages/contracts/src/flags.ts`'s ownership registry (`flags.test.ts` asserts the two sets match), so a flag cannot be introduced with only an env var and no named owner or removal condition.

## ADR-045 — Redaction: user_id is an operational-log override; evidence manifests reject rather than redact

**Status:** Accepted  
**Date:** 28 August 2026  
**Decided during:** GOV-004.

### Context

`packages/observability` derives its redaction denylist from `contracts/analytics-event-catalog.json`'s `prohibitedProperties` (GOV-004's plan intent: no hand-duplicated list). That catalog exists to keep third-party-bound, pseudonymous product analytics events clean (ADR-025) and includes `user_id` in its prohibited list for that reason. Applying the same denylist unmodified to general structured application/audit logs breaks `24_AUTH_RBAC_SECURITY_AND_PRIVACY.md` §17, which explicitly names "object IDs" as a safe structured field, and §14, which requires audit logs to record manual access/correction/identity-merge actions - actions that are meaningless without recording which user they concern.

### Decision

`packages/observability/src/redaction.ts` excludes exactly one field, `user_id`/`userId`, from the analytics-derived denylist, with the exclusion named and reasoned in code (`OPERATIONAL_LOG_OVERRIDES`). No other analytics-prohibited field is excluded: email, phone, full_name, and the rest remain denied in both analytics events and operational logs, because dok 24 §17's safe-field list does not extend to them.

Separately: a release evidence manifest (`release-evidence.ts`) uses **reject**, not redact, when forbidden content is found. A log line silently substituting `[redacted]` for a secret is correct - logging must never crash the application. A standing evidence record silently doing the same would misrepresent what was actually captured, so `createReleaseEvidenceManifest` throws `ReleaseEvidenceRejectedError` instead, forcing the caller to remove the offending field before evidence exists at all.

### A naming lesson kept as a regression test

An early version of the CI evidence generator recorded a check result under the key `"secrets:scan"` (the pnpm script's own name) and was rejected by the manifest builder it was calling, because the key contains the substring "secret" - the same default-deny substring rule doing its job correctly, just against a metadata key rather than an actual secret. The fix renamed the generator's keys to describe outcomes (`gitleaksClean`, `buildSucceeded`, ...) rather than echoing internal script names. `release-evidence.test.ts` keeps both facts as separate assertions: `gitleaksClean` is accepted, and a key literally containing "secret" is still (correctly) rejected.

### Consequences

Any future addition to `contracts/analytics-event-catalog.json`'s `prohibitedProperties` is denylisted in operational logs automatically, unless a comparably-reasoned override is added to `OPERATIONAL_LOG_OVERRIDES` - the bar for adding one should stay high and each one should cite the specific dok 24 §17 clause that permits it. Evidence-manifest field names should be chosen to describe outcomes, not to echo script/tool names, precisely because tool names sometimes contain words the redaction rules treat as sensitive by design.

## ADR-046 — IDN-001: identity/session schema scope, merge-key policy, and test database strategy

**Status:** Accepted  
**Date:** 28 August 2026  
**Decided during:** IDN-001 (first implementation task after the P0 governance foundation; first database migration, locking BD-05).

### Schema scope: narrower than the Gate 3 contract artifact

`contracts/drizzle-schema.ts` (a Gate 3 review artifact, not a runtime module) includes `roles`, `permissions`, `user_roles`, `role_permissions`, `consent_records`, and `users.date_of_birth`/`guardian_consent_state` in its identity section. IDN-001 implements only `users`, `external_identities`, `user_sessions`, and `identity_conflicts` - the four tables that map 1:1 onto IDN-001's three backlog acceptance criteria (identity mapping, session revocation, deterministic/audited login). RBAC tables are `IDN-004`'s explicit scope ("Enforce RBAC, object scope, and privileged-action audit"); building them now would be exactly the "generating schema first" anti-pattern `29_CLAUDE_CODE_EXECUTION_PLAN.md` §13 warns against for a concern this task does not own. Consent/guardian fields are deferred to whichever task takes up ADR-036's instruction to model consent before legal policy freeze - IDN-001's own acceptance criteria never mention consent, and `21_ERD_AND_DATA_DICTIONARY.md` §3's own `users` definition (ERD outranks the Gate 3 schema artifact in `CLAUDE.md`'s source-of-truth order) does not list those columns either.

`users.email_normalized` and `users.phone_e164` deliberately carry no unique constraint. `23_SEJOLI_WORDPRESS_INTEGRATION.md` §4 rule 3 requires an email/phone collision to become a reviewable conflict case; a unique constraint would make that case impossible to represent, since two users could never (even temporarily, pending resolution) share a contact value.

### Merge-key policy: (provider, externalSubject) only, structurally

`packages/domain/src/identity/identity-linking.ts`'s `evaluateIdentityLink` has exactly one code path that returns `link_existing`, and it is gated on an already-verified `(provider, externalSubject)` match. An email or phone match against a different user can only ever produce a `conflict` decision - never an automatic link or merge. This is the direct implementation of the founder instruction "jangan pakai email sebagai satu-satunya identity merge key" and of `29_CLAUDE_CODE_EXECUTION_PLAN.md` §13's anti-pattern list. `identity-linking.test.ts` and `service.integration.test.ts` both assert this by injecting a real collision and checking the outcome is `conflict`, not `link_existing`.

### Session model: hash-only, timing-safe, fixation-proof by construction

`user_sessions.secret_hash` is the only place a session secret is ever stored (SHA-256 of a 256-bit random value - sufficient because the input is already high-entropy, unlike a human password). `secretMatchesHash` uses `timingSafeEqual`. Session fixation is prevented structurally rather than by convention: `DeterministicLoginInput` (the only way to create a session) has no field for a caller-supplied session or secret value, so there is no code path by which a pre-chosen identifier could be honored. `evaluateSessionValidity` checks revocation before expiry and is server-clock-driven (`now` injected, never read from a request).

### Test database strategy: pglite for speed, a real Postgres service container in CI for parity

`packages/db/src/test-client.ts` uses `@electric-sql/pglite` (embedded WASM Postgres) to run the exact same generated migration SQL and exercise real constraint/FK/unique-index behaviour, with no Docker or live Postgres connection required - verified during design by confirming `drizzle-kit generate --dialect postgresql` produces standard, driver-independent SQL regardless of which client later applies it. This keeps `test:integration` fast and runnable on a machine with no local Postgres (this one, notably: verified there was neither Docker nor a local Postgres install available in the implementing session). `ci.yml` separately stands up a real `postgres:18` service container (pinned by image digest) and runs `db:migrate` against it, satisfying `27_QA_TESTING_AND_UAT_PLAN.md` §4's staging-parity principle and §8's "apply pada database kosong" - pglite is fast and constraint-accurate but is not byte-identical to production Postgres, so this is not left as the only migration-apply evidence.

### `db:check` rewritten as a real drift guard

GOV-001's `db:check` deliberately refused to become a permanent no-op: it reported `NOT_APPLICABLE` only while no schema existed, and failed the moment one appeared, naming the exact replacement contract ("generated migration must match the schema"). This task honors that contract: `scripts/db-check.mjs` now runs `drizzle-kit generate` and compares a content hash of `packages/db/drizzle/` before and after. A difference means the schema changed without `db:generate` being run and committed. This compares disk content rather than `git status`, deliberately: `git status` would also flag a migration that is staged-but-not-yet-committed as "drift" during ordinary local development, which is a different condition than the one this guard exists to catch.

### "Audited" without a new audit-log table

IDN-001's acceptance criterion "Login mapping is deterministic and audited" is satisfied by structured, correlation-ID-tagged logging (`identity.login_mapped` / `identity.link_conflict`) through the GOV-004 observability baseline, plus the durable `identity_conflicts` record for the one outcome that genuinely needs a queryable row. `packages/db` is not allowed to depend on `@superlatif/observability` under the ADR-042 layering matrix (`db → [contracts, domain]` only), so `service.ts` accepts a minimal structural `AuditLogger` interface (`info`/`warn`) rather than importing the concrete `Logger` type - any real `@superlatif/observability` logger satisfies it, without `packages/db` gaining a new package dependency for two log calls. A generic cross-domain `audit_log` table (`28_IMPLEMENTATION_ROADMAP.md` Phase 1's own separate "append-oriented audit log" deliverable) is left to whichever task actually owns it; IDN-001's own tests do not require one.

### A layering-checker bug this task exposed and fixed

`scripts/check-workspace-boundaries.mjs`'s "no vendor SDK" rule for `packages/domain` had never been exercised against a test file, because `packages/domain` had no `*.test.ts` files before this task. Adding the first one (`vitest` import) tripped the rule immediately - `packages/domain` would have been permanently untestable under the original check. Fixed by exempting `*.test.ts` files from the external-import ban (a test framework is dev tooling declared in the root `package.json`, not a production runtime dependency of the package under test); the rule still correctly rejects a vendor import in a non-test file, and `test/contract/workspace-boundaries.contract.test.ts` now covers both cases so this class of regression cannot reappear silently.

### Consequences

`packages/db` and `packages/domain/src/identity` are the first packages in this repository with real, non-placeholder implementations. Future domain areas (commerce, access, programs, ...) are expected to follow the same shape: pure decision logic in `packages/domain`, driver-agnostic persistence in `packages/db`, `*.integration.test.ts` for real-engine-backed tests. `createDatabaseClient` (the production postgres.js connection factory) has not yet been exercised against a live database in any session - only proven correct by type-checking and by drizzle-kit's own separate connection logic in the CI migration step. The first task that wires a real HTTP route or worker job to the database should treat that as new ground, not assume this factory has been runtime-proven beyond what is stated here.

## ADR-047 — ENT-001: event-sourced immutable grants, narrower-than-contract schema scope, deterministic checksum

**Status:** Accepted  
**Date:** 29 August 2026  
**Decided during:** ENT-001 (implement immutable access grants and versioned entitlement policies).

### Grant status is derived, never stored - event-sourced rather than mutable-status

`dok 05 §8.2` and `CLAUDE.md`'s canonical vocabulary both name the same six grant states (`scheduled`, `active`, `suspended`, `expired`, `revoked`, `cancelled`), but `contracts/drizzle-schema.ts`'s Gate 3 review artifact models them as a mutable `status` column. ENT-001 instead makes `access_grants` immutable after insert (no `status` column at all) and adds a separate append-only `grant_events` log (`activated | suspended | reinstated | revoked | cancelled`); `packages/domain/src/access/grant-status.ts#deriveGrantStatus` is a pure function of `(grant facts, event log, now)` that computes the status at read time. This is the same "compute, don't store" pattern IDN-001 already used for session expiry, and it is what the founder instruction requires directly: "Access grant harus immutable; perubahan dibuat sebagai grant/revocation/event baru, bukan update diam-diam." A mutable status column would make that instruction structurally unenforceable - nothing would stop a future caller from `UPDATE`-ing it in place. `deriveGrantStatus` evaluates revocation and cancellation first (terminal, independent of timing), then the most recent suspend/reinstate event, then the validity window, using the same inclusive-boundary rule as IDN-001's session expiry (`validTo <= now` is expired, not `< now`).

### Schema scope: narrower than the Gate 3 contract artifact, same discipline as ADR-046

`contracts/drizzle-schema.ts` also includes `grant_claims`, `effective_access` (a materialized/cached view), and `access_change_requests` in its entitlement section. ENT-001 implements only `access_policies`, `access_grants`, and `grant_events` - the three tables its own backlog acceptance criteria require (versioned/auditable policy, immutable grant, event-sourced status). Claim-level materialization (`grant_claims`), an effective-access read-model/cache, and a formal change-request/approval workflow are left to ENT-002/ENT-003/ENT-004, matching ADR-046's precedent of not building schema ahead of the task that owns its acceptance criteria (`29_CLAUDE_CODE_EXECUTION_PLAN.md` §13's "generating schema first" anti-pattern). `packages/domain/src/access/dedupe.ts#distinctTargets` covers this task's own narrower "duplicate content must not appear twice" requirement directly in the pure layer, without needing a materialized table.

### Policy config is schema-validated JSONB, locked by a stamped checksum

`access_policies.config` stores the full versioned entitlement policy document (validity mode, claims, attempt allowance, post-expiry behaviour, stacking, lifecycle) as JSONB, validated at runtime against the reviewed `contracts/entitlement-policy.schema.json` via AJV (`packages/db/src/access/policy-repository.ts#assertValidPolicyConfig`) - not merely accepted as opaque JSON. Per `CLAUDE.md`'s "JSONB stores versioned configuration/snapshots, not core relational integrity," the relational invariants that matter (immutability, one-checksum-per-version, publish-time tamper detection) are still enforced outside the JSONB blob: a unique `(code, version)` index makes a new version a new row rather than an edit, and `checksum` is a canonical-JSON SHA-256 (`packages/domain/src/access/policy-checksum.ts`) stamped at draft time and re-verified at `publishPolicyVersion` - a config mutated out-of-band between draft and publish (the one path this repository's own API never allows) is rejected as `PolicyChecksumMismatchError` rather than silently published. The checksum function is reimplemented independently in `packages/domain` rather than imported from `packages/testing`, honoring the ADR-042 layering matrix (`db → [contracts, domain]` only).

### Ownership-scoped events, not open mutation

`grant-repository.ts#recordGrantEvent` requires the acting `(sourceType, sourceId)` to match the grant's own issuing source (`packages/domain/src/access/grant-status.ts#isOwnedBy`) before accepting a `suspended`/`revoked`/`cancelled`/etc. event, and requires a `reason` whenever the policy's `lifecycle.manualChangeRequiresReason` is true. This implements `dok 05 §10` case E4 (`SOURCE_OWNERSHIP_MISMATCH`) directly: a `purchase`-sourced grant cannot be revoked by an actor claiming to be the `scholarship` source, even for the same user and even if both grants target the same claim - which is also what makes the required "overlapping grants are independent" negative test meaningful rather than vacuous.

### `through_program_or_batch_end` requires an explicit lifecycle end - no program/batch table to read yet

`packages/domain/src/access/policy-validity.ts#computeValidityWindow`'s `through_program_or_batch_end` mode takes `context.lifecycleEndsAt` as a required explicit input rather than resolving it from a program/batch record, because no such table exists in this task's schema scope (see above). The function throws `InvalidValidityConfigError` if the context is missing it. Whichever task introduces program/batch schema is expected to supply that value at the call site; this task deliberately does not guess a resolution path for data it cannot yet read.

### Consequences

`packages/domain/src/access` and `packages/db/src/access` follow the same split ADR-046 established: pure decision logic (validity, status derivation, dedup, checksum) in `packages/domain`, driver-agnostic persistence and runtime schema validation in `packages/db`, `*.integration.test.ts` for real-engine-backed behaviour including negative cases (revoked, expired-at-boundary, overlapping-grant independence, ownership-mismatch, duplicate-content collapse). The next task building on this (grant claims / effective access) should treat `distinctTargets` and `deriveGrantStatus` as the two functions to compose against, not reimplement.

## ADR-048 — COM-001: product/offer/SKU catalogue scope, immutability harmonized with ENT-001, and the product_component/access_policy split

**Status:** Accepted  
**Date:** 29 August 2026  
**Decided during:** COM-001 (model product, offer, SKU, bundle, and validity policy).

### Scope: five tables, not the full dok 21 §4 "Product and commerce" section

`21_ERD_AND_DATA_DICTIONARY.md` §4 lists `products`, `product_versions`, `product_components`, `offers`, `external_sku_mappings`, `checkout_intents`, `purchases`, `purchase_events`, and `reconciliation_cases`. This task implements only the first five - a catalogue/entitlement DATA MODEL, versioned and auditable, with no checkout flow, no live Sejoli/WordPress bridge, and no payment provider touched anywhere in the write-set. `checkout_intents`, `purchases`, and `purchase_events` are COM-002/COM-003's explicit backlog scope (dependency graph: `COM-002` depends on `COM-001` + `GOV-004`; `COM-003` depends on `COM-002` + `ENT-001`) - the same "narrower than the Gate 3 contract artifact, scoped to this task's own acceptance criteria" discipline ADR-046/047 already established, not a new decision.

The PRD's `COM-004` ("Purchase menyimpan product/offer/mapping version saat transaksi") is assigned to this task's `requirementIds` even though it names a `purchases` table this task does not build. It is satisfied here structurally, not literally: `product_versions`/`offers`/`external_sku_mappings` are versioned and immutable-once-created, which is exactly what a future purchase snapshot (COM-002/COM-003) needs to reference. Building the `purchases` table itself to "complete" `COM-004` now would mean building the checkout/webhook machinery this task's own founder instruction excludes - the requirement's structural precondition is delivered; the write path that consumes it is not.

### Immutability discipline: harmonized with ENT-001's access_policies, not the Gate 3 artifact's nullable checksum

`contracts/drizzle-schema.ts` shows `product_versions.checksum` as nullable, and dok 05 §5 says a product version becomes immutable "setelah dipakai order berbayar" (after first used by a paid order) - suggesting drafts stay editable until a purchase locks them in. This task instead applies the exact discipline ADR-047 already established for `access_policies`: `checksum` is `NOT NULL`, stamped over the version's full content (including its component set) at creation, and `publishProductVersion`/`publishOffer` are the one narrow, one-way exception that only ever flips `status`/`lockedAt`, re-verifying the stored checksum first. "Editing a draft" means authoring version N+1, never mutating version N - identical to how ENT-001 already treats "editing a draft" access policy.

This is a strengthening of the same underlying invariant (`CLAUDE.md`: "Published/versioned academic and commercial artifacts are immutable"), not a semantic redefinition of it, and `contracts/drizzle-schema.ts` is explicit that it is "a contract review artifact, not a ready-to-run production migration" - so this is not a conflict requiring escalation under `CLAUDE.md`'s source-of-truth rule, just a documented choice to keep one immutability pattern across the codebase instead of two. The actual business trigger for locking a product version - an explicit Product Builder publish action, versus the first paid order that uses it - remains COM-002/COM-003's decision to make at the call site; this task only guarantees that once locked, the content genuinely cannot change either way.

### product_component's target is authoritative; the referenced access_policy's own `claims` become a template, not a second source of truth

`21_ERD_AND_DATA_DICTIONARY.md` §4's `product_components` row (`target_type`/`target_id`, `access_policy`, `include_descendants`, `component_code`, overrides) and ENT-001's `entitlement-policy.schema.json` `claims` array (`targetType`/`targetRef`/`actions`/`includeDescendants`) both describe "what does this grant point at," and the ERD does not spell out how the two interact when a policy is reused across many products (dok 05 §5's own composition table implies exactly this reuse: the same access-policy *shape* - e.g. "SKD Track Standard" - attached to many different bundles, each pointing it at a different target).

This task resolves the ambiguity by treating `product_components.targetType`/`targetRef`/`includeDescendants` as authoritative for what a *product* grants, and the referenced `access_policy`'s own `claims` as meaningful only when that policy is used directly (a scholarship or manual grant naming its own target, per ENT-001) - a policy's `claims` become a vestigial template once it is reused as a shared component across products with different targets. This is an implementation-level modeling decision within a single Gate-3-layer document set, not a cross-layer conflict, and is recorded here so COM-003 (which will actually issue grants from a purchased product) does not have to re-derive it: **the target comes from the product_component row, the validity/attemptAllowance/postExpiry/stacking/lifecycle rules come from the referenced access_policy's config.**

### Offer sale-state is derived, never stored - a second concept from `offers.status`

`offers.status` (the `record_status` enum: draft/in_review/.../published/archived) is the offer DOCUMENT's own editorial workflow - the same concept `access_policies.status` and `product_versions.status` already use. dok 05 §6 / dok 18 §4's seven-value vocabulary (`draft`, `scheduled`, `on_sale`, `sold_out`, `ended`, `hidden`, `archived`) is a *different*, shopper-facing concept that both documents say explicitly must be computed ("State dihitung dari status, waktu server, dan enforced quota"), not stored - the same "compute, don't store" discipline IDN-001 applied to session expiry and ENT-001 applied to grant status. `packages/domain/src/commerce/offer-status.ts#deriveOfferSaleState` is that function: it takes the editorial status, `visibility`, the sale window, and quota/soldCount, and returns the shopper-facing state fresh on every read. `sold_out` is reachable only when `quota` is non-null (dok 09: "Quota hanya dipakai bila kapasitas benar-benar enforced") - `soldCount` itself is not a stored column (`offers.soldCountSource` only records *where* a real count would come from), left to whichever task wires real inventory/reservation tracking.

### SKU mapping resolution: priority + mappingVersion, a pure function shared between the repository and (later) the webhook path

`packages/domain/src/commerce/sku-mapping.ts#resolveSkuMapping` takes every mapping row ever created for one `(provider, site, externalSkuId)` and picks the one valid `at` a given instant: filtered to `status === "active"` and an inclusive-start/exclusive-end window (same boundary convention as ENT-001's validity windows), highest `priority` wins, ties broken by the newest `mappingVersion`. Rows are immutable and append-only (`createSkuMapping` never updates); a remap is always a new row. This is deliberately the exact function COM-002/COM-003's future webhook ingestion path will need to call - built and tested here as pure domain logic precisely so that task does not have to invent (or worse, re-derive differently) the same resolution rule.

### Explicitly deferred, not silently dropped

- **Circular inclusion detection** (dok 05 §14 "Warning jika ... inclusion circular"): requires a real program/content graph to detect a cycle against, which does not exist in any task's schema yet. `composeProductTargets` only performs flat target deduplication (dok 05 §10 E2, dok 18 acceptance #2/#3), not graph traversal.
- **Quota reservation/concurrency and enforced sold-count tracking** (dok 09 §9): `offers.quota`/`soldCountSource` model the *data shape*; nothing in this task computes or reserves a live count.
- **Tryout Pass bounded-dynamic-rule expansion** (dok 05 §4.3, dok 18 §7): this task's `product_components` only support the MVP-default named-list shape (one row per named target); the "all batches whose exam window starts in September" dynamic-rule expansion is out of scope until batches (EXM-002) exist to expand against.

### Consequences

`packages/domain/src/shared/checksum.ts` is promoted out of `access/policy-checksum.ts` (which now re-exports it unchanged) so `packages/domain/src/commerce`'s product/offer checksums do not duplicate the same canonicalize-then-SHA-256 logic a second time; this is a pure refactor with no behavioural change to ENT-001's existing tests. `packages/db/src/commerce` follows the exact repository shape ADR-047 established: checksum-stamped-at-creation, one-way publish-lock, `*.integration.test.ts` covering bundle composition, cross-product target overlap, expired/flash-sale offer windows, and versioned SKU-mapping resolution. COM-002/COM-003 (purchase ingestion and grant issuance) are expected to call `resolveSkuMapping`/`resolveOfferForSku` and read `product_components` rows directly rather than re-deriving either.

## ADR-049 — IDN-004: RBAC enforcement, the founder-vocabulary-to-canonical-role mapping, and the maker-checker/audit gates being structural, not advisory

**Status:** Accepted  
**Date:** 29 August 2026  
**Decided during:** IDN-004 (enforce RBAC, object scope, and privileged-action audit).

### Vocabulary mapping: the founder instruction's role names are not the canonical ones, and no document defines a role above super_admin

The founder instruction for this task names "student, admin, tutor, moderator, owner/founder." `CLAUDE.md`, dok 02 §5.3, and dok 21 §3 all agree on eight canonical, permission-based staff role codes instead: `super_admin`, `operations_admin`, `academic_admin`, `tutor_writer`, `moderator_reviewer`, `live_class_coordinator`, `support`, `finance_reconciliation` - and dok 02 §5.3 explicitly separates "Pengguna" (the student market segment) from "Pengguna operasional" (these eight). Per `CLAUDE.md`'s "Do not introduce synonyms without updating the domain document... and an ADR when material," the mapping is recorded once, here, rather than re-derived ad hoc at each call site (`roles.ts`'s own header comment carries the same note):

- **"student"** is not a role assignment at all - a user with zero `user_roles` rows IS a student, by construction. Their authorization runs entirely through ownership + entitlement (`object-scope.ts`), never through the permission matrix.
- **"admin"** is a generic term; this task's tests use `operations_admin` as the concrete representative (dok 24 §6's matrix gives it the broadest generic-admin surface: `purchase.raw.read`, `reconciliation.manage`, notification scheduling).
- **"tutor"** -> `tutor_writer`. **"moderator"** -> `moderator_reviewer`.
- **"owner/founder"** -> `super_admin`. No canonical document defines a role above `super_admin`; its matrix row is the only one with near-universal "Ya"/"Ya/approval" across dok 24 §6, which is the closest concrete meaning "owner/founder" can have in this system.

This is a documented reconciliation of two sources at the same `CLAUDE.md` layer (the founder instruction is layer 1; dok 02/21/24 are layer 2/4), not a conflict requiring escalation - the canonical documents' vocabulary wins, exactly as `CLAUDE.md`'s canonical-vocabulary section already locks it, and the founder's plainer terms are preserved only as the human-facing gloss recorded above.

### The permission matrix is versioned code, not a runtime-editable table - because there is no admin UI yet to edit it with

dok 21 §3 lists `permissions` and `role_permissions` as RBAC base tables. This task does not build them: dok 24 §6 itself says "Permission names final berada di seed/config dan diuji" - config, tested, not necessarily a live table - and the founder instruction excludes admin UI from this task's scope ("Jangan bangun UI admin dulu"). A `role_permissions` table nobody can edit yet is a table that exists only to be trusted blindly; `packages/domain/src/authorization/permissions.ts#ROLE_PERMISSION_MATRIX` is instead a direct, reviewed transcription of dok 24 §6's table, versioned in source control and covered by `permissions.test.ts`. Building the live-editable tables is left to whichever task actually builds the role-management admin surface.

Several dok 24 §6 cells are prose qualifiers this task cannot cleanly turn into enforcement rules yet ("Review tertentu", "Operasional terbatas", "Redacted", "Request terbatas", read-only variants). These are transcribed faithfully as `level: "scoped_nuance"` entries (with the original cell text kept in a `note` field) rather than dropped, but `hasFullGrant`/`authorize()` treat them as NOT a full grant - fail-closed, matching this task's least-privilege charter - until the task that owns each nuance (e.g. a redacted-purchase-view serializer, an operational-batch-publish sub-scope) defines its exact rule.

### Maker-checker is universal and role-independent, not a per-cell opt-in

dok 24 §6's table marks "Ya bila bukan creator" only in the Academic Admin column for `question.first_approve`, but `CLAUDE.md`'s own canonical invariant states the rule without a role exception: "creator, first approver, and second approver must be different where required... evaluated by actor ID," echoing dok 02 §5.3's "penulis tidak boleh menyetujui soal sendiri." `authorize()` therefore applies `violatesMakerChecker` unconditionally whenever `object.creatorUserId` is present on the request, regardless of which role or permission is involved - proven by a test where even a `super_admin` cannot approve their own question. The matrix's per-cell `requiresNonCreator` flag is kept only as a faithful transcription of the source table's exact wording; it is not what makes the check fire.

### The audit-fields gate is a structural refusal, not a logging step - "admin melewati audit trail" cannot pass

dok 24 §7's high-risk workflow list ("identity merge/link override," "manual grant/revoke/extension mass action," "role/permission change," ...) requires "reason + preview + audit." `authorize()` enforces this as a hard gate: a request whose `action.highRiskType` is set and whose `audit.reason`/`audit.correlationId`/`actor.userId` are not all non-empty is denied `AUDIT_FIELDS_REQUIRED` before any permission is even resolved - a `super_admin` gets no special exemption. The same discipline is enforced a second time, independently, at the persistence layer: `packages/db/src/authorization/role-repository.ts#assignRole`/`revokeRoleAssignment` require `grantedByUserId`/`grantedReason` (respectively `actorUserId`/`reason`/`correlationId`) as non-optional parameters and reject an empty string at runtime (`RoleAssignmentAuditRequiredError`) - there is no code path, at either layer, that writes or authorizes a privileged mutation without its audit trail already attached.

### RBAC schema: `roles` + `user_roles` matching the Gate 3 contract, plus a separate scope-assignment table and an ENT-001-shaped event log

`roles`/`user_roles` match `contracts/drizzle-schema.ts`'s shape (with `grantedByUserId`/`grantedReason` added - the same "strengthen the audit trail, don't redefine the semantic" pattern ENT-001/COM-001 already used). Object-scope narrowing is the SEPARATE `role_assignment_scopes` table dok 21 §3's prose describes ("assignment table bila diperlukan") rather than columns bolted onto `user_roles` - zero rows for an assignment means unscoped (applies wherever the matrix allows, e.g. `super_admin`); one or more rows restrict it to exactly those `(scopeType, scopeRef)` pairs. `user_roles` rows are immutable after insert; revocation is an append-only `role_assignment_events` row (`revoked`/`reinstated`), and effective status is DERIVED (`@superlatif/domain/authorization#isRoleAssignmentActive`) - the identical "compute, don't store" shape ENT-001's `access_grants`/`grant_events`/`deriveGrantStatus` already established, applied to a third domain area now.

### Object-level authorization checks three independent axes, composed but never merged

The founder instruction's own three-part requirement - "mengecek kepemilikan user, entitlement, dan scope role" - is implemented as three separately-testable pure functions (`object-scope.ts`'s `isOwner`, `isEntitled`, `isWithinAssignedScope`), each producing its own reason code (`OBJECT_SCOPE_DENIED`, `ENTITLEMENT_DENIED`, `OBJECT_SCOPE_DENIED` again for scope-mismatch - dok 24 §6's own matrix does not distinguish "no ownership" from "wrong role scope" by name, so this task reuses the one code for both, which is what `test/fixtures/contracts/privacy-rbac.cases.json`'s SEC-SYN-001 already expects). Entitlement is never computed inside `packages/domain/src/authorization` - `entitlement.hasEffectiveAccess` is a precomputed boolean the caller derives by composing ENT-001's `deriveGrantStatus` over real grant rows (proven end-to-end in `role-repository.integration.test.ts`, composing a real `@superlatif/db/access` grant with a real `@superlatif/db/authorization` role lookup) - this keeps the authorization domain free of I/O per the ADR-042 layering matrix, while still giving a real, DB-backed proof rather than a mocked boolean.

### Fixture coverage and what is deliberately not rebuilt here

`test/fixtures/contracts/privacy-rbac.cases.json`'s SEC-SYN-001..004 map directly onto `authorize.test.ts` test cases (case IDs cited in the test names). SEC-SYN-005 (an attempt-question payload must exclude answer secrets) needs an actual attempt/question entity that does not exist in any merged task yet (EXM series); SEC-SYN-006's redaction/pseudonymization half is already GOV-004's `@superlatif/observability/redaction.ts`, proven there. This task's contribution to both is the same one thing it actually owns: gating WHETHER a read/export is authorized at all (entitlement for the former, the `AUDIT_FIELDS_REQUIRED` high-risk gate for the latter's `export_pii_or_secrets` case) - not re-deriving field-level redaction or building the attempt schema, which belong to the tasks that own those objects.

### Consequences

`packages/domain/src/authorization` and `packages/db/src/authorization` are the third domain area to follow the ENT-001/COM-001 split: pure decision logic (`authorize`, the permission matrix, object-scope checks, assignment-status derivation) in `packages/domain`, immutable-row-plus-append-only-event persistence in `packages/db`. No HTTP route or worker job calls `authorize()` yet - wiring a real API/BFF layer to it, and building the `role.manage` admin UI the founder instruction explicitly excluded from this task, are left to whichever task takes up API/BFF wiring next. `role_assignment_scopes`'s `(scopeType, scopeRef)` pair is free text, matching the same "new scope type never needs a migration" reasoning ENT-001 already applied to `access_grants.sourceType`.

## ADR-050 — ENT-002: no new schema, `grant_claims` deferred, `effective_access` stays a live projection (not a materialized table) at this task, and the in-process cache boundary

**Status:** Accepted  
**Date:** 29 August 2026  
**Decided during:** ENT-002 (effective-access resolver, cache, and explanation trace).

### No migration this task - the resolver reads what ENT-001 already persists, nothing new is stored

`21_ERD_AND_DATA_DICTIONARY.md` §5 lists `grant_claims` and `effective_access` as part of the Access section ENT-001 explicitly deferred ("ENT-002/003/004", ADR-047). This task adds zero tables and zero columns. Two scope decisions explain why:

- **`grant_claims`** (a per-grant, per-target override table) has no consumer yet: nothing merged into `main` creates a grant whose claims differ from its `access_policy`'s own `config.claims` - COM-001's `product_components` (the one place a per-instance target override would come from) are not yet wired to grant issuance (that wiring is COM-003's job). Building `grant_claims` now would be schema for a caller that does not exist, the exact "generating schema first" anti-pattern ADR-046/047/048/049 have all avoided. The resolver instead reads a grant's claims directly from its policy's `config.claims` (`packages/domain/src/access/policy-config-parsing.ts#parsePolicyClaims`) - already schema-validated at write time by ENT-001's `assertValidPolicyConfig`, and sufficient for every grant any merged task can currently create.
- **`effective_access`** is explicitly a "Rebuildable projection" per dok 21 §5, and `ENT-003`'s own acceptance criteria ("Effective access can be rebuilt from source records," "Drift is reported before repair") are what turn a materialized table into something trustworthy - a persisted `effective_access` table without rebuild/drift tooling is an unmanaged cache that can silently drift with no way to detect it. This task's founder instruction independently points the same way: "Cache cukup in-process/testable... harus mudah diganti nanti" describes a resolver-side cache, not a persisted database projection. `getEffectiveAccess` therefore computes fresh (or serves from the in-process cache) on every call; the persisted, rebuildable, drift-checked version of `effective_access` is left to ENT-003.

### The cache is an interface with one in-memory implementation, invalidated only by two explicit wrapper functions

`EffectiveAccessCache` (`packages/domain/src/access/effective-access-cache.ts`) is a three-method interface (`get`/`set`/`invalidateUser`); `createInMemoryEffectiveAccessCache` is the only implementation shipped, backed by a plain `Map`, driven entirely by an injected `now` (no `Date.now()` anywhere) so it stays deterministic and unit-testable without timers. No Redis/Valkey dependency is added, per the founder instruction. Swapping to a shared store later means writing a second implementation of the same interface - nothing that calls `get`/`set`/`invalidateUser` needs to change.

"Cache invalidation follows grant mutations" is enforced by construction, not convention: `issueGrantAndInvalidate`/`recordGrantEventAndInvalidate` (`packages/db/src/access/effective-access-service.ts`) are the ONLY two functions in this task that call `cache.invalidateUser`, and they do so by wrapping ENT-001's `issueGrant`/`recordGrantEvent` UNCHANGED rather than modifying those functions to know about a cache - ENT-001's public API and its own passing tests are untouched. A caller that mutates grants through ENT-001's original functions directly (bypassing the wrapper) gets a stale cache until the next explicit `invalidateUser` - proven directly by a test in `effective-access-service.integration.test.ts` - documenting this rather than papering over it: nothing in ENT-001's repository is aware a cache exists, and retrofitting that awareness was judged riskier than adding one obvious "use the `*AndInvalidate` wrapper when a cache is in play" convention now, revisited once a real caller (API/BFF layer) exists to prove which pattern it actually needs.

### The resolver returns a decision-plus-explanation object, never a bare boolean, and attempt allowance is a genuinely separate function call

`resolveEffectiveAccess` (`packages/domain/src/access/effective-access.ts`) always returns `{allowed, decisiveGrantIds, ignoredGrantIds, reasonCode, effectiveFrom, effectiveTo, studentReason, diagnostic}` - dok 05 §9's full "Bentuk keputusan akses yang wajib tersedia" list. `ignoredGrantIds` plus `diagnostic` (every claiming grant's derived status) is what makes "revoked, expired, suspended, cancelled harus tertolak dengan explanation trace yang jelas" (founder instruction) concrete rather than aspirational - a support agent, or a future `access.explain` (IDN-004) caller, gets every claiming grant's fate, not just the winner. `reasonCode: "OVERLAPPING_ACTIVE_GRANT"` (matching `entitlement-resolution.cases.json` ENT-SYN-002's literal expected value) fires whenever more than one grant is decisive OR at least one claiming grant was ignored - i.e. it means "there was more going on here than a single clean grant," not literally "N≥2 currently active."

`resolveAttemptAllowance` (`attempt-allowance.ts`) is a SEPARATE exported function, never merged into `EffectiveAccessDecision` - ENT-005's "Attempt allowance dinilai terpisah dari content visibility" is enforced by the two functions having disjoint signatures (one never takes a target/action/grant-status, the other never takes attempt-allowance config), proven by a test asserting the attempt-allowance result has no `allowed`/`targetType` fields at all. Its default (`ownedByBatch: true`, no fabricated number) matches dok 05 §8.4's own MVP default (`batch_policy_only`) - there being no batch/attempt-policy table yet (EXM series) means this resolver correctly refuses to invent a ranked-attempt count it cannot verify, deferring to whichever task can actually read a batch's real limit.

### `includeDescendants` still requires the caller to supply ancestry - PRG series has not landed

Same reasoning ADR-047 already applied to `through_program_or_batch_end`'s `lifecycleEndsAt`: `resolveEffectiveAccess`'s `isDescendantOf` option is caller-supplied, defaulting to exact-match-only when omitted, because no program/track/module hierarchy table exists in any merged task yet (`PRG-001` onward). A claim marked `includeDescendants: true` expands to a descendant target only when the caller can actually answer "is X a descendant of Y" - this resolver does not guess.

### Gate A is not claimed PASS by this task

Per the founder instruction ("Jangan klaim Gate A PASS kecuali semua requirement release-gate benar-benar terpenuhi"): `planning/release-gates.json`'s Gate A requirements are broader than this one task's write-set (they also cover ENT-003's rebuild/drift guarantee and ENT-004's manual-change audit trail, neither built yet). This task's own report states only what it verifiably completed - `ENT-003`/`REQ`/`ENT-004`/`ENT-005` per this task's `requirementIds`, with `ENT-006`/`ENT-007` explicitly named as NOT in scope - and leaves the actual Gate A status field in `planning/release-gates.json` untouched; updating a release-gate status is a founder/owner decision made against the full requirement set, not something a single task's completion should silently flip.

### Consequences

`packages/domain/src/access` now has five files beyond ENT-001's original four (`effective-access.ts`, `attempt-allowance.ts`, `effective-access-cache.ts`, `policy-config-parsing.ts`), and `packages/db/src/access` gains one service file (`effective-access-service.ts`) plus one small additive accessor on ENT-001's own `policy-repository.ts` (`findPolicyById`, alongside the existing `findPolicyByCodeVersion` - a grant references a policy by ID, not by code+version, and nothing before this task needed that lookup). ENT-003 (deterministic rebuild/drift detection) and ENT-004 (manual grant/extension/revocation with reasoned approval, composing IDN-004's `authorize()`) are both expected to build on `resolveEffectiveAccess`/`listResolvableGrantsForUser` directly rather than re-deriving grant-to-claims resolution a second time.

## ADR-051 — ENT-004: manual-change workflow shape, the manual `sourceId` convention, and completing IDN-004's deferred `access.manual.change` nuance

**Status:** Accepted  
**Date:** 29 August 2026  
**Decided during:** ENT-004 (manual grant, extension, and revocation with reasoned approval).

### `access_change_requests` splits into two immutable/append-only tables, not one mutable-status row

dok 21 §5 describes `access_change_requests` as a single table storing "requested action, preview, reason, approvals, result." Every other domain area this codebase has built so far (ENT-001's `access_grants`/`grant_events`, IDN-004's `user_roles`/`role_assignment_events`) uses the same shape instead: an immutable fact row plus an append-only decision/event log, with status DERIVED, never stored. This task follows that precedent rather than dok 21's literal single-table reading: `access_change_requests` (the immutable ask - `changeType`, `targetUserId`, `requestedByUserId`, `reason`, `correlationId`, `payload`, `previewSnapshot`) plus `access_change_decisions` (append-only - one row per approve/reject act, carrying the execution outcome when approved). `@superlatif/domain/access#deriveManualChangeStatus` computes `pending_approval | rejected | executed | execution_failed` from the two, the same "compute, don't store" discipline as `deriveGrantStatus`/`isRoleAssignmentActive`.

### The "preview" is a real before-state snapshot, computed once, never recomputed

`requestManualChange`'s `previewSnapshot` is not a cosmetic label - it is the literal output of `@superlatif/db/access#getEffectiveAccess` for every `(targetType, targetRef, action)` the requested policy's claims cover, computed BEFORE the request is written and stored verbatim. A reviewer deciding on the request sees exactly what the requester was shown, not a value recomputed (and potentially different) at decision time. Building a full simulated "what would effective access look like AFTER this change" projection was considered and rejected as out of scope: it would require either a second resolver mode or a dry-run write-then-rollback, and the founder instruction's own emphasis ("preview" alongside "actor, reason") is satisfied by the honest before-state this task delivers without inventing that machinery.

### Peer approval is enforced universally by the workflow, not conditionally by the permission matrix's `requiresApproval` flag

dok 24 §7 marks "manual grant/revoke/extension mass action" as high-risk requiring "peer approval when marked" - a conditional phrasing. The founder instruction for this task is unconditional: "High-risk change harus mendukung peer approval dengan aktor kedua yang berbeda." `decideManualChange` resolves the tension by making peer approval a STRUCTURAL property of the workflow itself: `object.creatorUserId` is always set to the request's `requestedByUserId`, so IDN-004's universal, role-independent maker-checker rule refuses self-decision for every manual change, regardless of the deciding role's `requiresApproval` flag value. `super_admin`'s matrix entry is left without `requiresApproval: true` (it was never marked that way, and this task does not need it to be, since the workflow itself is the enforcement point) - the flag remains informational documentation of dok 24 §6's per-cell prose, not what actually gates approval.

### Completing IDN-004's deferred `access.manual.change` nuance for `academic_admin`/`operations_admin`

ADR-049 recorded `access.manual.change`'s "Terbatas" (limited) cells for `academic_admin`/`operations_admin` as `level: "scoped_nuance"` - not a full grant - because IDN-004 could not yet define what "limited" meant. This task defines it: "Terbatas" means every manual change these roles make goes through the mandatory peer-approval workflow above, with no direct-execute path. Both roles' `access.manual.change` entries are upgraded from `scoped_nuance` to `granted` (with `requiresApproval: true` recorded for documentation) in `permissions.ts` - a small, additive edit to IDN-004's own file, not a parallel permission system built inside ENT-004. `support`'s "Request terbatas" cell is deliberately left as `scoped_nuance`/unresolved: dok 24 §6 names it as request-only (no execute capability at all), a genuinely different, narrower shape this task's two-actor (requester/decider) model does not represent - support remains excluded from this workflow until a task defines a request-only participant explicitly.

### Manual grants use a per-student stable `sourceId`, not a per-request one - this is what makes "jangan pernah rewrite purchase grant asli" enforceable, not just true by convention

Every manual grant this task issues uses `sourceId = targetUserId` (not the change request's own id) and `sourceKey = changeRequestId`. This is deliberate: ENT-001's `recordGrantEvent` ownership check (`isOwnedBy`, dok 05 §10 E4) requires an acting source's `(sourceType, sourceId)` to exactly match the grant's own issuing source. A per-request `sourceId` would mean no LATER manual revocation request (a different id) could ever pass ownership on an EARLIER manual grant - breaking manual revocation entirely. A stable per-student `sourceId` treats "manual/support grants for this student" as one coherent, continuously-manageable source, while `sourceKey` (unique per request) still keeps issuance idempotent and each grant separately auditable. The direct, load-bearing consequence: a manual revocation targeting a **purchase**-sourced grant fails `isOwnedBy` by construction (`"manual" !== "purchase"`) - `decideManualChange` catches this as `GrantOwnershipMismatchError`, records `executionStatus: "execution_failed"` on the decision (the human approval still happened and is audited; the mutation did not), and leaves the original purchase grant row byte-for-byte unchanged. This is deliberately proven at EXECUTION time rather than pre-validated away at request time - the ownership check that makes "never rewrite a purchase grant" true is the same one ENT-001 already ships and already tests, not a second, potentially-divergent guard reimplemented in this task.

### Cache invalidation is inherited, not reimplemented

`decideManualChange`'s execution step calls ENT-002's `issueGrantAndInvalidate`/`recordGrantEventAndInvalidate` exclusively - the only two functions in this codebase that touch `EffectiveAccessCache`. "Resolver/cache ENT-002 harus langsung invalidated/tercermin setelah perubahan" is therefore satisfied by construction: there is no code path in this task that mutates a grant without also invalidating the cache, because the mutation and the invalidation are the same function call.

### Consequences

`packages/db/src/access/manual-change-service.ts` is the first production module in this repository to import across two `packages/db` subdomains in the same package (`../authorization/index.ts` for `listActiveRoleHoldings`, composed with `@superlatif/domain/authorization#authorize`) - a legitimate same-package composition, not a layering violation (the ADR-042 matrix governs cross-*package* dependencies; `access/` and `authorization/` are both inside `@superlatif/db`). No HTTP route or worker job calls this service yet, and no admin UI exists to drive it - both explicitly out of this task's scope per the founder instruction. `manual_extension` and `manual_grant` share the exact same execution path (`issueGrantAndInvalidate`); the distinction is audit-trail labeling (`changeType`) and an optional `extendsGrantId` reference in the payload, not different code.

## ADR-052 — PRG-001: program-centric home is the first route to touch the database, minimal program/enrollment schema, the next-action contract without its data sources, and the userId-in-URL auth placeholder

**Status:** Accepted  
**Date:** 29 August 2026  
**Decided during:** PRG-001 (program-centric home, active context, and cross-product deduplication).

### Scope: `programs` + `program_enrollments` only - the full dok 21 §6 curriculum tree is PRG-002's

`21_ERD_AND_DATA_DICTIONARY.md` §6 "Programs and content" names nine tables: `programs`, `program_versions`, `tracks`, `roadmap_stages`, `modules`, `resources`, `resource_versions`, `resource_placements`, `assets`, plus `program_enrollments`/`onboarding_responses`/`resource_progress`/`progress_events`/`progress_projections`. This task builds exactly two - `programs` (stable identity, no version/publish workflow) and `program_enrollments` (primary-program tracking) - matching the founder instruction "Buat representasi program/track secukupnya untuk acceptance PRG-001." `program_versions`/`tracks`/`roadmap_stages`/`modules`/`resources` are `PRG-002`'s explicit backlog scope ("Implement versioned curriculum, tracks, modules, and release rules") - building them now would be the "generating schema first" anti-pattern every prior ADR in this series has avoided, for curriculum-publishing behaviour this task does not own.

`programs.code` deliberately reuses the exact `program:` target-ref prefix convention ENT-001/COM-001's own test fixtures already established (e.g. `program:aks-2026`) - not a new vocabulary.

### `program_enrollments` is a presentation-layer projection SYNCED FROM the resolver, never a second access source

dok 21 §6 states this explicitly: "Enrollment bukan authorization source." `syncProgramEnrollments` (`packages/db/src/program/enrollment-service.ts`) only ever creates an enrollment row for a program `listAccessibleProgramsForUser` (composing ENT-002's `getEffectiveAccess`) has already confirmed the student can see - there is no code path that grants access via an enrollment row. This is also what makes cross-product deduplication (`PRG-003`'s PRD requirement) fall out for free: `getEffectiveAccess` is called once per DISTINCT program in the catalogue, never once per grant, so a program two products both grant collapses into one accessible-program entry before an enrollment row is ever considered - the same "compute the union once" discipline ENT-002 already established, just applied at the program level instead of the (target, action) level.

### `program_enrollments.isPrimary` is genuinely mutable - the one deliberate exception to this task's own event-sourced precedent

Every prior domain area in this codebase (`access_grants`/`grant_events`, `user_roles`/`role_assignment_events`, `access_change_requests`/`access_change_decisions`) is immutable-fact-plus-append-only-log. `program_enrollments.isPrimary` breaks that pattern on purpose: dok 09 §8.1 (locked, "tidak boleh dibuka ulang tanpa ADR" per §18) describes a student's primary-program choice as a live, current preference that "menang" outright, not a fact whose history matters the way a grant's provenance does. It is the same class of field as IDN-001's `user_sessions.lastSeenAt` - mutable operational state, not an audit-critical record. `setPrimaryProgram` enforces "at most one primary per user" inside a transaction (unset the old one, set the new one), not via a database constraint, because validating the new choice is itself enrolled (`ProgramNotEnrolledError` otherwise) needs an application-level read first.

### `resolveNextAction` ships the full dok 09 §5 priority contract with zero wired candidate sources - by design, not by omission

dok 09 §5's seven-tier priority table (`LIVE_NOW` through `OPTIONAL_RECOMMENDATION`) and its four-level tie-break are fully implemented and unit-tested in `packages/domain/src/program/next-action.ts`. Every realistic candidate source it would rank (live sessions, batch deadlines, resource/attempt progress, roadmap steps, results) needs schema no merged task owns yet (`SCH-001`, `EXM` series, `PRG-002`, `LRN` series, a future result-correction task). Rather than fabricate any of them, `buildHomeViewModel` calls `resolveNextAction([])` - always `null` for this task - which is the CORRECT, honest answer given today's data, and exercises dok 09 §5's own specified fallback ("Jika resolver tidak menemukan aktivitas, tampilkan milestone yang sudah dicapai dan pilihan ringan... Jangan memunculkan halaman kosong"). Every future task that adds a real candidate source needs only to produce `NextActionCandidate` values; the ranking, reason codes, and tie-break are already correct and already tested, matching dok 09 UX invariant #12 ("Satu resolver, satu vocabulary").

### `resolveProgramHubTabs` (PRG-004) is built and tested; the Program Hub page itself is not

dok 07 §6's "Tidak ada tab kosong" rule is implemented as a pure function (`packages/domain/src/program/program-hub-facilities.ts`) over six facility flags, all of which default to `false` because no task has built roadmap, schedule, batch, resource, community, or progress data yet. With every flag false, the function correctly returns only the `ringkasan` tab - a literal, provable demonstration of "empty tabs are hidden" today, not a placeholder. The actual Program Hub *page* (dok 07 §6's full tabbed screen) is not built in `apps/web` this task: "Jangan bangun seluruh LMS dulu" (founder instruction), and every tab besides Ringkasan needs a facility this task does not own. `apps/web/src/app/programs/[programCode]/page.tsx` is a narrower, honest stub: it proves the `assertProgramAccess`-gated allow/deny outcome is a real rendered UI state (see below), not the Hub itself.

### `userId` in the URL query string is an explicit, documented authentication PLACEHOLDER, not a security boundary

`/home` and `/programs/[programCode]` are this repository's first routes to call the database at all - every prior ADR in this series (ADR-046 through ADR-051) states "no HTTP route calls this layer yet." Building real session-cookie authentication (reading IDN-001's `user_sessions`, validating via `evaluateSessionValidity`, wiring cookies/middleware) is a substantial, separate concern no task has been assigned yet, and inventing it inside PRG-001 would mean guessing at a design no backlog entry, ADR, or founder instruction has settled. Both routes therefore read `userId` from `searchParams` with a prominent code comment and an explicit rendered "Belum ada sesi aktif" state when it is absent - clearly labeled as a development/demo seam, never silently treated as authorization. Actual authorization is unaffected by this placeholder: `buildHomeViewModel`/`assertProgramAccess` decide access entirely through ENT-002's resolver and IDN-004's `authorize()` once a `userId` is known, exactly the same as if it had arrived via a real session cookie - swapping the identification mechanism later changes nothing about how access is decided.

### The "denied/unauthorized" state needed a real page to render it, so one was built - narrowly

The founder instruction requires a rendered denied/unauthorized UI state, not only a backend decision. Rather than fabricate that inside `/home` (which only ever shows programs a student already has), `apps/web/src/app/programs/[programCode]/page.tsx` was added specifically to give `assertProgramAccess`'s `ENTITLEMENT_DENIED`/`OBJECT_SCOPE_DENIED` outcomes a real place to render - matching dok 07 §12's "Navigasi tidak boleh menjadi satu-satunya kontrol keamanan": a student who follows a link or types a program URL directly, for a program they do not have access to, is refused by the same `authorize()`/effective-access composition as everywhere else, not merely hidden from a menu. This page also fixed two dead links `/home`'s empty-state fallbacks originally pointed at (a nonexistent `/programs/:code/roadmap` and a nonexistent `/catalog`) - both were changed to point somewhere real, or to have no action link at all, rather than promising a page that 404s.

### `packages/ui` gets its first real content: design tokens transcribed from dok 11, five components

`packages/ui` was an empty GOV-001 placeholder. This task transcribes dok 11 §3-9's tokens verbatim into `packages/ui/src/styles/tokens.css` (colors, typography, spacing, radius, motion, layout - light theme only, since dok 11 §20 does not define a dark palette) and builds five components dok 11 §13/§9's global-state rules require: `ProgramCard`, `NextActionCard`, `EmptyState`, `StatusBadge` (dok 09 UX invariant #3: status is never color-only - every variant renders an icon and a text label), and `Skeleton` (dok 09 §6.1: a skeleton resembling final structure, not a page spinner). Exam, admin, and the remaining student-domain components (Journey Roadmap, Schedule Item, Batch Card, ...) are left to whichever task first needs them.

### Mobile-first CSS, verified live where the environment allows it

`packages/ui/src/styles/components.css` is written mobile-first (base rules target the 0-479px range; `min-width` queries widen for tablet/desktop, dok 09 §3.4's breakpoint table) and was verified live in the browser at 320 CSS px with zero horizontal scroll (`document.documentElement.scrollWidth === clientWidth`), which caught and fixed a real bug: an unstyled `<pre>` debug block overflowed the viewport at 320px until `overflow-wrap: anywhere` was added globally for `pre`/`code`. This environment has neither Docker nor a local PostgreSQL install (confirmed, same constraint ADR-046 already recorded for IDN-001) - the loading, "no active session," and error-handling states were verified visually; the DB-backed "no active program," "ready," and "denied" states are proven by the integration test suite against pglite (which exercises real Postgres constraint/FK/unique-index behaviour) rather than by a live screenshot. No automated component/a11y test framework (`test:e2e`/`test:a11y`) exists yet - README already documents both as "declared, not configured," and this task does not change that; per the founder instruction's own "bila sudah ada UI test ringan" qualifier, none was invented for this task.

### Consequences

`packages/domain/src/program` and `packages/db/src/program` follow the same pure-logic/persistence split every prior domain area uses. `apps/web` gains its first real dependencies on `@superlatif/domain`, `@superlatif/db`, and `@superlatif/ui`, and its first database-backed routes. `.claude/launch.json` and `apps/web/.env.local` (gitignored) were added purely as local dev-preview tooling - the latter carries no secrets (`DATABASE_URL` is deliberately left unset). `PRG-002` (versioned curriculum) is expected to supply real `ROADMAP_NEXT` candidates and Program Hub facility flags; `SCH-001`/`EXM` series/`LRN` series/a future result-correction task are expected to supply the other six next-action candidate types, all against the exact `NextActionCandidate` contract this task ships.

## ADR-053 — PRG-002: versioned curriculum schema (with a documented deviation from the Gate 3 draft), service-layer immutability instead of a checksum, per-enrollment version pinning, and release rules as a pure resolver

**Status:** Accepted  
**Date:** 29 August 2026  
**Decided during:** PRG-002 (versioned curriculum, tracks, modules, and release rules).

### Schema scope: the full dok 21 §6 tree except `assets`, `onboarding_responses`, `resource_progress`, `progress_events`, `progress_projections`

This task builds `program_versions`, `tracks`, `roadmap_stages`, `modules`, `resources`, `resource_versions`, and `resource_placements` - everything ADR-052 deferred from dok 21 §6's "Programs and content" list except the five tables above. Those five stay out because they need capability this task's boundaries explicitly exclude: `assets` needs real object storage ("Jangan integrasi object storage/CDN/provider file nyata dulu" - founder instruction); `onboarding_responses`/`resource_progress`/`progress_events`/`progress_projections` need a progress-tracking task (the LRN series) this codebase does not have yet. `resource_versions.body` (untyped JSONB) carries whatever a resource type needs as an opaque reference - including, eventually, an object-storage key - without this task's code ever calling a real provider.

### Two deliberate deviations from `contracts/drizzle-schema.ts`'s draft shape, both documented rather than silent

Table shapes are transcribed from the Gate 3 contract the same "reference, not import" way `enums.ts`/`access.ts` already established (ADR-047). Two places this task's actual schema differs from that draft, both recorded in `packages/db/src/schema/curriculum.ts`'s module doc, not discovered later as drift:

1. `resource_versions` has no `primaryAssetId` - see the scope note above; there is no `assets` table for it to reference.
2. `modules` gains an independent `status` (`record_status`) column the draft does not have - the draft's tracks/roadmap_stages/modules have no status of their own, only the whole `program_version` does. The founder instruction explicitly requires an "archived module hidden" test, which needs a per-module archive action independent of retiring an entire program version. This reuses the existing `record_status` enum's value set (draft/in_review/changes_requested/approved/published/archived) rather than inventing new vocabulary - satisfying CLAUDE.md's "No new unauthorized state vocabulary" while still meeting the acceptance criterion. New modules default to `status: "published"`: there is no independent module-level draft/review workflow being built in this task (no admin CMS), only the parent version's draft gate (below) and the one-way `archiveModule` transition.

Per CLAUDE.md's source-of-truth conflict process, this is reported here as a deliberate, minimal, additive reconciliation - not a silent redefinition - since it does not contradict anything the Gate 3 draft or any higher-layer document states, only adds a capability the draft's snippet happened not to need yet.

### Immutability is a service-layer write guard, not a checksum - because a curriculum version is a relational tree, not one document

Every other versioned artifact in this codebase (`access_policies`, and this task's own `resource_versions`) proves immutability with a stored checksum over one JSONB `config`/`body` column (ADR-014's discipline). A `program_version`'s content is spread across four child tables (`tracks`/`roadmap_stages`/`modules`/`resource_placements`) as separate rows - there is no single document a checksum could cover in one write. `publishProgramVersion` therefore enforces immutability structurally instead: every repository function that attaches curriculum structure (`createTrack`/`createRoadmapStage`/`createModule`/`createResourcePlacement`) first checks its program version's `status` is still `"draft"` (`ProgramVersionLockedError` otherwise) before it will insert anything. `lockedAt` is stamped at publish time for the same audit purpose ADR-014 already establishes, just without a checksum alongside it.

### Circular prerequisite rejection happens at publish, exactly where dok 14 §6 says it should

"Circular dependency ditolak saat publish" (dok 14 §6) is implemented as a pure graph-cycle-detection function (`@superlatif/domain/program#findCircularPrerequisite`, DFS with a recursion stack) run across every placement in the whole program version being published - not per module, since a prerequisite can point anywhere in the same version. `publishProgramVersion` runs this check before opening its status-flip transaction; a cycle throws `CircularPrerequisiteError` and nothing is written.

### `resourceVersion` must already be published before it can be placed - enforced the same way `access.ts`'s grant/policy pairing already is

`createResourcePlacement`'s `releasedResourceVersionId` references a specific resource version row; the schema's foreign key alone can express "this row exists," not "this row's status is published." The repository re-checks the referenced row's `status` explicitly (`ResourceVersionNotPublishedError` otherwise) - the same class of application-layer guard `access.ts`'s module doc already documents for grant/policy pairing (ADR-047), applied here to a second, unrelated pairing.

### Release rules are one pure resolver over an explicit five-mode union - matching dok 14 §6 exactly, with no rule kind left implicit

`@superlatif/domain/program/release-rule.ts`'s `ReleaseRule` union has exactly the five kinds dok 14 §6 names: `immediate`, `fixed_datetime` ("scheduled release" in the founder instruction), `relative_to_enrollment` ("drip" - each learner's own release date shifts with when THEY enrolled), `after_prerequisite`, and `manual`. `resolveReleaseState` is a pure, injected-clock function (no wall-clock read, no I/O) that resolves any one rule against a point-in-time learner context to `"locked" | "released"` - the same discipline as ENT-002's `getEffectiveAccess` and PRG-001's `resolveNextAction`. `resolveModuleVisibility` layers a module's own lifecycle status on top: `archived` always wins over any release rule ("archived module hidden" is unconditional), a module that is not yet `published` is hidden as a distinctly reason-coded `hidden_unpublished` (not confused with `hidden_archived`), and only a genuinely published module's release rule is consulted at all.

`after_prerequisite`'s `completedPlacementIds` context is always an empty set in this task - there is no progress-tracking task (LRN series) yet to report real completions, so every `after_prerequisite` placement stays honestly locked rather than this task guessing at completion. This is the same "ship the resolver against the real contract, wire zero fabricated data sources" pattern ADR-052 already used for `resolveNextAction`.

### Per-enrollment version pinning: set at most once, by `syncProgramEnrollments`, never migrated automatically

dok 14 §7: "Jika program version baru dipublish: enrollment aktif tidak dipindah diam-diam." `program_enrollments` gains a `pinnedProgramVersionId` column (nullable). `syncProgramEnrollments` sets it to the program's current published version ONLY while the column is still `null` for that enrollment - a brand-new enrollment (or one that existed before any version had published) adopts the first published version it observes, exactly once; an already-pinned enrollment is never touched again by this function, even after a newer version publishes. This single rule is what makes "existing learners retain pinned behavior" true in code, without building dok 14 §7's admin "keep / migrate with mapping / new cohorts only" workflow - that remains explicitly out of this task's scope, a future admin-facing task's to build.

`program_enrollments` itself moved from `program.ts` into `curriculum.ts` (same table, same name, same data) purely to avoid a circular ES module import: the new `pinnedProgramVersionId` column needs `programVersions`, which needs `programs` from `program.ts` - defining both tables that need each other's neighbour in one file sidesteps the cycle rather than relying on cross-file lazy-reference semantics. `drizzle-kit generate` confirms this was a pure file reorganization, not a schema change: the generated migration is an `ALTER TABLE program_enrollments ADD COLUMN`, not a drop/recreate.

### A latent PRG-001 bug this task's own tests surfaced: `enrolledAt` was never stamped from the injected clock

`syncProgramEnrollments`'s insert never set `enrolledAt` explicitly, silently falling back to the column's `defaultNow()` (real wall-clock time) instead of the function's own injected `now` parameter. This was invisible in PRG-001 (nothing there depended on `enrolledAt` matching the injected clock precisely), but this task's `relative_to_enrollment` (drip) release rule measures directly from it, and a test enrolling a learner at an injected future timestamp caught the mismatch immediately. Fixed by stamping `enrolledAt: now` explicitly on insert - the same "inject clock" discipline (CLAUDE.md) every other resolver in this codebase already follows, now actually enforced at the one write site that was missing it.

### Consequences

No route or page in `apps/web` calls this task's curriculum-service yet - `getProgramCurriculum` is a read model the future roadmap/Hub page (`PRG-003`+) will call, deliberately not built here ("Jangan bangun full LMS player dulu" - founder instruction). No admin UI exists to drive `createProgramVersionDraft`/`createTrack`/.../`publishProgramVersion` - every curriculum-building function in this task is server-side service/API-layer ready, exercised only by this task's own integration tests, the same "service ready, UI deferred" shape ENT-004 already used for manual grants.

Audit findings must update ADR status rather than silently editing conclusions. Minimum founder confirmations:

- ADR-006 identity bridge;
- ADR-008/010 hosting stack;
- ADR-018 late sync;
- ADR-028 progress formula;
- review/support/download policies from Gate 2.

## ADR-054 — LRN-001: `assets`/`recordings`/`asset_delivery_references` schema, a two-check secure-delivery model, and reuse-without-duplication by owning assets on the resource version

**Status:** Accepted  
**Date:** 29 August 2026  
**Decided during:** LRN-001 (reusable learning resources, assets, recordings, and secure delivery).

### Schema fills exactly the gap ADR-053 left open

ADR-053 explicitly deferred `assets` because it "needs real object storage" - this task fills that gap without ever touching one. Three new tables: `assets` (one deliverable file/stream owned by a `resource_version`, `role`-keyed so one version can carry more than one asset, e.g. a primary video plus a caption file, without a nested asset-of-an-asset chain), `recordings` (dok 14 §14's `pending → processing → ready/failed → archived` processing lifecycle, one row per recording-type resource version, independent of the resource version's own draft/published/archived status), and `asset_delivery_references` (the issued, time-bound tokens themselves). `resource_versions` still has no `primaryAssetId` column - ownership runs the other direction (`assets.resourceVersionId`), so the circular-FK problem a `primaryAssetId` column would have created never arises.

`recording_processing_status` is a genuinely new Postgres enum (`pending`/`processing`/`ready`/`failed`/`archived`), transcribed verbatim from dok 14 §14 rather than invented - the same "document names it, code transcribes it" discipline `record_status`/`grant_event_type` already established (ADR-047).

### `storageRef` is opaque end-to-end - "Jangan integrasi S3/CDN/video provider nyata dulu" enforced structurally, not just by convention

`assets.storageRef` is a synthetic string shaped like a real object-storage key (e.g. `protected-learning/<resourceVersionId>/<uuid>`) but is never resolved against a real provider anywhere in this task. It is written once at asset creation and read in exactly one place in the entire codebase: `delivery-service.ts#resolveAssetDelivery`'s final, server-only return value - never by `requestAssetDelivery` (the function a student-facing caller would actually call), and never serialized into any response that function produces. The "no raw asset URL leak" required test asserts this directly (`Object.keys(request)` excludes `storageRef`, and the serialized response never contains its value), not just as a code-review convention.

### Secure delivery is TWO checks, not one - dok 14 §14's "access mengikuti grant saat playback" taken literally

`requestAssetDelivery` (issue time) composes exactly the existing primitives, inventing no new access rule: `assertProgramAccess` (ENT-002/IDN-004, unchanged) for program-level entitlement, plus a new pure `resolvePlacementVisibility` (`@superlatif/domain/program`) that ANDs a placement's own release rule with its parent module's already-existing `resolveModuleVisibility` - dok 14 §3/§6 give placements their own independent release condition ("Rules lebih kompleks memakai AND terbatas"), which PRG-002 had not yet modeled since nothing needed it until this task's delivery gate did.

`resolveAssetDelivery` (redeem time) does not trust that a reference was validly issued earlier - it re-runs `assertProgramAccess` FRESH against the token's stored `userId`/`placementId`, in addition to checking the TTL. This is what dok 14 §14's "access mengikuti grant saat playback, bukan hanya saat link dibuat" means operationally: a reference that has not yet hit its TTL is still denied if the underlying grant was revoked in between (proven by the "unauthorized access" test's second case - issue, revoke, then redeem within the still-valid TTL window, and confirm denial).

A delivery reference's `expiresAt` is `min(now + ttlSeconds, effectiveAccessDecision.effectiveTo)` (`@superlatif/domain/program#computeDeliveryExpiry`) - a reference can never outlive the grant that authorized it, even if the TTL alone would allow it to (proven directly by a dedicated test).

### Only a hash is ever persisted - reusing `userSessions.secretHash`'s exact discipline, deliberately NOT its code

`asset_delivery_references.tokenHash` is the only column; there is no raw-token column for application code to accidentally persist unhashed - identical reasoning to `identity.ts`'s `userSessions.secretHash` (IDN-001, dok 24 §4 "only hash stored server-side"). `@superlatif/domain/program/secure-delivery.ts` re-implements the same random-token/SHA-256-hash/timing-safe-compare shape as `@superlatif/domain/identity/session.ts` rather than importing it: a delivery reference and a session secret are different credential classes with different lifetimes and different revocation triggers (dok 24 §4's "idle and absolute expiry differentiated" already treats distinct credential classes as independently rotatable), so a bug in one generator must not be able to affect the other.

### Resource reuse without duplication holds by construction, not by a new check

"One resource can be attached to multiple programs without content copying" (acceptance criterion) was already true at the placement layer (PRG-002); this task extends the same guarantee to assets for free by giving `assets.resourceVersionId` - not `resourcePlacements` - ownership of the asset row. The "reusable resource" required test places the same resource version under two different programs' versions and confirms both placements' delivery resolves to the identical `storageRef`, with only one asset row ever created.

### Consequences

No download/stream proxy route exists in `apps/web` - `resolveAssetDelivery` is service/API-layer ready, exercised only by this task's own integration tests, exactly the "service ready, UI deferred" shape ADR-053/ENT-004 already used. No admin UI drives `createAsset`/`createRecording`/`markRecordingReady`. No real object storage, CDN, or video provider was integrated or contacted at any point - every "provider" reference in this task's tests (`provider:zoom:session-opaque-id`) is inert test data, never dereferenced. Gate B and Gate D remain exactly as open as ADR-052/ADR-053 already recorded them; this task does not claim either PASS.

Audit findings must update ADR status rather than silently editing conclusions. Minimum founder confirmations:

- ADR-006 identity bridge;
- ADR-008/010 hosting stack;
- ADR-018 late sync;
- ADR-028 progress formula;
- review/support/download policies from Gate 2;
- OD-03 final object storage/CDN provider decision, before any of this task's synthetic `storageRef` values are replaced with real ones.

## ADR-055 — COM-002: raw/quarantine/normalized commerce-event schema, a synthetic HMAC verification layer, provider status mapping as versioned config, and a synchronous ingest pipeline pending real queue infrastructure

**Status:** Accepted  
**Date:** 29 August 2026  
**Decided during:** COM-002 (ingest immutable raw commerce events and normalize provider payloads).

### Schema fills exactly the gap `commerce.ts` (COM-001) left open

COM-001's module doc explicitly deferred `checkout_intents`/`purchases`/`purchase_events` as "COM-002/COM-003's explicit scope." This task builds the ingestion half of that gap: `raw_commerce_events` (the immutable envelope), `commerce_event_quarantine` (one row per event this task could not normalize), and `normalized_commerce_events` (dok 22 §17's canonical shape). Purchase/grant creation itself - "resolve identity and mapping; upsert purchase snapshot; create source grant tree" (dok 23 §11) - remains COM-003's scope; `normalized_commerce_events.externalSkuId` is deliberately left unresolved to an internal offer, exactly what COM-003 (`dependsOn: ["COM-002", "ENT-001"]`) is meant to consume next.

`purchase_state` is a new Postgres enum, but transcribes CLAUDE.md's own canonical "Purchase states" vocabulary verbatim (`pending`/`paid`/`failed`/`expired`/`cancelled`/`refunded_partial`/`refunded_full`/`chargeback`) - this task is simply the first to actually persist it. `status`/`signatureOutcome`/`reasonCode` stay free text, matching `commerce.ts`'s own established local convention (`products.status`, `offers.visibility`, `externalSkuMappings.status` are all free text) rather than importing ENT-001/PRG-002's enum-preference from a different domain area into this one.

### No live Sejoli/WordPress connection, no production secret - verification is a synthetic, injected-secret HMAC layer

`@superlatif/domain/commerce/webhook-verification.ts` implements dok 23 §8's first preferred verification step (HMAC-SHA256 over the raw body, timing-safe compare) as a pure function. The signing secret is ALWAYS an injected parameter - `ingestCommerceEvent`'s caller supplies it, and every test in this task uses an obviously-synthetic string (`"synthetic-test-webhook-secret-do-not-use-in-production"`). No `.env.example`/env-spec entry was added for a webhook secret: wiring one in now, before OD-01/OD-02 are resolved, would imply a production configuration surface this task explicitly does not claim readiness for. `secret === null` ("unverified") is a legitimate, distinct outcome from "failed" - dok 23 §8 does not require every environment to have a key from day one, and this codebase has no live bridge that would ever supply one; a caller still treats `"unverified"` as quarantine-worthy, never as an implicit pass.

### Provider status mapping is versioned config, not a switch statement - dok 23 §9 taken literally

`ProviderStatusMap` (`@superlatif/domain/commerce/canonical-event.ts`) is a plain, versioned data structure (`{ provider, version, mapping: Record<string, PurchaseState> }`). `SEJOLI_BRIDGE_STATUS_MAP_V1` is dok 22 §17's own worked example, transcribed as synthetic test/reference data - never wired to a real Sejoli instance. Adding a provider, or a new raw status string for an existing provider, is a new config object/row, never a new `if`/`switch` branch. `normalizeCommerceEvent` never guesses: an event `type` outside `SUPPORTED_EVENT_TYPES`, or a raw status the provider's own map does not recognize, is reported as a distinct, named failure kind (`unsupported_type` / `unknown_status`) - the caller turns either into a quarantine record, never a best-effort normalized row with a fabricated status.

### Quarantine is a structural audit trail, not a log line - "jangan silent drop" enforced by table design

Every code path in `ingestCommerceEvent` that cannot produce a normalized event - a failed/unverified signature, an unsupported event type, an unrecognized provider status - writes a `commerce_event_quarantine` row before returning, inside the same transaction as the raw event insert. There is no path in this task's code that discards an event without a corresponding raw record and (when applicable) a quarantine record; the "invalid signature" and "unknown event" required tests both assert the raw envelope is still present and readable after quarantine, not merely that the outcome value says `"quarantined"`.

### Defense-in-depth redaction, independent of what the sender claims it already did

dok 23 §7 says the bridge should already send a minimized/redacted payload with no secret/payment credential. `@superlatif/domain/commerce/payload-redaction.ts#redactRawPayload` strips any object key whose NAME matches a credential-shaped pattern (`password`, `secret`, `token`, `card`, `cvv`, `account_number`, `api_key`, `authorization`, `private_key`) recursively, regardless of what the sender promises - CLAUDE.md "Parse/validate all external input at the boundary" and dok 24 §17's "Never log ... full webhook payload without controlled secure store" both apply at this ingestion boundary, not only at a later trust-assumed layer. `payloadChecksum` is computed over the ORIGINAL, pre-redaction canonical payload (`@superlatif/domain/shared#computeChecksum`) - a one-way SHA-256 digest cannot itself leak a secret, so this preserves an auditable link to exactly what was received without ever storing the unredacted bytes.

### Idempotency: (provider, eventKey) uniqueness checked BEFORE the transaction opens, never a second raw row

`deriveEventKey` (dok 22 §16 step 4) prefers a provider-supplied stable event ID and falls back to a canonical-JSON checksum of the payload itself when absent - two deliveries with byte-identical content and no ID collapse to the same fallback key, the same idempotency behavior a real stable ID would give for free. `ingestCommerceEvent` looks up an existing `(provider, eventKey)` row first and returns `{ kind: "duplicate", existingStatus }` untouched when found - no second raw row, no re-normalization, no re-quarantine. The required "duplicate/idempotency" test asserts exactly one row exists for a re-ingested key, not merely that the second call's return value differs from the first.

### No raw payload mutation, proven against the actual mutation surface, not just a re-read

`commerce-event-repository.ts` exposes exactly one function that can update an existing `raw_commerce_events` row - `markRawCommerceEventStatus`, whose `UPDATE` statement names only the `status` column. The required test calls this function DIRECTLY (not through `ingestCommerceEvent`) and asserts `rawPayloadRedacted`/`payloadChecksum`/`correlationId`/`receivedAt` are unchanged afterward - proving the payload/checksum columns are unreachable by the one exposed mutator, not merely that two reads of an already-settled row happen to match.

### Synchronous ingest pipeline - a documented scope simplification, not a production-shape claim

dok 22 §16 and dok 23 §9's sequence diagram describe ingress persisting durably and acknowledging fast, with a WORKER normalizing afterward. No queue/worker-dispatch infrastructure exists yet anywhere in this repository (no GOV-series task built one). `ingestCommerceEvent` therefore runs persist → verify → normalize/quarantine synchronously, inside one transaction, entirely in-process - `commerce-event-service.ts`'s own module doc records this explicitly as a scope simplification a future queue-backed task can call the same function from without changing its contract, not a claim that production ingestion is this synchronous.

### A workspace-boundary checker false positive found and fixed along the way

`scripts/check-workspace-boundaries.mjs`'s import scanner is a plain regex over file text (`/\bfrom\s+["']([^"']+)["']/g`), not a real parser - it does not distinguish a doc comment from an actual `import` statement. An early draft of `webhook-verification.ts`'s module doc contained the literal text `from "failed"` inside a comment explaining the `"unverified"` outcome, which the checker misread as `packages/domain` importing an external module named `"failed"`. Fixed by rewording the comment (no code change) once `pnpm run verify`'s contract-test suite caught it - `test/contract/workspace-boundaries.contract.test.ts` already has a similar documented regression case for `*.test.ts` files; this is the same class of naive-regex false positive in a new shape (a comment, not a test file), not a real boundary violation.

### Consequences

No `POST /api/v1/integrations/commerce/{provider}/events` route exists in `apps/web` - `ingestCommerceEvent` is service/API-layer ready, exercised only by this task's own integration tests against fabricated-but-realistic fixture payloads, the same "service ready, UI/route deferred" shape ADR-053/ADR-054/ENT-004 already used. No live Sejoli/WordPress connection, no production webhook secret, and no claim of production readiness anywhere in this change - OD-01 (real Sejoli event/signature/retry/refund semantics) remains exactly as open as it was before this task. Gate A and Gate D are not claimed PASS.

Audit findings must update ADR status rather than silently editing conclusions. Minimum founder confirmations:

- ADR-006 identity bridge;
- ADR-008/010 hosting stack;
- OD-01 signed Sejoli event sample, before any of this task's synthetic verification/status-mapping logic is treated as production-ready;
- OD-02 WordPress bridge/account-linking, relevant to the identity resolution COM-003 will need next;
- review/support/download policies from Gate 2.

## ADR-056 — COM-003: purchase/purchase_events/reconciliation_cases/commerce_outbox schema, a pure transition resolver, a two-layer idempotency model, and grant issuance/revocation reusing ENT-001 unchanged

**Status:** Accepted  
**Date:** 29 August 2026  
**Decided during:** COM-003 (process purchase lifecycle into access grants with outbox delivery).

### Schema fills exactly the gap COM-002 left open, plus one addition of its own

`purchases`, `purchase_events`, and `reconciliation_cases` are dok 21 §4's own tables, implemented here for the first time. `commerce_outbox` is NOT in dok 21 - a minimal, founder-instructed addition ("buat minimal outbox table + synchronous drain jika perlu, tapi jangan bangun queue infra penuh"), not a full message-queue schema. `purchases` is deliberately the ONE mutable projection in this task's write-set ("upsert purchase snapshot", dok 23 §11) - the same class of exception PRG-002's `program_enrollments.isPrimary` already used; the immutable fact log underneath it is `purchase_events` (append-only) plus `access_grants`/`grant_events` (ENT-001, entirely unchanged by this task).

`reconciliation_cases` is deliberately a SEPARATE table from COM-002's `commerce_event_quarantine`, not a reuse of it: quarantine is about an event that could not be NORMALIZED (bad signature, unsupported shape - COM-002's concern); a reconciliation case is about a normalized event that COULD be normalized but could not be PROCESSED into a grant decision (unknown SKU, unresolved identity, an ambiguous/out-of-order transition, an unverifiable partial refund, an unresolvable policy validity config, or a chargeback flagged for review). Same audit-trail discipline, two distinct failure classes, matching dok 21 §4's own table separation.

### Purchase transition legality is a pure, data-driven resolver - dok 22 §18 taken literally

`@superlatif/domain/commerce/purchase-transition.ts#resolvePurchaseTransition` decides ONE thing, with no I/O: given a purchase's current status/time and one incoming event's status/time, is this event safe to apply? Two independent checks, in order - staleness (incoming `occurredAt` before the purchase's current state, rejected regardless of the target status) then legality (`ALLOWED_TRANSITIONS`, a plain data table, not a switch statement - the same "config, not code branches" discipline `canonical-event.ts`'s `ProviderStatusMap` already established). `paid -> pending` is deliberately absent from the table - dok 22 §18's own worked example of a transition that must never auto-apply, "even with a later timestamp" (a required test asserts exactly this). Terminal states (`expired`, `cancelled`, `refunded_full`, `chargeback`) have no outbound edges at all - reopening one is always `illegal_regression`, always a reconciliation case, never an automatic transition. `failed -> paid` stays open on purpose: a delayed retry can still succeed after an earlier attempt was marked failed.

### Two independent idempotency layers, matching COM-002's "checked before the transaction opens" discipline

Layer 1: `purchase_events.normalizedEventId` is unique - `processPurchaseLifecycleEvent` checks for an existing row before opening its transaction and returns `{ kind: "already_processed" }` untouched when found, mirroring exactly how `ingestCommerceEvent` (COM-002) checks `(provider, eventKey)` before its own transaction. Layer 2: `access_grants`' own `(userId, sourceType, sourceKey)` uniqueness (ENT-001, unmodified) - `sourceType = "purchase"`, `sourceId = purchase.id` (shared by every grant one purchase ever issues, so a refund/cancel can find and revoke exactly this purchase's grants without an extra join table), `sourceKey = "${purchase.id}:${componentCode}"` (one grant per product component, replay-safe by construction - re-deriving the same key on a replay makes `issueGrant` return the existing row, never a duplicate). A same-target-status re-delivery under a DIFFERENT `eventKey` (a provider retry with a new delivery id) is caught by layer 2's resolver as `"duplicate"`, not layer 1 - the required "provider retry" test exercises this distinction directly.

### Grant issuance and revocation reuse ENT-001/ENT-002 completely unchanged

`applyPurchaseStatusEffects` calls `issueGrantAndInvalidate`/`recordGrantEventAndInvalidate` (ENT-002's ENT-001 wrappers) exactly as ENT-004 already did - no new grant-mutation code path was added anywhere. `paid` issues one grant per `productComponents` row on the resolved offer's product version, using `@superlatif/domain/access#computeValidityWindow` for each component's own policy (a `through_program_or_batch_end` policy with no program/batch lifecycle table to supply `lifecycleEndsAt` degrades to a `policy_validity_unresolvable` reconciliation case for THAT component only, never aborting the whole purchase). `refunded_full`/`cancelled` record a `"revoked"` grant_event for every grant this purchase's `sourceId` owns - dok 23 §11 "revoke/cancel only grants from that purchase; preserve other grants" enforced by the same `sourceType`+`sourceId` ownership filter ENT-004's `GrantOwnershipMismatchError` already relies on elsewhere. `chargeback` records `"suspended"`, never `"revoked"` - dok 22 §18 "tidak otomatis menuduh siswa melakukan kecurangan" - and always pairs it with a `chargeback_review` reconciliation case for human review. `refunded_partial` takes NO automatic grant action at all: this task has no line-item granularity (one purchase maps to one offer), so it can never verify dok 22 §18's own precondition ("provider memberi nominal/line-item semantics yang dapat diverifikasi") - every `refunded_partial` event becomes an `unverifiable_partial_refund` reconciliation case instead of a guess.

### Outbox atomicity, proven directly against the actual failure mode

Every `commerce_outbox` row is written inside the SAME `db.transaction` as the grant/reconciliation-case write it accompanies. The required "outbox prevents partial commits" test does not rely on inference from the code's shape - it manually opens a transaction, issues a real grant, then deliberately writes an outbox row with a nonexistent `purchaseId` (violating the FK) to force a failure, and asserts the grant does not exist afterward. `drainCommerceOutbox` is a synchronous, injectable-consumer function (`publish: (entry) => Promise<void>`), not a queue worker - a `publish` failure leaves that one row `pending` for a later drain to retry, never blocking the rest of the batch; a future task with real dispatch infrastructure can call it from a job handler unchanged.

### Consequences

No `apps/web` route processes a normalized event automatically - `processPurchaseLifecycleEvent` is service/API-layer ready, exercised only by this task's own integration tests, which drive it through COM-002's real `ingestCommerceEvent` first (fabricated-but-realistic fixture payloads end to end, not a shortcut past COM-002). No checkout-intent resolution (no checkout flow exists yet) and no real notification delivery (the outbox records the obligation; nothing sends anything). No live Sejoli/WordPress connection, no production webhook secret, and no claim of production readiness anywhere in this change - OD-01 remains exactly as open as ADR-055 already recorded it. Gate A and Gate D are not claimed PASS.

Audit findings must update ADR status rather than silently editing conclusions. Minimum founder confirmations:

- ADR-006 identity bridge;
- ADR-008/010 hosting stack;
- OD-01 signed Sejoli event sample, before any of this task's synthetic verification/status-mapping/transition logic is treated as production-ready;
- OD-02 WordPress bridge/account-linking - `external_identities` is reused for identity resolution as-is (IDN-001), but no live bridge populates it yet;
- review/support/download policies from Gate 2.

## ADR-057 — COM-004: no new schema, no new production code path - source-isolated revocation proven against the existing COM-003/ENT-001/ENT-002 mechanism, not a new one

**Status:** Accepted  
**Date:** 29 August 2026  
**Decided during:** COM-004 (handle refund, cancellation, expiry, and source-isolated revocation).

### The founder instruction's own precondition held: no schema, no new mutation path

Before writing any code, this task reviewed `applyPurchaseStatusEffects` (COM-003, `purchase-lifecycle-service.ts`) against COM-004's three acceptance criteria and found all three already true by construction:

- **"A source can revoke only grants it created"** - refund/cancel already filters `listGrantsForUser(...).filter(g => g.sourceType === "purchase" && g.sourceId === purchase.id)` before calling `recordGrantEventAndInvalidate`. A grant from any other source (another purchase, a manual grant, anything else) is never even considered, let alone touched.
- **"Overlapping valid access survives another source refund"** - a direct consequence of the same filter: two purchases granting the same target produce two grant rows with two different `sourceId`s; refunding one can only ever match its own.
- **"Every removal has a reason and audit trail"** - `recordGrantEvent` (ENT-001) already throws `GrantEventReasonRequiredError` for a reason-less revoked/suspended/cancelled/reinstated event, and `applyPurchaseStatusEffects` already supplies a fixed, meaningful reason per path (`"purchase_refunded_full"`, `"purchase_cancelled"`, `"purchase_chargeback_review"`).

Per the founder instruction ("Jangan buat schema baru kalau acceptance bisa dipenuhi dengan mekanisme COM-003 + ENT-001/ENT-002 yang sudah ada"), this task's entire write-set is ONE new integration test file - `source-isolated-revocation.integration.test.ts` - proving the above against the harder multi-source scenarios COM-004 names, rather than re-describing a mechanism that was never actually missing.

### Overlapping-grant refund, proven at the student-facing layer, not just the row layer

The core required test issues two independent grants for the identical target (`program:aks-2026`) from two different offers/purchases (a "bundle" and a "specialist" product, mirroring COM-001's own bundle/overlap precedent), refunds only the specialist purchase, and asserts three things together: the bundle grant's row is untouched (no `revoked` event, same id), the specialist grant DID get a `revoked` event with the correct reason, and - the real proof - `getEffectiveAccess` for the shared target still returns `allowed: true` with `decisiveGrantIds` now pointing at the surviving bundle grant alone. Checking only the grant table would have missed a class of bug where the resolver itself, not the revocation, breaks isolation.

### Unknown-source revocation denial extended to a DIFFERENT source type, not just another purchase

The backlog's own test name ("Unknown-source revocation denial") is interpreted as: isolation must hold not only between two purchases, but between a purchase and any OTHER source type entirely. A second required test issues a `sourceType: "manual"` grant (ENT-004's own convention, `sourceId = studentId`) for the same target, then refunds an unrelated purchase for the same student - the manual grant is asserted untouched (no `revoked` event, still the sole entry in `decisiveGrantIds`) exactly as if it belonged to a different student's data entirely.

### Expiry boundary is a purchase-lifecycle state, not a grant-lifecycle one

COM-004's "expiry" is `purchases.status = "expired"` (a `pending` order whose payment window closed - dok 22 §18's own vocabulary), not a grant's own `validTo` passing, which ENT-001/ENT-002 already handle automatically via `deriveGrantStatus` with zero commerce involvement. The required test drives `pending -> expired` and confirms zero grants were ever issued (nothing to revoke) and that a replay of the same normalized event is `already_processed`, matching COM-003's existing idempotency layer.

### Idempotent repeated refund/cancel - proven against the grant_events audit trail directly, not inferred

A required test sends two DIFFERENT deliveries (distinct `eventId`s, simulating a provider retry) that both resolve to `"refunded_full"`. `resolvePurchaseTransition`'s same-status check already classifies the second as `"duplicate"` before any grant code runs; the test proves the consequence directly by counting `grant_events` rows: exactly one `revoked` entry exists afterward, not two - the transition-layer guard is what prevents a double-revocation, and this is what the test actually exercises rather than assuming.

### Consequences

No schema changed, no migration was generated, no production code path was added or modified - this task's write-set is exactly one new test file plus this ADR. `db:check` has nothing new to report. Gate A and Gate D are not claimed PASS; OD-01/OD-02 remain exactly as open as ADR-055/ADR-056 already recorded.

Audit findings must update ADR status rather than silently editing conclusions. Minimum founder confirmations: same as ADR-056 (no new ground covered by this task).

## ADR-058 — COM-006: four nullable columns on `reconciliation_cases` (not a new table), repair reuses `applyPurchaseStatusEffects` exported from COM-003, and authorization reuses IDN-004's already-granted `reconciliation.manage` permission unchanged

**Status:** Accepted  
**Date:** 29 August 2026  
**Decided during:** COM-006 (build commerce reconciliation and exception operations).

### Read-set honored: dok 25 §13 and dok 30 §10.1 drove the design, not invention

Per the task instruction, `25_MIGRATION_AND_RECONCILIATION_PLAN.md` and `30_LAUNCH_AND_OPERATIONS_RUNBOOK.md` were read before any code. Two passages shaped this task directly:

- dok 25 §13 "Reconciliation queue": `State: open, assigned, investigating, resolved, ignored-with-reason.` - transcribed verbatim into `ReconciliationCaseStatus`, still free text (matching `reconciliation_cases`' own existing convention), not a new Postgres enum.
- dok 30 §10.1 "Paid order but no access": `"Create/assign case; replay known event only through idempotent command"` and `"fix mapping/adapter, replay affected event range by provider key, rebuild access."` This is the literal shape of `repairReconciliationCase` - not a re-ingestion of the original webhook (COM-002/COM-003's own idempotency layers permanently consume a `normalizedEventId` the first time it's processed, by design), but a distinct "the underlying blocker is now fixed - drive the SAME grant machinery through it once" operation.

### No new table - four nullable columns on the table COM-003 already built

`reconciliation_cases` gained `assignedToUserId`, `resolvedByUserId`, `resolvedAt`, `resolutionReason` - all nullable, all additive. Per the founder instruction ("jangan buat schema baru kecuali benar-benar perlu"), a new table was considered and rejected: a reconciliation case has at most one live resolution, so the columns going from null to set (who, when, why) already IS the audit fact; a separate append-only "repair log" table would record the same single event twice for no additional guarantee. `reconciliation-repository.ts`'s two new mutators - `assignReconciliationCase` and `resolveReconciliationCase` - are the ONLY functions that ever write these columns, and both refuse to touch an already-terminal case, so idempotency is enforced at the repository layer, not only trusted to the service layer above it.

### Repair reuses `applyPurchaseStatusEffects` - exported, not reimplemented

Per the founder instruction ("Repair yang menyentuh grants harus reuse ENT-001/ENT-002 functions, jangan bikin write path baru"), `purchase-lifecycle-service.ts`'s previously-private `applyPurchaseStatusEffects` was exported as-is (no logic change) and is now called from two places: the original webhook-driven `processPurchaseLifecycleEvent`, and this task's `repairReconciliationCase`. There is exactly one implementation of "what happens to grants when a purchase reaches `paid`/`refunded_full`/`chargeback`" in this codebase, before and after this task. `unknown_sku`/`unresolved_identity` repair re-resolves the original blocker (`resolveOfferForSku`/`findExternalIdentity`, unchanged from COM-001/IDN-001), patches the purchase row via `updatePurchaseStatus`, then calls the exported function; `chargeback_review` repair calls `recordGrantEventAndInvalidate` (ENT-001/ENT-002, unchanged) directly, exactly as COM-003's own chargeback path already did.

### Authorization needed zero changes to `permissions.ts`

IDN-004's permission matrix already carries `reconciliation.manage: { level: "granted" }` for `operations_admin`, `finance_reconciliation`, and `super_admin`, and `level: "scoped_nuance"` (a real permission cell, but NOT a full grant - `authorize()`'s `hasFullGrant` check treats it as absent) for `academic_admin` ("Read") and `support` ("Create case"). This task's authorization requirement - only staff who can fully manage reconciliation may REPAIR a case, not merely read or create one - was already exactly what the existing matrix encodes; `repairReconciliationCase`/`assignReconciliationCaseToOperator` call `authorize()` unchanged, with `action.permission: "reconciliation.manage"`, and the required "unauthorized operator" tests (a plain student, and separately an `academic_admin`) are denied by the matrix that already existed before this task started.

### The reason-required guard is this task's own, mirroring ENT-001's pattern rather than reusing its class

`recordGrantEvent`'s `GrantEventReasonRequiredError` (ENT-001) only fires for the specific grant-event types it gates (revoked/suspended/cancelled/reinstated) - it has no opinion about a reconciliation-case-level repair action that might resolve `unknown_sku` (no grant event at all, if the purchase somehow never reached `paid`) just as easily as `chargeback_review` (a grant event every time). `repairReconciliationCase` therefore has its own `ReconciliationRepairReasonRequiredError`, checked before authorization even runs - same shape and intent as ENT-001's guard, but a distinct class for a distinct action, not a forced reuse across an API boundary that doesn't naturally fit.

### `ambiguous_transition` and `chargeback_review` require an explicit human decision - repair never guesses

Both case types can resolve two structurally different ways (force the pending transition through vs. leave it rejected; confirm the chargeback vs. reinstate the grant), and nothing in the stored evidence can tell repair which one a human reviewer intends. `decision: "apply" | "reject"` is required for exactly these two case types (`ReconciliationRepairDecisionRequiredError` if omitted) - `unknown_sku`/`unresolved_identity` need no such parameter, because there is only one possible outcome once the blocker clears (issue the grant) or it doesn't (`still_blocked`).

### No silent mutation - proven for both the blocked-repair and the reject-decision paths

A "still_blocked" outcome (SKU still unmapped, identity still unresolved) leaves the case status, the purchase row, and the grant table completely untouched - proven directly by re-reading all three after a blocked repair attempt, not inferred from the code's shape. A "reject" decision on `ambiguous_transition`/`chargeback_review` resolves the case (`ignored_with_reason`) but performs zero purchase/grant mutation - the chargeback-reject test specifically asserts neither a `"revoked"` nor a `"reinstated"` grant event exists afterward, closing the one case where "did nothing happen" and "did the wrong thing happen" could otherwise look identical from the outside.

### Consequences

No live Sejoli/WordPress connection, no production sign-off claim anywhere in this change - the founder instruction's own stop condition (finance-approved reconciliation evidence unavailable) is honored by never claiming it. Gate A and Gate D are not claimed PASS. `assignReconciliationCaseToOperator` exists but has no `apps/web` route calling it - service/API-layer ready only, same "service ready, UI deferred" shape every commerce task in this series has used. A read-only reconciliation summary/report function (counts by case type/status, matching dok 25 §12's "Counts" section) was considered and deliberately deferred - the required tests did not need it, and adding one would have widened this task's scope beyond what "repair" itself requires; a future task can add it without touching anything built here.

Audit findings must update ADR status rather than silently editing conclusions. Minimum founder confirmations:

- ADR-006 identity bridge;
- ADR-008/010 hosting stack;
- OD-01 signed Sejoli event sample, before any of this task's repair logic is treated as production-ready;
- OD-02 WordPress bridge/account-linking;
- finance-approved order/refund reconciliation evidence, before any repair outcome is treated as a production sign-off record (the task's own stop condition, not yet satisfied and not claimed here);
- review/support/download policies from Gate 2.

## ADR-059 — ENT-003: no new schema - rebuild reuses ENT-002's own resolver bypassing the cache, drift correction is invalidation-only, a latent grant-ordering non-determinism found and fixed, and purchase-vs-grant drift reuses COM-006's reconciliation table with one new case type

**Status:** Accepted  
**Date:** 29 August 2026  
**Decided during:** ENT-003 (create deterministic entitlement rebuild and drift detection).

### No persisted `effective_access` snapshot table - "rebuild" already existed, just needed a name

Per the task instruction, a new schema was considered and rejected. ENT-002's `getEffectiveAccess` already does exactly two things on a cache miss: fetch every grant from source records (`listResolvableGrantsForUser`) and recompute a decision (`resolveEffectiveAccess`) - both pure/unmodified. "Rebuild from source records" is that exact pair of calls, exposed under its own name (`rebuildEffectiveAccess`) so a caller can request it explicitly rather than incidentally on a cache miss. No new table was needed because there was never a SECOND thing to compare a fresh computation against other than the cache itself - and the cache already existed.

### Two independent drift checks, because they are two different classes of problem with two different correct responses

`detectEffectiveAccessDrift` (cache vs. rebuild) is **self-healing**: if a cached decision disagrees with a fresh rebuild, the only correct action is to stop trusting the stale entry - `cache.invalidateUser` (ENT-002's own existing method, already called by `issueGrantAndInvalidate`/`recordGrantEventAndInvalidate`) is the entire "repair." No reconciliation case is raised for this kind, because there is no decision for a human to make - the next real read will simply recompute correctly. `detectPurchaseGrantDrift` (paid purchase vs. supporting grant) is **not** self-healing: a paid purchase with zero grants at all could be a real bug, or a legitimately-documented exception (dok 05 §14 / dok 25 §12's own language: "unless exception documented") - this always raises a COM-006 `reconciliation_cases` row (a new case type, `paid_purchase_no_grant`, added to the existing free-text-backed union - zero schema impact) for a human to investigate, resolved through COM-006's own `resolveReconciliationCase` unchanged.

### "Repair" never widens access - proven directionally, not just by absence of a widening code path

`compareEffectiveAccessDecisions` (pure, `@superlatif/domain/access`) reports which DIRECTION a disagreement runs: `cache_over_permissive` (cache says allowed, rebuild says denied - the dangerous direction dok 05 §16 invariant 8 is about) versus `cache_under_permissive` (the safe direction - a real grant exists that the cache hadn't caught up to yet). Both are reported as drift, but the reaction is identical either way (invalidate) precisely because invalidation can only ever make the next read MORE accurate - it removes a cached answer, it never installs a wider one. The required "no access widening" test does not just assert that no widening function exists; it drives the actual sequence (populate cache while allowed, revoke the grant out-of-band, detect drift, invalidate, re-read) and asserts the re-read returns the more restrictive rebuilt decision, never the stale permissive one.

### A latent non-determinism found and fixed: `listGrantsForUser` had no `ORDER BY`

While designing the "deterministic output ordering" test, `access/grant-repository.ts#listGrantsForUser` was found to have no `ORDER BY` clause at all - `@superlatif/domain/access#resolveEffectiveAccess`'s `decisiveGrantIds` is derived directly from its caller's array order (deduped, never sorted), so an unordered fetch could report the same overlapping grants in a different sequence on different calls, purely as an artifact of physical row storage, never a real change in entitlement. Fixed by adding `.orderBy(asc(createdAt), asc(id))` - a minimal, purely additive change (no semantic change, only a determinism guarantee) that the required ordering test now exercises directly (three overlapping grants from three different sources, five repeated rebuilds, identical `decisiveGrantIds` order every time). `commerce/purchase-repository.ts#listPurchasesForUser` (new, needed for `detectPurchaseGrantDrift`) was written with the same explicit ordering from the start, for the same reason.

### Consequences

No live Sejoli/WordPress connection, no schema change, no migration generated - `db:check` has nothing new to report. Gate A and Gate D are not claimed PASS. `detectPurchaseGrantDrift`/`detectEffectiveAccessDrift` have no `apps/web` route calling them yet - service/API-layer ready only, matching every commerce/entitlement task in this series. `paid_purchase_no_grant` cases are never auto-repaired by issuing a grant - dok 05 §16 invariant 8 ("Unknown SKU atau ambiguous user mapping tidak memberi akses luas secara diam-diam") generalized to this task's own scope: a detected gap is always a human decision, reusing ENT-004's manual-grant workflow if a grant turns out to genuinely be owed, never an automatic one from this module.

Audit findings must update ADR status rather than silently editing conclusions. Minimum founder confirmations:

- ADR-006 identity bridge;
- ADR-008/010 hosting stack;
- OD-01/OD-02, unaffected by this task;
- review/support/download policies from Gate 2.

## ADR-060 — SCH-001: schedule_items/live_sessions/live_session_join_references/live_session_attendance/live_session_reminders schema, join-link security mirrors LRN-001's two-check model exactly, append-only reschedule, and recording reuses LRN-001's table unchanged

**Status:** Accepted  
**Date:** 30 August 2026  
**Decided during:** SCH-001 (schedule, live class, reminder, recording, and attendance lifecycle).

### Schema transcribes dok 14 §11 verbatim - two new closed enums, three new tables, plus join/attendance/reminder support tables

`schedule_item_type` (`live_class`/`exam_window`/`deadline`/`announcement`/`other`) and `live_session_status` (`draft`/`scheduled`/`live`/`ended`/`cancelled`/`rescheduled`) are transcribed directly from dok 14 §11's own vocabulary, matching `grantEventType`/`recordingProcessingStatus`'s established enum precedent for closed, spec-defined vocabularies. `schedule_items` carries the program/track reference and explicit authoring timezone (SCH-001 acceptance); `live_sessions` carries everything specific to a live_class occurrence. `provider`/`externalMeetingRef` are opaque strings end to end - never dereferenced against a real Zoom/Meet provider anywhere in this task, the same discipline `assets.storageRef` (LRN-001) already established for object storage.

### Join-link security is LRN-001's two-check delivery model, reused at the primitive level, not duplicated at the table level

dok 14 §12's join flow ("access mengikuti grant saat playback, bukan hanya saat link dibuat" - the same phrase dok 14 §14 uses for asset delivery) is structurally identical to LRN-001's asset-delivery problem: issue a short-lived opaque token at REQUEST time, re-authorize FRESH at REDEEM time. `requestLiveSessionJoin`/`resolveLiveSessionJoin` (`schedule-service.ts`) mirror `requestAssetDelivery`/`resolveAssetDelivery` exactly, and reuse `@superlatif/domain/program`'s crypto primitives (`generateDeliveryToken`/`hashDeliveryToken`/`deliveryTokenMatchesHash`/`computeDeliveryExpiry`/`evaluateDeliveryReferenceValidity`) completely unchanged - zero new cryptography. `live_session_join_references` is a NEW table, not a reuse of `asset_delivery_references`, because the FK target genuinely differs (a live session, not an asset+placement); reusing that table would have meant either a nullable dual-FK shape or overloading `placementId` to mean something it doesn't - the founder instruction's "jangan bikin write path baru" is honored at the level that actually matters (no second implementation of the security-sensitive token logic), not by force-fitting an unrelated table's foreign keys.

dok 14 §12's own ordering - "1. buka session, 2. evaluasi effective access, 3. evaluasi join window dan session status" - is followed literally: `assertProgramAccess` (ENT-002/IDN-004, unchanged) runs BEFORE the status/window checks, so an unauthorized caller never learns anything about a session's timing from the response shape.

### Recording reuses LRN-001's table unchanged - `live_sessions.recordingId` only ever attaches, never creates

Per the founder instruction ("Recording harus reuse LRN-001 recording lifecycle, jangan duplikasi model baru"), this task defines no `sourceKind`/`processingStatus`/`providerRef` vocabulary of its own - `linkRecording` is one `UPDATE live_sessions SET recording_id = ...` statement. Creating the underlying recording (`createRecording`, `markRecordingReady`) is entirely LRN-001's existing, unmodified code path; SCH-001 never calls those functions itself outside of test setup, matching how a real caller (a future admin route) would compose the two existing modules rather than SCH-001 owning recording creation.

### Reschedule is append-only, matching dok 14 §13 literally, and reuses the same "new row, old row becomes terminal" discipline COM-003's purchase transitions already established

`rescheduleLiveSession` never mutates a session's own `startsAt`/`endsAt` in place. The OLD row is marked `status = "rescheduled"` (a status this schema's own enum lists as terminal for join purposes - `isLiveSessionJoinable` excludes it) and keeps its original timing permanently ("jadwal lama tidak hilang dari audit", dok 14 §13); a NEW row is inserted with `rescheduledFromId` pointing at the old one. `rescheduledFromId` deliberately has no enforced FK constraint - the same choice `commerce.ts`'s `offers.upgradeFromOfferId` already made for a self-referential column, for the same reason (self-reference insert ordering is not worth the constraint at this stage).

### Reminders are a synthetic scheduling record only - dok 19 §12's full notification lifecycle is explicitly NOT built here

Per the founder instruction ("Reminder cukup outbox/synthetic scheduling model, bukan pengiriman nyata"), `live_session_reminders.status` only ever takes two values in this task's code (`planned`/`cancelled`) - dok 19 §12's richer `planned → queued → provider_accepted → delivered/read(optional) → failed → retried/dead` lifecycle belongs to NTF-001 (already in the backlog, `dependsOn: [..., "SCH-001", ...]`), not this task. `rescheduleLiveSession`/`cancelLiveSession` both cancel every still-`planned` reminder for the affected session (dok 19 §13 "Reschedule membatalkan job lama") - scheduling a fresh reminder for a new occurrence is left to the caller's own explicit `scheduleReminder` call, not auto-created, keeping the two concerns (occurrence lifecycle vs. reminder scheduling) composable rather than implicitly coupled.

### Authorization needed zero changes to `permissions.ts` - `live.occurrence.manage` already existed

IDN-004's permission matrix already carries `live.occurrence.manage: { level: "granted" }` for `academic_admin`, `operations_admin`, and `live_class_coordinator` - exactly the staff roles who should be able to reschedule/cancel a live session, established before this task began. `rescheduleLiveSession`/`cancelLiveSession` call `authorize()` with this existing permission unchanged, and both require a non-empty reason (`ScheduleReasonRequiredError`) before authorization is even checked - mirroring ENT-001/COM-006's audit-required-field discipline.

### Consequences

No live Zoom/Google Meet/video provider integration, no live WhatsApp/email reminder delivery, anywhere in this change. No `apps/web` route calls any of these functions yet - service/API-layer ready only, the same "service ready, UI deferred" shape every prior program/commerce task in this series has used. Gate B is not claimed PASS. `live_session_series`/per-session entitlement targeting (already present in ENT-001's `target_type` enum: `"live_session"`, `"live_session_series"`) remains unused - this task reuses program-level access (`assertProgramAccess`, matching LRN-001's own precedent) rather than inventing a per-session policy-authoring flow that has no admin UI to author it with yet.

Audit findings must update ADR status rather than silently editing conclusions. Minimum founder confirmations:

- ADR-006 identity bridge;
- ADR-008/010 hosting stack;
- OD-03 final video/notification provider decision, before any of this task's synthetic `provider`/`externalMeetingRef` values are replaced with real ones;
- review/support/download policies from Gate 2.

## ADR-061 — QST-001: versioned question bank schema, `question_version_secrets` as a structurally unreachable answer-key table, a deliberate draft/in_review/changes_requested-mutable lock rule, and `question_assets` as a new table reusing LRN-001's opaque-reference pattern

**Status:** Accepted
**Date:** 30 August 2026
**Decided during:** QST-001 (versioned questions, stimuli, options, assets, and answer secrets - question bank model only; attempt engine, scoring engine, ranking, and tryout batch are explicitly out of scope).

### Schema transcribes dok 15 §4's "Question types MVP" and dok 21 §8's table list verbatim - one new enum, six new tables

`question_type` (`single_choice`/`multiple_choice`/`true_false`/`weighted_choice`/`numeric`) is transcribed directly from dok 15 §4's own vocabulary. "Shared stimulus/passage" and "text, formula, table, and images" are content FORMATS a question of any type can carry (stem/option/explanation documents, a stimulus link), not question types of their own, and are therefore not in this enum. `questions`/`question_versions` and `stimuli`/`stimulus_versions` both use the identity/version split already established by ENT-001/COM-001/PRG-002 (a stable line-level identity row plus a numbered content version row). `question_options` is relational, not JSONB, because `optionCode` must be a stable, individually addressable key referenced both by `question_assets.optionCode` and by every answer-key shape (`correctOptionCode`, `correctOptionCodes`, `statementAnswers` keys); for `type = "true_false"`, an option row represents one STATEMENT (its `content` is the statement text) rather than a traditional choice, avoiding a fourth table for what is structurally the same "addressable content row" shape. `classification` (JSONB on `question_versions`) holds dok 15 §4's classification fields (exam family, subject/section, topic/subtopic, competency code, difficulty editorial, source/provenance/year, language, sensitivity/copyright note) as versioned configuration attached to one specific version, per CLAUDE.md's "JSONB stores versioned configuration/snapshots, not core relational integrity" - a reference-table hierarchy for exam families/subjects/topics is explicitly later EXM-series scope (dok 21 §9), not built here. `explanationDocument` lives directly on `question_versions`, not in the secrets table: dok 15 §6 lists "explanation" as its own manual-editor section distinct from "answer/scoring metadata," shown to students post-attempt per a later task's release policy, not a permanent secret.

### `question_version_secrets` is the security boundary - a separate table AND a structurally unreachable one from the student-facing serializer

dok 21 §8 names the boundary directly: "question_version_secrets memisahkan kunci/bobot dari konten yang dapat diserialisasi ke siswa." This is enforced two ways, deliberately redundant. First, relationally: `question_version_secrets` is a separate 1:1 table, never a column on `question_versions`, and only `packages/db/src/exam/question-secret-repository.ts` ever reads or writes it - no other file in `packages/db/src/exam` imports it. Second, and more strongly: `@superlatif/domain/exam`'s `toStudentFacingQuestionView` (student-view.ts) has a function signature (`StudentFacingQuestionInput`) that has no field an `AnswerKey` could be assigned to at all - passing one is a type error, not a discipline failure a code review has to catch by eye. CLAUDE.md's `weighted_choice` rule ("uses the student response shape kind=single_choice + optionCode; option weights remain server-only secrets") is implemented as one pure mapping function, `toStudentResponseKind`, the single place that translation happens; the internal/admin `type` column stays `"weighted_choice"` for classification and scoring, only the student-facing `responseKind` field ever reports `"single_choice"`. `assertValidAnswerKey` (answer-key.ts) enforces dok 15 §6's per-type completeness rules before any secret row is written - single choice exactly one correct option (by shape), complex/multiple choice at least one correct option plus an explicit partial-score policy, true/false every statement covered, weighted choice every option covered by a finite numeric weight, numeric a complete accepted-value/tolerance/unit policy - and rejects any option code that does not exist on the version's own `question_options` rows (the "invalid option key" required test).

### The mutability rule is a deliberate, documented deviation from this codebase's usual "immutable from creation" pattern

Every other versioned artifact in this codebase so far (ENT-001 `access_policies`, COM-001 `product_versions`, PRG-002 `resource_versions`) locks from the moment a version row is created. dok 15 §4 states a different rule explicitly: "question adalah identity/kode yang stabil. question_version immutable setelah approved/published/used. Draft boleh diedit." This is honored literally rather than forced into the codebase's dominant pattern: `@superlatif/domain/exam`'s `isQuestionVersionLocked`/`assertQuestionVersionMutable` treat `draft`/`in_review`/`changes_requested` as mutable in place and only `approved`/`published`/`archived` as locked - one status earlier than "published" alone, so a version cannot be edited after its first approval either, not only after release. The same lock point is reused unchanged for `stimulus_versions` (`stimulus-repository.ts`), since dok 15's rule is the `record_status` workflow's own lock point, not something question-specific. `transitionQuestionVersionStatus`/`transitionStimulusVersionStatus` re-verify each version's own content checksum before any transition into a locked status - the same "re-verify before lock" discipline `policy-repository.ts#publishPolicyVersion` already established - and stamp `lockedAt` exactly once, on the first transition into a locked status, so a later `approved → published → archived` step never overwrites when the version actually became immutable.

### `question_assets` is a new table, not a retrofit of LRN-001's `assets`, because the owning concept genuinely differs

Per the founder instruction ("Gunakan LRN-001 asset model kalau relevan; jangan buat storage provider nyata"), this task reuses LRN-001's DESIGN PATTERN - an opaque `storageRef` never resolved against a real object-storage/CDN provider anywhere in this task, plus checksum/mimeType metadata - but not LRN-001's own `assets` table, which is owned by `resourceVersionId`, a curriculum concept unrelated to a question or stimulus version. This is the same choice SCH-001 already made when it built its own `live_session_join_references` table rather than force-fitting `asset_delivery_references`'s foreign keys. `question_assets` carries dok 21 §8's own fields (question/stimulus version, placement, option key/order via `optionCode`, asset, alt metadata, `image_purpose`, a synthetic `malware_scan_clean` boolean per dok 15 §5) with an XOR owner constraint - exactly one of `questionVersionId`/`stimulusVersionId` - enforced at the application layer (`question-asset-repository.ts`'s `insertQuestionAsset`), matching `reconciliation_cases`' own multiple-optional-FK precedent (COM-003/COM-006) rather than a database CHECK constraint. An asset attached with `placement = "option"` must name an `optionCode` that actually exists on that same question version, checked before insert - the "image option/assets" required test exercises this path directly.

### Authorization needed zero changes to `permissions.ts` - `question.draft.write`/`question.first_approve`/`question.ranked_publish` already existed

IDN-004's permission matrix already carried these three codes with sensible role grants (`tutor_writer`/`moderator_reviewer`/`academic_admin`/`super_admin` for drafting, `moderator_reviewer`/`academic_admin` with `requiresNonCreator: true` for first approval, `academic_admin`/`super_admin` with `requiresApproval: true` for ranked publish) before this task began, matching COM-006/SCH-001's own precedent of discovering the matrix already had a future task in mind. `question-service.ts` calls `authorize()` with these codes unchanged; `approveQuestionVersion` passes the version's own `createdByUserId` as `object.creatorUserId`, so `authorize()`'s maker-checker check denies a writer approving their own draft (`MAKER_CHECKER_VIOLATION`) before the permission matrix is even consulted, satisfying CLAUDE.md's "creator, first approver, and second approver must be different." `question.ranked_publish`'s `requiresApproval: true` stays informational-only, per IDN-004's own documented precedent - the two-actor REQUEST/DECIDE persistence workflow (ENT-004) is out of this task's scope.

### No new JSON Schema contract - validated by plain TypeScript domain functions

Unlike ENT-001's `entitlement-policy.schema.json` (a pre-existing, Gate-3-reviewed contract), no equivalent question-schema contract exists in `contracts/`. Inventing one now would be scope creep - a new Gate-3 contract needs its own review process per CLAUDE.md's source-of-truth hierarchy. `classification`/`stemDocument`/`explanationDocument`/`bodyDocument` and the answer-key shapes are all validated by plain TypeScript functions in `@superlatif/domain/exam` instead, matching PRG-002/LRN-001/SCH-001's own approach for their JSONB configuration fields.

### Consequences

No attempt engine, scoring engine, ranking, or tryout batch exists in this change - a question/stimulus version's content and answer key can be authored, versioned, and locked, but nothing yet presents a question to a student or scores an attempt against it; `toStudentFacingQuestionView`/`toStudentResponseKind` are the read-model shape a future attempt-presentation task would call, not that task itself. No `apps/web` route calls any of these functions yet - service-layer ready only, the same "service ready, UI deferred" shape every prior task in this series has used. Gate C is not claimed PASS - OD-04 (official current-year SKD rules and academic sign-off) remains open, and nothing in this change depends on or asserts an official scoring rule. `question_assets.storageRef` stays opaque throughout; no object-storage/CDN provider is called anywhere in this task (OD-03 remains open).

Audit findings must update ADR status rather than silently editing conclusions. Minimum founder confirmations:

- OD-04 official current-year SKD rules and academic sign-off, before any ranked-production question content is authored;
- OD-03 final object-storage/CDN provider decision, before `question_assets.storageRef` is resolved against anything real;
- academic review of dok 15 §4/§6's classification and answer-key completeness rules as transcribed here.

## ADR-062 — QST-002: bulk XLSX/ZIP question import collapses dok 15A's async pipeline into validate-then-commit, reuses QST-001's service layer as the ONLY write path, and never writes an archive entry to a real filesystem

**Status:** Accepted
**Date:** 30 August 2026
**Decided during:** QST-002 (idempotent XLSX and ZIP import with validation and rollback).

### The pipeline is collapsed from dok 15A §7's nine-state async model into one synchronous validate-then-commit call

dok 15A §7 defines `awaiting_upload → queued → scanning → parsing → validating → preview_ready → blocked|importing → completed|partial|failed|cancelled`. This task builds no async worker/queue for imports (matching the "service ready, worker/async deferred" shape COM-002/SCH-001 reminders already used) - `runQuestionImportJob` runs the whole thing in one call, in exactly two phases: VALIDATE (read-only - parse the workbook and ZIP, cross-check every row against every other row and against the ZIP's own contents, resolve each row's create/update/revise/skip intent) then COMMIT (one `db.transaction()`, entered only once validation finds zero issues). The founder instruction "Import harus rollback kalau ada error" is satisfied structurally by this split, not by a special-case rollback handler: a content error is caught before any write is even attempted, and a write-time error (a constraint race, for instance) rolls back the whole transaction via Drizzle's own throw-to-rollback semantics. dok 15A §6's own `partial` commit mode (valid rows commit, error rows are simply skipped) is explicitly NOT implemented - this is a scope reduction chosen for this task, not an oversight, and `question_import_jobs.status` only ever takes `completed`/`failed` as a result (its column stays `text`, not a closed enum, so a future async-worker task can widen the vocabulary without a destructive migration).

### Every write in the commit phase calls an EXISTING QST-001 service function - zero second write path

"Reuse service/model QST-001, jangan buat write path kedua" is met literally: `question-import-service.ts` never touches `questions`/`question_versions`/`question_options`/`question_version_secrets`/`stimuli`/`stimulus_versions`/`question_assets` directly. It calls `createQuestionDraft`/`updateQuestionDraft`/`setQuestionOptions`/`setQuestionAnswerKey`/`createStimulusDraft`/`updateStimulusDraft`/`addQuestionAsset`/`addStimulusAsset` unchanged, plus two NEW but structurally identical additions to the same service module - `createQuestionRevision`/`createStimulusRevision` - for dok 15A §6's "Kode lama yang approved, published, atau pernah digunakan tidak ditimpa; mode create_revision membuat version baru" case, which QST-001 itself had no caller for yet (manual authoring never needed to create version N+1 of an already-locked question). Every authorization check, checksum, mutability guard, and answer-key validator QST-001 already built therefore runs unchanged for an imported row exactly as it would for a manually drafted one - including the SAME `assertValidAnswerKey` (not a parallel "workbook completeness" rule set) and the SAME `assertQuestionVersionMutable` lock gate. `assertQuestionPermission` was exported (previously a private helper) so the import job's own upfront authorization check reuses the identical permission-checking code, not a rebuilt one.

### `resolveImportRowIntent` is one pure decision table, shared by questions and passages

dok 15A §6's four cases (new code → create; existing draft/changes_requested + `update_draft` mode → update in place; existing draft/changes_requested + `create_revision` mode → skip, since there is nothing published yet to revise FROM; existing locked (approved/published/archived) → only `create_revision` may touch it, `update_draft` is refused) are one pure function in `@superlatif/domain/exam` (`import-idempotency.ts`), generic over `RecordStatus` rather than question-specific - the same function resolves a `passage_code`'s intent too, since dok 15 already reuses `record_status` for both `question_versions.status` and `stimulus_versions.status`.

### ZIP handling never writes an entry to a real filesystem - zip-slip is closed structurally, not just by validation

Every ZIP entry is read straight into an in-memory `Buffer` (`jszip`'s `entry.async("nodebuffer")`) and handed to `question-asset-repository.ts` as an opaque, content-addressed `storageRef` (`import-asset:sha256:<hex>`) - there is no `fs.writeFile(entryControlledPath, ...)` call anywhere in this task for a malicious path to reach, the same "structural, not conventional" security discipline QST-001 used for its answer-key secret boundary. Path-safety validation (`@superlatif/domain/exam`'s `assertSafeAssetPath`: no `..`, no absolute/drive-letter path, no backslash, no null byte, must resolve under `images/<placement>/`, disallowed/executable extensions rejected outright) runs against jszip's own `unsafeOriginalName` field, not its already-sanitized `name` - jszip normalizes `..`-bearing entries into a clean `name` internally and separately exposes the RAW original name specifically because it "may contain '..' path components that could result in a zip-slip attack" (jszip's own type documentation); validating only the sanitized name would make the traversal check structurally unable to ever see the attack it exists to catch. A single unsafe entry throws immediately and poisons the WHOLE archive - no partial import of "the rest of the ZIP" is possible.

Disclosed, not hidden: `MAX_ASSET_BYTES` (dok 15A §1, 5 MB/asset) is checked AFTER `entry.async("nodebuffer")` fully decompresses one entry into memory, because jszip's public API exposes no per-entry uncompressed-size hint before decompression - a single maliciously crafted entry (tiny compressed size, huge decompressed size) can still spike memory for the duration of that one entry before this module rejects it. dok 15A §1 itself flags its own size limits as requiring a pre-production load test; full zip-bomb hardening (a streaming, bounded-read ZIP reader) is left to that future work, not assumed solved here.

### XLSX parsing is read by header name, and every binary-format test builds its own fixture at test time

`exceljs`/`jszip` are new runtime dependencies of `@superlatif/db` (never `@superlatif/domain`, which stays free of vendor SDKs per `scripts/check-workspace-boundaries.mjs`'s `PURE_PACKAGES` rule). `xlsx-parser.ts` reads each dok 15A §3 sheet (Questions/Options/Statements/NumericAnswers/Passages/Assets/Instructions) by HEADER NAME on row 1, not fixed column position, so column reordering does not silently misparse a workbook. No binary XLSX/ZIP fixture file is checked into the repository - every required test (`question-import-service.integration.test.ts`) builds its own real workbook/ZIP bytes at test time using `exceljs`'s and `jszip`'s own writer APIs, then feeds those bytes through the exact same parser production code uses, the same "synthetic, generated, never hand-authored binary fixture" discipline this codebase already uses for JSON fixtures.

### Scope reductions made explicit, not silent

- **Numeric min/max ranges are not supported.** dok 15A §4 allows "exact value atau min/max" for numeric answers; QST-001's own `NumericAnswerKey` type (already shipped, already tested) only carries `acceptedValue`/`tolerance`/`unit`. A workbook row supplying only `min`/`max` without `accepted_value` is rejected with an explicit `numeric_range_not_supported` issue rather than silently coerced or accepted - extending QST-001's shared answer-key type is left to a future task.
- **A `passage_code` referenced by a question must have its own row in the SAME workbook's Passages sheet.** Cross-job passage reuse (referencing a passage imported by an earlier, separate job) is not resolved by this pipeline; an unresolved reference is a validation issue (`unknown_passage_code`), not a silent skip.
- **Activation scope / exam family gating (dok 15A §8) is not modeled at all.** No `exam_families`/blueprint/activation-scope table exists yet (later EXM-series scope); this task does not read, validate, or store an activation scope value.
- **Inline image alt-text/purpose columns are supported for stem/option/passage images** (dok 15A §3: "Profil sederhana tetap membawa alt text dan kolom purpose untuk media"); the Assets sheet remains the path for explanation-placement images, which have no inline column of their own.

### Consequences

No admin upload route, no preview UI, no moderation/approval workflow for imported drafts (QST-003's own scope) exists in this change - `runQuestionImportJob` is a service-layer entry point only, callable but not yet wired to any `apps/web` route. Gate C is not claimed PASS - OD-04 remains open, and nothing in this change asserts an official scoring rule. No object-storage/CDN provider is called anywhere in this task; `storageRef` values remain content-addressed opaque strings (OD-03 remains open).

Audit findings must update ADR status rather than silently editing conclusions. Minimum founder confirmations:

- OD-04 official current-year SKD rules and academic sign-off, before any ranked-production content is imported;
- OD-03 final object-storage/CDN provider decision, before `question_assets.storageRef` values from an import are resolved against anything real;
- a pre-production load test against dok 15A §1's own stated limits (workbook/ZIP size, question/option counts, per-asset size) before this pipeline is exposed to untrusted uploaders;
- a decision on whether dok 15A §6's `partial` commit mode is required before production use, given this task's atomic-only implementation.

## ADR-063 — QST-003: preview reuses `toStudentFacingQuestionView` with no second serializer, `question_version_reviews` is a new append-only audit trail QST-001 never built, approval now requires a dok 12 §31 checklist, and `packages/ui` gets its first exam-domain component

**Status:** Accepted
**Date:** 30 August 2026
**Decided during:** QST-003 (preview, moderation, approval, and revision workflow).

### Preview is assembly, not a second serializer

dok 12 §29 "A06" section 8 ("Preview desktop/mobile") and §31 "A09" ("Student preview di tengah") both require a moderator to see exactly what a student would see before approving. `question-preview-service.ts#buildQuestionPreview` composes QST-001's own read functions (question/stimulus/option/asset repositories) into the exact input shape `toStudentFacingQuestionView` (QST-001, unchanged) already expects, then calls that one function - "Preview wajib pakai toStudentFacingQuestionView" (founder instruction) is met by construction, not convention: this file never imports `question-secret-repository.ts` at all, so there is no answer-key/weight field anywhere in its reachable code to accidentally serialize. `assetId` on a preview asset is the asset row's own UUID, never `storageRef` - the same "one indirection short of a real, resolvable reference" discipline QST-001's own student-view.ts module doc already commits to.

### `question_version_reviews` is a genuinely NEW concern - QST-001 never persisted moderation actions at all

Before this task, `requestQuestionVersionChanges` REQUIRED a non-empty `reason` (`QuestionReasonRequiredError`) but then DISCARDED it - nothing recorded who requested what changes or why, and `submitQuestionVersionForReview`/`approveQuestionVersion`/`publishQuestionVersion`/`archiveQuestionVersion` left no trace beyond the version's own current `status` column. This is a real gap against dok 12 §31's "open history" action and the founder instruction "rejected revisions harus preserve history" - a `changes_requested → in_review → approved` cycle would otherwise be indistinguishable from a question that sailed through review untouched. `question_version_reviews` is a new, append-only table (one row per moderation action: `submitted_for_review`/`changes_requested`/`approved`/`published`/`archived`), the same "history preserved via an event log, never an update-in-place" pattern `purchase_events`/`grant_events`/`role_assignment_events` already use elsewhere in this codebase. Every one of the five question-service.ts transition functions now writes its status change and its review-log row in the SAME `db.transaction()` - the audit trail can never disagree with the status it describes. Scoped to `question_versions` only in this task; stimulus review history is not modeled (`questionVersionId` is `NOT NULL`, not the nullable XOR-owner shape `question_assets` uses) - a deliberate, narrower scope than symmetry would suggest, left for a future task if stimulus-level moderation history is ever needed.

### Approval now requires dok 12 §31's nine-item checklist - enforced, not decorative

dok 12 §31 "A09 — Review Queue" names a "Checklist minimum" (classification correct, stem clear, options complete, answer/scoring correct, explanation adequate, media readable, source and usage rights, accessibility metadata, not a real duplicate). Previously nothing in this codebase enforced that a reviewer had actually checked any of this before approving. `approveQuestionVersion`'s signature now REQUIRES a `ReviewChecklist` (`@superlatif/domain/exam`, transcribing those nine items as booleans); `assertReviewChecklistComplete` throws `ReviewChecklistIncompleteError` if any item is unchecked, and the checklist itself is persisted on the `approved` review-log row for later audit. This check runs AFTER `authorize()`'s maker-checker check, not before - the established order in this codebase is always "who is allowed" before "is the content actually ready," so a self-approval attempt is still denied first regardless of checklist completeness. This is a breaking change to `approveQuestionVersion`'s existing signature (not a new parallel function) - both call sites in QST-001's own integration test were updated to pass a checklist, matching CLAUDE.md's "no second write path" instruction extended to its logical conclusion: one canonical approval action, always gated the same way, not an easier-to-call unchecked variant left lying around.

### `packages/ui` gets its first exam-domain component - typed to match `StudentFacingQuestionView`'s shape structurally, never importing it

`scripts/check-workspace-boundaries.mjs`'s layering matrix allows `packages/ui` to depend only on `@superlatif/contracts` - it cannot import `@superlatif/domain` directly, by design (ADR-042), to keep the design-system package presentation-only. `QuestionPreviewCard`'s prop type (`QuestionPreviewData`) is therefore written locally, matching `StudentFacingQuestionView`'s shape field-for-field rather than importing it; the `apps/web` route (which CAN depend on both `@superlatif/domain` and `@superlatif/ui`) passes a real `StudentFacingQuestionView` value straight through, and TypeScript's structural typing accepts it with zero runtime conversion. Every rendered input is `disabled`/`readOnly` - dok 12 A06 §8 is explicit this section is a preview, not an answerable surface - and no correctness/weight indicator is rendered anywhere, because none exists on the type to render. `packages/ui`'s own module doc already anticipated this: "Exam, admin ... components ... are added by whichever task first needs them - not built ahead of a real consumer." This is that task.

### `/admin/questions/[versionId]/review` is read-only in this task - the write actions exist and are tested, just not wired to a button yet

The new route follows `/programs/[programCode]` (PRG-001)'s own precedent exactly: a `?userId=` query param as an explicit, clearly-labeled development/demo auth-stub seam (not a real session), full state coverage (no-session empty state, denied state via `QuestionActionNotAuthorizedError`, not-found state, a caught-technical-error state, and the ready state), and authorization decided entirely inside the composed service function, not the route. It renders the preview and the full review history - proving those two read surfaces are real UI, not only backend functions, the same standard PRG-001 set for "denied is a real page, not just a function result." `approveQuestionVersion`/`requestQuestionVersionChanges` are fully built, checklist-gated, and integration-tested (`question-moderation.integration.test.ts`) but this task does not wire an interactive Approve/Request-changes button - that is left to a follow-up task, the same "service ready, write-action UI deferred" shape every prior program/commerce task in this series has used. No local Postgres is available in this environment (the same limitation PRG-001's ADR-046 already documented); visual mobile/desktop verification of `QuestionPreviewCard` itself was done via a temporary fixture-data route, screenshotted at 375px and 1280px, then deleted before this PR - it is not part of the shipped diff.

### Consequences

No attempt engine, scoring engine, ranking, or tryout batch is touched. Gate C is not claimed PASS - OD-04 remains open. No new JSON Schema contract; the checklist and preview types are plain TypeScript, matching every prior task's approach for their own JSONB/UI-adjacent shapes.

Audit findings must update ADR status rather than silently editing conclusions. Minimum founder confirmations:

- a decision on whether `apps/web`'s Approve/Request-changes actions should be wired next, or whether A05 (Question Bank list)/A07-A08 (Bulk Import UI) take priority first;
- OD-04 official current-year SKD rules and academic sign-off, before any ranked-production question content is reviewed against this checklist as a proxy for official quality sign-off;
- a decision on whether stimulus-level review history is needed before stimulus content reaches production use.

## ADR-064 — EXM-001: exam blueprint `config` conforms exactly to the pre-existing `contracts/exam-blueprint.schema.json`, AJV validates it on every write, `scoringPolicyRef` is embedded IN the blueprint document (not an independent form-level pairing), and `activationScope=production` is refused unconditionally at the code level

**Status:** Accepted
**Date:** 30 August 2026
**Decided during:** EXM-001 (exam family, versioned blueprint, form, and publication validation).

### A pre-existing, reviewed Gate 3 contract was discovered mid-implementation - the semantic conflict was stopped and reported, then this task's design was reshaped to conform to it

This task's schema/domain layer was FIRST built independently from dok 21 §9's ERD prose, before `contracts/exam-blueprint.schema.json` - a pre-existing, already-reviewed JSON Schema contract, unrelated to this task's own commits - was noticed while reading `pnpm run verify`'s own `contracts:validate` output. Its shape differed materially from the first draft (an embedded `scoringPolicyRef` rather than a form-level pairing; a structured `navigation` object; a structured `resultPolicy` with cross-field rules; a richer `approval` object with per-track academic/technical/regulatory sign-off). Per CLAUDE.md's source-of-truth rule ("If a lower layer conflicts with a higher layer, stop the semantic change... wait for the appropriate owner"), implementation stopped before any commit/PR, the conflict was reported in full, and the founder chose to reshape this task's implementation to conform to the contract exactly, with AJV enforcement mirroring `policy-repository.ts`'s own pattern - not to proceed with the independently-designed shape, and not to treat contract conformance as a deferred follow-up gap. Everything below describes the RESHAPED, contract-conformant design; nothing in this task's shipped code diverges from `contracts/exam-blueprint.schema.json`.

### `exam_blueprint_versions.config` holds the FULL contract document - validated by AJV on every write, mirroring `access_policies.config`/`entitlement-policy.schema.json` (ENT-001) exactly

`packages/db/src/exam/config/exam-blueprint-schema-validator.ts` is `policy-repository.ts`'s own `loadValidator`/`assertValidPolicyConfig` pattern, verbatim: AJV2020 + `ajv-formats`, loaded via `node:fs` (never a static import, so it cannot end up in a browser bundle), compiled once and cached. `createExamBlueprintVersionDraft` AND `updateExamBlueprintVersionDraft` both call it BEFORE writing - "draft rows are not exempt from validation," the same phrase `policy-repository.ts`'s own module doc uses. `activationScope`/`title` stay real, queryable columns in addition to also appearing inside `config`, the same intentional duplication `access_policies.code`/`version`/`title` already has alongside its own `config` column.

### `scoringPolicyRef` is embedded IN the blueprint document - this is why the publication validator collapsed from two stages to one

The contract's own schema requires `scoringPolicyRef: {code, version, checksum}` as a top-level blueprint field - the blueprint document itself declares which scoring policy it uses, checksummed for integrity. This directly changed the design from an EARLIER (pre-contract-discovery) plan where scoring was only paired at the exam-form level: `approveExamBlueprintVersion` now RESOLVES `config.scoringPolicyRef` against a real `scoring_policy_versions` row (`resolvePublishedScoringPolicyRef` - must exist, must be `published`, and its stored `checksum` must equal the ref's `checksum`, the one piece of referential integrity AJV's string-PATTERN check on `checksum` cannot provide) and runs the FULL fail-closed publication check at that point - `@superlatif/domain/exam#assertBlueprintVersionPublishable` (activation-scope hard gate, `assertSectionCodesUnique`, the per-section timing-sum invariant, AND the scoring/structure cross-reference, `assertScoringPolicyConsistentWithStructure`, dok 17 §12) - all in ONE stage, not two. `createExamFormDraft` reuses the exact same resolution to DERIVE the form's `scoringPolicyVersionId` from the blueprint it pins, rather than trusting an independently caller-supplied value that could disagree with what the blueprint itself declares; `approveExamFormVersion` therefore only needs to run `assertExamFormComposable` (item section/type/published-status/count checks) - the scoring cross-reference already ran, and cannot have changed, since the blueprint is published/immutable by the time any form can reference it.

### AJV owns structural/enum/pattern/cross-field validation; the domain layer keeps only what JSON Schema cannot express portably

Because every draft write is now AJV-validated against the full contract, the domain layer's own earlier hand-rolled structural checks (per-field presentation validity, structure well-formedness) became redundant and were removed. `@superlatif/domain/exam` keeps exactly three pure checks, matching the schema's own `x-superlatifSemanticInvariants` annotation and dok 17 §12's own words about what JSON Schema cannot compare: section-code uniqueness (`assertSectionCodesUnique`), the per-section timing sum (`assertBlueprintTimingConsistent`, `SECTION_DURATION_SUM`), and the scoring/structure cross-reference (`assertScoringPolicyConsistentWithStructure` - no contract exists for scoring policy itself, so this stays this task's own design). `BlueprintSection.allowedQuestionTypes` reuses `WorkbookQuestionType` (QST-002's `import-row-mapping.ts`) rather than inventing a third vocabulary - the contract's own enum (`single_choice`/`multiple_choice`/`statement_true_false`/`weighted_choice`/`numeric`) is IDENTICAL to dok 15A's workbook vocabulary QST-002 already modeled, checked against QST-001's `true_false` schema vocabulary via the SAME `mapWorkbookQuestionType` translator QST-002 already built, not a second one.

### The mutable-in-place lock rule is reused, not reimplemented, via one generic wrapper

`@superlatif/domain/exam/exam-config-lifecycle.ts` imports and re-exports QST-001's own `isQuestionVersionLocked`/`assertValidQuestionStatusTransition` unchanged (that module's own doc already says the rule "is not question-specific - it is the recordStatus workflow's own lock point") and wraps them with an artifact-kind-aware error (`ExamConfigVersionLockedError`, naming `blueprint_version`/`scoring_policy_version`/`exam_form_version` explicitly) so a blueprint's error message never says "question version" by accident. This is a SEPARATE concern from `config.approval.status` (the contract's own academic/technical/regulatory sign-off tracking, validated as ordinary document content, draft/in_review/approved/active/retired) - the exact same split `access_policies.status` (my mutability gate) / `access_policies.config` (validated document content) already models.

### "Form snapshot pin exact question version" is a plain FK, not a copy - and forms require ALREADY-published inputs

`exam_form_items.questionVersionId` is a direct foreign key into QST-001's own `question_versions.id` - EXM-001 owns zero question content tables. `createExamFormDraft` requires the blueprint version it pins to already be `published` (`ExamFormPrerequisiteNotPublishedError` otherwise) - a form can only ever snapshot already-locked, immutable configuration, never a still-editable draft that could shift under it before the form itself locks. Once the form version locks, `replaceExamFormItems` (which mirrors `question-repository.ts#replaceQuestionOptions` exactly - whole-set replace in one transaction) is refused by the same generic lock guard, so the exact question version IDs a locked form points at can never change again.

### `activationScope=production` is refused UNCONDITIONALLY at the code level - stricter than, and never contradicting, the contract's own conditional rule

The contract's own `allOf` rule says `activationScope=production` is valid only if `approval.status=active` - a CONDITIONAL permission. This task's `assertActivationScopeNotProduction` (`@superlatif/domain/exam`) is stricter: it refuses `production` UNCONDITIONALLY, regardless of `approval.status` or actor role, because OD-04 (official current-year SKD rules and academic sign-off) is still open and no family in this task has any of dok 17 §3's activation-gate evidence. Since `approval.status=active` never legitimately occurs in this task either, the two rules never actually disagree in practice - this task's code path is a strict subset of what the contract would otherwise permit, matching CLAUDE.md's own hard-gates list ("Do not activate production commerce, ranked SKD, or legacy migration merely because code exists") literally rather than leaving it to reviewer discipline or the contract's own conditional alone.

### New permission codes - a documented gap-fill, not a transcription

Unlike `question.*` (QST-001, reused unchanged from an existing dok 24 §6 matrix row) or `live.occurrence.manage` (SCH-001, same), dok 24 §6's own RBAC table has NO dedicated row for blueprint authoring/approval - only §7 "High-risk workflows" names "blueprint/scoring publish" as requiring the same reason+preview+audit+peer-approval treatment as every other high-risk item. `exam.blueprint.draft.write`/`first_approve`/`publish` were added to `permissions.ts`, deliberately mirroring `question.*`'s exact three-tier shape (the closest existing precedent for "author, independent first reviewer, second high-risk publish approval") rather than inventing a new one. Granted to `academic_admin` (full) and `moderator_reviewer` (`first_approve` only, matching their broad first-approve role across `question.*` already) and `super_admin` (full) - `tutor_writer` deliberately does NOT get `draft.write` here, since authoring exam structure/timing/scoring policy is a different discipline than authoring question content.

### Consequences

No attempt engine, scoring engine, ranking, or tryout batch exists in this change - a blueprint/scoring-policy/form can be authored, versioned, cross-validated, and locked, but nothing yet starts an attempt against a form or scores one (ATM-series scope). No `apps/web` route calls any of these functions yet. Gate C is not claimed PASS - OD-04 remains open, and every scoring-policy/blueprint fixture in this task's own tests uses clearly synthetic smoke-test numbers and codes (dok 17 §4's own fixture style), never a real 2026 regulatory value. `activationScope` never reaches `production` anywhere in this task's code paths. No JSON Schema contract exists for scoring policy or exam form composition - those stay this task's own TypeScript-validated design, matching PRG-002/LRN-001/SCH-001/QST-series's approach for their own JSONB configuration fields; `exam-blueprint.schema.json` was the one artifact that already existed and is now the one this task's blueprint config is measured against.

Audit findings must update ADR status rather than silently editing conclusions. Minimum founder confirmations:

- OD-04 official current-year SKD rules and academic sign-off, before any blueprint/scoring policy is authored with real threshold/category values;
- a decision on which family EXM-002 (tryout batch/sales/attempt/release/leaderboard windows) targets first;
- academic review of the dok 17 §12 threshold-rule vocabulary (`section_score_gte`/`total_score_gte`/`selected_section_minimum`/`no_threshold`) as transcribed here, before it is extended with real category rules;
- confirmation that no other pre-existing `contracts/` artifact was missed for EXM-002 and later exam-engine tasks - this task's own discovery came from reading verify output after the fact, not from a proactive `contracts/` inventory before design, and that process gap should not repeat.

## ADR-065 — EXM-002: tryout batch state is server-derived (never a stored column), `batch_windows` is a relational per-type table with an eight-value owned vocabulary, and sales/access reuse COM-001/ENT-001 with zero new commerce code

**Status:** Accepted
**Date:** 30 August 2026
**Decided during:** EXM-002 (tryout batch, sales, attempt, release, and leaderboard windows).

### Scope: batch + independent windows only - attempt engine, scoring, ranking computation, and notification delivery are explicitly out

Per the founder's explicit instruction, this task builds ONLY the batch record and its independent windows. `start`/`answer`/`submit`/scoring (ATM-series), actual leaderboard ranking computation and result scoring (SCR-series, needs attempt data that does not exist yet), and notification delivery (NTF-series) are untouched. dok 18's own title bundles "batch, sales, attempt, release, and leaderboard windows" together, but its §5 ("batch state siswa"), §15 (leaderboard ranking), and §16 (result release) sections each explicitly depend on attempt/purchase data this task does not own - this task builds only the WINDOW/toggle/timing surface those later tasks will read, never the computation itself.

### `contracts/` was inventoried BEFORE design, closing the exact process gap ADR-064 flagged

ADR-064's own "Minimum founder confirmations" named "confirmation that no other pre-existing `contracts/` artifact was missed for EXM-002... this task's own discovery came from reading verify output after the fact, not from a proactive `contracts/` inventory before design, and that process gap should not repeat." This task's kickoff explicitly did that inventory first: `contracts/openapi.yaml`'s `Batch`/`BatchEnvelope` schema component (a real, `scripts/validate-contracts.mjs`-validated Gate 3 API contract) supplies the canonical `windows` field names and the eleven-value `state` enum, both transcribed verbatim below; `contracts/drizzle-schema.ts`'s `examBatches`/`batchWindows` reference tables and `batchWindowType`/`examBatchStatus` enums were read as a strong reference (not a runtime import) for column shape. No dedicated JSON Schema file exists for batch/window (unlike `exam-blueprint.schema.json`), so no AJV validator was needed here - batch configuration is a set of individually-columned, typed facts, not one opaque JSONB document requiring holistic schema validation the way blueprint `config` does.

### `state` is computed fresh from `windows` + governance status + `voidedAt`, never stored - a deliberate, documented divergence from `contracts/drizzle-schema.ts`'s own stored `state` column

The founder's instruction was unambiguous: "Batch state harus server-derived, jangan simpan status mutable." `contracts/drizzle-schema.ts`'s own `examBatches` table stores `state` as a real `examBatchStatus` enum column - this task deliberately does NOT follow that shape, per CLAUDE.md's own source-of-truth rule (an explicit founder instruction for this specific task wins over a lower-layer reviewed-but-non-binding reference artifact), the same class of documented divergence QST-001 already made for `question_options` (relational instead of embedded). `@superlatif/domain/exam#deriveBatchState` mirrors the exact "compute, don't store" shape `deriveOfferSaleState` (COM-001) and `deriveGrantStatus` (ENT-001) already established, and the eleven-value `BatchState` enum (`draft`/`scheduled`/`registration_open`/`exam_open`/`exam_closed`/`scoring`/`provisional_released`/`final_released`/`review_open`/`voided`/`archived`) is transcribed verbatim from `contracts/openapi.yaml`'s `Batch.state` schema - identical vocabulary to `drizzle-schema.ts`'s own `examBatchStatus`, so only the STORAGE strategy diverges, never the vocabulary itself.

This is a narrower, DIFFERENT concept than dok 18 §5's own richer "batch state siswa" (student-facing resolved state, which additionally factors in purchase, effective access, attempt, and result release) - that resolver needs attempt/purchase data this task does not own and is left to a later task to compose on top of `deriveBatchState`, the same way a route composes `getEffectiveAccess` on top of `deriveGrantStatus` today.

### `batch_windows` is a relational, one-row-per-type table (not JSONB, not flat nullable columns) with a DB-level CHECK constraint mirroring the reviewed contract's own shape

Every window is independently addressable (dok 18 §3: "Validation memastikan urutan logis tetapi mengizinkan overlap yang memang dimaksud" - windows are validated for logical order but intentionally allowed to overlap), so `batch_windows` follows `contracts/drizzle-schema.ts`'s own relational table shape rather than folding windows into JSONB or flat per-type nullable columns on `exam_batches` itself. The `batch_window_type` pg enum carries the FULL ten-value canonical vocabulary (including `catalogue`/`sale`) for parity with the reviewed contract, but only EIGHT types (`registration`/`attempt`/`late_sync_cutoff`/`provisional_result_release`/`final_result_release`/`leaderboard_release`/`explanation_release`/`access_end`) are ever written by this task's own code - `catalogue`/`sale` are refused at both the domain layer (`assertBatchOwnsWindowType`) and the db-repository layer (`replaceBatchWindows`) before a row can ever be inserted, per dok 18 §2's explicit boundary: "Harga tidak berada di batch. Exam window tidak berada di offer." A `CHECK` constraint (`batch_window_ranged_shape_ck`) is a second, DB-level guard mirroring the same reviewed shape: `registration`/`attempt` are ranged (`ends_at` required, after `starts_at`); every other type is a single point in time (`ends_at` absent).

`@superlatif/domain/exam#assertBatchWindowsCoherent` enforces only invariants that hold regardless of business model - a ranged window's end after its start, and a downstream milestone (`late_sync_cutoff`, `provisional_result_release`, `final_result_release`, `explanation_release`, `leaderboard_release`, `access_end`) not preceding the upstream one it depends on (attempt end, or the previous release stage) - and deliberately does NOT force adjacency or non-overlap where dok 18 explicitly allows it (e.g. registration may overlap the attempt window).

### `timezone` mirrors `schedule_items.timezone` (SCH-001) exactly - authoring/display only, never the source of truth for a comparison

`exam_batches.timezone` is an IANA zone recorded for authoring/display purposes; `batch_windows.starts_at`/`ends_at` are always the canonical UTC instant, and `deriveBatchState`/`assertBatchWindowsCoherent` only ever compare instants. This is what makes the backlog's "windows are independent and timezone-safe" acceptance criterion hold at the storage/domain layer, not merely in UI code - the same split SCH-001 already established for `live_sessions`.

### "Changing offer windows tidak boleh mengubah attempt/batch history" holds structurally via the SAME generic lock rule blueprint/scoring/form already use, extended to a new artifact kind

`exam_batches.status` reuses `recordStatus` unchanged (draft/in_review/changes_requested/approved/published/archived), and `@superlatif/domain/exam/exam-config-lifecycle.ts#ExamConfigArtifactKind` gained one new member, `"exam_batch"` - no new lock rule was written. A batch locks (its own `windows` become immutable - `replaceBatchWindows` refuses further calls via `assertExamConfigVersionMutable`) the instant `status` reaches `approved`, the exact same point blueprint/scoring/form already lock at. `approveExamBatch` runs the fail-closed publication validator (`assertBatchPublishable`: pinned `exam_form_version` still `published` + window set internally coherent) before allowing that transition, mirroring `approveExamBlueprintVersion`'s own validate-then-lock order. Since no attempt data exists yet in this codebase (ATM-series), "attempt history" protection is necessarily structural rather than data-verified in this task: a published/locked batch's own windows can never be edited in place, only voided (an explicit, once-only, audited fact - `voidedAt`/`voidedReason`, never cleared) or superseded by an entirely new batch code. Separately, COM-001's own `offers`/`product_versions` are already immutable-once-published (ADR-048); this task never copies an offer's sale-window values onto a batch row, so an offer's own version history (which already cannot retroactively rewrite an old, already-referenced offer version) has no path to silently mutate a batch that references it.

### Publication validator is intentionally PARTIAL - dok 18 §12's checklist has ten items, this task owns two

`@superlatif/domain/exam#assertBatchPublishable` checks only what this task actually owns end-to-end: the pinned form version is `published`, and the window set is internally coherent. Attempt-policy validity, scoring-fixture pass, notification-schedule validity, live-ops owner assignment, and support-copy/runbook linkage (dok 18 §12's other five items) are explicitly deferred to the tasks that will own those artifacts - `attempt_policies` does not exist as a table in this codebase yet either. This is documented as a deliberate, narrow validator, not a silent gap.

### Sales side reuses COM-001's `offers`/`products` with ZERO new commerce code - `targetType.exam_batch` already existed before this task

dok 18 §2: "Harga tidak berada di batch. Exam window tidak berada di offer" - price/sale-window stay owned entirely by COM-001's `offers` (`saleStartsAt`/`saleEndsAt`, already on that table); this task's `exam_batches` never stores or duplicates them. The integration point the founder asked this task to reuse ("Sales side harus reuse COM-001 offer/product") was found to already exist: `packages/db/src/schema/enums.ts`'s `targetType` pg enum already listed `"exam_batch"` as a valid value before this task began (added under ENT-001/COM-001), meaning a `product_component` can already claim `exam_batch:<code>` as its `targetType`/`targetRef` with no schema change at all. `examBatchTargetRef(code)` (`packages/db/src/exam/batch/batch-repository.ts`) is a one-line helper mirroring `programTargetRef` exactly, so a future COM-001-facing offer-builder route can target a batch through the exact same mechanism it already uses for programs. `ENT-002`'s `resolveEffectiveAccess` is generic over `targetType`/`targetRef` and needed zero changes either. Actual eligibility/entitlement RESOLUTION for a batch (checking a real purchase + grant) is intentionally left untouched - that composition belongs to whichever future route/task actually calls `resolveEffectiveAccess` for an `exam_batch` target, the same way `openapi.yaml`'s own `Batch.eligibility` sub-object is a read-projection concern this task's own internal model does not build.

### `rankingAttemptRule` is a plain text field, batch-owned per dok 18 §21 RC2 - configuration only, never applied by this task

dok 18 §21's audit resolution RC2 is binding: "Batch adalah satu-satunya pemilik `ranking_attempt_rule`; policy product/blueprint tidak menimpanya." `exam_batches.rankingAttemptRule` (`text`, default `"first"`, validated against `first`/`best`/`latest` by `@superlatif/domain/exam#assertValidBatchRankingAttemptRule`) stores this as configuration, matching `products.type`'s own "free text, not a pg enum" extensibility choice (COM-001) rather than a pg enum - actually COMPUTING which attempt counts requires attempt data this task does not own (ATM-series), so this module only validates and carries the value.

### `batch.publish` (an already-existing permission code) is reused directly for every batch-mutating action - zero new permission codes, and no invented maker-checker requirement

Unlike EXM-001 (which had to add three new `exam.blueprint.*` codes because dok 24 §6's matrix had no row at all), `batch.publish` already existed in `permissions.ts` before this task, granted `"granted"` to `academic_admin`/`super_admin` and `"scoped_nuance"` (not a full grant, ADR-049 fail-closed) to `moderator_reviewer`/`operations_admin`. This single code gates every batch-mutating action in `batch-service.ts` (create, edit windows, submit, request-changes, approve, publish, archive, void), mirroring SCH-001's own single-permission `live.occurrence.manage` shape for an operational/scheduling object, rather than EXM-001's heavier three-tier academic-artifact shape - dok 24 §6's `batch.publish` row carries no "bukan creator" qualifier for any role (unlike `exam.blueprint.first_approve`'s explicit `requiresNonCreator: true`), so `approveExamBatch` deliberately does NOT pass `creatorUserId` into the permission check: `authorize()`'s maker-checker gate is unconditional whenever `object.creatorUserId` is supplied at all, so passing it without a documented basis would have silently invented a same-actor restriction the source table never states. A single `academic_admin`/`super_admin` actor may create, approve, and publish one batch end-to-end - this was caught and fixed via a failing integration test during this task's own implementation, not assumed.

### `voidExamBatch` is a once-only, reasoned, audited fact - never a mutable status flag

dok 18 §17: "Tidak ada bulk extension tanpa impact preview, permission, reason, dan audit." `voidExamBatch` requires a non-empty `reason` (mirroring ENT-001/COM-006's own audit discipline), sets `voidedAt`/`voidedReason` exactly once (`ExamBatchAlreadyVoidedError` on a second call - voiding is a fact, not a toggle), and refuses to void an already-`archived` batch. `deriveBatchState` checks `voidedAt` FIRST, before governance status or any window, so a voided batch's state is unambiguous regardless of what its windows would otherwise say.

### Consequences

No attempt engine, scoring, ranking computation, or notification delivery exists in this change - a batch can be authored, windowed, validated, locked, published, voided, or archived, and its canonical operational state can be read fresh at any instant, but nothing yet starts, answers, submits, or scores an attempt against it (ATM-series), nor computes an actual leaderboard ranking or delivers a scheduled notification (SCR-series/NTF-series). No `apps/web` route calls any of these functions yet. Gate C is not claimed PASS - OD-04 remains open, and every batch/window fixture in this task's own tests uses clearly synthetic dates and codes, never a real 2026 exam schedule. `examBatches`/`batchWindows` are purely additive tables (migration `0016_early_black_bolt.sql`); no existing table or column changed shape.

Audit findings must update ADR status rather than silently editing conclusions. Minimum founder confirmations:

- a decision on when the student-facing composite batch-state resolver (dok 18 §5, needing purchase/effective-access/attempt/result-release data) should be built, and which task owns it;
- confirmation that `attempt_policies` (referenced only in `contracts/drizzle-schema.ts`'s own reference `examBatches.attemptPolicyId`, deliberately NOT built by this task) is correctly scoped to a future ATM-series task rather than EXM-002;
- a decision on which task builds the actual `product_component` → `exam_batch:<code>` targeting UI/route now that the underlying mechanism is confirmed to need no schema change;
- academic/operational review of the eight-window ordering rules in `assertBatchWindowsCoherent` (late-sync-after-attempt-end, provisional-before-final, final-before-explanation, etc.) against real SKD Kedinasan operational cadence, before any batch carries real 2026 dates.

## ADR-066 — ATM-001: attempt start reuses ENT-002/EXM-002 unchanged (zero new access code), snapshot pins pinned FKs + presented order into one checksum, writer lease is a separately-generated credential class, and answer/submit/scoring stay entirely out

**Status:** Accepted
**Date:** 30 August 2026
**Decided during:** ATM-001 (authorized attempt start, immutable snapshot, and resumable state).

### Scope: start + snapshot + resume only - answer save, submit, scoring, and ranking are explicitly out

Per the founder's explicit instruction, this task builds ONLY the attempt-start transaction (dok 16 §5), the presented question/option-order snapshot (dok 16 §6), the writer-lease mechanism that start issues (dok 16 §7), and resume (dok 16 §11). `PUT /attempts/{id}/answers/{instanceId}`, `/submit-summary`, `/submit`, `/result`, `/review`, and `/writer-lease/takeover` (dok 22 §9) are all untouched. `attempts.attemptRevision` exists on the schema (defaulted to `0`) purely so that surface does not require a later migration - nothing in this task's own code reads or increments it.

### `contracts/` was checked BEFORE design, per the two-task-old discipline ADR-064/065 both established

`contracts/openapi.yaml`'s `Attempt`/`AttemptEnvelope`/`AttemptSection`/`StudentQuestionInstance`/`WriterLease`/`AnswerState` schema components (a real, `scripts/validate-contracts.mjs`-validated Gate 3 contract) were read in full before any code was written. The seven-value `status` enum (`created|in_progress|submitting|submitted|scoring|scored|voided`) is transcribed verbatim (also identical to CLAUDE.md's own canonical "Attempt states"), as are `WriterLease.state` (`held_here|held_elsewhere|expired`) and `Attempt.permittedActions` (`answer|flag|navigate|submit|takeover_writer|report_question|view_result`).

One deliberate, documented gap: `StudentQuestionInstance` requires pre-rendered `StudentRichContent` (`renderedHtml`/`plainText`) for `stem`/`stimulus`/`options`/`statements`. No HTML-rendering layer exists anywhere in this codebase - QST-001's own `toStudentFacingQuestionView` has always returned raw JSON documents (`stemDocument: Record<string, unknown>`), and QST-003's admin preview never rendered them either. This task's own `AttemptInstanceView` therefore carries `content: StudentFacingQuestionView` (QST-001's existing type) rather than the contract's own `StudentQuestionInstance` shape - vocabulary/field-naming conformance where it costs nothing (`sequence`, `sectionCode`, `questionVersionId`, `presentedOptionOrder`), explicit divergence where genuine new infrastructure (an HTML renderer) would be required and is out of this task's narrow scope. The same class of decision EXM-002's own batch publication validator already made being deliberately partial.

### The presented-instance snapshot is generated ONCE at start and never recomputed - `questionOrder` is a JSON Schema CONST, `optionOrder="question_policy"` fails closed

`contracts/exam-blueprint.schema.json`'s own `presentation.questionOrder` is a JSON Schema `const: "fixed"` - not even an enum with alternatives - so `@superlatif/domain/exam#buildPresentedInstances` orders every attempt's questions by the pinned form's own (blueprint-declared section sequence, then item order), never a pool or a resample. `optionOrder` DOES have a second contract value, `"question_policy"` (a per-question shuffle flag) - `assertSupportedPresentationPolicy` fails closed on it (`UnsupportedOptionOrderPolicyError`) rather than guessing at a shape: no per-question shuffle field has ever been defined anywhere in `question_versions.classification` (QST-001's own free-form JSONB) or any later task. The HMAC/secure-seed shuffle mechanism dok 16 §6 describes is consequently not built either - it has nothing to seed yet.

### `computeAttemptSnapshotChecksum` is the "Snapshot hash stability" required test, and covers exactly what dok 16 §24 RC2 names

dok 16 §24 RC2 (binding): "Attempt menyimpan FK dan checksum form, blueprint, scoring policy... serta start idempotency key." The checksum covers `batchId`/`examFormVersionId`/`blueprintVersionId`/`scoringPolicyVersionId` plus the FULL presented-instance list (sequence, section, question version, presented option order) - deterministic and order-sensitive, so an accidental reordering changes the hash the same way a changed reference would. `attempt_policy_snapshot` and `accommodation` (also named in RC2) are NOT modeled - `attempt_policies` does not exist as a table anywhere in this codebase yet (EXM-002's own ADR-065 already deferred it), and accommodation is ATM-010/later scope; both are left out rather than guessed at.

### Start is authorized via ENT-002/IDN-004 unchanged - ZERO new access code, because the needed pieces already existed

The founder's instruction was explicit: "Start harus authorized via ENT-002/IDN-004." `resolveEffectiveAccess`'s own `query.action` is a free string (not an enum), so `"start_attempt"` (dok 16 §5's own precondition wording) required no vocabulary addition. More surprisingly, `packages/domain/src/access/attempt-allowance.ts` and its db-layer caller `getAttemptAllowance` (`packages/db/src/access/effective-access-service.ts`) were ALREADY BUILT during ENT-002, months before any EXM-series batch existed - that module's own doc already said "the caller (once EXM-series batches exist) is expected to read the actual limit from the batch's own attempt policy." This task is the first to actually call it. Since no `attempt_policies` table exists yet, `resolveAttemptAllowanceLimit` in `attempt-service.ts` defaults to exactly ONE ranked attempt per (user, batch) whenever `getAttemptAllowance` returns `ownedByBatch: true` or a null cap - a conservative, documented MVP boundary a future ATM/attempt-policy task will loosen, never silently invented as "unlimited."

### "No duplicate attempt" is a database-level partial unique index, not application discipline alone

`attempts_user_batch_active_uq` on `(user_id, batch_id) WHERE status <> 'voided'` refuses a second non-voided attempt row for the same (user, batch) pair structurally - the same class of guarantee EXM-002's own `batch_windows` CHECK constraint and ENT-001's dedup already established for their own invariants. `startOrResumeAttempt` checks for an existing non-voided attempt FIRST and returns it (200-equivalent, `created: false`) for ANY subsequent call regardless of idempotency key - dok 22 §9's own endpoint description, "Start a new attempt or return the learner's resumable attempt," names this duality explicitly. A SEPARATE idempotency-replay check (`attempts_user_idempotency_key_uq`, dok 22 §14) refuses the narrower case of the SAME key being reused with materially different request content (`IDEMPOTENCY_KEY_REUSED`) before the duality check even runs.

One consequence of this MVP shape, documented rather than hidden: because the DB constraint allows at most one non-voided attempt EVER per (user, batch) - not merely one concurrently-open one - `AttemptLimitReachedError` (dok 16 §19's own `ATTEMPT_LIMIT_REACHED`) is currently unreachable through the service's own start-or-resume duality (an existing attempt is always returned as a resume, never re-evaluated against the allowance). It remains fully unit-tested at the pure eligibility layer (`attempt-eligibility.test.ts`) for when a future attempt-policy task allows `allowanceLimit > 1` and the constraint is loosened to match (e.g. adding an attempt-number dimension).

### Writer lease token is its own, separately-generated credential class - deliberately not reusing `secure-delivery.ts`

Mirrors `packages/domain/src/program/secure-delivery.ts`'s own design exactly (random opaque token, only its hash persisted, timing-safe comparison) but as a NEW module (`attempt-writer-lease-token.ts`) rather than calling `generateDeliveryToken`/`hashDeliveryToken` directly - that module's own doc already explains why: "a bug in one generator must never be able to affect the other." `isActive` on `attempt_writer_leases` only ever flips false via an explicit revoke (a future takeover flow, not built here) - never a background expiry sweep; whether an active lease has simply timed out is DERIVED at read time (`deriveWriterLeaseState`, "compute, don't store" again, the same discipline EXM-002 applied to batch state) from `expiresAt` vs `now`. "Renew" is a plain in-place UPDATE of the same row (dok 16 §7's own "diperbarui saat client aktif" - a lightweight heartbeat, not a new credential each time); a genuinely NEW lease row is only ever inserted by `issueLease`, called once at start. Full multi-device explicit-takeover UX remains dok 16 §24's own OPEN decision and is not built - `/writer-lease/takeover` has nothing to protect against yet without answer-save's `WRITER_LEASE_REVOKED` enforcement, which this task also does not build.

"Resume after disconnect" (required test) holds structurally from this shape alone: an expired lease is never an error at resume - `deriveWriterLeaseState` simply reports `expired`, and the resume response still returns full server-authoritative state (deadline, presented order, answers-so-far) regardless of lease status. A fresh device (or the disconnected one, reconnecting) can call `renewWriterLease` or a future takeover to reclaim write access; read access via resume is never gated on lease state at all.

### Resume never leaks answer secrets - by construction, not by discipline alone

`assembleAttemptView` (`attempt-view.ts`) builds each `AttemptInstanceView.content` via `assembleStudentFacingQuestionView` (question-preview-service.ts, extracted from QST-003's own `buildQuestionPreview` this task - see that file's own module doc) - the SAME function QST-003's admin preview already uses, and the same structural guarantee that module's own doc states: it is the only place in that file that ever touches question content, and it never imports `question-secret-repository.ts` at all. `toStudentFacingQuestionView`'s own `StudentFacingQuestionView` type has no field an answer key or option weight could ever be assigned to - a type error, not a review-time discipline failure, the same guarantee QST-001 established and this task inherits unchanged rather than re-derives.

### Consequences

No answer-save, submit, scoring, or ranking exists in this change - a student can start an authorized attempt (checked against real effective access and a real, server-derived batch window), see their exact presented question/option order and deadline, and resume that same state from a different device or after a disconnect, but nothing yet records or scores an answer (ATM-004/005/007 territory) or computes a leaderboard (SCR-series). No `apps/web` route calls any of these functions yet. Gate C is not claimed PASS - OD-04 remains open, and every fixture in this task's own tests uses clearly synthetic dates, codes, and scoring numbers, never a real 2026 SKD threshold. `attempts`/`attempt_question_instances`/`attempt_writer_leases` are purely additive tables (migration `0017_numerous_reavers.sql`); no existing table or column changed shape.

Audit findings must update ADR status rather than silently editing conclusions. Minimum founder confirmations:

- a decision on when a real `attempt_policies` table (allowance beyond the MVP default of 1, resume/ranking/accommodation policy - dok 16 §3's own named concept) should be built, and whether it loosens `attempts_user_batch_active_uq` to allow more than one non-voided attempt per (user, batch);
- a decision on whether `StudentQuestionInstance`'s rich-HTML-content requirement should be built as its own task (an HTML-rendering layer QST-001 never built either) before any `apps/web` route consumes this task's resume view directly;
- confirmation that "exactly one ranked attempt, MVP default" is the correct interim policy for SKD Kedinasan specifically, given OD-04 is still open;
- academic/operational review of the `DEFAULT_WRITER_LEASE_TTL_SECONDS` (120s) provisional value against real network/reconnect behavior, before any batch carries real 2026 dates.

## ADR-067 — ATM-002: mutation-ID dedup records EVERY outcome (not just accepted), a rejected CAS still commits its audit row outside the aborted transaction path, and explicit takeover finally exercises the WRITER_LEASE_REVOKED gate ATM-001 could only declare

**Status:** Accepted
**Date:** 30 August 2026
**Decided during:** ATM-002 (server-authoritative lease, timer, autosave, and offline recovery).

### Scope: answer save + writer-lease enforcement/takeover + server-authoritative timer + offline-reconnect idempotency only

Per the founder's explicit instruction, this task builds ONLY answer-save's full CAS pipeline (dok 16 §8), the timing-window decision (§10), fail-closed lease enforcement plus explicit takeover (§7), and the storage-layer mechanism behind offline-reconnect idempotency (§9). Final submit, scoring, ranking, explanation/review, and any full tryout UI remain untouched - the same boundary ATM-001 already drew, moved one step further down dok 16 §3's own concept list (`Answer state`/`Answer mutation` are now built; `Submission`/`Result version` still are not).

### `contracts/openapi.yaml`'s `AnswerSaveRequest`/`AnswerState`/`AnswerConflict`/`WriterLeaseEnvelope` were checked before design, same discipline as every prior task since ADR-064

`SingleChoiceAnswer`/`MultipleChoiceAnswer`/`StatementAnswer`/`NumericAnswer` and their `kind` discriminators are transcribed verbatim into a NEW type family (`answer-payload.ts`) deliberately separate from `answer-key.ts`'s `AnswerKey` (QST-001) - that module's own doc already states the precedent this follows: a student payload has no field a correct answer or weight could ever be assigned to, by construction, not by review discipline. One genuine vocabulary surprise found by this check: the contract's own `answer.kind` for a `true_false` question is `"statement_true_false"`, NOT `"true_false"` - a different string than `student-view.ts`'s own `StudentResponseKind` ("true_false", used for rendering). `toAnswerKind` is kept as its own, separate mapping rather than forcing two independent, already-tested vocabularies to agree just because they look similar.

### The CAS decision (`resolveAnswerSaveOutcome`) is dok 16 §8 steps 5-8, transcribed as one pure three-way branch

`accepted` (expectedRevision matches current, revision increments by exactly 1), `idempotent_replay` (stale expectedRevision but the submitted payload already equals what's current - dok 16 §8 step 7), `conflict` (stale AND genuinely different - dok 16 §8 step 8, "409 ANSWER_REVISION_CONFLICT dengan safe current state"). Payload equality is its own structural comparison per answer kind (multiple_choice is set-equality, not array-order-equality; numeric is exact string comparison, never coerced to a float) - this is what makes "Answer save harus monotonic/revision-safe, tidak boleh lost update" hold for every question type, not just single_choice.

### Mutation-ID dedup records EVERY outcome, not only `accepted` - this is the actual mechanism behind BOTH "Duplicate answer request" and "Offline reconnect"

dok 16 §8 step 3 ("Deduplicate client_mutation_id") runs BEFORE the CAS comparison, and dok 22 §14's own idempotency contract requires "same key + same hash returns recorded outcome" for every outcome, not just success. If only `accepted` mutations were stored, a RETRY of a request that originally resulted in `conflict` would re-run the CAS again - against whatever the current state has since become - and could produce a DIFFERENT answer on retry than the client's first attempt got, which is not idempotent at all. `answer_mutations` therefore stores a row for `accepted`, `idempotent_replay`, `conflict`, AND `late_sync_recovery_candidate` alike, keyed by `(attempt_id, instance_id, client_mutation_id)` with a real unique constraint - `saveAnswer`'s very first substantive step is looking this table up and, on a hit, reconstructing the ORIGINAL response (re-querying live `answer_states` only for the `conflict` case, so a stale replay still reports the truly current server state) rather than ever re-running the CAS. This single mechanism is what makes "Offline reconnect harus idempotent dan tidak menggandakan answer" and "Duplicate answer request" (both required tests) hold - they are, from the server's own point of view, the identical code path: a retried mutation ID, whether the retry came from a flaky network or a client replaying its local offline queue after reconnecting.

A retry with the SAME mutation ID but DIFFERENT content (`expectedRevision` or `payload` mismatched against the stored row) is refused with `AnswerMutationIdReusedError` (dok 22 §14's own `IDEMPOTENCY_KEY_REUSED`) - the exact same pattern ATM-001's own `attempts.start_request_hash` already established for start-idempotency, applied here at the per-mutation grain via a stored `expected_revision` + `payload` comparison rather than a checksum column.

### A `conflict` outcome still COMMITS its audit row - it does not throw from inside the transaction

The naive implementation - `throw` the moment a conflict is detected, inside the same `db.transaction()` that also inserted the mutation row - would roll back that insert along with everything else, silently defeating the dedup mechanism above (a retry of a conflicted mutation ID would find NOTHING stored and re-run the CAS from scratch, against a possibly-different current state). `saveAnswer` instead returns a plain discriminated result FROM inside the transaction (so it commits normally, mutation row included) and only inspects that result and throws AFTER the transaction has committed. This is a subtle but material correctness detail this task got right by tracing through the retry scenario explicitly, not by assumption.

### Writer-lease enforcement is now exercised, not merely declared - `assertWriterLeaseValidForWrite` fails closed on anything but `held_here`

ATM-001 built `deriveWriterLeaseState` but nothing yet CALLED it as a write gate (no write path existed to gate). This task adds `assertWriterLeaseValidForWrite` (`attempt-writer-lease.ts`): `WRITER_LEASE_REQUIRED` when no token is presented at all, `WRITER_LEASE_REVOKED` for every other non-`held_here` state (held elsewhere, or expired) - dok 16 §19's own two stable codes, chosen deliberately over inventing a third. "Multi-device lease conflict harus fail-closed" holds by construction: there is no code path in `saveAnswer` that skips this check, and the check itself has exactly one success state.

`takeoverWriterLease` (new) is the OTHER half ATM-001's own module doc explicitly deferred - "the takeover endpoint is a later ATM task once answer-save/WRITER_LEASE_REVOKED enforcement exists to actually need it." It revokes whatever lease is currently active (dok 16 §7: "Takeover membatalkan lease lama dan dicatat" - `revokeActiveLease`'s own `reason` column records `"explicit_takeover"`) and issues a fresh one; the device that lost the lease learns on its VERY NEXT write attempt, via the same fail-closed gate above, not via any push notification or polling this task does not build. "Two-device lease conflict" (required test) is exactly this sequence.

### Timer is server-authoritative by construction, not by convention - `evaluateAnswerTimingWindow`'s own signature has no channel for a client timestamp

dok 16 §10: "Client menghitung tampilan dari server time offset tetapi server memutuskan." `evaluateAnswerTimingWindow(now, deadlineAt, lateSyncCutoffAt)` takes exactly the server's own resolved `now` and two already-persisted server `Date`s - `captured_at_client` (dok 16 §8's own telemetry-only field) is not even a parameter this function could accept. "Clock manipulation" (required test) includes a case that explicitly forges `capturedAtClient` to claim an answer was submitted hours earlier while the SERVER clock is already past the late-sync cutoff - the save is still rejected, proving the forged value has literally no code path into the decision.

Three windows, mirroring dok 16 §10/§24 RC2 exactly: `normal` (before `deadlineAt`) runs the ordinary CAS and updates `answer_states`; `late_sync_recovery_candidate` (`deadlineAt` to `lateSyncCutoffAt`) is recorded in `answer_mutations` with that outcome but NEVER applied to `answer_states` (dok 16 §24 RC2: "tidak otomatis masuk answer set/scoring" - a later adjudication task, not built here, decides accept/reject); `rejected` (at/after `lateSyncCutoffAt`) refuses the write outright with `ATTEMPT_DEADLINE_PASSED` before any row is inserted - dok 16 §10's own allowance to "also" capture a rejected mutation as diagnostic telemetry is explicitly NOT built (documented, not silently dropped).

### `answer_states` (authoritative current) and `answer_mutations` (append-only log) are two tables, mirroring dok 16 §3's own concept split

The exact same event-log-plus-current-projection shape this codebase already uses elsewhere (COM-002's raw/normalized commerce events). `answer_states.revision` starts implicitly at 0 (no row = revision 0, payload null) and is written to ONLY from the CAS `accepted` branch, always as `current + 1` - never a caller-supplied number - which is what makes "monotonic" hold at the storage layer, not merely in application code. `attempts.attemptRevision` (the coarser, attempt-wide counter ATM-001's own schema reserved for this) is bumped atomically (`revision + 1` at the database, not read-then-write) inside the same transaction as every accepted mutation - a separate granularity from the per-instance `answer_states.revision`, intended for a future submit task's own optimistic-concurrency check (`SubmitRequest.expectedAttemptRevision`, `contracts/openapi.yaml`), not read by anything this task ships itself.

### `assembleAttemptView`'s `answers` field is now real - the extension ATM-001's own module doc predicted

ATM-001 hardcoded `answers: []` with an explicit comment: "the FIELDS still exist... so a later task extends this same view rather than building a second, competing one." This task is that later task: `listAnswerStatesForAttempt` now feeds the resume/start view's `answers` array, so a resumed attempt genuinely shows the student's saved answers and revisions, matching dok 16 §11's own resume contract - no second, competing answer-projection was built.

### Consequences

No final submit, scoring, ranking, explanation/review, or full tryout UI exists in this change - a student can save/resave answers with full revision-safety, have their offline queue replay safely on reconnect, lose or reclaim write access across devices with a clear signal, and see their exact saved answers on resume, but nothing yet finalizes an attempt or scores one (ATM-series submit/SCR-series). No `apps/web` route calls any of these functions yet. Gate C/D are not claimed PASS - OD-04 remains open, and every fixture in this task's own tests uses clearly synthetic dates, codes, and answer values, never a real 2026 SKD scenario. `answer_states`/`answer_mutations` are purely additive tables (migration `0018_material_mojo.sql`); no existing table or column changed shape.

Audit findings must update ADR status rather than silently editing conclusions. Minimum founder confirmations:

- a decision on when the late-sync adjudication workflow (accept/reject a `late_sync_recovery_candidate` mutation into the authoritative answer set, dok 16 §17's own incident-adjudication territory) should be built, and which task owns it;
- a decision on whether rejected (past-cutoff) mutations should ALSO be captured as diagnostic telemetry (dok 16 §10's own "dapat," optional) - not built by this task;
- confirmation that the DEFAULT_WRITER_LEASE_TTL_SECONDS (120s, ATM-001's own provisional value) is adequate once a real client's actual heartbeat/renewal cadence is measured under load;
- a decision on flag-setting (`PUT /attempts/{id}/flags/{instanceId}`) - explicitly not built by this task either, though it shares the same attempt/writer-lease machinery this task just built.

## ADR-068 — ATM-003: submit and timeout finalization share one race-safe function, `transitionAttemptStatus` drops its own nested transaction so submit stays atomic, and a driver-error `.cause` bug was caught by the "Expiry race" test it was written to satisfy

**Status:** Accepted
**Date:** 31 August 2026
**Decided during:** ATM-003 (final submit, timeout auto-submit, and attempt audit telemetry).

### Scope: final submit + timeout auto-submit + audit telemetry only

Per the founder's explicit instruction, this task builds ONLY dok 16 §13's submit contract and §21's observability/audit telemetry - no scoring engine, no ranking, no pembahasan/explanation release, no full tryout UI. `Submission` and the append-only audit log are the two dok 16 §3 concepts this task adds; `Result version`/ranking remain untouched (SCR-series territory). A scoring job is enqueued into a transactional outbox but nothing in this task, or any task before it, ever consumes that table.

### `contracts/openapi.yaml`'s `SubmitRequest`/`SubmissionEnvelope`/`ResultState`/`Attempt.submissionState` were checked before design, same discipline as every prior task since ADR-064

`SubmitRequest` {mutationId (uuid), leaseToken, expectedAttemptRevision, acknowledgedUnansweredCount?} is transcribed as `SubmitTrigger`'s `"user"` variant. `ResultState` (`processing|provisional|final|corrected|withheld|voided`, CLAUDE.md canonical) is transcribed verbatim but this task's own response only ever produces the literal `"processing"` - no `results` table exists yet, so nothing else in the enum is reachable from this code. `Attempt.submissionState`'s `ready`/`blocked_unsynced` distinction (the full submit-summary feature) is explicitly NOT built - out of this task's narrow acceptance criteria - leaving that field's fuller behavior for a later task.

### One function serves both a user-submit and a timeout-submit - this is what makes the race-safety argument actually hold

`submitAttempt(db, attemptId, trigger, now)` takes a `SubmitTrigger` discriminated union (`{kind:"user", userId, mutationId, leaseToken, expectedAttemptRevision, acknowledgedUnansweredCount?}` vs `{kind:"timeout"}`) rather than being two separate functions. dok 16 §13 explicitly allows "Scheduler/worker DAN request path... memicu finalization" - if these were two independently-written code paths, "user-submit vs timeout-submit race menghasilkan tepat satu submitted snapshot" would depend on both authors independently getting the same check-existing-first-then-insert sequence right. One function removes that risk by construction: both triggers funnel through the identical existing-submission check, `assertAttemptSubmittable`, snapshot freeze, and transactional insert - only the user-specific lease/revision validation branches on `trigger.kind`.

`finalizeExpiredAttemptIfDue(db, attemptId, now)` is a thin, timeout-specific wrapper: it fires at `attempt.lateSyncCutoffAt`, not `deadlineAt` - deliberately later than the deadline. Recovery-candidate mutations (ATM-002) never touch `answer_states` regardless of when they arrive, so the frozen snapshot `submitAttempt` produces is already stable by `deadlineAt`; waiting for the FULL cutoff instead simply respects the entire late-sync recovery grace window dok 16 intends before an attempt is declared closed, rather than cutting that window short.

### `transitionAttemptStatus` lost its own nested `db.transaction()` so a submission's insert, two status hops, outbox insert, and audit rows are ONE atomic unit

ATM-001/002 only ever called `transitionAttemptStatus` at the top level, and it wrapped itself in its own transaction. ATM-003 needs `created`→`in_progress`... no - `in_progress`→`submitting`→`submitted` to commit or roll back TOGETHER with the submission row, the scoring-outbox row, and both audit-event rows, or a crash between steps could leave a submission row committed with the attempt still stuck at `in_progress` and no scoring job ever enqueued - a real, if narrow, correctness gap. The fix generalizes the function to accept `Queryable<Schema>` (a plain db handle OR an open transaction) instead of always opening a fresh one, exactly matching every OTHER repository function's own shape (`incrementAttemptRevision`, `insertAnswerMutation`, `upsertAnswerState`) - the transaction-boundary decision now belongs entirely to the caller, which is the correct general shape this codebase already used everywhere except this one function. `createAttempt`'s own single-statement call (line 252, unchanged behavior) still passes the top-level `db` handle directly.

### A genuine unique-violation race is caught OUTSIDE the transaction, never inside it - and the FIRST attempt to catch it inside was wrong in a way only the "Expiry race" test caught

The insert into `attempt_submissions` can lose a real concurrent race (a user-submit and a timeout-submit both passing the pre-transaction existence check before either commits). The naive fix - catch the unique-violation and re-query the winner FROM INSIDE the same transaction - is broken: once a statement inside a Postgres transaction errors, the whole transaction is aborted and every subsequent statement on that same handle fails with "current transaction is aborted" until a ROLLBACK. The actual implementation throws a private `SubmissionRaceLostError` sentinel from inside the transaction callback (letting drizzle roll the whole thing back cleanly and re-throw), catches THAT sentinel outside the transaction, and re-queries the winner using the plain, non-aborted `db` handle - never the poisoned `tx`.

A second bug surfaced only by actually running the "Expiry race" integration test (two real concurrent `submitAttempt`/`finalizeExpiredAttemptIfDue` calls against a pglite-backed Postgres): the initial `isUniqueViolation(error)` check looked at `error.code`, which is `undefined` - drizzle-orm wraps every driver error in its own `DrizzleQueryError`, with the raw postgres error (the one actually carrying `.code === "23505"`) attached as `.cause` (ES2022 error-cause chaining). The loser's insert therefore re-threw a real, uncaught database error instead of gracefully replaying the winner's submission. Fixed by checking `error.cause?.code` as well as `error.code`. This is recorded here specifically because it is the kind of bug that ONLY a genuine concurrent-race test catches - a sequential "double submit" test never exercises the catch branch at all, since the second call's own existing-submission check finds the first call's row before ever reaching the insert.

### `attempt_audit_events` is allowlisted by construction - the same "no field exists to assign a secret to" pattern this codebase keeps reusing

Every column is individually typed and pre-vetted safe (attempt id, event type, trigger, actor, revision-at-event, checksum, recovery state) - there is no JSONB "metadata" column at all, unlike `commerce_outbox`'s own free-form `payload`. "Audit telemetry harus bisa rekonstruksi incident tanpa logging answer payload/secrets" holds by this table's own shape: the "Audit reconstruction" test asserts both structurally (no `payload`/`metadata` key exists on any row) and by literal content (the fixture's own correct-answer-key and option-weight values, serialized, never appear in the trail).

### `scoring_job_outbox` mirrors `commerce_outbox`'s exact shape, with a deliberately minimal payload

Same transactional-outbox pattern COM-003 already established (id/targetId-FK/eventType/payload/status/createdAt/deliveredAt), applied to a new domain. The payload is `{submissionId, attemptId}` only - "Jangan bangun scoring engine" means no worker in this task, or any task before it, ever reads this table; a future scoring worker re-queries `answer_states`/`attempt_submissions` fresh by these two ids rather than trusting a duplicated snapshot sitting in the outbox row.

### Submit's own revision check reuses `ANSWER_REVISION_CONFLICT` - no new error code invented for a case dok 16 §19 does not separately name

A stale `expectedAttemptRevision` at submit time is conceptually the same failure as a stale `expectedRevision` at answer-save time (a client acting on data older than the server's current state) - dok 16 §19's stable code list has no distinct code for the attempt-wide submit case, and CLAUDE.md's "do not introduce synonyms without updating the domain document" applies exactly here. `SubmitRevisionConflictError` (`submission-lifecycle.ts`) carries the same `ANSWER_REVISION_CONFLICT` prefix as `AnswerRevisionConflictError`, deliberately.

### `assertAttemptWritable`'s own `SUBMISSION_ALREADY_FINALIZED` branch (declared unreachable by ATM-002's own doc comment) is now reachable, and the doc comment is corrected to say so

ATM-002 wrote `assertAttemptWritable`'s doc comment noting `submitting`/`submitted`/`scoring`/`scored` "are never actually reached by any code this task ships" and that the guard exists defensively "for a future submit task." That future task is this one - `submitAttempt` moves an attempt through exactly those statuses, so an answer-save attempted after submission now genuinely exercises `SUBMISSION_ALREADY_FINALIZED`, not just a theoretical guard. The comment is corrected rather than left stale.

### `mutation_id`/`clientMutationId` are `uuid`-typed columns, matching `answer_mutations.client_mutation_id` - not an arbitrary opaque string

Confirmed against both the existing schema (`answer_mutations.client_mutation_id` is `uuid`, ATM-002) and `contracts/openapi.yaml`'s own `SubmitRequest.mutationId` (`format: uuid`) before writing `attempt_submissions.mutation_id` the same way. The integration test's own fixture mutation IDs were initially plain human-readable strings ("m1", "submit-1") and failed against the real schema exactly as they should have - fixed in the test, not the schema, once the contract was re-checked.

### Consequences

No scoring engine, ranking, result release, explanation/pembahasan, or full tryout UI exists after this change - an attempt can now be finally submitted (by the student or by a timeout), its answer state and revision are frozen into an immutable submission row, a scoring job sits in an outbox nothing yet drains, and every submission/replay event is captured in an audit trail reconstructable without ever touching answer content - but no attempt is ever scored, ranked, or shown a result by this task. No `apps/web` route calls any of these functions yet. Gate C/D are not claimed PASS - OD-04 remains open, and every fixture in this task's own tests uses clearly synthetic dates, codes, and answer/weight values, never a real 2026 SKD scenario. `attempt_submissions`/`scoring_job_outbox`/`attempt_audit_events` are purely additive tables (migration `0019_red_zuras.sql`); `transitionAttemptStatus`'s signature widened from `PgDatabase` to `Queryable<Schema>` but its external behavior for existing callers (`createAttempt`, and the ATM-002 integration test's own direct call) is unchanged.

Audit findings must update ADR status rather than silently editing conclusions. Minimum founder confirmations:

- a decision on which task owns the late-sync recovery adjudication workflow that decides `recoveryState` beyond `none`/`candidate_stored` (`under_adjudication`/`accepted`/`rejected` are declared in the type but never produced by this task);
- a decision on which task builds the actual scoring worker that drains `scoring_job_outbox` and produces the first real `results` row (SCR-series) - `resultState` stays hardcoded `"processing"` until then;
- a decision on whether `Attempt.submissionState`'s `ready`/`blocked_unsynced` distinction (the submit-summary feature dok 16 §13 also describes - counts of answered/unanswered/flagged before the client commits to a final submit) is a separate task or folded into a scoring/UI task;
- confirmation that firing timeout finalization at `lateSyncCutoffAt` (not `deadlineAt`) is the correct interim policy, given no real scheduler/worker invokes `finalizeExpiredAttemptIfDue` yet - this task builds the function only, not the cron/queue trigger that would call it in production.

## ADR-069 — SCR-001: the deterministic scorer splits "what did the student get right" from "what is that worth" into two separately-testable pure functions, `result_versions` follows dok 21's own logical name over its suggested physical collapse, and the scorer re-verifies ATM-003's own pinned checksum before trusting it

**Status:** Accepted
**Date:** 31 August 2026
**Decided during:** SCR-001 (deterministic versioned scorer and component calculation).

### Scope: deterministic scorer + component calculation only, reading ATM-003's submitted immutable snapshot

Per the founder's explicit instruction, this task builds ONLY the scorer and its persistence - no ranking, no result release, no pembahasan/explanation, no tryout UI, no production SKD activation. `scoring_job_outbox` (ATM-003) is drained only as far as this task's own internal scoring path needs - `drainScoringJob`/`drainAllPendingScoringJobs` are callable functions, not a real scheduler/worker process. Requirement IDs SCR-001/002/004/005/007 (dok 13 PRD) - explicitly NOT SCR-003 (result state machine, already covered structurally by the canonical `ResultState` enum this task reuses without building any transition beyond the first), SCR-006 (correction), or SCR-008 (ranking snapshot privacy) - those stay SCR-002/SCR-003 territory.

### `contracts/openapi.yaml` and `test/fixtures/contracts/scoring-skd-synthetic.cases.json` were checked before design, same discipline as every prior task since ADR-064

`openapi.yaml` has no dedicated Score/Component schema - `ResultEnvelope.data.scoreSummary` is `{type: [object, 'null'], additionalProperties: true}`, deliberately unconstrained; this task builds no endpoint that serializes into it at all (no `apps/web` route, matching every ATM-series task's own boundary). The golden fixture's own `policy.components`/`policy.thresholds` shape (a flat per-section map, not the existing `ScoringThresholdRule[]` array) is a SCENARIO description translated into the real `ScoringPolicyConfig` shape inside the test, not a byte-identical schema this task adopts.

### `computeScore` and `gradeAnswer` are two separately-testable pure functions, not one - "what did the student get right" is not "what is that worth"

`gradeAnswer` (answer-grading.ts) reads a real `AnswerKey`/`AnswerPayload`/`QuestionType` and produces a `GradedOutcome` (`{kind:"binary", correct}` / `{kind:"weighted", weight}` / `{kind:"blank"}`) - close to the golden fixture's own `{correct: true}`/`{selectedWeight: 5}` shape by design. `computeScore` (score-calculation.ts) never touches an `AnswerKey` at all; it resolves a `GradedOutcome` to points using ONLY the policy's own `sectionScorers` parameters (`binary_choice`: correct/incorrect/blank scores; `weighted_option`: the outcome's own weight, verbatim). This split is what makes `computeScore` directly golden-fixture-testable with plain JSON data (score-calculation.test.ts) while `gradeAnswer` stays testable against real `AnswerKey` fixtures independently (answer-grading.test.ts) - dok 16 non-negotiable #9 ("Scoring deterministic dan fixture-tested") is satisfied at BOTH layers, not just the DB-integration layer.

`SectionScorerConfig` (`binary_choice` | `weighted_option`) is added to EXM-001's own `ScoringPolicyConfig` as an OPTIONAL field - every pre-SCR-001 policy config (EXM-001/ATM-002/ATM-003's own test fixtures) has no such field and stays valid; only a config that actually declares scorers gets the new structural check (`assertScoringPolicyConsistentWithStructure`'s own extension: a `binary_choice` scorer must sit on a section whose blueprint `allowedQuestionTypes` includes `single_choice`, and symmetrically for `weighted_option`/`weighted_choice`). SCR-004's own narrow requirement scope ("SKD mendukung binary cognitive score dan weighted situational option") means `multiple_choice`/`true_false`/`numeric`/negative-marking/external-scaled scorers (dok 17 §11's fuller "Scorer types" table) are deliberately NOT stubbed out - `gradeAnswer` throws `UngradeableQuestionTypeError` for any of them rather than silently scoring 0.

### The scorer RE-VERIFIES ATM-003's own pinned checksum before trusting it - "same snapshot and answers always produce same score" is a checked property, not an assumption

`scoreSubmission` re-reads `answer_states` (ATM-002, frozen by `assertAttemptWritable` once an attempt leaves `in_progress`), recomputes `computeAnswerSetChecksum` (ATM-003's own function, reused verbatim) over it, and compares against `attempt_submissions.answer_set_checksum` recorded at submit time. A mismatch throws `ScoringInputChecksumMismatchError` rather than silently scoring a snapshot that may have drifted since submit - this should be structurally unreachable via any normal application code path (nothing can write to `answer_states` once submitted), but the integration test exercises it anyway via a direct SQL corruption, the same "defensive check, deliberately exercised" discipline ATM-002/003 already used for their own near-unreachable branches (`invalidCount`, the mutation-dedup replay path).

The scoring policy is dereferenced through the attempt's own PINNED `scoringPolicyVersionId` (set once at start, ATM-001) - never "the current published version for this batch/family." "Policy-version regression" (required test) publishes a v2 of the SAME scoring policy with a materially different `correctScore` (999 instead of 5) AFTER the attempt has already submitted, and confirms the recomputed score still uses the original, pinned value - proving the pin, not just asserting it exists.

### `result_versions` follows dok 21's own LOGICAL name, diverging from its suggested "collapsed" physical name `results` - consistent with EXM-001's own established precedent

dok 21 §18's "Mapping logical ke physical RC2" table suggests collapsing `result_versions` to a physical table named `results`. This codebase already diverged from the SAME suggestion for `exam_blueprints`+`exam_blueprint_versions`, `scoring_policies`+`scoring_policy_versions`, and `exam_forms`+`exam_form_versions` (EXM-001 kept each as two real tables, not collapsed) - `result_versions` follows that already-established, more recent precedent rather than the older suggested mapping, for the same reason: clarity over the RC2 draft's own space-saving suggestion. dok 21's key constraint #11 ("Result version unique by attempt + version; one current") is enforced by two real indexes - `(attempt_id, version)` unique, and `(attempt_id) WHERE is_current = true` unique (a real partial index on a boolean flag, not a `now()` predicate - the same pattern `attempt_writer_lease_active_uq`, ATM-001, already established) - matching dok 21 §12's own RC2 physical invariant note verbatim.

`submission_id` is deliberately NOT uniquely constrained on its own (only `(attempt_id, version)` is) - a future correction (SCR-002) plausibly re-scores the SAME submission into result version 2, and a bare `submission_id` unique index would incorrectly block that. This was caught and fixed before the schema was finalized: an earlier draft had a `result_version_submission_uq` index that would have created exactly this conflict.

### `scores`/`evaluation` stay aggregate JSON - no per-question breakdown table exists

"Component, total, threshold, and rank inputs are separately recorded" (acceptance) is satisfied by two JSON columns (`scores`: section scores/max/unanswered/invalid counts; `evaluation`: per-threshold-rule pass/fail) plus two hoisted scalar columns (`total_score`, `overall_passed` - hoisted specifically so a future ranking feature can `ORDER BY`/`WHERE` them directly without JSON-path queries). Deliberately absent: any column recording WHICH option a student picked per question, or a "computation trace." dok 16 §14 lists "computation trace yang aman untuk internal" as an allowed output, but a per-question breakdown is pembahasan/explanation-adjacent data this task's own scope explicitly excludes ("Jangan bangun ... pembahasan") - building it now would have created a de facto review surface as an unplanned side effect of "record the score," so it stays unbuilt rather than guessed at.

`released_at`/`corrected_at` columns exist now (matching dok 21's own canonical `result_versions` shape) but are never written by any code this task ships - the same "surface exists without this task depending on it" pattern ATM-001 used for `attempts.attempt_revision` before ATM-002 needed it. `state` is set once, to the literal `"provisional"`, and never transitioned further - SCR-002's own release/correction workflow owns every transition after that.

### `scoring_job_outbox` gains its first real reader - `findPendingScoringJobs`/`markScoringJobDelivered` extend ATM-003's own repository file rather than duplicating it elsewhere

ATM-003's own module doc predicted this exactly: "a FUTURE scoring worker has a real table to poll." The three new functions live in `attempt/scoring-outbox-repository.ts` (the table's existing owner file), not a competing file in `scoring/` - same table, same repository, matching this codebase's own "one file per table" convention throughout. `drainScoringJob`'s own two statements (`scoreSubmission` then `markScoringJobDelivered`) are NOT wrapped in one transaction, unlike ATM-003's own `submitAttempt` - both steps are independently idempotent (`scoreSubmission` checks for an existing current result first; `markScoringJobDelivered`'s own `WHERE status = 'pending'` guard means a crash between the two just leaves the job `pending` for a clean retry), so the extra transactional complexity ATM-003 needed for ITS OWN multi-step atomicity is not needed here.

### A genuine `scoreSubmission` race is NOT caught the way ATM-003's `submitAttempt` race is - a deliberate, narrower choice, not an oversight

`scoreSubmission` checks for an existing current result first (the same shape `startOrResumeAttempt`/`submitAttempt` use), then does a plain insert with NO unique-violation catch-and-refetch. Unlike ATM-003's own "User-submit vs timeout-submit race" (an explicit required test, because a REAL user action and a REAL timeout can genuinely race), nothing in this task's required tests demands a graceful outcome for two truly simultaneous `scoreSubmission` calls - the only caller in this task's own scope is the internal drain path, which this task also fully controls. A genuine race surfaces as a raw unique-violation to the loser, matching ATM-001's own `insertAttempt` precedent (documented there as an accepted, weaker race tolerance) rather than ATM-003's stricter one. If a future task introduces a real concurrent-drain requirement, it can upgrade this the same way ADR-068 upgraded ADR-066's own weaker pattern - the two-step ATM-003 upgrade (sentinel-thrown-inside/caught-outside a transaction, `.cause`-aware unique-violation check) is directly reusable then.

### Consequences

No scoring engine consumer beyond THIS task's own internal drain function exists after this change - an attempt with a real submission can now be scored deterministically into a real, persisted, versioned result, but nothing releases that result to a student, nothing ranks it, nothing explains it, and nothing schedules the drain automatically. No `apps/web` route calls any of these functions yet. Gate C is not claimed PASS - OD-04 remains open, and every fixture/policy/blueprint in this task's own tests is clearly synthetic (`SCR001`/`SCORE-*` codes, arbitrary section-max/correct-score numbers), never a real 2026 SKD value. `result_versions` is a purely additive table (migration `0020_swift_apocalypse.sql`); `scoring_policy.ts`'s `ScoringPolicyConfig`/`assertScoringPolicyConsistentWithStructure` extension is backward compatible (optional field, only-when-present check) and does not change behavior for any existing caller. No request for production SKD scoring activation occurred during this task; per the founder's own instruction, such a request before OD-04 approval would have been a stop-and-escalate condition, not something this task would silently proceed past.

Audit findings must update ADR status rather than silently editing conclusions. Minimum founder confirmations:

- a decision on which task owns actual result RELEASE (provisional -> final transition, student-visible serializer, `apps/web` route) - SCR-002 per the current backlog, not started;
- a decision on which task owns correction (re-score into version 2, `is_current` pointer switch, `released_at`/`corrected_at` writes) - also SCR-002 per the current backlog;
- a decision on which task owns ranking/leaderboard (SCR-003 per the current backlog) and whether `total_score`/`overall_passed` as hoisted scalars are sufficient "rank inputs" or whether a dedicated tie-break value needs its own column then;
- a decision on who/what actually triggers `drainScoringJob`/`drainAllPendingScoringJobs` in a real deployment (a worker cron, a queue consumer) - this task builds the callable function only, not the trigger;
- confirmation that `multiple_choice`/`true_false`/`numeric` scorer support (dok 17 §11's fuller table) is needed before any non-SKD family activates, and which task builds it.

## ADR-070 — SCR-002: release is a fresh, unstored computation every read (never a trusted flag), correction reuses IDN-004's maker-checker workflow verbatim instead of building a second one, and `releasedAt`/`state` are two genuinely different axes

**Status:** Accepted
**Date:** 1 September 2026
**Decided during:** SCR-002 (result release, immutable history, and correction workflow).

### Scope: result release + immutable history + correction workflow only

Per the founder's explicit instruction, this task builds ONLY release, history, and correction - no ranking, no leaderboard, no pembahasan/explanation, no tryout UI, no production SKD activation. Requirement IDs SCR-003 (the canonical `ResultState` lifecycle - first given an actual TypeScript type by this task, after existing only as scattered string literals in ATM-003/SCR-001) and SCR-006 (correction preserves the old result, cause, approver, and affected scope). `multiple_choice`/`true_false`/`numeric` scorer types remain unbuilt (SCR-001's own scope boundary, unchanged).

### `contracts/openapi.yaml`, dok 16/17, and dok 24 were checked before design, same discipline as every prior task since ADR-064

`ResultEnvelope.data` (`state`, `resultId`, `version`, `scoreSummary`, `releasedAt`) is transcribed as `StudentResultView`'s own shape verbatim. `Batch.state`'s own `provisional_released`/`final_released`/`review_open` values and `Batch.windows.provisionalResultReleasesAt`/`finalResultReleasesAt` (already declared in the contract) turned out to already be FULLY IMPLEMENTED by EXM-002's `deriveBatchState`/`getExamBatchState` - "Release follows batch policy" (acceptance) needed no new release-scheduling mechanism at all, only a consumer of the one that already existed. `result.correction.request`/`result.correction.publish` (dok 24 §6 RBAC matrix) and the `"result_correction"` high-risk action type (dok 24 §7) were ALSO already fully wired into IDN-004's own permission matrix and `HIGH_RISK_ACTION_TYPES` before this task started - IDN-004 anticipated this exact workflow by name.

### Release is a FRESH, unstored computation on every read - never a trusted flag - because EXM-002 already committed to that discipline for the input it depends on

`getStudentResultView` calls `getExamBatchState` fresh on every single call and derives visibility from the batch's CURRENT server-derived state (`@superlatif/domain/exam#resolveResultVisibility`), rather than trusting a stored `result_versions.releasedAt` flag as the access-control gate. This was a deliberate choice to match EXM-002's own committed discipline ("Batch state harus server-derived, jangan simpan status mutable," `batch-state.ts`'s own module doc) rather than undermining it one layer up: if `releaseResult` (the WRITE path) were the only gate, a bug in that write path, or simply never having been called yet for a given attempt, could accidentally leave a result permanently hidden OR (worse) a stale/incorrectly-set flag could reveal one early. Computing fresh every read makes "Student visibility harus aman: hasil belum release tidak boleh terlihat" (founder instruction) a property of the READ function's own construction, not a promise the write path has to keep perfectly.

`releasedAt` (SCR-001's own reserved-but-unwritten column, per that task's ADR-069) is still written by `releaseResult` - but only as an INFORMATIONAL audit timestamp ("the first moment this was observed released"), idempotent and one-time (`markResultVersionReleased`'s own `WHERE released_at IS NULL` guard). It answers "when," never "whether."

### `state` and "is it released" are two genuinely different axes, and treating them as one would have been the wrong model

`result_versions.state` (SCR-001: always `"provisional"`; SCR-002 adds `"corrected"`, written once by `decideResultCorrection` on the new row) answers "what KIND of result computation is this" - a first pass, or the outcome of a correction. Batch-derived release state answers "is anyone allowed to see it right now." A `withheld`/`voided` result (dok 16 §16's own vocabulary, `resolveResultVisibility`'s own hard-coded hidden set) is refused regardless of how far past the release window the batch has moved - proving these are genuinely orthogonal, not one collapsed concept. No code in this task ever WRITES `withheld`/`voided` (no late-sync adjudication or attempt-voiding cascade is built here - explicitly out of scope, same boundary ATM-003's own ADR-068 already drew for late-sync adjudication), but `resolveResultVisibility`'s own logic handles them structurally regardless, so a future task that DOES write one of those states gets the correct visibility behavior for free, without this file changing.

### Correction REUSES ENT-004's maker-checker workflow shape verbatim rather than building a second one

`requestResultCorrection`/`decideResultCorrection` are structurally identical to `packages/db/src/access/manual-change-service.ts`'s own `requestManualChange`/`decideManualChange` (ENT-004): `authorize()` gates the request first (nothing written if denied); the decision step passes `object.creatorUserId` set to the requester, so IDN-004's universal maker-checker rule refuses self-approval BEFORE any application code has to check who requested what - this IS "Correction approval separation" (required test), and it required writing zero new authorization logic, only calling the existing primitive correctly. A rejected decision is still recorded (never thrown as an error) - the human decision happened and is auditable even when nothing executes; an approved decision whose EXECUTION fails (a stale case, a checksum mismatch inherited from SCR-001's own integrity check) is recorded as `executionStatus: "execution_failed"` rather than losing the decision - the exact same "the decision itself still happened" discipline `decideManualChange` already established for a failed grant mutation.

### A correction is scoped to exactly one attempt, and dok 21's separate `correction_impacts` table is deliberately not built

dok 21 §10 names three tables (`correction_cases`, `correction_impacts`, `correction_approvals`); this task collapses "impacts" into the case row itself (`attemptId` alone identifies the affected scope) rather than a third table, because nothing in SCR-002's own acceptance criteria requires correcting more than one attempt in a single case - a bulk multi-attempt correction CAMPAIGN (e.g. "every attempt that used question X's wrong answer key") is a materially bigger feature (would need its own preview/impact-analysis step across many attempts) that no required test or acceptance line asks for. The chosen shape does not block adding a real `correction_impacts` table later if a bulk campaign is ever built - it would sit alongside, not require reshaping, this table.

### A correction requires an EXPLICIT, already-published, DIFFERENT scoring policy version - not an answer-key edit, and not a same-input no-op

dok 17 §15's own "corrected question weight" required-test-fixture scenario is satisfied via the scoring POLICY axis, not the question axis: `question_version_secrets.answerKey` stays genuinely immutable once a question version is locked (QST-001's own `assertQuestionVersionMutable` refuses an edit) - "Published/versioned academic and commercial artifacts are immutable" (CLAUDE.md) holds even for a wrong answer key, matching the SAME discipline SCR-001 already relied on for "Question edit setelah attempt tidak mengubah score" (dok 16 test invariant #7). A wrong scoring PARAMETER (a `correctScore`/`blankScore` typo, a mis-set weight) is instead fixed by publishing a NEW scoring policy version (itself immutable once published) and having a correction case name it EXPLICITLY as `correctedScoringPolicyVersionId` - reusing SCR-001's own `computeScorePayload` (extracted from `scoreSubmission` specifically for this reuse) against that policy version instead of the attempt's original pin. `assertCorrectionChangesPolicy` (new, `result-correction.ts`) refuses a correction that names the SAME policy version the current result already used, at REQUEST time, before any approver's time is spent on a correction that would recompute byte-identical output - `computeScore` being deterministic (SCR-001) makes this refusal provably correct, not a heuristic guess.

### `scoring-service.ts`'s `scoreSubmission` was refactored to extract `computeScorePayload`, its FIRST reuse beyond the function it was written for

The instance/answer-key-gathering loop, checksum-verification, and `computeScore` call were pulled out of `scoreSubmission` into a shared `computeScorePayload(db, attemptId, submission, scoringPolicyVersionId)` taking the policy version as an explicit parameter rather than always deriving it from the attempt's own pin. `scoreSubmission` itself is now three lines shorter and behaviorally unchanged (confirmed: SCR-001's own 11 integration tests still pass verbatim after the refactor, run BEFORE writing any new SCR-002 test); `decideResultCorrection` is the second caller, supplying the corrected version explicitly. The answer-snapshot checksum verification runs inside the shared function regardless of which caller invokes it - a correction gets the exact same "the answer data has not drifted since submit" guarantee the original score did, for free.

### Consequences

A student can now see a released result (gated by the batch's own server-derived release window, recomputed fresh on every read) and a correction can be requested, peer-approved, and executed into a new, traceable result version while the original is preserved unchanged - but no ranking, leaderboard, pembahasan, or tryout UI exists, and no `apps/web` route calls any of this yet. `result_versions.state` now has two real values in use (`"provisional"`, `"corrected"`); `withheld`/`voided` are structurally handled but never written by this task. `correction_cases`/`correction_decisions` are purely additive tables (migration `0021_workable_komodo.sql`); `scoring-service.ts`'s refactor is behavior-preserving (SCR-001's own test suite re-verified passing, unmodified, after the change). Gate C/D are not claimed PASS - OD-04 remains open, and every fixture/policy in this task's own tests is clearly synthetic (`SCR002`/`REL-*`/`CORR-*` codes, arbitrary correctScore numbers). No request for production SKD scoring activation occurred during this task.

Audit findings must update ADR status rather than silently editing conclusions. Minimum founder confirmations:

- a decision on which task builds the "final" release transition with human review confirmation (dok 16 §16/§17's own "provisional/final/review release" distinction beyond the window-based gating this task builds) - `state` stays `"provisional"`/`"corrected"` only from this task's own write paths, never `"final"`;
- a decision on which task builds late-sync recovery adjudication and any attempt-voiding cascade that would ever actually WRITE `withheld`/`voided` onto a result version - `resolveResultVisibility` already handles both correctly, but nothing produces them yet;
- a decision on which task builds a bulk multi-attempt correction campaign (dok 21's own `correction_impacts` concept) if one is ever needed, versus this task's single-attempt-per-case scope remaining sufficient indefinitely;
- a decision on which task builds the student-report -> correction linkage (`contracts/openapi.yaml`'s own `QuestionReportEnvelope.state: linked_to_correction` value) - `evidenceRef` on `correction_cases` is a free-text pointer ready to carry a report reference, but no code in this task creates or consumes a question report;
- a decision on which task owns ranking/leaderboard (SCR-003 per the current backlog), unchanged from SCR-001's own open item.

## ADR-071 — SCR-003: leaderboard visibility is its own independent window (not folded into `BatchState`), ranking reuses EXM-002's own `ranking_attempt_rule`/`leaderboardEnabled` columns rather than inventing parallel ones, and the "Tie-break policy" test caught a real dead column in ATM-003

**Status:** Accepted
**Date:** 1 September 2026
**Decided during:** SCR-003 (privacy-safe versioned leaderboard).

### Scope: privacy-safe versioned leaderboard only

Per the founder's explicit instruction, this task builds ONLY the leaderboard: population, ranking, tie-break, versioning, and the privacy projection. No full leaderboard UI, no pembahasan, no notifications, no production SKD activation. Requirement SCR-008 (dok 13 PRD). The leaderboard is built strictly from RELEASED results (SCR-002's own `resolveResultVisibility`, reused verbatim) - never a draft/unreleased one.

### `contracts/openapi.yaml`, dok 17/18/24, and EXM-002's own `batch-ranking-rule.ts` were checked before design, same discipline as every prior task since ADR-064

`LeaderboardEntry`/`LeaderboardEnvelope` (openapi) are transcribed as `LeaderboardEntryProjection`/`LeaderboardView` verbatim. `BatchRankingAttemptRule` (`"first"|"best"|"latest"`, EXM-002) is imported and reused UNCHANGED - the founder's own explicit instruction ("agar tidak bikin ranking rule kedua") was honored by never redeclaring it. Checking `exam_batches`' own schema surfaced two columns EXM-002 had ALREADY built specifically for this task - `ranking_attempt_rule` (confirmed reused, not reinvented) and, more consequentially, `leaderboard_enabled: boolean` (dok 18 §15 "Leaderboard boleh dimatikan per batch") sitting right next to it. An earlier design draft had planned to gate "disabled" off the blueprint's own `resultPolicy.rankingMode` field instead - checking the actual schema before writing code caught this before any code shipped: `leaderboard_enabled` is the batch's own, already-built, single source of truth, and `resolveLeaderboardWireState`'s signature was written against a plain boolean from the start, never against the blueprint field.

### Leaderboard visibility is its OWN independent window, deliberately not folded into the canonical `BatchState` enum

dok 18 §3 lists ten independent timeline windows, with "leaderboard visibility" as its own separate milestone from "result release." `deriveBatchState` (EXM-002) deliberately does not reference the `leaderboard_release` window type at all in its own eleven-value `BatchState` derivation - confirmed by reading that function's own `DeriveBatchStateInput` shape before assuming otherwise. `getBatchLeaderboardView` therefore reads the RAW `leaderboard_release` window timestamp directly (`toBatchWindowSet`/`listBatchWindows`, EXM-002's own repository functions) rather than trying to derive leaderboard readiness from `getExamBatchState`'s own output - a batch can have its result released while its leaderboard stays closed, or vice versa, and both are legitimate, independently-configurable operational choices this task's read path respects rather than collapses.

### Population, ranking, and privacy are three separately-testable pure/thin layers, mirroring SCR-001's own "what did the student get right vs what is that worth" split

`rankCandidates` (domain, `ranking.ts`) is a pure, deterministic sort+rank function over already-resolved `{subjectKey, totalScore, submittedAt}` tuples - no DB, no clock, golden-fixture-testable exactly like `computeScore` (SCR-001). `projectLeaderboardEntry` is the SEPARATE privacy gate: an opted-out subject's rank/score are never withheld (a leaderboard position without a name is still privacy-safe, not invisible), only `displayAlias` is gated - to every viewer except the subject's own `isCurrentLearner` view. `generateRankingSnapshot` (db service) is the thin population/wiring layer: it gathers eligible candidates (released result + still-effective batch access, dok 16 §18's own "Eligibility publik ditentukan effective access"), calls the pure ranker, and persists. This three-layer split is what makes "Opt-out privacy" and "Tie-break policy" (required tests) independently verifiable at the domain layer (17 unit tests) before ever touching a database.

### A required test caught a real, pre-existing dead column: `attempts.submittedAt` is declared but ATM-003 never writes it

`generateRankingSnapshot`'s first draft read `attempt.submittedAt ?? attempt.startedAt` for the tie-break input. The "Tie-break policy" integration test (two students, identical scores, different submission times) failed: both students' `startedAt` was identical (same `NOW_EXAM_OPEN` in the fixture), and `attempts.submittedAt` turned out to be `null` for both - a grep across `attempt-service.ts` confirmed `submitAttempt` (ATM-003) never actually assigns to that column, despite it being declared on the `attempts` table since ATM-001. The real, reliably-written submission timestamp lives on `attempt_submissions.submittedAt` (ATM-003's own table, inserted transactionally at submit time) - `generateRankingSnapshot` was fixed to read it from there via `findSubmissionByAttemptId` instead. `attempts.submittedAt` itself is left as a genuine, now-documented dead column - fixing ATM-003's own write path is out of THIS task's scope (a scorer/leaderboard task should not silently patch an unrelated task's schema-wiring gap), but the finding is recorded here rather than worked around silently, the same "a required test caught a real bug, not a fixture artifact" discipline ATM-003's own `.cause`-unwrapping bug and SCR-001's own submission-uniqueness schema mistake both established.

### `ranking_entries` denormalizes `scoreSummary` at generation time rather than joining `result_versions` fresh on every read

dok 21's own "Snapshot dan entry hanya menyimpan... score tuple" is read literally: each entry carries its own frozen `{total, sectionScores, sectionMaxScores, overallPassed}` (the exact same allowlisted shape `StudentResultView.scoreSummary` already uses, SCR-002) at the moment the snapshot was generated, rather than re-deriving it from `result_versions` on every leaderboard read. This keeps a snapshot version genuinely immutable and self-contained - a later correction to the SAME attempt's result (producing result version 2) does not retroactively alter what an OLD ranking snapshot displayed, only a NEW `generateRankingSnapshot` call (creating ranking snapshot version 2) picks up the corrected score. "Corrections create a new ranking version" (acceptance) holds by this same immutability, not by a special-cased correction handler in the ranking code itself - `generateRankingSnapshot` has no branch that even knows a correction happened; it just re-reads whatever the CURRENT result is for each candidate at whatever moment it is called.

### `ranking_subjects` never appears in `ranking_entries`' own FK graph beyond its own id - dok 21's "no direct user FK on the immutable entry" is a real constraint, not prose

`ranking_entries.ranking_subject_id` references `ranking_subjects.id`, never `users.id` directly - the ONLY table in this schema addition with a real `userId` column is `ranking_subjects` itself, and no student-facing code path (`getBatchLeaderboardView`) ever forwards `userId`/`subjectToken` into a response; only `publicOptIn`/`displayAlias`, resolved fresh at read time, cross that boundary. This mirrors SCR-002's own `resultVersions`-never-exposes-raw-answer-payload discipline and ATM-001's `StudentFacingQuestionView` structural-secrecy pattern, applied to a third kind of secret (identity, not academic content).

### `generateRankingSnapshot` is deliberately NOT idempotent-on-content, unlike `scoreSubmission` (SCR-001) or `submitAttempt` (ATM-003)

Every call creates a new snapshot version - there is no "check if anything actually changed" comparison. This is a considered choice, not an oversight: a submission or a scored result each have one natural identity key to check existence against (a specific attempt/submission id); a leaderboard reflects the WHOLE batch's aggregate state at generation time, with no single such key. "Corrections create a new ranking version" (acceptance) is satisfied exactly BY this behavior - calling it again after a correction produces a new version, which is the intended, literal effect. Nothing in this task wires an automatic trigger from `decideResultCorrection` (SCR-002) to `generateRankingSnapshot` - matching every other "callable, not a scheduler" function this codebase has built (`drainScoringJob`, `releaseResult`) - a caller (a future admin action or worker) decides when to regenerate.

### Consequences

A batch's eligible, released, still-access-active attempts can now be ranked into a real, versioned, privacy-safe leaderboard snapshot, re-rankable after a correction without corrupting prior history, with identity display gated by an opt-in preference resolved fresh at read time - but no leaderboard UI, pembahasan, or notification exists, and no `apps/web` route calls any of this yet. `ranking_subjects`/`ranking_snapshots`/`ranking_entries` are purely additive tables (migration `0022_last_terrax.sql`); `attempt-repository.ts` gained one new read-only function (`listAttemptsForBatch`) with no behavior change for any existing caller. Gate C is not claimed PASS - OD-04 remains open, and every fixture/policy in this task's own tests is clearly synthetic (`SCR003`/`RANK-*` codes, arbitrary correctScore numbers). No request for production SKD scoring activation occurred during this task.

Audit findings must update ADR status rather than silently editing conclusions. Minimum founder confirmations:

- a decision on which task fixes `attempts.submittedAt` never being written by `submitAttempt` (ATM-003) - this task worked around it by reading `attempt_submissions.submittedAt` instead, but the dead column itself remains on `attempts` and could mislead a future reader who does not know to avoid it;
- a decision on which task wires the actual TRIGGER for `generateRankingSnapshot` (an admin action after correction, a scheduled job after the leaderboard window opens) - this task builds the callable function only;
- a decision on which task builds the student privacy-preference UI/endpoint that would call `setRankingSubjectPrivacy` for real - the data-layer primitive exists and is tested, but every subject in this task's own tests defaults to `publicOptIn: false` unless a test calls the function directly;
- a decision on whether `best`/`latest` (as opposed to `first`) `ranking_attempt_rule` values need real multi-attempt selection logic before any attempt-policy task allows more than one non-voided attempt per (user, batch) - `listAttemptsForBatch` cannot return more than one today, so this task never actually exercised that branch;
- a decision on which task builds real cohort grouping (dok 18 §15 "Cohort... eksplisit") - `ranking_entries.cohort` exists as a column but is always null from this task's own write path.
