---
name: superlatif-exam-engine
description: Implement or audit Superlatif question import, blueprint, form, batch, attempt, timer, autosave, offline recovery, scoring, result, ranking, correction, accommodation, and exam incident behavior. Use for any change that can affect exam integrity or a learner's answer/score.
---

# Superlatif Exam Engine

## Treat as high risk

Before editing, read the relevant sections from:

- `docs/gates/15_ADMIN_CMS_AND_QUESTION_BANK_SPEC.md`;
- `docs/gates/15A_QUESTION_IMPORT_TEMPLATE_CONTRACT.md`;
- `docs/gates/16_EXAM_ENGINE_CORE_CONTRACT.md`;
- `docs/gates/17_EXAM_BLUEPRINTS_AND_SCORING.md`;
- `docs/gates/18_FLASH_SALE_AND_BATCH_SYSTEM.md`;
- `docs/gates/21_ERD_AND_DATA_DICTIONARY.md`;
- `docs/gates/22_API_AND_WEBHOOK_CONTRACT.md`;
- machine contracts under `contracts/`;
- `docs/gates/27_QA_TESTING_AND_UAT_PLAN.md`.

State the invariants, concurrency boundary, secret boundary, and failure evidence before implementation.

## Configuration and publication

- Exam family, blueprint version, scoring policy, form, batch, and attempt policy are distinct.
- Ranked MVP uses a fixed immutable form; presented option order is persisted.
- Published/used question, blueprint, scoring policy, and form are immutable.
- `draft_only|staging|production` activation is enforced.
- Production ranked release requires academic/regulatory/technical approval and fixtures.
- For per-section timing, require every section duration and validate their sum equals total duration in the publication validator.

## Answer integrity

- Server time controls deadline; reload never resets it.
- Start and submit are idempotent.
- Save uses client mutation ID, writer lease, expected revision, and server acknowledgement.
- Acknowledged answer loss is a release-blocking integrity failure.
- Resume returns the exact question/option order, answers, flags, section/current question, submission/incident/accommodation state, and permitted actions.
- Offline queue sync resolves deterministically; a stale mutation cannot overwrite a newer revision.
- Late-sync within cutoff is a recovery candidate requiring controlled adjudication; it is not automatically scored.
- Analytics/notification failure cannot make answer persistence falsely succeed.

## Scoring and secrets

- Scoring reads immutable attempt/form/blueprint/policy/question snapshots.
- Scorer is deterministic and fixture-tested.
- `weighted_choice` uses student payload `kind=single_choice` + `optionCode`.
- Answer keys and option weights stay in restricted server records and serializer allowlists exclude them.
- Do not put official thresholds, categories, or annual rules in generic UI/source code.
- Non-official simulations are labeled as estimates.

Canonical result states are `processing`, `provisional`, `final`, `corrected`, `withheld`, and `voided`. Worker failure is a job error, not a result state.

## Results, ranking, and correction

- Ranked result release is scheduled/manual after human review.
- Correction creates a new version, records cause/scope/approval, and atomically switches the current pointer.
- Old result and ranking snapshots remain audit evidence.
- Ranking entries reference restricted ranking subjects; public projection contains only safe alias/opt-in data.
- Refund/access expiry does not erase historical attempt/result/ranking evidence.
- Accommodation, void, extension, and retake require permission, reason, impact preview, audit, and approval where defined.

## Required tests

Use and extend the Gate 4 fixtures:

- `exam-attempt-lifecycle.cases.json`;
- `blueprint-publication.cases.json`;
- `scoring-skd-synthetic.cases.json`;
- `result-correction.cases.json`;
- `question-import.cases.json`.

For changes touching writes, test duplicates, out-of-order requests, concurrent tabs/workers, timeout after commit, retry after lost response, boundary time, queue delay, and partial dependency failure.

For serializer/UI changes, search the response/log/cache/analytics output for answer key, option weight, user identity, and private asset URL leakage.

## Stop conditions

Stop when implementation needs an unverified official rule, undefined navigation/timing/scoring policy, provider-specific clock behavior, destructive history edit, or weakened durability/authorization. Do not “temporarily” hardcode a production value. Use staging/synthetic configuration or return the exact blocker.

## Completion

Report affected snapshot/version, state transitions, transaction/idempotency behavior, secret boundary, deterministic fixtures, load/failure implications, release gate, and academic/security review still required.
