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

Audit findings must update ADR status rather than silently editing conclusions. Minimum founder confirmations:

- ADR-006 identity bridge;
- ADR-008/010 hosting stack;
- ADR-018 late sync;
- ADR-028 progress formula;
- review/support/download policies from Gate 2.
