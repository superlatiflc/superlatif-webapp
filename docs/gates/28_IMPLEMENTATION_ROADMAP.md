# 28 — Implementation Roadmap

**Versi:** 1.0-RC1  
**Tanggal:** 28 Agustus 2026  
**Status:** Sequenced implementation plan; calendar commitment belum ditetapkan

## 1. Outcome dan strategi delivery

Roadmap membangun Superlatif sebagai vertical slices yang dapat didemokan, diuji, dipantau, dan dihentikan secara independen. Urutan tidak dimulai dari seluruh database atau seluruh halaman sekaligus.

Urutan risiko:

1. kontrak dan tooling;
2. identity/access foundation;
3. program/LMS vertical slice;
4. question operations;
5. trustworthy exam;
6. commerce staging and migration;
7. controlled launch.

Program/LMS dapat bergerak sambil spike commerce berjalan. Ranked exam boleh dibangun menggunakan synthetic/staging rule, tetapi production activation tetap menunggu evidence eksternal.

## 2. Planning assumptions

- Team reference: 1 engineering lead, 2–4 full-stack/backend engineers, 1 product designer, 1 QA/automation, shared DevOps/security, serta product/academic/ops owner.
- TypeScript modular monolith; web/BFF dan worker berbeda deployment.
- Next.js 16 App Router provisional dan dikunci saat kickoff.
- PostgreSQL transactional source of truth; Drizzle + reviewed SQL migration.
- Provider DB, queue/cache, storage, messaging, live class, dan exam hot-path hosting masih provisional sampai spike/benchmark.
- Scope production pertama fokus Kedinasan/SKD.
- Tidak ada migrasi active ranked attempt lintas engine.

Estimasi reference untuk tim di atas adalah **14–18 minggu** sampai controlled launch candidate bila external evidence tersedia tepat waktu. Ini bukan tanggal janji. Dengan 2–3 engineer tanpa dedicated QA/DevOps, gunakan 20–26 minggu atau kurangi scope.

## 3. Workstreams

| Code | Workstream | Outcome |
|---|---|---|
| GOV | Governance/contracts | Repo, ADR, CI, release gate, traceability |
| IDN | Identity/security | App identity, session, WordPress bridge boundary |
| COM | Commerce/access | Event adapter, purchase projection, entitlement, reconciliation |
| PRG | Program/LMS | Program hub, curriculum, resource, progress, schedule/live |
| QST | Academic operations | Question bank, import, media, moderation |
| EXM | Exam | Blueprint/form/batch, runner, scoring, result/correction |
| ADM | Admin/operations | Role UI, live ops, support, notification |
| DAT | Data/migration | Mapping, import, reconciliation, cutover |
| OPS | Platform/quality | Observability, security, performance, backup, runbook |

## 4. Phase overview

| Phase | Reference duration | Primary outcome | Production gate |
|---|---:|---|---|
| P0 — Kickoff and spikes | 1–2 minggu | Tool/vendor decisions and executable skeleton | None |
| P1 — Foundation | 2 minggu | CI, DB, auth skeleton, audit/outbox, contracts | None |
| P2 — Program vertical slice | 2–3 minggu | Student home → program → resource → progress | Gate B candidate |
| P3 — Access and commerce staging | 2–3 minggu, parallel | Synthetic + real staging purchase-to-access | Gate A candidate |
| P4 — Academic operations | 2–3 minggu | Question import → moderation → immutable form | Gate C prerequisite |
| P5 — Trustworthy exam | 4–5 minggu | Start/save/resume/submit/score/result/correction | Gate C candidate |
| P6 — Operations and migration rehearsal | 2–3 minggu | Admin/support/live/notification + pilot migration | Gate D candidate |
| P7 — Hardening and controlled launch | 1–2 minggu | UAT, load, recovery, pilot, go/no-go | A–D evidence |

P2/P3 dan sebagian P4 dapat paralel setelah P1. P5 hot path tidak boleh diparalelkan tanpa satu owner integritas yang mengendalikan attempt/scoring contract.

## 5. Phase 0 — Kickoff and technical spikes

### Scope

- Create repository structure, owners, branch/review policy, and ADR process.
- Lock Node/runtime/package manager/Next.js/Drizzle versions.
- Validate Gate 3 artifacts and Gate 4 fixtures in CI.
- Decide provider shortlist and benchmarking method.
- Spike Sejoli event capture and WordPress bridge in staging.
- Spike connection pooling, transactional semantics, outbox/worker, protected media.
- Prototype IndexedDB offline queue, writer lease, and server deadline.
- Define test, observability, and release evidence storage.

### Exit

- repo builds from clean checkout;
- local/CI synthetic stack works;
- contract validation command green;
- architecture/provider decisions recorded or explicitly remain blocked;
- no real provider behavior encoded from assumptions;
- first vertical slice backlog is ready.

### Stop conditions

- bridge cannot prove stable subject or one-time exchange;
- provider event has no safe verification path;
- target hosting cannot meet transaction/connection behavior;
- team cannot supply academic/security owner.

Stop does not cancel program/LMS development; it blocks dependent production path.

## 6. Phase 1 — Foundation

### Deliverables

- monorepo/app skeleton;
- environment/config validation and secret boundary;
- PostgreSQL schema baseline and first reviewed migration;
- stable app user, external identity link, session/device model;
- RBAC/permission/object-scope foundation;
- append-oriented audit log;
- outbox/background job foundation;
- structured logging, correlation ID, error tracking, health/readiness;
- OpenAPI/JSON Schema generation or validation workflow;
- test factories and clock/UUID/provider fakes.

### Demonstration

An internal user signs in through a synthetic bridge, sees an authorized empty home, receives a traceable request ID, and an admin action creates an audited outbox event.

### Exit

- P0 identity/security/database tests pass;
- migration apply on empty and previous schema passes;
- no browser receives service credential or exam secret;
- role separation can be exercised in integration tests.

## 7. Phase 2 — Program/LMS vertical slice

### Slice 2A — Catalogue and program shell

- program/product separation in read model;
- Program Saya, program hub, context resolver, empty/loading/error/access states;
- manual primary program preference and one next action.

### Slice 2B — Curriculum and resources

- program/track/stage/module/resource versioning;
- article, file/PDF, video, recording, external link;
- protected media/access decision;
- admin draft/validate/publish with preview.

### Slice 2C — Progress and schedule

- completion/last position;
- required-only denominator and rebuild;
- schedule, live occurrence, reschedule/cancel, recording;
- mobile 320px and accessibility acceptance.

### Exit

- home → program → resource → completion E2E pass;
- multi-grant program is not duplicated;
- revision does not erase completion;
- progress rebuild matches source record;
- Gate B UAT can run with synthetic access.

## 8. Phase 3 — Access and commerce staging

### Slice 3A — Domain and synthetic adapter

- product/version, offer, external SKU mapping, purchase/event, grant/claim;
- canonical event envelope and provider fake;
- entitlement resolver, explanation, projection, rebuild;
- reconciliation case and safe admin preview.

### Slice 3B — Provider staging

- capture representative paid/pending/failed/expired/cancel/refund/chargeback events;
- verify signature bytes, timestamp/replay, event/order/SKU identity;
- WordPress bridge one-time exchange and account conflict;
- checkout handoff/return correlation;
- event poll/reconciliation fallback where required.

### Exit

- synthetic Gate A passes;
- real staging evidence closes OD-01 and OD-02 or documents a blocker;
- event replay produces no duplicate grant;
- refund source isolation and unknown SKU queue pass;
- paid-to-access SLO measured in staging.

Production commerce remains off when OD-01/OD-02 are not closed even if synthetic tests pass.

## 9. Phase 4 — Academic operations

### Deliverables

- exam family activation scope;
- question/stimulus/version/asset/secret tables and serializer boundary;
- XLSX v2.1 simple/advanced + ZIP pipeline;
- quarantine, scanning, parsing, validation, preview, row issue export;
- draft/review/approval/publish/archive;
- version-only edits after published/use;
- blueprint publication validator, form builder, batch/windows/policy;
- question usage/exposure tracking.

### Exit

- all example/negative import fixtures pass;
- preview mobile has no key/weight leakage;
- writer cannot approve own content;
- Moderator and Academic Admin are distinct actors for ranked publish;
- fixed form/checksum and batch policy are immutable after attempt.

## 10. Phase 5 — Trustworthy exam

### Slice 5A — Attempt and runner

- idempotent start/resume;
- immutable question instance and option order;
- server timer, current section/question, flag/navigation;
- writer lease, takeover, revision CAS;
- IndexedDB queue and reconnect recovery;
- one final submit and controlled auto-submit.

### Slice 5B — Scoring and result

- deterministic scorer and restricted secret load;
- binary cognitive and weighted situational policies;
- asynchronous scoring state;
- provisional/final/withheld/voided/corrected lifecycle;
- human review/release;
- result explanation/remediation and privacy-safe leaderboard.

### Slice 5C — Incident and correction

- late-sync receipt/adjudication;
- attempt accommodation;
- void, extension, retake;
- question reports and correction impact/approval;
- result/ranking re-version.

### Exit

- acknowledged answer loss = 0 under retries/failures;
- concurrent lease/revision tests pass;
- offline/resume/deadline/submit E2E pass;
- scoring fixtures deterministic;
- academic owner signs staging blueprint/fixture;
- load and incident drill evidence exists before production Gate C.

## 11. Phase 6 — Operations and migration rehearsal

### Operations

- admin dashboard, import/review queue, batch live ops;
- support access explain and safe recovery;
- finance reconciliation;
- notification preferences, audience preview, scheduling, delivery/dead-letter;
- analytics allowlist and core dashboards;
- runbook automation/synthetic checks.

### Migration

- source inventory/profiling;
- legacy promise register closure;
- SKU/identity/content mappings;
- idempotent ETL and exception queue;
- pilot dry run, count/financial/access reconciliation;
- fallback routing and cutover rehearsal.

### Exit

- production-like pilot data reconciles at criteria from document 25;
- no active ranked attempt crosses cutover;
- support performs scenarios without SQL editing;
- notification consent/suppression tests pass;
- rollback rehearsal preserves evidence.

## 12. Phase 7 — Hardening and controlled launch

### Entry

- release-scope backlog complete;
- Gate A–C evidence available for enabled paths;
- external gates required by scope closed;
- zero known Sev-0/Sev-1;
- support/on-call/academic/finance coverage confirmed.

### Activities

- full regression and UAT;
- WCAG 2.2 manual/automated pass;
- load/spike/soak and reconnect storm;
- security review and remediation;
- backup restore, projection rebuild, queue replay, rollback drills;
- pilot cohort and staged traffic/feature rollout;
- launch communication and command center.

### Exit

- signed go/no-go record;
- rollback target and last known good release identified;
- dashboards/alerts/runbooks verified;
- launch proceeds by cohort/feature, not all-or-nothing.

## 13. Milestones

| Milestone | Demonstrable outcome | Decision |
|---|---|---|
| M0 | Clean repo + CI + synthetic stack | Continue/adjust tooling |
| M1 | Identity/RBAC/audit/outbox foundation | Begin vertical slices |
| M2 | Program learning flow usable on mobile | Gate B UAT candidate |
| M3 | Staging paid-to-access proven | OD-01/02 closure candidate |
| M4 | Question import to immutable form | Begin ranked runner integration |
| M5 | Reliable attempt to reviewed result | Gate C candidate |
| M6 | Pilot migration and operational rehearsal | Gate D candidate |
| M7 | Controlled production release | Operate/rollback/expand |

## 14. Dependency rules

- Identity foundation precedes user-scoped program/access/attempt.
- Product/SKU mapping precedes real purchase-derived grants.
- Entitlement resolver precedes protected resource/join/start attempt.
- Published question/blueprint/form precede ranked batch.
- Attempt snapshot and mutation log precede scoring.
- Final/corrected result precedes stable leaderboard/remediation metrics.
- Consent/preferences precede promotional notification.
- Source profiling and 05A closure precede production migration.
- Observability/runbook are part of each slice, not a final-phase add-on.

## 15. Scope controls

Move to post-MVP unless needed to close P0:

- non-SKD production family;
- practice attempt;
- native video conference/community chat;
- IRT/adaptive testing;
- proctoring webcam or automatic cheating verdict;
- native mobile app;
- parent dashboard, multi-tenant school;
- dark mode/maskot as release dependency;
- microservices/Kafka/Kubernetes/multi-region active-active.

Any addition requires trade-off: remove another item, extend capacity/time, or explicitly change release scope.

## 16. Role and responsibility

| Area | Accountable | Required consultation |
|---|---|---|
| Product scope/journey | Founder/Product | Design, Academic, Support |
| Academic/scoring | Academic Admin | Moderator, Product, Engineering |
| Architecture/data/security | Engineering lead | Security/Privacy, Ops |
| Commerce mapping | Commerce/Finance owner | Engineering, Support |
| Migration/cutover | Engineering/Ops | Finance, Support, Product |
| QA/release evidence | QA lead | All domain owners |
| Go/no-go | Founder/Product + Engineering + relevant domain owner | Incident commander/on-call |

Satu orang boleh memegang beberapa role organisasi, tetapi approval berisiko tetap memerlukan aktor berbeda sesuai RBAC contract.

## 17. Definition of ready for a task

- one backlog ID and bounded outcome;
- source documents/read-set known;
- dependency state known;
- acceptance and negative cases written;
- test layer selected;
- data/fixture and environment known;
- write-set reasonably bounded;
- external assumption absent or explicitly mocked;
- owner/reviewer identified.

## 18. Definition of done for a vertical slice

- functional and negative acceptance pass;
- test/contract/migration evidence attached;
- accessibility/security implications reviewed;
- logs/metrics/traces and alerts added where material;
- runbook updated for new failure mode;
- feature flag/rollback available where rollout risk requires;
- docs/ADR/schema synchronized;
- support/admin state and error copy completed;
- no hidden dependency on production provider or secret.
