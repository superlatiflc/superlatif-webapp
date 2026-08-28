# 29 — Claude Code Execution Plan

**Versi:** 1.0-RC1  
**Tanggal:** 28 Agustus 2026  
**Status:** Project execution contract

## 1. Tujuan

Claude Code digunakan untuk mengimplementasikan task yang sudah mempunyai boundary, bukan untuk memilih ulang strategi bisnis atau mengarang aturan provider/regulasi. Setiap task harus dapat ditelusuri dari backlog → requirement → contract → test → evidence.

`CLAUDE.md` berada di root repository dan dimuat sebagai project memory. Prosedur domain yang tidak perlu hadir pada setiap task ditempatkan di `.claude/skills/` agar dimuat saat relevan.

## 2. Model penggunaan

| Jenis kerja | Routing yang disarankan |
|---|---|
| Architecture, exam concurrency, migration, security, cross-contract review | Model reasoning paling kuat/Opus-class dengan effort tinggi |
| Bounded feature, tests, UI state, adapter implementation | Sonnet-class/current coding model dengan effort tinggi |
| Mechanical rename, formatting, generated snapshot review | Model cepat hanya jika diff tetap direview dan test sama |

Nama/version model berubah dari waktu ke waktu. Pilih kelas kemampuan, bukan hardcode model lama ke repo. Risiko task menentukan model; ukuran task saja tidak cukup.

## 3. Project context

### Persistent project context

Tempatkan pada repository:

- `CLAUDE.md`;
- `.claude/skills/superlatif-domain/`;
- `.claude/skills/superlatif-design-system/`;
- `.claude/skills/superlatif-exam-engine/`;
- `.claude/skills/superlatif-sejoli-sync/`;
- folder `docs/gates/` berisi source of truth 00–30;
- folder `contracts/` untuk OpenAPI/JSON Schema;
- folder `test/fixtures/contracts/` untuk fixture terpilih.

Claude Code menemukan project skills pada `.claude/skills/<name>/SKILL.md`. `CLAUDE.md` harus ringkas dan berisi fakta/aturan yang selalu relevan; prosedur panjang tetap berada dalam skill.

### Session context

Prompt task menyertakan hanya:

- backlog ID;
- outcome;
- relevant read-set;
- current evidence/defect;
- expected write-set;
- command/test yang tersedia;
- external gate status.

Jangan menempelkan seluruh 00–30 ke setiap chat. Simpan paket lengkap pada project/repository, kemudian minta Claude membaca file yang disebut task.

## 4. Atomic task contract

Setiap task memiliki bentuk berikut:

```text
Task ID:
Outcome:
Why now / dependency:
Read-set:
Expected write-set:
Requirements:
Invariants:
Positive acceptance:
Negative acceptance:
Tests/commands:
Observability/runbook impact:
External assumptions or fakes:
Stop conditions:
Definition of done:
```

Task dianggap terlalu besar bila mencampur lebih dari satu boundary berisiko, misalnya identity bridge + entitlement + UI + migration. Split berdasarkan observable outcome, bukan sekadar berdasarkan folder.

## 5. Standard execution loop

1. Baca `CLAUDE.md` dan task packet.
2. Baca source file pada read-set; jangan memindai seluruh repo tanpa alasan.
3. Muat satu atau lebih project skill yang benar-benar relevan.
4. Nyatakan requirement, invariant, dependency, dan stop condition yang ditemukan.
5. Periksa existing code/tests/migrations dan working tree; jangan menimpa perubahan user.
6. Buat rencana kecil dengan test/evidence.
7. Implementasi smallest coherent change.
8. Jalankan narrow test, lalu required broader test.
9. Audit diff untuk secret, PII, answer key, permission, enum/state, migration, log, dan backward compatibility.
10. Perbarui contract/ADR/runbook hanya bila behavior benar-benar berubah.
11. Laporkan outcome, evidence, open risk, dan next unblocked task.

Jika ada kontradiksi source of truth, berhenti sebelum semantic implementation. Buat issue/ADR proposal dan minta keputusan owner yang tepat.

## 6. Branch and change policy

- Satu branch/PR untuk satu backlog outcome atau satu tightly-coupled vertical slice.
- Commit message menyebut backlog ID.
- Generated file tidak menutupi semantic diff; generator dan source ikut direview.
- Tidak ada drive-by refactor pada task security/exam/commerce.
- Perubahan database memakai expand → backfill → switch → contract jika compatibility dibutuhkan.
- Feature flag mempunyai owner, default, target removal, dan bukan authorization control.
- Breaking contract memerlukan versioning dan consumer migration plan.
- Dependency baru memerlukan rationale, maintenance/security check, dan impact bundle/runtime.

## 7. Work order untuk Claude Code

### Wave CC-0 — Repository bootstrap

1. `GOV-001` repository layout dan package/runtime lock.
2. `GOV-002` CI quality gates, deterministic test harness, dan contract/fixture validator.
3. `GOV-003` config/env validation, secret boundary, dan feature-flag convention.
4. `GOV-004` baseline observability, correlation ID, redaksi, dan evidence capture.

Tidak membuat provider live connection pada wave ini.

> **Koreksi RC1 (disetujui founder, 28 Agustus 2026).** Daftar di atas sebelumnya
> menempatkan contract/fixture validator pada `GOV-004` dan skeleton observability
> pada `OPS-001`. Keduanya bertentangan dengan `planning/implementation-backlog.json`,
> yang merupakan kontrak task machine-readable dan divalidasi CI. Backlog menang:
> contract/fixture validator adalah bagian acceptance `GOV-002`, `GOV-004` memiliki
> observability dan evidence capture, dan **`OPS-001` tetap berada di P6** dengan
> dependensi `ADM-003` dan `ANL-001`. `OPS-001` tidak boleh dikerjakan pada Wave CC-0.

### Wave CC-1 — Platform foundation

1. schema/migration baseline;
2. app user/external identity/session;
3. permission/object scope;
4. audit log;
5. outbox/background job;
6. test clock/factories/provider fake.

Review gate: schema ↔ ERD ↔ OpenAPI ↔ authorization.

### Wave CC-2 — Program vertical slice

1. program/curriculum version;
2. effective access interface fake;
3. student home/program/resource;
4. progress projection/rebuild;
5. schedule/live occurrence/recording;
6. admin content flow;
7. accessibility/device E2E.

### Wave CC-3 — Entitlement and commerce boundary

1. product/offer/SKU/purchase records;
2. canonical event normalizer fake;
3. grant claim/resolver/explanation;
4. replay/refund/overlap fixtures;
5. reconciliation queue;
6. checkout intent/return;
7. real staging adapter only after OD-01/02 evidence.

### Wave CC-4 — Question operations

1. question/stimulus/version/secret/asset;
2. import upload/quarantine;
3. parser/validator profiles;
4. preview and row issue UI;
5. moderation/separation of duties;
6. blueprint/form/batch publication validator.

### Wave CC-5 — Exam engine

1. start/resume snapshot;
2. writer lease and answer revision;
3. offline queue/reconnect;
4. deadline/cutoff/submit;
5. deterministic scoring;
6. result release;
7. correction/ranking/report/accommodation;
8. load/failure drills.

Gunakan `/superlatif-exam-engine` untuk setiap task CC-5.

### Wave CC-6 — Migration, operations, launch

1. profiler/mapping/importer dry-run;
2. reconciliation dashboards;
3. notification/analytics;
4. support/live ops;
5. backup/restore/replay automation;
6. deployment/rollback/synthetic checks;
7. release evidence bundle.

## 8. Prompt templates

### 8.1 Implement one backlog task

```text
Implement backlog item <ID> only.

First read CLAUDE.md, planning/implementation-backlog.json entry <ID>, and the
read-set listed by that entry. Load the relevant project skill. Before editing,
state the requirement IDs, invariants, expected write-set, tests, and stop
conditions you found.

Preserve all unrelated work. Do not infer provider behavior, regulatory values,
or secrets. Implement the smallest coherent change, add positive and negative
tests, run the required validations, inspect the diff, and report evidence.
If a source-of-truth conflict or missing external decision appears, stop and
write a concise blocker rather than inventing a policy.
```

### 8.2 Review a high-risk change

```text
Audit this change as a hostile but constructive reviewer. Read CLAUDE.md and
the relevant Superlatif skill. Check domain correctness, authorization/object
scope, idempotency/concurrency, immutable history, secret/PII leakage,
migration safety, negative tests, observability, and rollback.

Return findings ordered Blocker/High/Medium/Low with exact file and symbol.
Do not rewrite code unless explicitly asked. Distinguish verified defect from
unproven concern.
```

### 8.3 Fix a verified finding

```text
Fix finding <ID> without expanding scope. Read the original requirement,
failing evidence, current implementation, and dependent contracts. Add a test
that fails before the fix and passes after it. Preserve public behavior outside
the finding. Run narrow and required broader tests, then report changed files,
evidence, and remaining risk.
```

### 8.4 Prepare a release candidate

```text
Do not deploy. Prepare release-candidate evidence for <scope>. Validate the
commit against Gate 4 QA and release-gates.json, enumerate missing evidence,
run only authorized non-production checks, and produce GO / CONDITIONAL_GO /
NO_GO with reasons. An external gate without attached evidence remains open.
```

## 9. Read-set routing

| Task domain | Mandatory docs | Skill |
|---|---|---|
| Product/program/access | 05, 13, 14, 21 | `superlatif-domain` |
| UI/UX/components | 07, 09, 11, 12, 13 | `superlatif-design-system` |
| Exam/question/result | 15, 15A, 16, 17, 18, 21, 22, artifacts | `superlatif-exam-engine` |
| Sejoli/WP/commerce | 05, 13, 22, 23, 25, OpenAPI | `superlatif-sejoli-sync` |
| Security/RBAC/privacy | 13, 21, 22, 24, 27 | relevant domain skill + security review |
| Migration | 05A, 21, 23, 25, 27, 30 | `superlatif-domain` + `superlatif-sejoli-sync` |

Document numbers refer to canonical filenames in `docs/gates/`.

## 10. Mandatory review lenses

### Every task

- requirement trace;
- error/loading/empty/permission state;
- tests and observability;
- no unrelated change;
- no hardcoded secret/PII/regulatory rule.

### Database/worker

- idempotency and retry;
- unique/check/FK and transaction boundary;
- concurrency/lock behavior;
- rebuild/replay;
- migration forward compatibility;
- redacted logs.

### Student/admin UI

- server authorization independent of navigation;
- 320px/keyboard/screen reader/reduced motion;
- stale/partial/error/retry states;
- trustworthy wording; no false scarcity or false official score claim.

### Exam

- server time;
- immutable snapshot/order;
- writer lease/revision;
- acknowledged-write durability;
- secret serialization allowlist;
- result version/correction history;
- incident and recovery receipt.

### Commerce

- signature and anti-replay based on captured provider evidence;
- external mapping version;
- canonical transition;
- source-isolated grant;
- reconciliation and explainability;
- amount/refund semantics.

## 11. Stop conditions

Claude must stop before implementation when:

- requirement files disagree materially;
- task needs a founder/legal/academic/provider decision not recorded;
- production credential/data/action would be required;
- destructive migration lacks approved plan/backup/rehearsal;
- provider signature/payload is guessed;
- official scoring/threshold is absent or unverified;
- write-set expands into another high-risk aggregate;
- existing unrelated changes overlap and cannot be preserved;
- test cannot observe the promised behavior.

Stopping means returning a blocker with evidence and the smallest decision needed—not silently omitting the requirement.

## 12. Completion report format

```text
Outcome:
Backlog/requirements:
Files changed:
Behavior and invariants:
Tests run and result:
Contract/migration/observability impact:
External gates touched:
Residual risk:
Next unblocked task:
```

## 13. Anti-patterns

- “Build the whole LMS/tryout” in one prompt.
- Generating schema first and redefining product from tables.
- Mock provider behavior promoted to live adapter.
- Happy-path-only exam tests.
- UI permission used as backend authorization.
- Editing published question/form/result in-place.
- Using email as sole identity merge key.
- Marking gate passed because code exists.
- Large refactor mixed with scoring/access fix.
- Updating fixture snapshot to make a failing rule disappear without domain review.
