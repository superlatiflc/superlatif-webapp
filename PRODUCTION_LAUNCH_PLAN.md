# Production Launch Plan

**Baseline:** clean `main` @ `35f3b37`. Verify PASS — 704 unit / 348 integration / 30 contract. Migrations 0000–0023. All three security P0s closed. Production infrastructure does not exist.

**Companion document:** `PRODUCTION_READINESS_AUDIT.md` carries the evidence behind every status claim here.

**Nothing in this document has been executed.** Creating Supabase Production and configuring Vercel Production are execution gates.

> **Who can execute Phases A and B.** Not this coding agent, and not for want of approval. The environment has no Supabase or Vercel credentials: neither CLI is installed, `SUPABASE_ACCESS_TOKEN` and `VERCEL_TOKEN` are unset, there is no `.vercel` project link, and unauthenticated probes return HTTP 401 (Supabase Management API) and HTTP 403 (Vercel API). Provisioning also spends money and creates billable resources under an account the agent cannot and should not authenticate into.
>
> Two ways forward, both fine:
>
> 1. **A human performs Phases A and B** in the two dashboards, following this document, then runs the verification commands below and pastes the output.
> 2. **A human authenticates the CLIs on this machine** (`supabase login`, `vercel login`) — the agent never sees the token — after which the agent can drive Phases A–C and produce the evidence directly.
>
> Everything else in this plan is already prepared: exact settings, the full variable inventory, and a read-only verification command that emits the Phase C and Phase 7 evidence in one shot.

---

## The distinction this plan is built around

**Infrastructure readiness ≠ real-user launch readiness.**

Infrastructure is ready to create. A real student cannot use the product: they cannot log in, and no purchase reaches the application. Those are OD-02 and OD-01 — open hard gates that engineering cannot close alone.

Bringing production online _write-frozen_ is still worth doing now, because it de-risks everything that must be correct before those gates close: connection strategy, migration application, region alignment, backup configuration, and read-only boot. It is explicitly **not** a soft launch.

---

## Launch board

### ✅ DONE — genuinely production-ready

| Item                                                                                        | Evidence                                                               |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Query-string identity bypass closed                                                         | PR #38; structural guard verified to fail on reintroduction            |
| Production write kill switch enforced                                                       | PR #40; incident simulation with byte-identical row counts when frozen |
| Rate limiting enforced                                                                      | PR #39; 30-concurrent → exactly 5 admitted; naive limiter admits 30/30 |
| Session auth (cookie, hashed secret, revocation, non-oracle failures)                       | Verified live on staging                                               |
| Exam integrity: server deadline, writer lease, CAS, idempotent submit, answer-key isolation | Full E2E on staging; 348 integration tests                             |
| Deterministic scoring from frozen snapshots                                                 | Fixture-tested, checksum-verified                                      |
| Migrations 0000–0023 reviewed, `db:check` clean, applied to real Postgres in CI             | Every CI run                                                           |
| Region alignment (Vercel `icn1` ↔ Supabase Seoul)                                           | p50 ~185 ms same-region                                                |

### 🚫 MUST — before the first real student

These are genuine blockers. Nothing else on this list is.

| #      | Blocker                                                    | Why it blocks                                                                                                                                        | Owner                     |
| ------ | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| **M1** | **Production authentication (OD-02)**                      | A real student cannot log in at all. `/signin` renders "Masuk belum tersedia" when `APP_ENV=production`. No WordPress bridge exists in the codebase. | Founder + Eng Lead        |
| **M2** | **Purchase → entitlement (OD-01)**                         | No route handler exists anywhere in `apps/`; nothing calls `commerce.*`. A purchase creates no identity, no grant, no access.                        | Commerce Owner + Eng Lead |
| **M3** | **Catalogue data**                                         | staging has **0 products, 0 programs** — every `/home` shows "Belum ada program yang aktif". Even with M1+M2, there is nothing to grant access _to_. | Academic + Product        |
| **M4** | **Scheduler for attempt finalization (P1-1)**              | Auto-submit at deadline depends on the learner's browser staying open. For a real ranked cohort this strands attempts. Vercel Cron is sufficient.    | Exam on-call              |
| **M5** | **Error boundaries + request/error logging (P1-2, P1-3)**  | An unexpected production error currently renders Next's default page and is logged nowhere structured. Incident response would be blind.             | Platform on-call          |
| **M6** | **Backup/PITR confirmed and one restore rehearsed (P1-7)** | dok 30 §12 promises RPO ≤15 min / RTO ≤4 h. Supabase PITR is plan-dependent and unverified. Do not admit student data under an unmet objective.      | Platform on-call          |
| **M7** | **OD-04 (official SKD rules), OD-07 (legal/privacy)**      | Cannot be closed by engineering. Ranked scoring and PII handling depend on them.                                                                     | Founder                   |

### 🕓 CAN FOLLOW — after launch

P1-4 session lifecycle (sliding renewal, idle timeout, `touchSessionLastSeen`) · P1-5 CSRF contract divergence (Server Actions already mitigate) · P1-6 previous-version migration test in CI · P2-1 review N+1 · P2-2 pool tuning · P2-3 unused `redact()` · P2-6 password `@` normalisation · P2-7 batch catalogue · P2-8 remove `DEVICE_LEASE_ENFORCEMENT`.

**Explicitly not launch blockers:** the review N+1 (same-region latency masks it; it is authenticated and owner-scoped), and every cosmetic/doc item. Do not let them delay anything.

**One cheap exception worth doing with the production domain:** P2-4, excluding `/preview/*` from production builds. It is a small change and avoids a confusing public surface on a real domain.

---

## Phase A — Supabase Production (EXECUTION GATE — not yet performed)

A **new, separate project**. Never reuse, fork, or restore staging.

**Settings**

- Region: **Seoul (`ap-northeast-2`)**, matching Vercel `icn1`. Staging measured p50 ~185 ms same-region versus seconds cross-region; do not repeat that mistake.
- Postgres only. No Auth, Storage, Realtime, or Edge Functions — nothing in the codebase uses them.
- Plan: must provide **PITR**. Confirm before creating, because M6 depends on it.
- Strong generated database password, **URL-encode reserved characters** (`@` → `%40`) — staging's password has a literal `@` (P2-6); do not carry that forward.

**Schema**

- Apply migrations **0000–0023 in order** with `pnpm run db:migrate`. No manual DDL, no `drizzle-kit push`, no schema copied from staging.
- **No staging data of any kind** — no fixtures, no users, no attempts. Production starts empty.

**Verification before anything else — one command**

```bash
DATABASE_URL='<production migration string>' pnpm run db:verify-production -- --expect-empty
```

This is strictly read-only and never prints the connection string or any part of it. It asserts 24 applied migrations, that `rate_limit_counters` exists, and — with `--expect-empty` — that **every** business table is empty (users, sessions, identities, attempts, answers, submissions, results, grants, purchases, commerce events). Any row at all fails the run, which is the point: it is how you prove no staging fixture was copied.

It also prints a **fingerprint** — a SHA-256 over the applied-migration timestamps plus the database name. That value is safe to paste into a report and is what Phase 7's isolation proof compares.

Verified working against staging before production existed: staging reports `migrationsApplied: 24`, `rateLimitCountersPresent: true`, Postgres **17.6**, 66 business rows, and correctly **fails** under `--expect-empty` — so the emptiness assertion is known to discriminate rather than pass vacuously.

Then run `pnpm run db:check` locally against production to confirm generated migrations match the schema.

> **Version note:** staging runs Postgres **17.6** while CI's parity container is `postgres:18`. Migrations 0000–0023 apply cleanly on both, so this is not a blocker — but pick the production version deliberately rather than by default, and prefer matching staging unless there is a reason not to.

**Connection strategy — two distinct strings**

| Use                                    | Port   | Mode               | Notes                                                                |
| -------------------------------------- | ------ | ------------------ | -------------------------------------------------------------------- |
| Migrations (one-off, from a laptop/CI) | `5432` | session            | Direct connection; required for DDL                                  |
| Vercel runtime                         | `6543` | transaction pooler | Verified compatible with the current `postgres.js` config on staging |

The runtime string must **never** be a staging string. Consider `max: 1–2` for serverless (P2-2) at the same time.

**Backups**

- Confirm automated backups + PITR are actually enabled and note the retention window.
- Rehearse **one** restore into a scratch project and record RPO/RTO actuals against dok 30 §12's ≤15 min / ≤4 h. This is M6; do it before students, not after.

---

## Phase B — Vercel Production (EXECUTION GATE — not yet performed)

| Setting           | Value                                                | Why                                                           |
| ----------------- | ---------------------------------------------------- | ------------------------------------------------------------- |
| Root Directory    | `apps/web`                                           | Matches the monorepo layout staging uses                      |
| Framework         | Next.js (16.3.3)                                     | Pinned in `apps/web/package.json`                             |
| Node              | **24.x**                                             | `engines.node: >=24.15.0 <25`                                 |
| Package manager   | pnpm 11.20.0                                         | `packageManager` field                                        |
| Function region   | **`icn1` (Seoul)**                                   | Must match Supabase; this is the single biggest latency lever |
| Production branch | `main`                                               |                                                               |
| Domain            | Dedicated production hostname, distinct from staging |                                                               |

**Environment separation — the rule that must not be broken**

- **Production** scope: production Supabase only.
- **Preview** scope: staging Supabase only, `APP_ENV=staging`.
- Production must **never** point at the staging database, and preview must never point at production. Set these in separate Vercel environment scopes, not a shared one.

### Production environment variables

Six are required for startup (`CORE_REQUIRED_FOR_STARTUP`); the rest are required by behaviour this repository now enforces. **No values here.**

| Variable                    | Production value                          | Notes                                                                                                            |
| --------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `APP_ENV`                   | `production`                              | Gates the kill switch and disables the dev sign-in seam                                                          |
| `APP_BASE_URL`              | production URL                            | Required at startup                                                                                              |
| `ADMIN_BASE_URL`            | production admin URL                      | Required at startup                                                                                              |
| `API_BASE_URL`              | production API URL                        | Required at startup                                                                                              |
| `WORKER_CONCURRENCY`        | e.g. `2`                                  | Required at startup                                                                                              |
| `LOG_LEVEL`                 | `info`                                    | Required at startup                                                                                              |
| `DATABASE_URL`              | production pooler string                  | **Never staging.** URL-encode reserved chars                                                                     |
| `RATE_LIMIT_ENABLED`        | `true`                                    | Startup refuses `false` when `APP_ENV=production`                                                                |
| `RATE_LIMIT_HASH_SECRET`    | **new production-only secret**, ≥16 chars | Startup refuses to boot without it. Generate fresh; never reuse staging's, and never reuse a session/auth secret |
| `PRODUCTION_WRITES_ENABLED` | **`false`**                               | Deliberate. See Phase C                                                                                          |

All other flags (`FEATURE_*`, `SKD_PRODUCTION_ACTIVATION`, `COMMERCE_RECONCILIATION_ENABLED`, `DEVICE_LEASE_ENFORCEMENT`) stay **unset**, which means `false` in production — their declared safe default.

> **Note on flag latency:** flags are read once per process and cached. Changing one in Vercel takes effect on **redeploy or instance recycle**, not instantly. This is an operational kill switch with deploy-shaped latency; plan incident response accordingly.

---

## Phase C — First deployment: READ-SAFE / WRITE-FROZEN

Deploy with `PRODUCTION_WRITES_ENABLED=false`. This is the point of the phase, not a limitation of it.

**Verification checklist**

| #   | Check                                           | Expected                                                                                                                 |
| --- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| C1  | Process boots                                   | `startup.config_validated` in logs; no `startup.rate_limit_misconfigured`                                                |
| C2  | Deliberately omit `RATE_LIMIT_HASH_SECRET` once | Process **exits**, logs `startup.rate_limit_misconfigured`. Then restore it. Proves the fail-safe on real infrastructure |
| C3  | Database reachable                              | A read path returns 200                                                                                                  |
| C4  | Migrations                                      | 24 rows in `drizzle.__drizzle_migrations`                                                                                |
| C5  | Read-only boot                                  | `/`, `/signin`, `/tryouts` render                                                                                        |
| C6  | **No dev login exposure**                       | `/signin` shows "Masuk belum tersedia" — no username field, no form                                                      |
| C7  | **No writes possible**                          | Any guarded action → `?error=writes_disabled`; row counts unchanged across the attempt                                   |
| C8  | Rate limiting live                              | `rate_limit_counters` gains rows on repeated sign-in attempts                                                            |
| C9  | No staging leakage                              | `pnpm run db:verify-production -- --expect-empty` passes against production                                              |
| C10 | Region                                          | Function region `icn1`; measure a read p50                                                                               |

**Rollback:** delete the deployment. Nothing is irreversible in this phase — production holds no student data by construction.

### Phase 7 — environment isolation proof (mandatory)

Run the same read-only command against both environments and compare the printed `fingerprint`:

```bash
DATABASE_URL='<production>' pnpm run db:verify-production
DATABASE_URL='<staging>'    pnpm run db:verify-production
```

- The two fingerprints **must differ.** Identical values mean production and preview resolve to the same database — a stop condition, not a warning.
- Staging's fingerprint, captured before production existed, is **`ca232257111f693d`** (Postgres 17.6, 24 migrations, 66 business rows). Production must not report this value.
- Cross-check the direction too: production must report **0** business rows while staging reports non-zero. If production reports 66, it is pointed at staging.

Neither invocation prints a connection string, so both outputs are safe to paste into the bring-up report.

---

## Phase D — Write activation (SEPARATE GATE)

Flipping `PRODUCTION_WRITES_ENABLED=true` must not happen until:

1. M1 (production auth) and M2 (purchase → entitlement) are implemented and verified;
2. M3 catalogue data exists;
3. M4 scheduler running;
4. M5 error boundaries + request logging;
5. M6 restore rehearsed with recorded RPO/RTO;
6. M7 OD-04 and OD-07 closed;
7. dok 30 §13 go/no-go signed.

Activating writes with M1/M2 unmet would produce a production system nobody can log into that is nonetheless accepting writes — the worst of both states.

---

## Recommended next execution milestone

**Phase A + B + C as one unit** — create Supabase Production, configure Vercel Production, deploy write-frozen, and run C1–C10. It is self-contained, fully reversible, and unblocks nothing dangerous.

Run **M6 (restore rehearsal)** inside the same window while production is still empty — it is far cheaper to rehearse a restore on an empty database than on a live one, and it closes the objective dok 30 §12 already promises.

In parallel, the real launch work is **M1 and M2**, neither of which is engineering-only.
