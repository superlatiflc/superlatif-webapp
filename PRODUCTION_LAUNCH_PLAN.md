# Production Launch Plan

**Baseline:** clean `main` @ `8a1dce2`. Verify PASS — 704 unit / 348 integration / 30 contract. Migrations 0000–0023. All three security P0s closed.

**Companion document:** `PRODUCTION_READINESS_AUDIT.md` carries the evidence behind every status claim here.

**Execution status (2026-09-10)**

| Phase                                   | Status                                                                             |
| --------------------------------------- | ---------------------------------------------------------------------------------- |
| A — Supabase Production                 | ✅ **Done** — created by a human; migrated and verified empty by the agent         |
| Phase 7, layer 1 — database isolation   | ✅ **Done** — distinct project refs and distinct server fingerprints               |
| B — Vercel Production                   | ⏳ **Waiting on a human** — no Vercel credentials on this machine                  |
| C — write-frozen deploy + C1–C10        | ⏳ Blocked on B                                                                    |
| Phase 7, layer 2 — deployment isolation | ⏳ Blocked on B                                                                    |
| Backup / PITR (M6)                      | ⏳ WAL archiving confirmed active; whether PITR is enabled needs a dashboard check |

> **Who can execute Phase B.** Not this coding agent — for want of credentials, not approval. The `vercel` CLI is not installed, `VERCEL_TOKEN` is unset, there is no `.vercel` project link, and the Vercel API returns HTTP 403 unauthenticated. Either a human configures Phase B in the dashboard using the variable table below, or a human runs `vercel login` on this machine — the agent never sees the token — and the agent then drives Phases B and C and produces the evidence directly.

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

## Phase A — Supabase Production (DONE — 2026-09-10)

**Status: created, migrated, verified empty.** Project `superlatif-webapp-production`, ref `mfqfkxtrckacrwxltmxg`, region `ap-northeast-2` (Seoul), Postgres **17.6** — matching staging exactly. Created by a human in the Supabase dashboard; migrations applied with `pnpm run db:migrate` over the Session Pooler (port 5432), reading the connection kept locally as `PRODUCTION_DATABASE_URL` in the gitignored `apps/web/.env.local`. No connection string or password was printed at any point.

**Result on production**

| Check                              | Result                                                                                                   |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------- |
| State before migration             | 0 public tables, no `drizzle` schema — only Supabase system schemas                                      |
| Migrations applied                 | **24**, exactly matching the repository journal (0000–0023)                                              |
| `rate_limit_counters`              | present                                                                                                  |
| Business rows (11 tables)          | **0** — `--expect-empty` PASS                                                                            |
| Schema vs already-verified staging | **identical** — 76 tables, 668 columns, 199 constraints, 180 indexes, 15 enums; all catalog hashes equal |

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
DATABASE_URL='<production migration string>' pnpm run db:verify-production -- --expect-empty --expect-ref=mfqfkxtrckacrwxltmxg
```

This is strictly read-only and never prints the connection string or any part of it. It asserts that the applied migration chain **exactly matches this repository's journal** (0000–0023), that `rate_limit_counters` exists, and — with `--expect-empty` — that **every** business table is empty (users, sessions, identities, attempts, answers, submissions, results, grants, purchases, commerce events). Any row at all fails the run, which is the point: it is how you prove no staging fixture was copied.

It also prints two identity values, and Phase 7 compares both: `identity.projectRef` — not a secret, it is the `<ref>` in the project's public `https://<ref>.supabase.co` URL — and `identity.serverFingerprint`, a hash of the address of the Postgres server that actually answered. `--expect-ref=<ref>` turns "pointed at the wrong project" into a hard failure before the tool even connects.

> **Correction (2026-09-10).** Until this revision the command printed a `fingerprint` hashed from applied-migration timestamps, and this document said it would differ between environments. It does not. drizzle records each migration's _authoring_ timestamp from `_journal.json` in `created_at`, so every database migrated from this repository produces the same value — during bring-up, production and staging both reported `ca232257111f693d`. The claim had only ever been checked against one environment. Postgres's `system_identifier` was tested as a replacement and is also identical across Supabase projects, which are cloned from one base image. The field is removed. The migration timestamps are now used for what they genuinely prove: that the applied chain matches this repository exactly.

Verified against staging before production existed: 24 migrations, `rate_limit_counters` present, Postgres **17.6**, 66 business rows, and it correctly **fails** under `--expect-empty` — so the emptiness assertion is known to discriminate rather than pass vacuously.

`pnpm run db:check` needs no database connection: it compares `packages/db/src/schema` against the committed migrations, so there is nothing to run "against production". It passed on this commit inside `pnpm run verify`. The production-side equivalents are `migrationsMatchRepository: true` above and the schema-catalog comparison in the results table.

> **Version note:** production was created on Postgres **17.6**, matching staging. CI's parity container is `postgres:18`; migrations 0000–0023 apply cleanly on both.

**Connection strategy — two distinct strings**

| Use                                 | Port   | Mode               | Evidence                                                                                                                                                                                                                              |
| ----------------------------------- | ------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migrations (one-off, from a laptop) | `5432` | Session Pooler     | Used for the 2026-09-10 production migration. A direct connection (`db.<ref>.supabase.co`) also works where the network supports IPv6                                                                                                 |
| Vercel runtime                      | `6543` | Transaction Pooler | Tested 2026-09-10 against production with the app's own `createDatabaseClient` (prepared statements ON, `max: 5`): **71/71** read queries OK — 40 sequential, 30 concurrent across three statement shapes, one transaction — 0 errors |

The runtime row previously said "verified compatible on staging" with no recorded evidence. It now has evidence, and that matters: `createDatabaseClient` does not set `prepare: false`, and older Supabase poolers rejected named prepared statements in transaction mode. If a runtime error ever mentions a prepared statement, switch the runtime string to the Session Pooler (5432) first — it is fully compatible — and investigate second.

The runtime string must **never** be a staging string. Consider `max: 1–2` for serverless (P2-2) at the same time.

**Backups**

- **Observed 2026-09-10 (read-only):** `archive_mode = on` and WAL archiving is healthy on production — 17 segments shipped, 0 failures, last shipped minutes before the check. That shows Supabase's backup pipeline is running. It does **not** show that PITR is enabled or what restore window exists; both are plan-dependent and visible only in the dashboard (Project → Database → Backups).
- Confirm automated backups + PITR are actually enabled and note the retention window.
- Rehearse **one** restore into a scratch project and record RPO/RTO actuals against dok 30 §12's ≤15 min / ≤4 h. This is M6; do it before students, not after. A restore must never target the production project itself.

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

Two layers, because they prove different things.

**Layer 1 — the two connection targets are different databases (DONE, 2026-09-10).** Run the same read-only command against both in the same session and compare `identity`:

```bash
DATABASE_URL='<production>' pnpm run db:verify-production -- --expect-ref=mfqfkxtrckacrwxltmxg
DATABASE_URL='<staging>'    pnpm run db:verify-production -- --expect-ref=mpjvqtozvhcckgswtunt
```

|                           | Production             | Staging                |
| ------------------------- | ---------------------- | ---------------------- |
| `projectRef`              | `mfqfkxtrckacrwxltmxg` | `mpjvqtozvhcckgswtunt` |
| `serverFingerprint`       | `09e02743ef64036b`     | `48ebeb67a9da1cd1`     |
| Business rows             | **0**                  | 66                     |
| Migrations / matches repo | 24 / yes               | 24 / yes               |

Both identity values differ, and the data points the right way — production empty, staging populated. Either identity value matching is a stop condition. The `--expect-ref` guard was also exercised negatively: the staging connection run with `--expect-ref=mfqfkxtrckacrwxltmxg` is refused **before connecting**.

`serverFingerprint` is point-in-time — Supabase can move a project to a new host — so compare the two environments in the same session rather than against the values recorded here. `projectRef` is stable.

**Layer 2 — each deployment reaches the right database (PENDING Vercel configuration).** Layer 1 proves two connection strings reach two different databases. It does not prove which string each Vercel environment was given. That proof comes from Vercel: the `DATABASE_URL` in the **Production** scope must carry ref `mfqfkxtrckacrwxltmxg`, and the one in the **Preview** scope must carry `mpjvqtozvhcckgswtunt`. Check the ref only — never display the value — then confirm behaviourally that production still reports 0 business rows after traffic while staging keeps its data.

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
