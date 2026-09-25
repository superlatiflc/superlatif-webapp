# OD-02 / M1 — Staging Acceptance Evidence

**Date:** 24 September 2026
**Scope:** the WordPress one-time bridge on its permanent path (ADR-072 as revised by ADR-073), exercised against the real Superlatif WordPress + Sejoli **staging** copy.
**Result:** **OD-02: PASS on staging.** **M1 Staging Authentication: PASS.** **M1 Production Activation: not started** — it needs the founder-approved steps listed at the end.

Nothing in this record is a secret. No cookie value, state, authorization code, HMAC, client secret, session secret, or connection string appears anywhere below; session and user IDs are truncated to their first 8 characters.

## 1. What was tested

| Item | Value |
| --- | --- |
| Implementation commit | `edcf425` on `feat/m1-bridge-frontend-authorize` |
| Deployed commit | `8e36587` on `od02` — a non-destructive merge of `edcf425`; its tree `8821b556…` is byte-identical to `edcf425` (`git diff edcf425..8e36587` is empty) |
| Preview deployment | `dpl_5FYLKLgz3BTYaLA1BK8PHeYs3Ugj`, alias `superlatif-webapp-web-git-od02-superlatifs-projects.vercel.app` (the host registered as the staging client's `redirect_uri`) |
| Plugin | Superlatif App Bridge **1.1.0**, ZIP `superlatif-app-bridge-1.1.0-edcf425.zip`, SHA-256 `5fffa193376f3294aa4c7a33d0bc6bf647f5ae5f5256cef1ecc32db95cd358a9`. The README served by the staging site is byte-identical to the one in `edcf425` |
| WordPress | `wp-staging.superlatif.id` (staging copy of `superlatif.id`, Sejoli active) |
| App database | Supabase staging `mpjvqtozvhcckgswtunt` |
| Workaround mu-plugins | `10-bridge-authorize-pass.php` and `20-bridge-login-return.php` **absent** (HTTP 404) for the whole run; `00-staging-guard.php` present and active (`X-Robots-Tag: noindex, nofollow`) |
| Cache exclusion | LiteSpeed → Cache → Excludes → Do Not Cache Query Strings: `superlatif_bridge` |

## 2. Identity mapping (spike §3)

Outcome **(a)**, recorded by the founder on 12 September 2026: for the staging test account, the Sejoli order row's `user_id` equals the WordPress `users.ID` (`splt_sejolisa_orders.user_id = 5638`, order `9526`, status `completed`). The bridge links provider `wordpress` with that same `users.ID` as the subject, so M2 can resolve Sejoli purchases to the bridge identity without a protocol change. Email is never a merge key.

## 3. Gate results — permanent path (24 September 2026)

| Gate | Result | Evidence |
| --- | --- | --- |
| T1 — sign-in while logged out of WordPress | **PASS** | Founder's browser run (Incognito): `/signin` → WordPress staging login → `/tryouts`, no second login, dev path unused. Server: `start` 10:38:29 → `callback` 10:38:41 WIB → `auth.bridge.signed_in` (`link_existing`) → `/tryouts`; session `1bc06ea2…` created in staging DB |
| T2 — WordPress already logged in | **PASS** | `start` 10:41:06.70 → `callback` 10:41:08.25 WIB (1.5 s — no WordPress prompt possible); `signed_in` / `link_existing`; session `828584e6…` |
| T3 — session rotation | **PASS** | Opening `/auth/bridge/start` from a signed-in Preview session: old `828584e6…` `revoked_at` = new `e0ec5129…` `expires_at` − 8 h = `03:45:51.094Z` — the same application clock value, i.e. one transaction. The earlier pair (`1bc06ea2…` → `828584e6…`, a sign-out 130 s apart) evaluates `false`, so the check discriminates. One active session remains |
| T9 — identity | **PASS** | `provider = wordpress`, `external_subject = 5638`; every sign-in resolves to the same internal user `519548e8…`; 0 new identities, 0 new users, 0 identity conflicts since the deployment; the user row's email, phone, and display name are all `null` |
| T14 — cache security | **PASS** | Logged out, two identical authorize requests: both `302`, freshly generated (distinct cookie expiry times), no `x-litespeed-cache` header, `cache-control: no-cache, no-store, must-revalidate, max-age=0`, `x-litespeed-cache-control: no-cache`, `pragma: no-cache`, `expires: 0`, `x-accel-expires: 0`, `cdn-cache-control: no-store`, `referrer-policy: no-referrer`. Exclusion proven effective on its own: a control URL (`/?zzcachecontrol=…`) went `miss` → `hit`, while `/?superlatif_bridge=cacheprobe` — a value the plugin ignores, so no plugin headers — was never cached. Logged in, three separate exchanges succeeded; a cached authorize response would have carried an already-burned code and failed |
| T15 — ordinary Sejoli login | **PASS** | Founder's browser run: direct `/member-area/login` lands on `/dashboard-utama/`, not on the app. Server: after T2, exactly one new app session exists — the T3 rotation — so the ordinary login created none |
| Pending cookie | **PASS** | `superlatif_bridge_pending`: `Max-Age=600`, `path=/`, `secure`, `HttpOnly`, `SameSite=Lax`. Its value has exactly four parts (client ID, 43-char token, timestamp, 64-hex HMAC) and contains no URL, scheme, or host |
| Preview → staging only | **PASS** | `APP_ENV=staging` is proven by the protocol itself: the plugin refuses an exchange whose app environment differs from the client's configured `staging`, and three exchanges succeeded. Every session above landed in the staging database |

## 4. Earlier evidence the v1.1.0 change did not touch

The exchange side (REST endpoint, code store, signing) is unchanged since the 12–13 September spike, so this evidence still stands.

| Gate | Result | Evidence |
| --- | --- | --- |
| Wrong / missing client credential | **PASS** | Against staging: a request signed with a random key → `401 invalid_client`; unsigned → 401; stale timestamp → 401; GET on the exchange route → 404 |
| Replay (T4) | **PASS** | PHP plugin tests (`replayed code: invalid_grant`), TypeScript client tests over real HTTP, and WordPress Playground E2E with the identical plugin code. On staging MySQL: declared PASS by the founder after running the local `replay-check` script (13 September) |
| Expiry (T5), wrong state (T6), cross-client / cross-environment (T7, T8) | **PASS** | Playground E2E with a real 125 s wait; PHP and TypeScript suites; app-side state checks fail without calling WordPress |
| Deleted account (T10) | **PASS** | Playground: code issued, account deleted, exchange → `invalid_grant` |
| Data minimality (T11) | **PASS** | Code table has exactly `code_hash`, `client_id`, `wp_user_id`, `state_hash`, `created_at`, `expires_at`, `used_at`; hashes only, no plaintext token, no email/IP/user agent |
| No side effects on Sejoli / WordPress data (T12) | **PASS (static)** | The plugin writes only to its own table; no `wp_insert_*`, `wp_update_*`, `update_user_meta`, or Sejoli table access |
| Uninstall (T13) | **PASS** | Playground, real `uninstall.php`: table dropped, option removed |

## 5. Production isolation (read-only, 24 September 2026)

- Database `mfqfkxtrckacrwxltmxg`: verifier PASS, **0** business rows (0 users, sessions, identities).
- Vercel Production env: `APP_ENV=production`, `PRODUCTION_WRITES_ENABLED=false`, **no** `FEATURE_STUDENT_LOGIN`, **no** `WP_BRIDGE_*`; still 10 variables.
- Production alias unchanged on `dpl_GXcCSwAMXRVo5P9zBNmrMK9DTs6x`; `/auth/bridge/start`, `/auth/bridge/callback`, `/preview/login` → 404; `/signin` shows "Masuk belum tersedia".
- Live `superlatif.id`: bridge exchange endpoint 404 and no pending cookie on the authorize URL — the plugin is not installed.
- `main` unchanged at `5bd226f` throughout.

## 6. Findings

1. **Sejoli discards `redirect_to`.** The logged-out redirect goes to `/member-area/login` with no query string, so the pending cookie is the only carrier of the flow — which is exactly what ADR-073 designed for, and what T1 proved.
2. **Header normalisation (cosmetic).** The stack delivers WordPress's own `Cache-Control` form (without `private`) and normalises LiteSpeed's control header to `no-cache`. `no-store` is present and nothing is cached, so no change is needed.
3. **Vercel runtime-log retention is short.** Through the CLI, request logs for this deployment were no longer retrievable about an hour later. T3/T15 therefore rest on database evidence. Incident evidence must be captured at the time or via a log drain (M5).
4. **Supabase server fingerprint changes after pause/resume.** Baselines on 24 September 2026: production `00e9da5320b5f7e2`, staging `7d828ffda5c73134` (previously `09e02743…` and `48ebeb67…`). `projectRef` is stable and the two environments still differ, so isolation is unaffected.
5. **Free-tier auto-pause.** Both Supabase projects paused after roughly a week idle; the pooler then answered `tenant/user postgres.<ref> not found` although DNS and TCP were healthy. Data was preserved and a dashboard restore fixed it. Production must be on a plan that does not auto-pause before any student relies on it.

## 7. Remaining for M1 production activation (each step needs founder approval)

1. ~~Confirm the production app host.~~ **Decided 24 September 2026:** the founder confirmed `app.superlatif.id` as the final canonical Production domain (OQ-005). The launch plan now uses that host too. Still to do, each as an approved step: the DNS record and the Vercel Production domain. The production client's `redirect_uri` must then use this host. Because the bridge cookies are `__Host-` (host-only), sign-in has to start and finish on `app.superlatif.id`, not on the `vercel.app` alias. No DNS, domain, or `redirect_uri` has been configured yet.
2. Decide the session TTL policy (ADR-072 recommendation).
3. Move production Supabase to a plan without auto-pause and confirm PITR (M6).
4. On `superlatif.id`: configure the LiteSpeed `superlatif_bridge` exclusion, add a **production** client with a **new** secret to `wp-config.php`, install plugin 1.1.0.
5. On Vercel Production: add `WP_BRIDGE_BASE_URL`, `WP_BRIDGE_CLIENT_ID`, `WP_BRIDGE_CLIENT_SECRET`, then `FEATURE_STUDENT_LOGIN=true`; redeploy; run a controlled first sign-in.
6. `CLAUDE.md` still lists OD-02 as an open hard gate. It is a protected project-instruction file and was deliberately left unchanged; updating it is the founder's call.
