# 25 — Migration dan Reconciliation Plan

**Versi:** 1.0-RC2  
**Status:** Planning contract; source extracts dan counts belum tersedia

## 1. Objective

Memindahkan pengguna dan akses aktif dari WordPress/Sejoli/legacy tryout ke web app tanpa kehilangan entitlement, menciptakan duplicate account, atau mengganggu commerce yang masih berjalan.

## 2. Principles

1. Migrate active value first, not all history first.
2. Preserve source IDs and provenance.
3. Never merge by email alone.
4. Imports idempotent and rerunnable.
5. Reconcile before cutover and after each wave.
6. WordPress/Sejoli remains commerce source during MVP.
7. Rollback means routing/activation reversal, not deleting imported evidence.
8. Users see one program even when sources overlap.

## 3. Migration scope

### Wave 0 — Configuration

- product catalogue and versions;
- Sejoli SKU mappings;
- program/curriculum/resources;
- active batch/live schedule;
- role/permission seeds;
- blueprint/form/scoring configuration.

### Wave 1 — Pilot active users

- internal/test team;
- small active Kelas Akselerasi cohort;
- representative bundle/single/upgrade/scholarship cases.

### Wave 2 — All active paid Kedinasan

- users with current product access;
- orders/source grants;
- relevant progress/results if mapping reliable.

### Wave 3 — Recent tryout-only users

- currently valid/upcoming batches;
- active/pending attempts only after engine compatibility review.

### Wave 4 — Selected history/dormant

Only if business/support value justifies.

## 4. Source inventory required

| Source | Needed data |
|---|---|
| WordPress | user ID, account status, email/phone attributes, created/updated |
| Sejoli | customer/member, orders, products/SKUs, statuses, payment/refund, validity |
| Legacy membership | product-access mapping, start/end/status/source |
| Legacy LMS | courses/lessons/progress where reliable |
| Legacy tryout | event/form/session/answers/results where contract compatible |
| Manual rosters | scholarships, exceptions, support grants |

Each extract records source system, extraction timestamp, schema version, checksum, row count, and owner.

## 5. Source profiling

Before mapping:

- null/duplicate IDs;
- email/phone normalization/collision;
- order status distribution;
- unknown product IDs;
- conflicting access dates;
- users with multiple accounts;
- paid order without member/access;
- active access without order/source;
- legacy result/form integrity.

No production import before profiling report approved.

## 6. Identity mapping

### Safe automatic match

- existing external identity link; or
- stable WordPress/Sejoli subject proven to same record.

### Review match

- same verified email with different external IDs;
- same phone and conflicting name/email;
- one order references email not linked to account;
- duplicate WordPress accounts.

### Prohibited auto-merge

- normalized email only without source/stability evidence;
- similar name;
- shared family phone/email;
- manually edited spreadsheet assertion without provenance.

Identity mapping table is append/audited and supports supersession.

## 7. Product and access mapping

Mapping file:

- source product/SKU;
- source validity behavior;
- internal product/offer version;
- component/grant template;
- migration validity rule;
- unknown/exception handling;
- approved by/date/version.

Legacy access becomes `source_type=migration` grant with source record reference. If a paid order can be safely linked, purchase projection and purchase-derived grant may be created; do not invent missing financial facts.

## 8. Validity conversion

Rules:

- explicit end date preserved;
- lifetime only if source explicitly states it;
- duration converts using documented source start anchor;
- “until selection ends” maps to approved fixed/lifecycle date;
- unknown validity enters review or conservative temporary access with owner-approved deadline;
- timezone normalized but source raw retained.

## 9. Curriculum/content mapping

- Map legacy course/lesson to program placement/resource version.
- Reuse content asset checksum to avoid duplicate.
- Store mapping version.
- Completion migrated only if meaning is equivalent.
- Video progress threshold differences documented.
- Unmappable progress may remain archived/read-only rather than forced.

## 10. Tryout/result migration

### Preferred

Keep legacy completed results as `legacy result record` displayed separately/normalized minimally unless form/question/scoring snapshots are complete.

### Full import only if

- stable event/session/user IDs;
- immutable question/version/form data available;
- answer and score reconcile;
- scoring policy known;
- timestamps valid;
- privacy/retention approved.

Do not recalculate legacy results with new blueprint by default.

Active attempts are not migrated live unless dedicated compatibility/cutover plan proves safe; schedule cutover between batches.

## 11. ETL pipeline

1. Extract immutable snapshot.
2. Store encrypted/restricted staging files.
3. Validate schema/checksum/count.
4. Normalize to canonical staging tables/files.
5. Produce exception reports.
6. Dry-run import and expected totals.
7. Import configuration.
8. Import identities.
9. Import purchases/grants.
10. Import enrollments/progress/results selected.
11. Build projections.
12. Reconcile and sign off.

Every importer has batch ID, idempotency key, source row reference, outcome, and rerun mode.

## 12. Reconciliation controls

### Counts

- source users mapped/unmapped/conflict;
- source products mapped/unknown;
- orders by status/amount/date;
- active access by product;
- grants by source/status;
- program enrollments;
- selected progress/results.

### Financial/access invariants

- Every imported purchase references source order.
- Every source-derived grant references mapping/source.
- Paid active product expected to grant access unless exception documented.
- Refund/cancel does not retain purchase grant unless policy explicitly does.
- Effective access allowed has supporting active grant.

### Sampling

- top revenue products;
- oldest/newest active;
- multi-product;
- upgrade;
- refund plus scholarship overlap;
- email changed;
- duplicate account;
- manual scholarship.

## 13. Reconciliation queue

Types:

- unknown product/SKU;
- unresolved identity;
- duplicate identity candidates;
- paid no access;
- access no source;
- invalid validity;
- order status conflict;
- result mismatch;
- missing asset/content mapping.

State: open, assigned, investigating, resolved, ignored-with-reason. SLA by severity.

## 14. Cutover strategy

### Parallel period

- Commerce continues on WordPress/Sejoli.
- New event bridge active.
- Web app read/access projections compared silently or pilot-visible.
- Member area remains fallback link for controlled time.

### Cutover

- Freeze config mapping changes briefly.
- Final incremental source snapshot/event catch-up.
- Reconcile active cohort.
- Switch student dashboard links to app.
- Monitor access/auth/errors.

### No exam cutover during active ranked batch

Launch exam engine on a new batch. Legacy active batch finishes in old system unless tested migration plan exists.

## 15. Rollback

Rollback triggers:

- access mismatch above threshold;
- login failure;
- exam critical incident;
- unreconciled paid orders;
- severe security/data issue.

Actions:

- route dashboard back/fallback;
- pause new batch/offer app entry;
- keep bridge ingesting or safely queueing events;
- preserve imported/audit data;
- communicate affected users;
- fix and replay idempotently.

Do not delete imported grants/purchases as rollback mechanism.

## 16. User communication

- Explain new dashboard and login path.
- Do not ask user to repurchase.
- Provide `Akses sedang diperiksa` state and reference ID.
- Target proactive messages to unresolved/high-risk cases.
- Preserve help and community channel.

## 17. Data handling

- Source extract access limited.
- Encrypted transfer/storage.
- No production dumps in chat/tickets.
- Temporary extracts deleted per migration retention.
- Audit who extracted/imported/resolved.
- Masked fixtures for lower environments.

## 18. Migration test cases

1. One user, one active product.
2. User email changed after purchase.
3. Two WP accounts same email/phone.
4. Bundle plus single batch overlap.
5. Upgrade from SKD to Akselerasi.
6. Refund plus scholarship.
7. Lifetime/manual validity.
8. Unknown SKU.
9. Paid order no member.
10. Legacy completed result without form snapshot.
11. Import rerun.
12. Bridge events arrive during bulk import.

## 19. Go/no-go criteria

- 100% active sellable SKUs mapped or explicitly blocked.
- 100% pilot paid active access reconciled.
- Unresolved identity below approved threshold; critical cases zero.
- Incremental bridge catches events during migration.
- Support workflow and staffing ready.
- Backup/rollback drill complete.
- No active ranked batch crosses engine cutover.

## 20. Deliverables before execution

- source inventory and profiling report;
- field/data mapping workbook;
- product/SKU mapping;
- identity conflict rules;
- migration scripts and dry-run reports;
- reconciliation dashboard/report;
- cutover checklist;
- rollback and communication templates.

## 21. Open decisions

### Audit resolution RC2

Sebelum mapping SKU, tim wajib menutup `05A_LEGACY_PRODUCT_PROMISE_REGISTER.md`. Klaim yang hanya disebut audit dan tidak ditemukan pada supplied deck tetap `UNVERIFIED`; ia tidak menghasilkan grant otomatis. Cutover membandingkan order/offer version, promise population, grant target, validity, post-expiry policy, serta attempt/result history. Ketidaksesuaian masuk reconciliation, bukan default akses luas atau diam-diam kehilangan benefit.

- Exact active cohort definition and cutoff date.
- Legacy result display/import depth.
- Duration of parallel/fallback period.
- Source export/API capability.
- Approved unresolved identity threshold.
