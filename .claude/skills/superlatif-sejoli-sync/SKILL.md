---
name: superlatif-sejoli-sync
description: Implement or audit Superlatif WordPress/Sejoli identity bridge, checkout handoff, provider event ingestion, purchase projection, grant synchronization, refund handling, and reconciliation. Use only for the commerce/identity integration boundary; real behavior must be grounded in captured staging evidence.
---

# Superlatif Sejoli Sync

## Read first

Read the relevant sections from:

- `docs/gates/05_PRODUCT_CATALOG_AND_ENTITLEMENT.md`;
- `docs/gates/13_PRD.md`;
- `docs/gates/22_API_AND_WEBHOOK_CONTRACT.md`;
- `docs/gates/23_SEJOLI_WORDPRESS_INTEGRATION.md`;
- `docs/gates/24_AUTH_RBAC_SECURITY_AND_PRIVACY.md`;
- `docs/gates/25_MIGRATION_AND_RECONCILIATION_PLAN.md`;
- `docs/gates/27_QA_TESTING_AND_UAT_PLAN.md`;
- canonical OpenAPI and purchase/access fixtures.

OD-01 and OD-02 remain blocked until real staging evidence is attached. Synthetic adapter work is allowed; invented production behavior is not.

## Boundary model

Keep these layers distinct:

1. raw provider envelope (restricted/redacted + checksum);
2. verification and anti-replay;
3. provider adapter normalization;
4. canonical purchase transition;
5. versioned external SKU mapping;
6. source-scoped grant update;
7. effective access projection;
8. reconciliation/explanation/support workflow.

WordPress/Sejoli owns checkout/payment/affiliate/kupon/refund mechanics on MVP. The app owns its canonical purchase projection and learning access grants.

## Identity bridge

- Exchange a signed, short-lived, audience-bound, one-time code.
- Verify nonce/replay/expiry/key ID using the proven bridge contract.
- Link by stable external subject/provenance.
- Never auto-merge by email/name/phone alone.
- Preserve safe return path and reject open redirect.
- Session/logout/revocation behavior must be tested.
- Identity conflicts enter a review queue with no credential exposure.

## Event and purchase invariants

- Verify the exact bytes and algorithm demonstrated by provider staging evidence.
- Timestamp/replay/event ID checks occur before business side effects.
- Store a redacted raw envelope and checksum for audit/replay diagnosis.
- Normalize to canonical states only through an explicit mapping version.
- Canonical states: `pending`, `paid`, `failed`, `expired`, `cancelled`, `refunded_partial`, `refunded_full`, `chargeback`.
- A repeated event does not duplicate purchase transition, outbox, or grant.
- Out-of-order event behavior is deterministic and tested.
- Amount, coupon, affiliate, partial refund, and chargeback semantics are not inferred from names alone.
- Unknown SKU/user/state creates reconciliation; it never grants broad default access.

## Grants and recovery

- Purchase-derived grant references purchase/event/mapping/product/offer versions.
- Refund/revoke affects only grants from that source.
- Another active source continues to support access.
- Paid-to-access side effects are recoverable through outbox/replay.
- Support can explain access and preview a manual action without SQL edits.
- Never ask a verified paid user to repurchase while reconciliation is pending.

## Required tests

Use and extend:

- `purchase-events.cases.json`;
- `entitlement-resolution.cases.json`;
- `migration-reconciliation.cases.json`.

Cover success, invalid signature, expired timestamp, replay, duplicate, out-of-order, timeout after commit, unknown SKU, identity conflict, paid-no-access, refund with overlapping scholarship, chargeback, and bridge events during migration.

Separate provider contract tests from canonical domain tests. Provider samples must record source, capture time, environment, redaction method, and approval; never commit live credentials or unnecessary PII.

## Stop conditions

Stop if real signature, canonical body, retry, refund, stable identifier, SSO, or logout behavior is unknown. Return the missing staging capture/owner. Do not copy assumptions from generic WooCommerce/Sejoli examples into the live adapter.

Do not perform a live webhook, checkout, order, refund, user link, or production migration unless explicitly authorized for that exact action.

## Completion

Report provider evidence used, mapping/version, replay/idempotency key, transaction/outbox boundary, affected grants/access explanation, reconciliation path, redaction/logging, and whether OD-01/OD-02 remains open.
