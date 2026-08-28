---
name: superlatif-domain
description: Implement or review Superlatif product, program, curriculum, progress, catalogue, entitlement, access-grant, upgrade, expiry, refund, and migration behavior. Use when a change decides what a learner owns, sees, or can do; do not use for exam scoring internals or provider-specific webhook verification alone.
---

# Superlatif Domain

## Read first

Read the task's relevant sections from:

- `docs/gates/05_PRODUCT_CATALOG_AND_ENTITLEMENT.md`;
- `docs/gates/13_PRD.md`;
- `docs/gates/14_PROGRAM_LMS_LIVE_CLASS_SPEC.md`;
- `docs/gates/21_ERD_AND_DATA_DICTIONARY.md`;
- `docs/gates/25_MIGRATION_AND_RECONCILIATION_PLAN.md` for legacy/migration work;
- `docs/gates/27_QA_TESTING_AND_UAT_PLAN.md` for evidence expectations.

If these files are not present at the expected paths, locate the exact filenames and do not substitute legacy documents.

## Model correctly

- Product is sold.
- Offer controls sale terms and price snapshot.
- Program is the learner experience.
- Track/module/resource compose the curriculum.
- Access grant is a source-scoped right.
- Effective access is a derived, explainable decision.
- Purchase state is not access state.
- Batch/form/blueprint are exam objects, not products.

Reuse resources; do not duplicate content per product.

## Preserve access invariants

- Combine supporting grants additively.
- Deduplicate equivalent claims by the canonical policy key.
- Revoke/expire/refund only the affected source grant.
- Keep access when another active grant supports the same target/action.
- Evaluate attempt allowance separately from content visibility.
- Return a stable reason code and safe explanation for allow/deny.
- Rebuild projection from source records and compare results in tests.
- Manual changes need actor, reason, preview, audit, and approval where high-risk.
- `UNVERIFIED` legacy promises never create automatic grants.

## Program and progress

- The home page shows one primary program and one next action.
- A user's manual primary-program choice wins; urgency elsewhere is a visible banner, not a silent switch.
- The primary percentage is `completed_or_waived_required / released_required`.
- Optional activities remain visible but outside the main denominator.
- A resource version change cannot erase a valid completion.
- Access expiry may retain read-only history according to product policy; it cannot expose protected content by accident.

## Test the hard cases

Always include applicable cases:

- bundle plus single product overlap;
- upgrade;
- refund plus scholarship/manual grant;
- multiple grants with different end dates;
- pending/failed/expired purchase;
- unknown SKU or identity conflict;
- free ecosystem grant with explicit targets;
- projection rebuild;
- migration rerun;
- support explain before/after a manual action.

Use `test/fixtures/contracts/entitlement-resolution.cases.json` and `test/fixtures/contracts/migration-reconciliation.cases.json` as examples, then add task-specific cases.

## Stop conditions

Stop if the change needs an invented product benefit, validity period, price, legacy promise, identity merge rule, or provider status semantic. State the missing owner/evidence and continue only with a synthetic interface or explicitly safe path.

## Completion

Report the affected targets/actions/sources, decision precedence, tests, migration/projection effect, audit/support explanation, and any open external gate.
