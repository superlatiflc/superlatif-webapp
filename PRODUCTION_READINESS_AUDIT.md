# Production Readiness Audit

**Baseline:** clean `main` @ `35f3b37` (PR #40 merged). `pnpm run verify` PASS — 704 unit / 348 integration / 30 contract. Migrations 0000–0023. Supabase + Vercel staging verified. **Production infrastructure does not exist.**

**Status:** originally written at `704aed9` before any P0 was closed. Revised after PRs #38, #39, #40. Areas whose repository state changed were re-audited against current `main`; findings that could not have changed were not re-derived.

---

## Verdict

**Infrastructure: READY.** All three P0 blockers are closed with evidence. Nothing remaining blocks _creating_ production infrastructure in the write-frozen posture described below.

**Real-user launch: NOT READY.** That is a separate question, and the answer is not close. A production student cannot log in at all today, and no purchase can reach the application. See §Real-user launch blockers — this is the finding that matters most in this revision.

---

## P0 — all closed

### ✅ P0-1. Query-string identity bypass — CLOSED (PR #38, merged `2b6e5fe`)

Was: `/home`, `/programs/[programCode]`, and `/admin/questions/[versionId]/review` accepted the acting user's identity from `?userId=`. Reproduced live on deployed staging: an anonymous caller supplying an admin UUID received HTTP 200 with question content and full moderation history.

Now: all three use `requireUserIdOrRedirect()`; identity comes only from the session cookie. The admin route additionally collapses unauthorized and nonexistent into one `notFound()`, removing an existence oracle.

**Evidence on current main:** `grep "searchParams" apps/web/src/app | grep userId` returns nothing; all three routes call `requireUserIdOrRedirect()`; `apps/web/src/app/no-query-identity.test.ts` (31 cases) fails the build if the pattern returns — and was verified to fail by reintroducing the vulnerability.

### ✅ P0-2. Feature flags unenforced — CLOSED (PR #40, merged `35f3b37`)

Was: `FLAG_OWNERSHIP`, `loadFlags()`, and the safe-default discipline were all real and all tested, and `loadFlags()` had no caller outside its own test file. `PRODUCTION_WRITES_ENABLED` ("master switch for any production-effect write") was inert, so dok 30 §9's primary containment lever did not exist.

Now: `packages/contracts/src/runtime-flags.ts` enforces the switch, scoped to `APP_ENV=production` so the existing fail-closed default is safe to enforce without freezing dev/staging. Start/resume, takeover, answer save, and submit are guarded before any mutation. Sign-out, the inline scoring drain, and all reads are deliberately unguarded.

**Evidence:** incident simulation against real staging Postgres with row counts around a real lease-takeover write — switch on: lease `7881e02b`→`3dcc32ee`, leases 6→7; switch off: redirect to `?error=writes_disabled`, reads all 200, **every row count byte-identical**; switch on again: leases 7→8. Production with no flags set at all: reads 200, writes refused.

### ✅ P0-3. Rate limiting contracted but unimplemented — CLOSED (PR #39, merged `f6c5c65`)

Was: `RATE_LIMIT_ENABLED` defaulted `true` with the description "Safe default is on, not off", and no limiter existed anywhere.

Now: Postgres-backed fixed-window limiter (migration 0023, `rate_limit_counters`), atomic via `INSERT … ON CONFLICT DO UPDATE … RETURNING`. Sign-in 5/15min per network **and** 10/60min per handle; start 10/5min; takeover 5/5min; submit 5/min; autosave 600/min (batched so a normal exam performs a handful of limiter writes in total).

**Evidence:** 30 concurrent requests against a limit of 5 admit exactly 5 — and a naive read-then-write limiter in the same harness admits 30/30, proving the test discriminates. On staging, six real sign-ins created exactly five users with the sixth blocked and **creating no user and no session**.

---

## Remaining P0

**None.** No new P0 was discovered in this revision.

---

## P1 — required before a real cohort, not before infrastructure

Each re-verified against current `main`.

- **P1-1. No scheduler for time-triggered finalization.** `finalizeExpiredAttemptIfDue` still has no caller in `apps/`, and there is no `vercel.json`. Auto-submit at deadline still depends on the learner's browser being open. `apps/worker` still validates env, logs one line, and starts no work. **Unchanged.**
- **P1-2. Observability is effectively startup-only.** Consumers on current main: `apps/web/src/lib/register-node.ts`, `apps/worker/src/index.ts`, and now `packages/db/src/identity/service.ts` — a small improvement, but there is still no per-request logging, no error logging, and no correlation-ID propagation. **Slightly narrowed, still open.**
- **P1-3. No error boundaries or custom 404.** No `error.tsx`, `global-error.tsx`, `not-found.tsx`, or `middleware.ts` anywhere in `apps/web/src`. **Unchanged.** Note the three closed P0s each added _controlled_ outcomes for their own expected failures, so the remaining exposure is genuinely unexpected errors.
- **P1-4. Session lifecycle gaps.** Fixed 8h TTL, no sliding renewal or idle timeout; `touchSessionLastSeen` still never called; `deviceLabel`/`ipPrefix` never populated. **Unchanged.**
- **P1-5. CSRF contract vs implementation.** `contracts/openapi.yaml` still declares `CsrfToken` on mutating endpoints that do not exist as HTTP routes; the app uses Server Actions, whose native Origin check mitigates this in practice. **Unchanged — divergence, not an exploitable hole.**
- **P1-6. Migration CI covers only the empty-database half.** CI still applies migrations only to an empty Postgres 18. CLAUDE.md requires empty **and** previous-version. I verified 0023 against a previous-version schema manually during PR #39, but that check is not in CI. **Unchanged.**
- **P1-7. Backup/recovery documented but unproven.** dok 30 §12 specifies PITR, quarterly restore tests, RPO ≤15min / RTO ≤4h. Nothing exercised; Supabase capability is plan-dependent. **Unchanged, and now directly relevant** — see the launch plan's Supabase section.

---

## P2

- **P2-1.** Review N+1 (~15–20 sequential queries). Same-region latency masks it (~366 ms). Not a launch blocker.
- **P2-2.** `postgres.js` pool `max: 5` per instance, untuned for serverless.
- **P2-3.** `@superlatif/observability`'s `redact()` still unused (commerce payload redaction is separately wired and correct).
- **P2-4.** `/preview/*` mock routes still ship to production builds, gated only by a demo cookie rather than `APP_ENV`. **Worth doing before a public production domain exists** — it is cheap and removes a confusing public surface.
- **P2-5.** ~~Stale `DATABASE_URL` description~~ — **re-checked: the stale sentence is gone.** Closed.
- **P2-6.** Staging `DATABASE_URL` password contains a literal unescaped `@`. Normalise before minting production credentials.
- **P2-7.** No batch catalogue; `/tryouts` renders an honest "not available" state.
- **P2-8 (new, from PR #40's audit).** `DEVICE_LEASE_ENFORCEMENT` defaults `false` while the writer lease is live and enforced. Wiring it as written would **disable a live integrity control**; its own `targetRemoval` says ATM-002 graduates it out of a flag, and ATM-002 has shipped. Its description ("no exam engine exists yet") is stale. **It should be removed from ENV_SPEC and the registry** — a contract change, deliberately not made unilaterally.

---

## Real-user launch blockers

This section is new, and it is the most important part of this revision. The three closed P0s made the application _safe_. They did not make it _reachable_ by a real student.

Evidence gathered from current `main` and live staging:

| Journey step                                | Status                  | Evidence                                                                                           |
| ------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------- |
| WordPress purchase                          | **Not implemented**     | No route handlers exist anywhere in `apps/` (`find apps -name route.ts` → none outside `/preview`) |
| Purchase → identity                         | **Not implemented**     | No caller of `commerce.*` in `apps/web` or `apps/worker`                                           |
| Purchase → entitlement                      | **Not implemented**     | staging: `purchases = 0`, `raw_commerce_events = 0`                                                |
| Login (production)                          | **Blocked by design**   | `isDevLoginEnabled()` is false when `APP_ENV=production`; `/signin` renders "Masuk belum tersedia" |
| `/home`                                     | Real, but empty         | staging: `programs = 0`, `products = 0` — every user sees "Belum ada program yang aktif"           |
| Program hub                                 | **Data does not exist** | 0 programs, 0 products in staging                                                                  |
| Tryout → attempt → submit → result → review | **Real and working**    | 5 attempts, 4 submissions, 4 scoring jobs in staging; full E2E verified                            |

**How does a real Superlatif student authenticate today? They cannot.** The only sign-in path is the deterministic dev seam, which refuses outright in production. There is no WordPress bridge in the codebase (`grep -rl "wp_bridge|WP_BRIDGE"` in `apps/web/src` and `packages/db/src` → nothing). This is OD-02, an open hard gate in CLAUDE.md.

**How does a real purchase create identity, entitlement, or program access? It does not.** The commerce domain (`packages/db/src/commerce/`) is substantial and tested — purchase lifecycle, event ingestion, outbox, SKU mapping, reconciliation — but nothing calls it, and there is no HTTP surface for a provider to reach. This is OD-01.

The six grants in staging carry `source_type = "purchase"` with synthetic source ids; they were seeded directly by the fixture script, not produced by a purchase.

**Can infrastructure still be created?** Yes. Creating a production Supabase project and a write-frozen Vercel production deployment is safe and useful _now_: it validates connection strategy, migration application, region alignment, backup configuration, and read-only boot — all of which must be right before OD-01/OD-02 land, and none of which depend on them. What it must not be mistaken for is readiness to admit students.

---

## Production rollout proposal

Superseded by `PRODUCTION_LAUNCH_PLAN.md`, which carries the execution-ready detail. In brief: create Supabase Production and Vercel Production in a **write-frozen** posture (`PRODUCTION_WRITES_ENABLED=false`), verify boot/DB/migrations/read-only behaviour, and treat write activation as a separate gate that cannot open before OD-02 (auth) and OD-01 (commerce) close.

**Gates to production traffic remain OD-01, OD-02, OD-04, OD-07, OD-08** — none closable by engineering work alone.

---

## Scope compliance

This revision changed documentation only. No production infrastructure created, no production data touched, no migration, no schema, contract, Supabase, or Vercel change. The review N+1 remains unfixed and unprioritised.
