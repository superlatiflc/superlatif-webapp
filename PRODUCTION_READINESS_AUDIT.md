# Production Readiness Audit

**Status:** Audit only. No production infrastructure created, no production data touched, no migration, no contract change, no code change.
**Baseline:** clean `main` @ `704aed9f090bcfc9ce084ecac3a2f30bd96b8646`, `pnpm run verify` PASS (629 unit / 329 integration / 30 contract).
**Environments verified before this audit:** Supabase staging (Seoul) + Vercel staging (`icn1`), full E2E and security probes passed.
**Method:** direct source inspection plus live probes against the deployed staging URL. Every finding below cites a file/line or a reproducible observation. Nothing is asserted from the checklist alone.

---

## Verdict

**NOT READY.** Three P0 findings, one of which is an **exploitable unauthenticated admin-surface access that I reproduced live on the deployed staging app**. None require large work, but production infrastructure must not be created until P0-1 in particular is closed, because the same code would ship the same hole.

---

## P0 — Production blockers

### P0-1. Authentication bypass: `?userId=` query parameter is a spoofable identity source on three deployed routes

**This is the headline finding and it is not theoretical — it is reproduced below against the live staging deployment.**

Three routes predate real session auth and still take the acting user's identity from the URL:

| Route                                                                | Identity source                                      | Flows into                                                                                                          |
| -------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/app/admin/questions/[versionId]/review/page.tsx:65,82` | `searchParams.userId`                                | `exam.buildQuestionPreview(db, userId, versionId)` → `assertQuestionPermission(db, userId, "question.draft.write")` |
| `apps/web/src/app/programs/[programCode]/page.tsx:41,58`             | `searchParams.userId`                                | `programService.assertProgramAccess(db, cache, userId, ...)`                                                        |
| `apps/web/src/app/home/page.tsx:33-34`                               | session first, **`searchParams.userId` as fallback** | `programService.buildHomeViewModel(db, cache, userId, ...)`                                                         |

**Reproduced on `https://superlatif-webapp-web.vercel.app` with no session cookie:**

```
sessionCookieVisibleToJs:            ""            <- no cookie
sessionGatedRouteRedirectsTo:        "/signin"     <- proves NO valid session
adminWithoutUserIdParam:             "shows placeholder"
adminWithSpoofedUserId_status:       200
adminWithSpoofedUserId_leaksContent: true          <- question stem + options
adminWithSpoofedUserId_leaksHistory: true          <- full moderation history
```

and on `/home`:

```
home_noParam_showsPlaceholder:       true
home_spoofed_status:                 200
home_spoofed_rendersGreeting:        true          <- victim's dashboard rendered
home_spoofed_showsSessionPlaceholder:false
```

**The precise nature of the defect matters.** Authorization is _not_ broken — `assertQuestionPermission` / `assertProgramAccess` / `buildHomeViewModel` all still evaluate correctly. What is broken is **authentication**: the app accepts a claimed identity from an attacker-controlled query string, then authorizes that claim faithfully. The only barrier is knowing a UUID that holds the permission. UUIDs are not secrets — they appear in URLs, logs, support tickets, and screenshots, and an internal actor trivially has one.

Each file documents the seam as "NOT an authorization control … development/demo seam" (ADR-052). That was accurate when no session mechanism existed. It stopped being acceptable the moment `apps/web/src/lib/session.ts` shipped and these routes were deployed to a public URL.

**Disclosure:** I introduced the `/home` fallback myself in PR #36, and it was explicitly kept at your instruction ("keep the `/home` session-cookie wiring"). The instruction was about preserving the _session_ wiring; the `?userId=` fallback rode along. Flagging it as my own regression risk rather than letting it pass as inherited.

**Minimal fix:** delete the `?userId=` branch from all three routes; use `requireUserIdOrRedirect()` (already exists, already used by every `/attempts/*` and `/tryouts/*` route). The admin route additionally needs a role check surfaced as 404, matching `attempt-access.ts`'s existing non-oracle pattern. No new auth architecture.

### P0-2. The feature-flag system is fully specified and completely unenforced

`packages/contracts/src/flags.ts` defines an 11-flag registry with owners and removal conditions, including `PRODUCTION_WRITES_ENABLED` ("Master switch for any production-effect write") and `SKD_PRODUCTION_ACTIVATION`. `env.test.ts`/`flags.test.ts` assert every production-sensitive flag defaults off.

**`loadFlags()` is never called by `apps/web` or `apps/worker`.** Verified: the only callers are `flags.test.ts` and the barrel re-export in `packages/contracts/src/index.ts`. The only runtime consumers of `PRODUCTION_WRITES_ENABLED` / `SKD_PRODUCTION_ACTIVATION` anywhere are `packages/testing/src/fixtures.ts:52-56`, which uses them to refuse loading synthetic fixtures — not to gate application behaviour.

Consequence: the exam engine, leaderboard, question import, and every "production-effect write" run **regardless of their flag state**. `PRODUCTION_WRITES_ENABLED=false` in production would switch nothing off. dok 30 §13's "explicit signed go/no-go" has no mechanism behind it, and the runbook's primary containment lever (§8 step 5: "Choose containment: feature off …") does not exist in code.

This is P0 specifically _because_ production is next: the runbook assumes a kill-switch that is not wired.

### P0-3. Rate limiting is contracted as on-by-default and has no implementation

`env-spec.ts:302-308` declares `RATE_LIMIT_ENABLED` with `defaultValue: "true"` and the description _"Rate limiting. Safe default is on, not off."_ A repo-wide search for any limiter (`rateLimit|rate_limit|RATE_LIMIT`) returns hits **only** in `packages/contracts` (spec, flags registry, its own tests). No middleware, no per-IP/per-user counter, no store.

There is also **no `middleware.ts`** anywhere in `apps/web`, so there is no request-level chokepoint where a limiter could currently apply.

Exposed unauthenticated/cheap-to-call surfaces today: `/signin` (a Server Action that **creates a user row and a session row per call** via `performDeterministicLogin`), plus every DB-backed page. The sign-in action is the sharpest edge — unauthenticated, write-heavy, and unbounded.

The flag defaulting to `true` makes this worse than a plain gap: an operator reading configuration would reasonably conclude protection is active.

---

## P1 — Required before first real cohort

### P1-1. No scheduler for time-triggered exam finalization

`finalizeExpiredAttemptIfDue`, `drainScoringJob`/`drainAllPendingScoringJobs`, and `releaseResult` are all implemented, idempotent, and integration-tested — and all three carry an explicit source comment that they are _"callable, not a scheduler"_ (`scoring-service.ts:272`, `result-release-service.ts:47`). `apps/worker/src/index.ts` validates env, logs one line, and **starts no work at all** (its own comment says so).

Today, auto-submit-at-deadline depends on the learner's browser being open (`CountdownTimer.onExpire`). A student who closes the tab at the deadline leaves an attempt that is never finalized until some later request happens to trigger it. For a real ranked cohort this produces unscored attempts and support load. Scoring itself is safe (it runs inline on submit).

### P1-2. Observability is startup-only; no request, error, or audit telemetry

`@superlatif/observability` is imported in exactly two places: `apps/web/src/lib/register-node.ts:22` and `apps/worker/src/index.ts:13`. Both log a single startup line. There is **no** request logging, no error logging, no correlation-ID propagation into any route or Server Action, and `packages/observability/src/correlation.ts` has no consumer outside its own tests.

Consequence: a production 5xx produces a Vercel platform log line and nothing structured — no correlation ID, no actor, no route context. dok 30 §7's incident flow assumes dashboards and traceable request IDs that do not exist. Combined with P1-3, incident response would be largely blind.

### P1-3. No error boundaries or custom 404

`apps/web/src` contains **no** `error.tsx`, `global-error.tsx`, `not-found.tsx`, or `middleware.ts`. Every unexpected error renders Next's default error page (the raw "A server error occurred" screen observed during staging verification), and `notFound()` renders Next's default 404 rather than a branded, actionable page. This also means there is no place where an unexpected error is currently _logged_ before being rendered.

### P1-4. Session lifecycle gaps

`apps/web/src/lib/session.ts` is sound on the essentials: `httpOnly`, `sameSite: "lax"`, `secure` in production, hashed secret server-side, uniform failure collapsing (no oracle). Verified live: session and lease cookies are invisible to page JS. Gaps:

- **Fixed 8h TTL, no sliding renewal and no idle timeout.** `evaluateSessionValidity` (`packages/domain/src/identity/session.ts:50`) checks only `revokedAt` and `expiresAt`.
- **`touchSessionLastSeen` is implemented (`identity/repository.ts:171`), exported — and never called.** `user_sessions.last_seen_at` is therefore dead data; idle-session detection and "active sessions" support tooling are impossible today.
- **No session rotation** on any privilege change, and `deviceLabel`/`ipPrefix` columns are never populated by `apps/web` (the sign-in action passes neither), so the anomaly-detection fields exist but are always null.

### P1-5. CSRF: contract declares a token that does not exist

`contracts/openapi.yaml` attaches a `CsrfToken` parameter to at least 5 mutating endpoints (lines 147, 213, 284, 309, 324). No CSRF implementation exists anywhere in the codebase.

**Mitigating fact, stated precisely:** the app does not serve those HTTP endpoints — it uses Next.js Server Actions, which enforce an Origin/Host check natively, and `next.config.ts` does not weaken it (no `serverActions.allowedOrigins` override). So this is **not currently an exploitable CSRF hole**; it is a contract-vs-implementation divergence that becomes a real gap the moment any real HTTP mutation endpoint is added. Classified P1, not P0, on that basis.

### P1-6. Migration safety covers only half of the required matrix

CI applies all 23 migrations to an **empty** production-representative Postgres 18 (`.github/workflows/ci.yml:119-122`), and `db:check` proves generated migrations match the schema. CLAUDE.md's migration rules require testing against **both** an empty database _and_ a previous-version schema. The second is not tested anywhere, so a migration that is fine on a fresh DB but breaks on an existing one would pass CI.

No destructive migration exists today and no migration is needed for the current slice, so this is P1 rather than P0 — but it must be in place before the first production migration.

### P1-7. Backup/recovery is documented but unproven for the target provider

dok 30 §12 is thorough: automated backup + PITR, encrypted/restricted backups, documented restore destination, **quarterly restore tests**, projection-rebuild and outbox-replay verification after restore, and a provisional objective of **RPO ≤ 15 min / RTO ≤ 4 h**. None of this has been exercised against Supabase, and Supabase's backup/PITR capability is **plan-dependent** — the staging project's tier and retention were not verified as part of this audit. Creating production without first confirming the plan actually provides PITR at the stated RPO would lock in an unmet objective.

---

## P2 — Improvements, safe to follow

- **P2-1. Review-page N+1.** `getAttemptReviewView` issues ~15–20 sequential queries for a 2-question attempt (`attempt-review-service.ts:75-106`: per instance, `findQuestionVersionById` + `requireQuestionVersionSecret` + `assembleStudentFacingQuestionView`, the last of which itself does several). Same-region latency now masks it (~366 ms measured post-`icn1`; it was ~7.4 s cross-region). Explicitly out of scope per instruction; recorded for completeness. This is the finding most likely to degrade under real concurrency.
- **P2-2. `postgres.js` pool sizing not tuned for serverless.** `getDb()` uses the default `max: 5` per function instance. 20-concurrent burst testing showed zero 5xx and no exhaustion, but transaction-pooler mode (`:6543`, verified compatible with the current config) plus `max: 1–2` is the conventional serverless shape.
- **P2-3. `@superlatif/observability`'s `redact()` is unused.** Commerce payload redaction (`redactRawPayload`) _is_ correctly wired (`commerce-event-service.ts:102`). The logger-side `redact()` has no consumer — harmless while logging is startup-only, but it must be applied when P1-2 adds request logging.
- **P2-4. `/preview/*` mock routes ship to production.** Eight routes serving synthetic data are deployed and reachable, gated only by a demo cookie, not by `APP_ENV`. Not a data risk (all content is synthetic and contains no answer keys), but it is a confusing public surface and should be excluded from production builds.
- **P2-5. Stale `DATABASE_URL` description** in `env-spec.ts:82-84` still says _"still not required for apps/web or apps/worker to start, since no HTTP route or job calls the database client yet"_ — untrue since PR #33.
- **P2-6. Staging `DATABASE_URL` password contains a literal unescaped `@`.** Works because parsers split at the last `@`, but it is non-conformant (RFC 3986 requires `%40`) and some tooling splits at the first. Normalise before minting production credentials.
- **P2-7. No batch catalogue.** `/tryouts` renders an honest "not available" state; learners can only reach a tryout by direct link. A product gap, not a readiness defect.

---

## Category findings

**Environment separation — adequate, with one leak.** `APP_ENV` is validated as a required enum and correctly gates the deterministic sign-in (`dev-login.ts:24`). `packages/testing/src/fixtures.ts:48-56` refuses to load synthetic fixtures when `APP_ENV=production` or the production flags are on — a genuinely good guard. Dev-only diagnostics are correctly `NODE_ENV`-gated in three routes. Leak: P2-4.

**Authentication/session — sound primitives, fatal entry point.** Hashing, expiry, revocation, cookie flags, and non-oracle failure handling are all correct and were verified live. Undermined entirely by P0-1, plus P1-4.

**Database/migrations — strong.** 23 reviewed migrations, intact journal, `db:check` in `verify`, real-Postgres application in CI, `drizzle-kit push` never used. Gap: P1-6.

**Backup/recovery — documented, unproven.** See P1-7.

**Deployment/rollback — good CI, unproven rollback.** CI pins every action to a commit SHA (with a documented re-resolution procedure) and the Postgres service image to a digest; `verify` is byte-identical to the local command. The workflow's own comment correctly notes that "failures block merge" requires branch protection — **a repository setting I could not verify and which should be confirmed before production**. dok 30 §11 defines rollback order and forbids destructive-schema reversal; no rollback has been rehearsed.

**Observability — P1-2, P1-3.** The building blocks (structured logger, correlation, redaction, release evidence) exist and are tested; they are simply not wired into the request path.

**Performance — healthy after the region fix.** `/signin` ~352 ms, `/result` ~188 ms, `/review` ~366 ms (was 1.4 s / 2.2 s / 7.4 s cross-region). 20-concurrent burst: 20×200, zero 5xx. Watch items: P2-1, P2-2.

**Exam integrity — the strongest area.** Server-authoritative deadline surviving reload (verified live: timer continued 59:46→59:26), writer-lease with fail-closed enforcement and explicit takeover, `client_mutation_id` idempotency, CAS on answer revision, DB-enforced single submission per attempt (verified: double-submit → 1 submission, 1 result, `submission_replayed` audit event), deterministic scoring from a frozen snapshot with checksum verification, and answer keys structurally excluded from student projections (verified: zero leakage across server HTML, RSC payload, inline scripts, and all 9 client JS chunks). Gap: P1-1.

**Data integrity/privacy — good structural discipline.** Immutable grants/attempts/submissions/results, append-only audit with no free-form JSONB column to leak into, `ranking_entries` referencing pseudonymous subjects rather than users, commerce payload redaction wired. Gaps: P2-3, and no documented retention/erasure procedure — **OD-07 (Indonesian legal/privacy review) remains an open hard gate in CLAUDE.md and is not satisfied by anything in this repository.**

**Rate limiting/abuse — P0-3.** Nothing implemented; no middleware chokepoint.

**Operational readiness — runbook is real, tooling is thin.** dok 30 covers severity levels, incident flow, rollback order, and continuity properly. Against it: no scheduler (P1-1), no dashboards/alerts (P1-2), no rehearsed restore (P1-7), no working kill-switch (P0-2). The runbook currently describes an operational capability the codebase does not yet have.

**WordPress/commerce — correctly not started.** `packages/db/src/commerce/` has substantial implementation (purchase lifecycle, event ingestion with HMAC-relevant raw-payload handling, outbox, SKU mapping, reconciliation). **No webhook or commerce HTTP surface exists in `apps/web`** — verified. `OD-01` (Sejoli event/signature/retry/refund semantics) and `OD-02` (WordPress bridge and safe account linking) remain open hard gates. This is the correct posture: production commerce must not be activated merely because code exists (CLAUDE.md). The production sign-in path depends on OD-02, so **production has no real authentication story yet** — the deterministic seam is explicitly dev/staging-only.

---

## Production rollout proposal

**Do not create Supabase Production yet.** Creating it now buys nothing: no production data can flow until OD-02 closes (no real login), production commerce is gated behind OD-01, and the current code would deploy P0-1 to a production URL. It adds a credential and an attack surface to manage with no offsetting benefit.

**Recommended sequence:**

1. **Close P0-1** — remove the `?userId=` seam from all three routes; add a role check on the admin route surfaced as 404. Small, well-scoped, testable. _(Blocking.)_
2. **Close P0-3** — add `middleware.ts` with a limiter on `/signin` at minimum, honouring `RATE_LIMIT_ENABLED`. _(Blocking.)_
3. **Close P0-2** — wire `loadFlags()` into `apps/web` startup and gate at least `FEATURE_EXAM_ENGINE` and `PRODUCTION_WRITES_ENABLED`, so the runbook's containment lever exists. _(Blocking.)_
4. **P1-2 + P1-3 together** — error boundaries that log through the existing structured logger with a correlation ID. These are one coherent piece of work and turn incident response from blind to traceable.
5. **P1-1** — a scheduler (Vercel Cron is sufficient) for `finalizeExpiredAttemptIfDue` and `releaseResult`. Required before any ranked cohort.
6. **P1-7 + P1-6** — confirm the Supabase plan actually provides PITR at RPO ≤ 15 min; rehearse one restore; add previous-version-schema migration testing to CI.
7. **P1-4, P1-5, then P2s.**
8. **Only then** create Supabase Production + a Vercel production environment (region `icn1`, matching staging), with production credentials minted fresh and `?userId=` already gone.

**Gate to production traffic remains OD-01, OD-02, OD-04, OD-07, and OD-08** — all still open in CLAUDE.md and none closable by engineering work alone.

---

## Scope compliance

No production infrastructure created. No production data touched. No migration, contract, schema, Supabase, or Vercel configuration change. Review N+1 not fixed (recorded as P2-1). No unrelated code changes — this audit adds exactly one Markdown file. Live probes were read-only `GET`s against staging; the only writes were pre-existing staging fixture rows from earlier verification sessions.
