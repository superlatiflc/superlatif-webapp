# Superlatif Web App — Claude Project Instructions

## Project identity

Superlatif is a program-centric, mindset-first EdTech platform. The product experience connects Mindset → Skillset → Toolset and helps learners move through one coherent program journey. It is not a collection of unrelated LMS, tryout, and live-class menus.

The first production focus is Kedinasan/SKD. WordPress and Sejoli remain the MVP commerce layer. The web app owns the learning experience, access ledger/projection, program delivery, question operations, and exam engine.

Brand behavior is optimistic, empathetic, visionary, smart, and grounded. Do not hide errors or operational uncertainty behind motivational copy. Never claim guaranteed graduation, official scoring, fake scarcity, or unverified “best/first/only” claims.

## Source of truth

Canonical documents live under `docs/gates/` after repository bootstrap.

1. Founder decisions recorded in the repository.
2. Gate 1 product/domain: 02, 03, 05, 05A.
3. Gate 2 UX: 07, 09, 11, 12.
4. Gate 3 PRD/contracts: `docs/gates/13_PRD.md` through `26_ADRS.md` and `contracts/`.
5. Gate 4 execution: `docs/gates/27_QA_TESTING_AND_UAT_PLAN.md` through `30_LAUNCH_AND_OPERATIONS_RUNBOOK.md`, `planning/`, and `test/fixtures/contracts/`.
6. Code and infrastructure configuration.

If a lower layer conflicts with a higher layer, stop the semantic change. Report the conflict, propose the smallest source correction/ADR, and wait for the appropriate owner. Do not let code or a database schema silently redefine product behavior.

## Hard gates

The following remain open until evidence is attached:

- OD-01: real Sejoli event/signature/retry/refund semantics;
- OD-02: WordPress one-time bridge and safe account linking;
- OD-03: final provider decisions;
- OD-04: official current-year SKD rules and academic sign-off;
- OD-07: Indonesian legal/privacy review;
- OD-08: launch workload and load/soak/failure results;
- legacy promise evidence in 05A.

Development with synthetic/staging data is allowed within the backlog. Do not activate production commerce, ranked SKD, or legacy migration merely because code exists.

## Project skills

Load the relevant skill before high-impact work:

- `/superlatif-domain` for product, program, grant, entitlement, progress, and migration policy;
- `/superlatif-design-system` for student/admin UI, mobile states, accessibility, and brand behavior;
- `/superlatif-exam-engine` for questions, import, blueprint, batch, attempt, answer, scoring, result, ranking, correction, and exam incidents;
- `/superlatif-sejoli-sync` for WordPress/Sejoli identity, checkout, webhook, purchase, grant sync, and reconciliation.

Use more than one only when the task truly crosses boundaries.

## Technical baseline

- TypeScript modular monolith.
- Next.js 16 App Router is provisional until kickoff version lock.
- Web/BFF and worker are separate deployments but share domain/contracts.
- PostgreSQL is the transactional source of truth.
- Drizzle schema plus generated and reviewed SQL migrations.
- Redis/Valkey-compatible infrastructure may coordinate cache/queue; durable job/outbox state remains in PostgreSQL.
- Object storage holds media/import/export; database metadata is authoritative.
- Vercel for web and container/VPS for worker/hot path are provisional pending test.

Target repository layout unless kickoff ADR records an equivalent alternative:

```text
apps/web
apps/worker
packages/domain
packages/db
packages/contracts
packages/ui
packages/testing
docs/gates
contracts
planning
test/fixtures/contracts
```

Pin runtime, package manager, framework, and migration tool versions before implementation. Preserve an already-valid repository choice unless an ADR approves migration.

## Canonical vocabulary

### Roles

`super_admin`, `operations_admin`, `academic_admin`, `tutor_writer`, `moderator_reviewer`, `live_class_coordinator`, `support`, `finance_reconciliation`.

One user may hold multiple role bundles. Separation of duties is evaluated by actor ID: creator, first approver, and second approver must be different where required; requester cannot approve the same high-risk action.

### Purchase states

`pending`, `paid`, `failed`, `expired`, `cancelled`, `refunded_partial`, `refunded_full`, `chargeback`.

### Grant states

`scheduled`, `active`, `suspended`, `expired`, `revoked`, `cancelled`.

### Attempt states

`created`, `in_progress`, `submitting`, `submitted`, `scoring`, `scored`, `voided`.

### Result states

`processing`, `provisional`, `final`, `corrected`, `withheld`, `voided`.

Worker failure is a job/error state, never a new student result state.

### Activation scope

`draft_only`, `staging`, `production`. Non-SKD families remain non-production until their family gate passes.

Do not introduce synonyms without updating the domain document, API/schema, fixtures, and an ADR when material.

## Domain invariants

- Product is what is sold; Program is what the learner experiences; Access Grant is why an action is allowed.
- Content is reusable; products grant actions on targets and do not clone content.
- Effective access is additive and explainable. Revoking one source cannot remove access supported by another active source.
- Purchase state and access state are separate.
- Email is not a sufficient identity merge key.
- Published/versioned academic and commercial artifacts are immutable.
- Progress denominator counts released required activities; optional work is shown separately.
- Ranked MVP uses fixed immutable forms. Presented question/option order is persisted.
- Start/save/submit/webhook/grant/job side effects are idempotent.
- Server time controls deadline. A reload cannot reset it.
- An acknowledged answer must never be lost.
- `weighted_choice` uses the student response shape `kind=single_choice` + `optionCode`; option weights remain server-only secrets.
- Client responses, logs, analytics, caches, and source maps must not expose answer keys or weights.
- Late-sync within the configured cutoff is a recovery candidate, not automatically scored.
- Correction creates a new result version and ranking snapshot; it never rewrites historical result rows.
- Ranking entries reference a restricted ranking subject, not a direct public identity.
- No active ranked attempt is migrated across engines without a separately approved compatibility plan.

## Coding and data rules

- Keep domain decisions in pure, testable modules. Inject clock, ID generation, and provider interfaces.
- Parse/validate all external input at the boundary. Preserve raw provider evidence redacted + checksummed.
- Use explicit transactions for purchase→grant/outbox, final submission, result current switch, and other atomic invariants.
- Use unique/check/FK constraints for invariants that the database can enforce.
- JSONB stores versioned configuration/snapshots, not core relational integrity.
- All event timestamps use timezone-aware storage; display uses account/context timezone.
- Never log secrets, raw tokens, answer payloads, medical evidence, or unnecessary PII.
- Use serializer allowlists for student/admin projections.
- Do not add a generic admin “edit database row” surface.
- Support recovery uses scoped commands with preview, reason, approval when required, and audit.

## Migration rules

- `drizzle-kit push` is allowed only for local disposable databases.
- Staging/production use generated and reviewed migration files.
- Prefer expand → backfill → switch → contract.
- A destructive change requires backup/restore evidence, forward-fix/rollback plan, and approval.
- Run migration against an empty database and a previous-version schema in CI/staging.
- Never delete purchase, grant, attempt, answer mutation, result, or audit evidence as rollback.

## UI and accessibility

- Program context is primary; global shortcuts resolve back to the active program.
- Design mobile-first for 320 CSS px reflow and 44×44 critical touch targets.
- Implement loading, empty, partial, stale, denied, expired, error, retry, offline, and read-only history states where relevant.
- Meet WCAG 2.2 AA for P0 flows, including keyboard/focus, screen readers, reduced motion, Dragging Movements, and Redundant Entry.
- Do not make color, charts, or timer animation the only information source.
- Keep gamification subtle. Do not use manipulative streak/scarcity behavior.

## Required task workflow

1. Read the backlog entry and listed read-set.
2. State requirement IDs, invariants, dependencies, expected write-set, tests, and stop conditions.
3. Inspect current code/tests and working tree; preserve unrelated changes.
4. Implement the smallest coherent outcome.
5. Add positive and negative tests at the correct layer.
6. Run narrow tests, then required broader validation.
7. Inspect the diff for authorization, concurrency, immutability, secret/PII leakage, migration safety, accessibility, observability, and rollback.
8. Update contracts/ADR/runbook only when behavior changes.
9. Report evidence and remaining gate/risk.

Do not perform production deploys, migrations, external messages, or live provider mutations unless the user explicitly authorizes that exact action and required gates are satisfied.

## Expected repository scripts

Bootstrap should expose stable scripts equivalent to:

```text
lint
typecheck
test:unit
test:contract
test:integration
test:e2e
test:a11y
db:generate
db:migrate
db:check
verify
```

Use the package manager locked in `package.json`. Do not invent or run a missing script; report the missing bootstrap dependency.

## Definition of done

- Acceptance and negative cases pass.
- Requirement/backlog IDs are traceable.
- Contract and schema remain synchronized.
- No new unauthorized state vocabulary.
- Migrations are reviewed and compatibility is explicit.
- Security/accessibility/observability implications are handled.
- Runbook covers new material failure modes.
- External gates remain visible.
- No unrelated changes are included.

## Stop and escalate

Stop before semantic implementation if provider behavior, official scoring, legal policy, production access, destructive migration, or a conflicting source-of-truth decision is required. Return the exact blocker, affected requirement, smallest decision/evidence needed, and work that can safely continue in parallel.
