# Pilot Preparation — SKD practice product (M2 pilot)

**Founder decisions recorded (12 Oct 2026):** the pilot product is a **new Sejoli product dedicated to SKD practice**. Whether SKD questions exist is **unknown**: nothing here assumes they do. Production stays unchanged until the founder approves each step explicitly.
**Companion runbook:** `docs/runbooks/M1_M2_PRODUCTION_ACTIVATION.md` (activation day).
**Status of this document:** guidance only. No product, content, batch, or configuration has been created on Production.

## 0. Blockers found while preparing (read first)

| # | Blocker | Why it blocks | Smallest decision needed |
| --- | --- | --- | --- |
| B1 | **A practice SKD tryout cannot be activated on Production under the current contract.** Blueprint `activationScope=production` is refused in code (`packages/domain/src/exam/activation-scope.ts`), pending OD-04 and every dok 17 §3 gate. Scope `staging` is defined as non-production only. Runtime does not compare scope to `APP_ENV`, so publishing a staging-scoped batch in the Production database would *work* technically, but it would break the contract. That is not an acceptable shortcut. | Without it, the pilot product has nothing to grant | Founder + Academic ADR: a **practice-only production gate** for SKD. It should cover `resultPolicy.rankingMode=none` and `releaseMode=immediate_unranked`, a visible "latihan / estimasi, bukan skor resmi" label, academic sign-off of the content (not of official thresholds), and no ranking. Engineering then lifts the code ceiling for exactly that combination, with tests. Ranked SKD stays behind OD-04. |
| B2 | **No SKD questions are known to exist** in a form the app can import | No questions → no form → no batch | Academic owner confirms whether questions exist, how many, their source/rights, and their format (§3) |
| B3 | **Production has 0 programs, 0 batches, 0 questions** | The catalogue loader blocks a product whose target does not exist (by design) | Content created through the governed workflow (§3.3) |

## 1. Pilot shape

- One new Sejoli product, for example "Latihan SKD — Superlatif Web App (Pilot)". Digital, no shipping, no subscription.
- It grants one component: `exam_batch` → one **practice, unranked** SKD batch, actions `start_attempt`, `view_result`, `view_explanation`.
- Validity: `duration_after_purchase` for a founder-chosen number of days, or `fixed_window` covering the pilot.
- One cohort. No ranking or leaderboard. No "official score" claim anywhere.

## 2. Creating the pilot product in Sejoli (guide only — do not create on live until approved)

Do it on **staging first** (`wp-staging.superlatif.id`), then repeat on live on activation day.

1. WordPress admin → **Sejoli → Produk → Tambah Baru**.
2. Fill in the name, description, and price, as decided by the founder.
3. **Tipe produk: digital** (no shipping). Turn **"Aktifkan penjualan produk ini"** off until the pilot opens. That keeps the product unpurchasable while everything else is prepared.
4. No subscription. Coupon and affiliate settings as the founder decides; they do not affect access in the app.
5. Do **not** use Sejoli's own user-group or access settings to grant app access. Access comes only from the app's catalogue mapping.
6. Save the product and record its **post ID** from the edit URL `post.php?post=<ID>`. Never retype it from memory.
7. Put that ID into **two** places:
   - the catalogue spec `sejoliProductId` (`packages/db/scripts/catalogue.example.json` format);
   - the bridge client's `webhook_products` in `wp-config.php` (plugin 1.2.2).
8. On staging: map it with the staging catalogue (seed or loader), then run the §4 acceptance test against Preview.

## 3. Content inventory — what must exist before the pilot

Nothing below is assumed to exist. Each row is a question for the academic owner.

### 3.1 Questions

| Item | Need | Notes |
| --- | --- | --- |
| Source and rights | Who wrote the questions, and whether Superlatif may use them | Required per item (`sourceAndRightsOk` in the review checklist) |
| Types | TWK and TIU: `single_choice` (exactly one correct option). TKP: `weighted_choice` (every option weighted) | dok 15A §4, dok 17 §4 |
| Count per section | **Academic decision.** Not taken from previous years' official rules (dok 17 §4 forbids assuming current-year values) | A practice set may be smaller than the official format; label it as such |
| Explanations | One per question, if `view_explanation` is sold | Shown only after the release window |
| Media | PNG, JPEG, or WebP only (no SVG); ≤ 5 MB per asset | dok 15A §1 |
| Format for import | Workbook template version `2.1` (`contracts/question-import-template.xlsx`) plus an optional media ZIP. Simple profile covers `single_choice` + `weighted_choice` | Status in the workbook may only be `draft` or `in_review` |

### 3.2 Exam configuration (all versioned and immutable once published)

| Artefact | Decision owner | Pilot value |
| --- | --- | --- |
| Scoring policy | Academic | Per-section scorers (binary for TWK/TIU, weighted for TKP), no official thresholds, disclaimer text |
| Blueprint | Academic + Engineering | Sections, counts, durations (`per_section` durations must sum to the total), `rankingMode=none`, `releaseMode=immediate_unranked` (after B1) |
| Form | Academic | Fixed question order |
| Batch | Operations | Attempt window covering the pilot; result and explanation release windows; attempt allowance |

### 3.3 Governed workflow (separation of duties, CLAUDE.md)

1. `tutor_writer` imports or authors questions.
2. A **different** `moderator_reviewer` reviews them with the checklist.
3. `academic_admin` publishes.

The scoring policy, blueprint, form, and batch go through submit → approve → publish, with a different approver where required. Nothing is inserted into tables directly. Role holders in Production are a prerequisite: there are none today.

## 4. Acceptance test (pilot) — staging first, then Production on activation day

Run on **staging** with plugin 1.2.2 before anything touches Production; repeat on Production as runbook step S8.

| # | Step | Expected |
| --- | --- | --- |
| A1 | Pilot product listed in `webhook_products`; an order for **another** product | No outbox row for the production-type client; nothing reaches the app |
| A2 | Account not yet bought → open the batch → Mulai | Refused, 0 attempts |
| A3 | Checkout the pilot product → order on-hold | App purchase `pending`, 0 grants |
| A4 | Admin sets **completed** | Purchase `paid`, exactly 1 grant, `start_attempt` allowed; Mulai opens the practice tryout |
| A5 | Finish and submit the attempt | Result visible according to the release policy, labelled as practice/estimate; no ranking shown |
| A6 | A second account buys **before** first sign-in, then signs in | Purchase claimed automatically on `/home`, 1 grant |
| A7 | Cancel or refund one order | Only that grant revoked; Mulai refused for a new attempt; history kept |
| A8 | Replay one delivered event (runbook §6.2) | `202 duplicate`, database unchanged |
| A9 | Reconciliation report | `OK`, apart from explained `unresolved_identity` while a buyer has not signed in |

**Rollback for the pilot:**
1. Turn sale off on the Sejoli product (no new orders).
2. Remove the product ID from `webhook_products` (no new events).
3. Set `FEATURE_COMMERCE_SYNC=false` (webhook 404).
4. If needed, `FEATURE_STUDENT_LOGIN=false`.

Purchases, grants, and attempts stay as evidence. Grants that must not stand are revoked with a reason, never deleted.

## 5. REST route audit — `/get_order/v1/sejoli` (read-only finding)

- Both `superlatif.id` and `wp-staging.superlatif.id` advertise namespace `get_order/v1` with route `/get_order/v1/sejoli`, method **GET**, and **no declared arguments**. This comes from the public REST index; the route itself was **not called**.
- It is not registered by any Sejoli package available locally (Sejoli core and its add-ons in `~/Downloads`), so it is most likely a custom snippet, a theme function, or another plugin.
- **Risk:** a GET route named "get order" with no arguments may return order data. Whether it is protected depends on its `permission_callback`, which cannot be read from outside without calling it. Calling it could expose personal data, including on staging (a copy of live data).
- **Owner action (safe order):**
  1. Find the registering code: search the live site's plugins, theme, and snippet plugin for `get_order/v1`.
  2. Read its `permission_callback`.
  3. If it is `__return_true` or missing, disable the route first and investigate afterwards.
  4. If a live check is needed, the owner runs `curl -s -o /dev/null -w "%{http_code}" https://superlatif.id/wp-json/get_order/v1/sejoli` from a logged-out shell. Only the status code is printed: 401/403 means protected; 200 means treat it as exposure.

This is outside M2 and does not block the bridge, but it should be resolved before more student traffic reaches the site.

## 6. Prerequisites before the pilot can be activated

| # | Prerequisite | Owner | Status |
| --- | --- | --- | --- |
| P1 | B1 practice-only production gate decided (ADR) and implemented with tests | Founder + Academic + Engineering | Open |
| P2 | Questions exist with rights confirmed, imported, reviewed, and published (§3) | Academic | Unknown |
| P3 | Scoring policy, blueprint, form, and batch published in Production through the governed workflow | Academic + Operations | Open |
| P4 | Role holders in Production (writer, reviewer, academic admin), separate people | Founder | Open |
| P5 | Pilot Sejoli product created on staging; §4 A1–A9 pass on staging | Founder + Engineering | Open |
| P6 | Plugin 1.2.2 merged; ZIP and checksum recorded | Engineering | This branch |
| P7 | Runbook G1–G9 (M1 live, Supabase Pro + PITR, OD-07, support owner, write gate decision) | Founder | Open |
| P8 | `/get_order/v1/sejoli` permission confirmed (§5) | WordPress owner | Open |
| P9 | Price, validity, and refund policy of the pilot product decided | Founder | Open |
