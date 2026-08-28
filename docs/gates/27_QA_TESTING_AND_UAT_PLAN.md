# 27 — QA, Testing, dan UAT Plan

**Versi:** 1.0-RC1  
**Tanggal:** 28 Agustus 2026  
**Status:** Build-readiness contract; runtime evidence belum tersedia

## 1. Quality objective

Superlatif harus dapat membuktikan tiga hal sebelum rilis:

1. siswa yang berhak selalu memperoleh akses yang tepat dan dapat dijelaskan;
2. jawaban yang sudah diakui server tidak hilang, berubah diam-diam, atau dinilai dengan versi aturan yang salah;
3. operasi akademik/commerce dapat dipulihkan tanpa edit database langsung atau penghapusan history.

Quality bukan tahap terakhir. Setiap vertical slice membawa contract test, integration test, observability, dan runbook sejak pertama kali dapat didemokan.

## 2. Prinsip pengujian

- Risk-based: identity, payment-to-access, exam hot path, scoring, correction, dan privileged admin mendapat kedalaman tertinggi.
- Traceable: test menyebut requirement ID dan backlog task.
- Deterministic: waktu, UUID, queue, provider callback, dan scoring dapat dikontrol pada test.
- Server-authoritative: test deadline, entitlement, scoring, dan revision tidak mempercayai client clock.
- Immutable history: correction, refund, version change, dan rollback tidak menghapus evidence lama.
- Mobile-first: primary UAT pada viewport 320–430 CSS px dan koneksi tidak stabil.
- Evidence-based: status `PASS` membutuhkan log/report/artifact, bukan pernyataan manual tanpa bukti.
- No production data in lower environments: fixture menggunakan synthetic identity dan media.

## 3. Test levels

| Level | Fokus | Wajib pada merge |
|---|---|---:|
| Static | lint, typecheck, dependency policy, secret scan, schema parse | Ya |
| Unit | resolver, transition, validator, scoring pure function, formatter | Ya |
| Property/invariant | grant union, idempotency, ordering, deadline monotonicity | Domain berisiko |
| Contract | OpenAPI, JSON Schema, event envelope, import workbook contract | Ya bila contract berubah |
| Database | constraint, transaction, migration, concurrency, projection rebuild | Ya bila persistence berubah |
| Integration | DB + queue + storage/provider fake + worker | Ya pada boundary terkait |
| Component | complex UI state, accessibility, keyboard, error boundary | Ya pada UI P0 |
| E2E | perjalanan siswa/admin lintas service | Critical path |
| Security | authz, object scope, CSRF, replay, upload, rate/resource limit | Sebelum staging sign-off |
| Performance | API p95, concurrency, queue lag, soak, backpressure | Sebelum Gate C/D |
| Recovery | restore, replay, projection rebuild, rollback, provider outage | Sebelum launch |
| UAT | kebenaran operasional/akademik dan usability | Sebelum go-live |

## 4. Environment dan data

| Environment | Tujuan | Data | External integration |
|---|---|---|---|
| Local | unit/contract/dev | Synthetic disposable | Fake/stub |
| CI | repeatable verification | Seed minimal per test | Network blocked kecuali approved scanner |
| Development | shared demo | Synthetic | Sandbox/fake |
| Staging | production-like, UAT, load rehearsal | Synthetic + masked approved samples | Sejoli/WP/provider staging |
| Production | live | Real | Live, least privilege |

Aturan:

- Feature flag tidak boleh menjadi satu-satunya authorization control.
- Test account produksi hanya bila disetujui, ditandai, dan tidak ikut analytics/leaderboard publik.
- Clock injection digunakan untuk sale, batch, deadline, expiry, dan scheduled notification.
- Provider fake harus menyimulasikan success, timeout, duplicate, out-of-order, malformed, partial refund, full refund, dan chargeback.
- Staging parity mencakup database engine/version, migration path, queue semantics, object storage policy, cookie/security header, dan timezone.

## 5. Requirement-to-test matrix

| Domain | Requirement | Test minimum | Evidence |
|---|---|---|---|
| Identity | IDN-001–006 | bridge replay, audience/expiry, conflict account, revoke session, deep link | Contract + integration + E2E |
| Program | PRG-001–008 | primary program, dedupe multi-grant, tab visibility, prerequisite, version history | Unit + E2E |
| Learning | LRN-001–006 | access asset, completion stable, required-only denominator, resume position | Integration + component |
| Schedule | SCH-001–006 | timezone, join window, cancel/reschedule, recording policy | Unit + E2E |
| Commerce | COM-001–010 | event verification, mapping version, replay, unknown SKU, refund/chargeback | Contract + integration |
| Entitlement | ENT-001–007 | union, overlap, expiry, revoke-one-source, allowance, explanation, rebuild | Property + integration |
| Question | QST-001–010 | import profiles, media/alt, workflow, duplicate, revision, secret serialization | Contract + integration + UAT |
| Exam config | EXM-001–006 | activation scope, fixed form, windows, official-review gate | Schema + integration |
| Attempt | ATM-001–010 | start/resume, lease, autosave, offline queue, deadline, submit, recovery | Concurrency + E2E + load |
| Result | SCR-001–008 | deterministic score, weighted option, state, correction, ranking privacy | Fixture + integration + UAT |
| Admin | ADM-001–006 | object scope, separation of duties, audit, preview/dry-run | Security + E2E |
| Notification/analytics | NTF/ANL | consent category, idempotency, suppression, prohibited payload | Contract + integration |

## 6. Critical domain suites

### 6.1 Identity and authorization

Wajib:

- one-time code sukses tepat sekali; replay ditolak;
- wrong audience, expired code, modified signature, unknown key ID, dan reused nonce ditolak;
- email sama dengan external subject berbeda masuk conflict queue, tidak auto-merge;
- session revoke per device mengakhiri access pada request berikutnya;
- setiap student/admin endpoint diuji object-level authorization, bukan hanya menu visibility;
- role bundle ganda tidak melewati `creator != first_approver != second_approver`;
- Support/Finance hanya menerima field redacted sesuai permission.

OD-02 tetap memblokir test provider nyata sampai bridge staging tersedia.

### 6.2 Commerce and entitlement

Gunakan fixture `purchase-events.cases.json` dan `entitlement-resolution.cases.json`.

Invariants:

- satu provider event menghasilkan maksimal satu canonical transition;
- satu source grant direvoke tanpa menutup access yang disokong grant aktif lain;
- pending/failed/expired purchase tidak membuka protected action;
- `refunded_partial`, `refunded_full`, dan `chargeback` tidak diterjemahkan sembarang tanpa provider semantics terverifikasi;
- unknown SKU/user/state membuat reconciliation case dan tidak memberi grant luas;
- rebuild effective access menghasilkan keputusan dan reason code yang sama;
- manual grant/revoke memerlukan requester, reason, preview, approval bila high-risk, dan audit before/after.

### 6.3 Question import and moderation

Uji kedua workbook v2.1:

- simple hanya menerima `single_choice` dan `weighted_choice`;
- advanced menerima lima tipe;
- path ZIP case-sensitive, traversal/absolute path/symlink/zip bomb ditolak;
- MIME nyata diverifikasi, bukan extension saja;
- `image_purpose=informative` tanpa alt menghasilkan error;
- decorative image menerima alt kosong yang disengaja;
- missing/unused/duplicate asset terdeteksi;
- duplicate `question_code` mengikuti mode `create_only|update_draft|create_revision`;
- re-run dengan import job/idempotency yang sama tidak menggandakan soal;
- published question tidak diedit in-place;
- preview mobile identik dengan serializer siswa dan tidak membawa answer key/weight.

### 6.4 Attempt reliability

Gunakan fixture `exam-attempt-lifecycle.cases.json`.

Scenario P0:

1. start request diulang setelah response hilang;
2. dua tab mencoba memegang writer lease;
3. mutation ID sama dikirim ulang;
4. revision lama tiba setelah revision baru;
5. browser offline, beberapa answer queued, lalu reconnect;
6. reload/device takeover mempertahankan question dan option order;
7. save tiba sebelum deadline tetapi acknowledgement terlambat;
8. save tiba maksimal 30 detik setelah deadline sebagai recovery candidate;
9. save di luar cutoff ditolak dengan receipt yang dapat dijelaskan;
10. submit dikirim berulang;
11. worker scoring tertunda setelah submit acknowledged;
12. Redis/analytics/notification/storage mengalami gangguan saat attempt;
13. batch void/extension/retake diproses terkontrol.

Pass condition paling penting: **nol acknowledged answer hilang** pada seluruh failure-injection dan load run.

### 6.5 Scoring, result, ranking, correction

- Pure scorer menerima only immutable snapshot/reference.
- `weighted_choice` memakai payload siswa `kind=single_choice`; weight hanya dari secret server record.
- Output fixture byte/semantic deterministic untuk input dan policy version sama.
- Result state hanya `processing|provisional|final|corrected|withheld|voided`.
- Worker failure tidak membuat result state baru.
- Ranked release memerlukan human review dan mode scheduled/manual.
- Correction membuat version baru, mempertahankan old result, cause, impact, approval, dan current pointer atomik.
- Ranking entry merujuk ranking subject; public response tidak memuat user ID/email/phone/nama asli.
- Opt-out alias mengubah visibility berikutnya tanpa mengubah score/snapshot history.
- Threshold atau regulasi tahun berjalan hanya boleh berasal dari blueprint/scoring version yang disetujui Academic owner.

## 7. API and contract testing

Pada setiap perubahan kontrak:

- OpenAPI parse dan seluruh local `$ref` resolve;
- path variable sama dengan declared parameter;
- mutation cookie-auth membawa CSRF kecuali boundary yang eksplisit exempt;
- command membawa idempotency semantic yang sesuai;
- examples tidak mengandung secret/PII;
- backward compatibility dinilai: additive, breaking, atau versioned;
- consumer tests mencakup web, worker, WordPress bridge adapter, dan admin tools terkait;
- JSON Schema parse, reference resolution, positive/negative fixture, dan semantic validator dijalankan;
- database state enum, API enum, dan domain enum dibandingkan secara programatik.

## 8. Database and migration testing

Setiap migration wajib:

1. generated dari schema dan direview SQL-nya;
2. apply pada database kosong;
3. apply pada snapshot schema versi sebelumnya;
4. menjalankan backfill/rebuild dalam dry-run dan actual staging;
5. membuktikan uniqueness, FK, check, partial index, dan lock behavior;
6. mempunyai forward-fix/rollback strategy;
7. diuji terhadap concurrent writer untuk allowance, lease, mutation, result current, dan webhook replay;
8. mencatat waktu, lock, row count, dan storage growth.

`drizzle-kit push` hanya boleh pada local disposable database. Staging/production memakai reviewed migration.

## 9. Security test plan

Minimum sebelum release candidate:

- SAST, dependency vulnerability, license policy, secret scan;
- authentication/session fixation/replay/logout/revocation;
- horizontal dan vertical authorization per endpoint;
- CSRF, CORS, safe redirect, CSP, cookie attributes;
- webhook signature/anti-replay menggunakan bytes canonical provider nyata;
- rate/resource limit untuk login, checkout intent, access explain, attempt start/save/submit, import, export;
- upload: MIME, malware, decompression, traversal, SVG/HTML active content, metadata stripping;
- SSRF pada import URL/external content bila fitur tersedia;
- stored/reflected XSS pada rich text, question, explanation, notification, filename;
- SQL/JSON/path injection dan mass assignment;
- answer key/weight leakage melalui response, source map, logs, analytics, cache, error, signed URL;
- audit log redaction dan privileged read audit;
- backup/export encryption dan least-privilege service identity.

High/critical finding memblokir production. Medium memerlukan owner, mitigation, dan deadline eksplisit.

## 10. Accessibility and device matrix

Target WCAG 2.2 AA pada flow P0.

### Manual criteria

- keyboard-only dan visible focus tanpa obscured target;
- screen reader labels, headings, table/card reading order, live region yang tidak berisik;
- zoom 200%, reflow 320 CSS px, landscape, reduced motion;
- target minimum 44×44 untuk aksi ujian penting;
- tidak ada drag-only interaction (2.5.7);
- input berulang dapat diisi/pilih ulang secara otomatis bila aman (3.3.7);
- warna bukan satu-satunya penanda status/benar/salah;
- timer memiliki text equivalent dan warning tidak mengganggu;
- equation mempunyai accessible representation;
- image informative memiliki alt bermakna; decorative mempunyai alt kosong.

### Browser/device minimum

| Kelas | Minimum |
|---|---|
| Android | Chrome current dan current-1 pada low/mid device representative |
| iOS | Safari current dan current-1 |
| Desktop | Chrome, Edge, Safari current; Firefox current untuk compatibility |
| Network | normal 4G, high latency, intermittent, offline/reconnect |
| Assistive | VoiceOver Safari dan TalkBack Chrome untuk exam/resource flow |

Exact device list dikunci dari analytics sebelum UAT, bukan berdasarkan preferensi tim.

## 11. Performance, load, and soak

### SLO assertions

| Signal | Target p95 awal | Fail condition |
|---|---:|---|
| Student read API | <500 ms | sustained breach 5 menit |
| Access decision | <150 ms | breach atau wrong decision |
| Answer save ack | <350 ms | breach/error >0,5% |
| Attempt start/resume | <800 ms | sustained breach 5 menit |
| Submit ack | <1 s | false success atau backlog tanpa state |
| Admin search | <1,5 s | dataset MVP/filter wajar |
| Paid-to-access | <2 menit p95 | mismatch >0,1% atau silent loss |

### Workload models

- Baseline: 5.000 monthly active learners.
- Required event test: 1.000 concurrent active attempts.
- Design exploration: 3.000 concurrent attempts tanpa mengubah contract.
- Ramp, spike, 60–120 minute soak, reconnect storm, submit-at-deadline burst, scoring backlog, and provider degradation.

Load script harus memodelkan writer lease, answer distribution, think time, payload size/media, connection pool, queue concurrency, dan realistic retries. Hasil OD-08 mencatat environment, commit, dataset, config, p50/p95/p99, error, resource saturation, queue age, dan bottleneck.

## 12. Recovery and resilience tests

- database PITR/restore ke isolated environment;
- object/media restore/version recovery;
- outbox replay dan dead-letter recovery;
- effective access, progress, next action, dan leaderboard rebuild;
- provider outage + later callback replay;
- app rollback dengan forward-compatible schema;
- active batch extension/void/retake drill;
- incident communication dry run;
- backup integrity dan restricted access audit.

Provisional target: transactional DB RPO ≤15 menit dan RTO ≤4 jam, baru sah setelah provider dan restore drill membuktikannya.

## 13. Migration and reconciliation QA

Gunakan dua belas scenario dari dokumen 25 ditambah fixture `migration-reconciliation.cases.json`.

Exit criteria migration:

- 100% active sellable SKU mapped atau explicitly blocked;
- 100% pilot paid active access reconciled;
- critical identity conflict = 0;
- every imported purchase/grant memiliki source reference;
- rerun tidak menggandakan record;
- bridge event selama bulk import tetap tertangkap;
- no active ranked batch crosses engine cutover;
- rollback routing rehearsal pass tanpa delete imported evidence.

## 14. UAT plan

### UAT roles

| Role | Fokus sign-off |
|---|---|
| Founder/Product | Scope, student journey, copy penting, commercial expectation |
| Academic Admin | Curriculum, blueprint, form, score, result, correction |
| Operations Admin | Offer/batch/live operations, schedule, manual access workflow |
| Tutor/Writer | Authoring, import, preview, submission for review |
| Moderator/Reviewer | First approval, question quality, separation of duties |
| Live-Class Coordinator | occurrence, recording, attendance, notification |
| Support | access explain, incident receipt, escalation, no DB edit |
| Finance/Reconciliation | purchase projection, amount, refund, mismatch |
| Representative students | onboarding, learning, exam, result, mobile/accessibility |

### UAT waves

1. Internal happy path dengan synthetic accounts.
2. Role-based admin workflow dan failure states.
3. Pilot cohort kecil dengan representative entitlement combinations.
4. Operational rehearsal pada jadwal batch nyata tetapi staging/non-ranked.
5. Launch candidate smoke dan rollback rehearsal.

Setiap script memuat precondition, actor, device, data fixture, numbered actions, expected state, evidence, actual result, defect ID, dan sign-off.

## 15. Defect severity and release policy

| Severity | Definisi | Release treatment |
|---|---|---|
| Sev-0 | Security/data/exam integrity aktif atau outage luas | Stop test/launch, incident command |
| Sev-1 | Lost answer, wrong access/score, auth bypass, payment grant salah, critical flow unusable | Release blocker |
| Sev-2 | Major function gagal dengan workaround terbatas | Block related gate kecuali accepted risk owner |
| Sev-3 | Minor defect/copy/layout tanpa integrity impact | Dapat dijadwalkan dengan owner |
| Sev-4 | Cosmetic/improvement | Backlog |

Tidak ada threshold “jumlah bug rata-rata”. Satu Sev-1 pada exam atau access cukup untuk `NO-GO`.

## 16. Evidence and sign-off

Evidence bundle per release candidate:

- commit SHA dan build/release ID;
- environment/config version;
- test report + failed/skipped rationale;
- contract/schema/migration diff;
- security and accessibility report;
- load/soak report;
- migration/reconciliation report bila relevan;
- backup/restore and incident drill evidence;
- UAT sign-off per owner;
- open risk register;
- go/no-go record dan rollback target.

## 17. Exit criteria

### Merge

- relevant unit/contract/integration tests pass;
- no new secret, critical dependency issue, broken schema/ref;
- requirement and test IDs linked;
- observability/runbook updated untuk new failure mode.

### Release candidate

- P0 planned test 100% executed and passed;
- zero Sev-0/Sev-1; Sev-2 resolved atau risk accepted oleh owner yang tepat;
- critical E2E pass pada device/network matrix;
- security/accessibility gates pass;
- migration and rollback rehearsal pass;
- external gate evidence attached, bukan hanya status manual.

### Production go-live

Gate A–D pada PRD harus lulus sesuai release scope. Commerce tidak dapat go-live tanpa OD-01/OD-02. Ranked SKD tidak dapat go-live tanpa OD-04, academic sign-off, Gate C, dan OD-08.
