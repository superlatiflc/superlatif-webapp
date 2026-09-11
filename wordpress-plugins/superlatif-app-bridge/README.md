# Superlatif App Bridge (WordPress plugin)

One-time sign-in bridge from the Superlatif WordPress site to the Superlatif Web App. It covers M1 and is recorded as ADR-072 in `docs/gates/26_ADRS.md`.

> **Status: NOT INSTALLED anywhere.** This plugin has only run in the repository's own tests and in a local, throwaway WordPress Playground. Do not install it on the live `superlatif.id` until the OD-02 spike below passes on a staging copy and the founder approves production activation.

## What it does, and what it does not do

| Does                                                                                                      | Does not                                                                   |
| --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Issues a single-use code to a user who is **already logged in to WordPress**, using WordPress's own login | Handle passwords. Recovery stays WordPress's own "lost password" flow      |
| Binds each code to one app client (audience), one environment, the WordPress user, and the app's state    | Send email, phone, name, or any profile field to the app                   |
| Redeems the code **server-to-server** for the WordPress user ID, signed with a per-client HMAC key        | Expose WordPress cookies, application passwords, or sessions               |
| Stores only a SHA-256 hash of each code, in its own table (`{prefix}superlatif_bridge_codes`)             | Read or write Sejoli data, orders, memberships, users, roles, or user meta |
|                                                                                                           | Compute access or entitlement (that is M2, in the app)                     |

## Flow

```text
Browser            Web App                         WordPress (this plugin)
   | GET /auth/bridge/start?next=/tryouts
   |------------------->| mint state; httpOnly __Host- state cookie
   |<-- 307 ------------| to /wp-admin/admin-post.php?action=superlatif_bridge_authorize&client_id&state
   |------------------------------------------------->| not logged in? -> wp-login.php, then back
   |                                                  | logged in: store sha256(code), client, user, sha256(state), exp=+120s
   |<-- 302 to the client's CONFIGURED redirect_uri ?code&state ------|
   | GET /auth/bridge/callback?code&state
   |------------------->| state == cookie? rate limit
   |                    |-- POST /?rest_route=/superlatif-bridge/v1/exchange (HMAC-signed) -->|
   |                    |                              atomically mark used; check expiry, client, state
   |                    |<-- 200 {version, subject, audience, environment} + HMAC over claims --|
   |                    | verify signature, audience, environment
   |                    | (wordpress, subject) -> internal user_id; revoke old session; new session
   |<-- 307 /tryouts ---| __Host-slf_session (HttpOnly, Secure, SameSite=Lax, Path=/)
```

## Security properties

| Property              | How                                                                                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Single use            | One conditional `UPDATE ... WHERE used_at IS NULL`. A code shown with the wrong state, by the wrong client, or after expiry is burned as well       |
| Short TTL             | 120 s (`SUPERLATIF_BRIDGE_CODE_TTL`). App-side state cookie: 10 min                                                                                 |
| Audience binding      | A code is stored with its client ID and redeemable only by the same client. The app checks that the signed `audience` equals its own client ID      |
| Environment binding   | Each client has one environment. The app states its `APP_ENV` in the request and checks the signed `environment`                                    |
| Client authentication | HMAC-SHA256 over `v1\n<timestamp>\n<raw body>`, ±300 s window, compared with `hash_equals`. The secret never crosses the wire                       |
| Response integrity    | HMAC over the canonical claims (`v1`, timestamp, version, subject, audience, environment)                                                           |
| Login CSRF            | The state is minted by the app, bound into the code, and must match an httpOnly cookie held only by the browser that started the flow               |
| No open redirect      | The plugin redirects only to the client's configured `redirect_uri` (through `wp_safe_redirect`). The app redirects only to allowlisted local paths |
| Minimal data          | The code table holds hashes, a client ID, a user ID, and timestamps. Rows are purged 24 h after expiry                                              |
| Sanitized errors      | `invalid_client` (401), `invalid_request` (400), `invalid_grant` (400), with fixed messages that never say which check failed                       |

## Configuration (wp-config.php only)

There is no settings screen and nothing is stored in `wp_options`. Add this above `/* That's all, stop editing! */`:

```php
define( 'SUPERLATIF_BRIDGE_CLIENTS', array(
    'superlatif-web-staging' => array(
        'secret'       => getenv( 'SUPERLATIF_BRIDGE_STAGING_SECRET' ), // or the value itself; never commit it
        'redirect_uri' => 'https://<staging-app-host>/auth/bridge/callback',
        'environment'  => 'staging',
    ),
) );
```

Rules the plugin enforces (an invalid entry is ignored and logged by client ID only):

- The client ID matches `^[a-z0-9][a-z0-9-]{2,63}$`, and the Web App uses the same value as `WP_BRIDGE_CLIENT_ID`.
- The secret is at least 32 characters, is dedicated to this one client, and equals the app's `WP_BRIDGE_CLIENT_SECRET`.
- `environment` equals the app deployment's `APP_ENV`.
- `redirect_uri` is `https://…/auth/bridge/callback` with no query string. Plain `http://localhost` is accepted only for an `environment` of `development`.
- Production and staging are **separate clients with separate secrets**.

---

# OD-02 spike package

## 1. Installation procedure (staging copy of WordPress; never the live site)

Prerequisites:

- A **staging copy** of the `superlatif.id` WordPress install with Sejoli, on HTTPS. If none exists, creating one is the first blocker.
- WordPress 5.8 or later, and PHP 7.4 or later.
- Admin access to that copy, and to Vercel for the app's Preview environment.

Steps:

1. **Back up** the staging WordPress database and files.
2. **Build the plugin zip** from the repository root. The tests are excluded:
   `cd wordpress-plugins && zip -r superlatif-app-bridge.zip superlatif-app-bridge -x 'superlatif-app-bridge/tests/*'`
3. **Generate the staging secret on your own machine** and keep it off chat, tickets, and git:
   `openssl rand -base64 48 | tr -d '\n'`
   Store it in your password manager.
4. **wp-config.php** on the staging copy: add the `SUPERLATIF_BRIDGE_CLIENTS` block above. Use client ID `superlatif-web-staging`, environment `staging`, and a `redirect_uri` on the Preview host that will run the test. Paste the secret directly on the server, or set it as a host environment variable.
5. **Upload and activate:** go to Plugins → Add New → Upload Plugin, choose `superlatif-app-bridge.zip`, then Activate. Activation creates `{prefix}superlatif_bridge_codes` and the option `superlatif_bridge_db_version`.
6. **Vercel (Preview scope only):**
   `vercel env add WP_BRIDGE_BASE_URL preview` (the staging WordPress root, `https://…`)
   `vercel env add WP_BRIDGE_CLIENT_ID preview` (`superlatif-web-staging`)
   `vercel env add WP_BRIDGE_CLIENT_SECRET preview --sensitive` (paste from your password manager at the prompt)
   Leave `FEATURE_STUDENT_LOGIN` **unset** in Preview; outside production an unset flag means "on". Then redeploy Preview.
7. **Smoke check:** `/signin` on the Preview URL now shows "Masuk dengan akun Superlatif".

## 2. Sanitized test procedure

Use **dedicated test accounts** created for the spike, never a real student. Record results in the table in §6. Before sharing any evidence, replace every code, state, signature, cookie, and secret with `<redacted>`.

| #   | Test                   | Steps                                                                                                                                                    | Expected                                                                                                   |
| --- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| T1  | Logged-out start       | In a private window, open `/signin` → "Masuk dengan akun Superlatif"                                                                                     | WordPress login page, then back to the app, landing on `/tryouts`, signed in                               |
| T2  | Logged-in start        | Already logged in to WordPress, click the button                                                                                                         | Straight back to the app, signed in, with no WordPress prompt                                              |
| T3  | Returning user         | Sign out of the app, then sign in again with the same account                                                                                            | Same internal user, not a second account. The app logs `linkDecision=link_existing`                        |
| T4  | Replay                 | Capture a callback URL (browser devtools, Network tab, "Preserve log"), let it complete, then open the same URL again                                    | `/signin?error=bridge`, no second session                                                                  |
| T5  | Expiry                 | Block the callback (for example, go offline once the WordPress redirect fires), wait over 120 s, then load the callback URL                              | `/signin?error=bridge`                                                                                     |
| T6  | Wrong state            | Start in browser A, then open the callback URL in browser B                                                                                              | `/signin?error=bridge` (B has no state cookie); the code is burned                                         |
| T7  | Cross-environment      | Temporarily point a local app at the staging WordPress with a **different** client (for example a `development` client) and try to redeem a staging code | Rejected. The code is never accepted by the other client                                                   |
| T8  | Wrong secret           | Briefly set a wrong `WP_BRIDGE_CLIENT_SECRET` on a throwaway Preview deployment                                                                          | `/signin?error=bridge_unavailable`; the Vercel log shows `auth.bridge.exchange_failed` / `client_rejected` |
| T9  | Server-to-server reach | T1/T2 from a Vercel Preview deployment, not from a laptop                                                                                                | No WAF or CDN challenge on `POST /?rest_route=/superlatif-bridge/v1/exchange`. Note the latency            |
| T10 | Deleted account        | Issue a code, delete that test user in WordPress before the redirect completes (or use T5's pause), then load the callback                               | `/signin?error=bridge`                                                                                     |
| T11 | Data minimality        | `SELECT * FROM {prefix}superlatif_bridge_codes LIMIT 5` on the staging database                                                                          | Only hashes, client ID, user ID, and timestamps. No code, email, or IP                                     |
| T12 | No side effects        | Compare user count, Sejoli order count, and a test user's roles before and after the spike                                                               | Unchanged                                                                                                  |
| T13 | Uninstall              | Run §7 on the staging copy                                                                                                                               | Table and option gone; users and Sejoli untouched                                                          |

## 3. The WordPress/Sejoli identifier that must be observed (M1 Phase A)

The app links a WordPress login as provider `wordpress`, with the subject set to the WordPress `user_id`. That value is proven: the plugin reads it from WordPress's own authenticated session.

What the repository **cannot** prove is how the commerce side's `sejoli_bridge` `externalUserId` relates to that `user_id`. M2 resolves purchases through that field (`purchase-lifecycle-service.ts`, `reconciliation-repair-service.ts`). The only evidence so far is synthetic fixture values (`wp-user-N`) and dok 23 §4, which lists `wordpress_user_id` and `sejoli_customer/member_id` as **separate** identifiers. OpenAPI also allows `externalUserId` to be `null`.

For at least **two** test accounts, plus **one** account created by checking out as a new buyer, record:

1. The WordPress `user_id`: the `subject` the bridge returns, as shown in the Vercel log or the Users screen.
2. For a test order placed by that account in Sejoli, every field that identifies the buyer in:
   - the Sejoli order record or export;
   - the payload of the hook or webhook that the OD-01 spike captures.
3. Whether Sejoli can complete a checkout **without** creating or linking a WordPress user. If so, record which buyer identifier such an order carries.
4. Whether any buyer identifier changes when the user changes their email in WordPress, or in Sejoli.

The outcome decides the canonical M2 rule:

- **(a) The buyer field always equals the WordPress `user_id`:** M2 resolves `sejoli_bridge` purchases against the `wordpress` login identity using that value. No bridge change is needed.
- **(b) A distinct, stable Sejoli customer ID exists:** the bridge adds it as a second signed claim, and the app links it as a second verified external identity at sign-in. That is a protocol v2 change, reviewed on its own.
- **(c) There is no stable mapping, or guest orders have no user:** M2 stays blocked on a reconciliation design. Email is still never used as the merge key.

## 4. Expected sanitized bridge request (app → WordPress)

```http
POST /?rest_route=/superlatif-bridge/v1/exchange HTTP/1.1
Host: <wordpress-host>
Content-Type: application/json
X-Superlatif-Bridge-Client: superlatif-web-staging
X-Superlatif-Bridge-Timestamp: 1767225600
X-Superlatif-Bridge-Signature: <redacted: 64 hex chars>

{"code":"<redacted: 43 chars>","state":"<redacted: 43 chars>","environment":"staging"}
```

## 5. Expected sanitized bridge response (WordPress → app)

Success:

```http
HTTP/1.1 200 OK
Content-Type: application/json
Cache-Control: no-store
X-Superlatif-Bridge-Timestamp: 1767225601
X-Superlatif-Bridge-Signature: <redacted: 64 hex chars>

{"version":1,"subject":"<wordpress user id>","audience":"superlatif-web-staging","environment":"staging"}
```

Failures. Each message is fixed and never says which check failed:

```json
{ "code": "invalid_grant", "message": "The code is invalid or has expired.", "data": { "status": 400 } }
{ "code": "invalid_client", "message": "Client authentication failed.", "data": { "status": 401 } }
{ "code": "invalid_request", "message": "Malformed request.", "data": { "status": 400 } }
```

`tests/vectors.json` holds exact, reproducible signatures for both directions under a synthetic key.

## 6. Pass/fail criteria

**PASS** only if all of the following hold. Any single failure is a FAIL: do not activate production, and record which one failed.

1. T1–T3: sign-in works for logged-out and logged-in users with no second registration, and a returning user maps to the same internal user.
2. T4–T8 and T10: every negative case is rejected as stated, and none creates a session.
3. T9: the exchange is reachable from Vercel, not blocked by a WAF, bot protection, a security plugin, or a disabled REST API. p95 latency is under 1.5 s.
4. T11–T12: data minimality and no side effects are confirmed.
5. §3: the identifier observation yields outcome (a) or (b), each with written evidence.
6. T13: uninstall is clean.
7. No secret, code, or real student data appears in any shared evidence.

## 7. Rollback / uninstall

The order matters: switch off the app side first, so no one sees a broken button.

1. **App:** unset `FEATURE_STUDENT_LOGIN` or set it to `false` (production default: unset), then redeploy. The bridge routes answer 404 and `/signin` stops offering the button. Existing sessions stay valid until they expire. Revoking all of them immediately is a separate, approved operator action; there is no "revoke all" command yet.
2. **WordPress:** Plugins → Superlatif App Bridge → Deactivate. Authorize and exchange stop at once.
3. Plugins → Delete. `uninstall.php` drops `{prefix}superlatif_bridge_codes` and deletes `superlatif_bridge_db_version`. Nothing else was ever created.
4. Remove the `SUPERLATIF_BRIDGE_CLIENTS` block from `wp-config.php` and any host environment variable holding the secret.
5. **Vercel:** remove `WP_BRIDGE_BASE_URL`, `WP_BRIDGE_CLIENT_ID`, and `WP_BRIDGE_CLIENT_SECRET` from the affected scope. Destroy the secret, and generate a new one if you reinstall.

WordPress users, passwords, roles, and all Sejoli data are untouched at every step.

## Tests

- `pnpm run test:wp-bridge` lints every PHP file and runs `tests/run.php`. It uses system PHP, or falls back to `@php-wasm/cli`. CI runs it on every push.
- The TypeScript side of the protocol is tested in `packages/integrations/src/wordpress-bridge/`, against the same `tests/vectors.json`.
