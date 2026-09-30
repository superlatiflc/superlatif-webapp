# OD-01 / M2 — Staging Acceptance Evidence

**Date:** 25–29 September 2026
**Scope:** Sejoli purchase → app entitlement (ADR-074), exercised end to end against the real Superlatif WordPress + Sejoli **staging** copy: signed webhook delivery from bridge plugin 1.2.0, purchase lifecycle, grants, effective access, automatic claim, revocation, and replay.
**Result:** **OD-01: PASS on staging.** **M2 Staging Purchase → Entitlement: PASS.** **M2 Production Activation: not started** — it needs the founder-approved steps in §7.

Nothing in this record is a secret. No webhook secret, signature, Vercel bypass token, cookie, session value, or connection string appears below; user, grant, attempt, and raw-event IDs are truncated to their first 8 characters. WordPress user IDs are staging test accounts.

## 1. What was tested

| Item | Value |
| --- | --- |
| Implementation commit | `878de9c` on `feat/m2-purchase-entitlement` (+ `91d3361`, staging seed script only) |
| Deployed commit | `803b8ac` on `od02` — non-destructive merge of `878de9c`; tree identical to `878de9c`; M1 (`edcf425`) included |
| Preview deployment | `dpl_G4kWE7xdkW5FAMrHXAr9q5nPJutk` (redeployed so `SEJOLI_WEBHOOK_SIGNING_SECRET` is bound), alias `superlatif-webapp-web-git-od02-superlatifs-projects.vercel.app` |
| Plugin | Superlatif App Bridge **1.2.0**, ZIP `superlatif-app-bridge-1.2.0-878de9c.zip`, SHA-256 `5a7a0520800ec6cfa1e7199b17cc789c36182941fbf01c9f2d9a273249d906ab`; 123/123 plugin tests on PHP 7.4.33 and 8.5 |
| WordPress / Sejoli | `wp-staging.superlatif.id`; Sejoli `README.txt` byte-identical to the 1.14.2 package whose source the adapter was built from |
| App database | Supabase staging `mpjvqtozvhcckgswtunt` |
| Catalogue | `seed-staging-commerce.ts --sejoli-product-id=445`: batch `TO-STG-M2`, policy `STG_M2_POLICY_SJ_445` (`start_attempt` on `exam_batch:TO-STG-M2`), SKU mapping `(sejoli_bridge, wp-staging.superlatif.id, 445)` v1 |
| Test accounts | A = WordPress user 5638 (app user `519548e8…`, signed in before buying); B = WordPress user 5639 (never signed in before buying) |

## 2. OD-01 capture (provider behaviour observed on staging)

| Question (dok 22 §22) | Observed |
| --- | --- |
| Hooks that fire | `sejoli/order/set-status/on-hold` at checkout; `…/completed`, `…/cancelled`, `…/refunded` on admin status changes. Each produced exactly one outbox event |
| Stable identifiers | Order `ID` (9527, 9528), `product_id` 445, `user_id` = WordPress `users.ID` (5638, 5639) on every event |
| Status → wire map v1 | `on-hold`→`order_pending`, `completed`→`payment_settled`, `cancelled`→`order_cancelled`, `refunded`→`refund_full` — all as ADR-074 |
| Amount / currency | `grand_total` 10000 for a Rp10.000 product → `grossMinor` 10000 IDR; refund carries `refundedMinor` 10000 |
| Signature | All 6 real deliveries `signature_outcome = verified`; probes with a wrong signature → 401, unknown key → 403, no bypass → Vercel SSO 401 |
| Retry / duplicate | First delivery of #9527 `order_pending` failed at transport level (status 0, outbound HTTP blocked on staging); the WP-Cron retry delivered the same event ID → 202, one raw event. A deliberate replay of a delivered event → `202 duplicate=true` |
| Timestamps | `occurredAt` is UTC; staging MySQL displays UTC+8 (outbox `created` 12:13:49 = 04:13:49Z) |
| Latency | Status change → app receipt 2–4 s |

## 3. Gate results

| Gate | Result | Evidence |
| --- | --- | --- |
| Not bought → no access | **PASS** | A pressed Mulai on `TO-STG-M2` before buying: denied (26 Sep 04:10 UTC); access `NOT_CLAIMED` |
| `pending` grants nothing | **PASS** | #9527 and #9528 `pending`: purchase recorded, 0 grants |
| `paid` → access | **PASS** | #9527 `payment_settled` 08:11:31Z → purchase `paid`, exactly 1 grant `8a155aae…` (`exam_batch:TO-STG-M2`, `start_attempt`), access `ACTIVE_GRANT`; A opened the tryout in the UI, attempt `7ec26ce1…` `submitted` and scored (`provisional`, release window 26 Oct by design) |
| Purchase before first sign-in → automatic claim | **PASS** | #9528 `paid` while unbound: 0 grants, 2 `unresolved_identity` cases open. B's first bridge sign-in 12:22:59Z created identity `wordpress/5639` → user `adcf1926…`; `/home` claim bound the purchase at 12:23:01Z, issued exactly 1 grant, resolved both cases with `resolvedBy = null` (`buyer_identity_linked_by_bridge_sign_in`) |
| No cross-user access | **PASS** | While #9528 was unbound, A's `/home` (claim runs every visit) did not take it. After binding: A 1 grant/1 purchase, B 1 grant/1 purchase, policy grants exactly 2 |
| `cancelled` revokes only that purchase | **PASS** | #9528 `order_cancelled` 12:48:53Z → `cancelled`, grant `96e7b89a…` revoked once (`purchase_cancelled`), B access `NO_ACTIVE_GRANT`; B pressed Mulai → server refused ("Akses berakhir atau belum tersedia."), 0 attempts; A untouched |
| `refund_full` revokes only that purchase | **PASS** | #9527 `refund_full` 29 Sep 04:50:41Z → `refunded_full`, grant `8a155aae…` revoked once (`purchase_refunded_full`), A access false; A's submitted attempt retained as history |
| Replay / idempotency | **PASS** | Outbox row 2 (#9527 `payment_settled`) re-sent once through the plugin's own signing path, no database write in WordPress → `HTTP 202 accepted=true duplicate=true receipt=bcb0a700`; Preview log `duplicate=true ingest=duplicate lifecycle=already_processed`; full staging snapshot before/after **identical** |
| Data integrity | **PASS** | End state: 6 raw events, all `verified` and `normalized`, 0 quarantine, 0 unprocessed; 0 open reconciliation cases |

Production was not touched at any point: alias `dpl_DzmkbRpAwtAoGZUYLRSs7GdHSyxz`, 10 env vars without `FEATURE_COMMERCE_SYNC`/`SEJOLI_WEBHOOK_SIGNING_SECRET`/`WP_BRIDGE_*`, `PRODUCTION_WRITES_ENABLED=false`, webhook route 404, production DB 24/24 migrations and 0 business rows, plugin absent on `superlatif.id`.

## 4. Not exercised on staging

- **Refund after cancellation.** No such event reached the app. By implementation `cancelled` is terminal: the event would be recorded as `ignored_out_of_order` with an `ambiguous_transition` case and no grant change (integration-tested).
- **Partial refund, chargeback, expiry.** Sejoli core has no such status; the adapter never produces them.

## 5. Findings

1. **Transport errors are not recorded by plugin 1.2.0.** `last_http_status = 0` carries no reason; the staging cause (outbound HTTP blocked, fixed with `WP_ACCESSIBLE_HOSTS`) needed a manual `wp eval`. Proposed plugin 1.2.1: store and log the `WP_Error` code on every failed attempt.
2. **WP-Cron is traffic-driven.** On staging, retries needed a manual `wp cron event run`. Production should run a system cron for `wp-cron.php`.
3. **One `unresolved_identity` case per event** for an unbound buyer (2 for #9528). All close on claim; merging them is a support-queue nicety.
4. **The tryout page shows "Bisa dikerjakan" and Mulai without access** (pre-existing; decided by the batch window only). The server refuses correctly.
5. **`attempts.submitted_at` is null on every submitted attempt** (pre-existing; the time lives in `attempt_submissions`).
6. **`/home` shows only programs**, so a batch-only grant still reads "Belum ada program yang aktif" (M3 scope).
7. The Preview `SEJOLI_WEBHOOK_SIGNING_SECRET` is scoped to all Preview branches, not only `od02` (functionally inert elsewhere; tidy up).

## 6. Scripts used (read-only unless stated)

- `packages/db/scripts/seed-staging-commerce.ts` — staging catalogue (writes; refuses `APP_ENV=production`).
- `packages/db/scripts/verify-staging-m2.ts --order=<id>` — purchase, events, grants, effective access, cases.
- Ad-hoc read-only SQL snapshots compared before/after the replay.

## 7. Remaining for M2 production activation (each needs founder approval)

1. M1 active in production (domain `app.superlatif.id`, production client + new secrets, plugin on `superlatif.id`, LiteSpeed exclusion, `FEATURE_STUDENT_LOGIN=true`).
2. Production catalogue: which Sejoli products grant which program/batch access, for how long (M3), created through the governance services — never the staging seed.
3. A production `SEJOLI_WEBHOOK_SIGNING_SECRET` (new, ≥ 32 chars, not the sign-in secret) in Vercel Production and the production client's `webhook_secret`; no Vercel bypass for production.
4. Live WordPress: outbound HTTP to the app host allowed, system cron for WP-Cron, Sejoli version confirmed.
5. `PRODUCTION_WRITES_ENABLED=true` — a launch decision (it also opens exam writes).
6. Backup/PITR confirmed and auto-pause removed (M6); OD-07 legal/privacy review; a support owner and process for reconciliation cases; production log retention/alerting (M5).
