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

**Status:** Provisional  
**Decision:** Next.js 16 App Router for student/admin web and BFF.  
**Consequences:** Productive full-stack TypeScript and Vercel compatibility; version locked at kickoff and exam hot path must pass latency/load test.

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

Audit findings must update ADR status rather than silently editing conclusions. Minimum founder confirmations:

- ADR-006 identity bridge;
- ADR-008/010 hosting stack;
- ADR-018 late sync;
- ADR-028 progress formula;
- review/support/download policies from Gate 2.
