# 30 — Launch and Operations Runbook

**Versi:** 1.0-RC1  
**Tanggal:** 28 Agustus 2026  
**Status:** Operational contract; provider-specific commands belum dibekukan

## 1. Tujuan dan batas

Runbook ini mengatur release, monitoring, incident, rollback, recovery, dan support Superlatif Web App. Ia tidak menggantikan provider console procedure atau legal incident plan. Provider-specific link/command wajib ditambahkan setelah OD-03 diputuskan dan diuji di staging.

Tidak ada operator yang boleh memperbaiki masalah access, answer, score, atau purchase dengan edit row database ad-hoc. Gunakan command/workflow yang idempotent, scoped, memiliki preview, reason, approval, dan audit.

## 2. Operational ownership

| Function | Primary role | Backup/consulted |
|---|---|---|
| Incident commander | Operations lead/on-call | Engineering lead |
| App/API | App on-call | Engineering lead |
| Exam hot path | Exam on-call | Academic Ops |
| Database/queue/storage | Platform on-call | App/Exam on-call |
| Commerce/access | Commerce Ops | Finance, Support, Engineering |
| Academic/scoring | Academic Admin | Moderator, Exam on-call |
| Security/privacy | Security/Privacy owner | Founder, Legal, Engineering |
| Student communication | Support lead | Product/Operations |
| Go/no-go | Founder/Product + Engineering + relevant owner | QA, Incident commander |

Contact names, phone, escalation group, provider account ID, and console links belong in a restricted operations directory—not in public repository or this package.

## 3. Environments and change classes

| Environment | Change authority | Data rule |
|---|---|---|
| Local/CI | Engineer/automation | Synthetic only |
| Development | Engineering | Synthetic, shared |
| Staging | Release manager/domain owner | Synthetic + masked approved sample |
| Production | Approved release command | Real, restricted |

Change classes:

- Standard: backward-compatible app/config under tested playbook.
- Elevated: migration, queue concurrency, auth/security header, feature activation, provider adapter.
- Emergency: security containment, exam integrity, widespread wrong access/score, outage.

Elevated/emergency change requires named commander, evidence, rollback/forward-fix, and incident/change record.

## 4. Release readiness

Before scheduling:

- release scope and commit SHA frozen;
- `release-gates.json` evaluated for the enabled paths;
- relevant external gates contain evidence;
- migration plan reviewed and staging timing measured;
- support/academic/finance/on-call coverage confirmed;
- dashboards, alerts, runbook links, feature flags, and rollback target verified;
- student/admin communication approved;
- no active ranked batch overlaps risky exam migration/deploy window;
- zero Sev-0/Sev-1 and no unaccepted relevant Sev-2;
- backup/restore freshness meets policy.

## 5. Deployment sequence

### 5.1 Pre-deploy

1. Announce change window and freeze conflicting configuration.
2. Capture current release, config version, schema migration version, queue backlog, DB health, and SLO baseline.
3. Confirm last known good application artifact is deployable.
4. Confirm feature flags default to safe/off for new high-risk path.
5. Run backup/pre-migration safeguard appropriate to provider.
6. Run migration dry-run/plan on staging-like schema.
7. Verify synthetic accounts/fixtures are ready.

### 5.2 Deploy

Preferred order for expand-style change:

1. backward-compatible schema expand;
2. worker/app capable of old + new shape;
3. backfill/rebuild with progress and pause control;
4. switch read/write behavior behind flag;
5. validate;
6. later contract cleanup in separate release.

Never rollback a destructive schema by blindly reversing SQL. Roll back application traffic/flag and forward-fix schema according to reviewed migration plan.

### 5.3 Post-deploy smoke

Within first 15 minutes:

- health/readiness and error rate;
- login/session/deep link;
- home/program/access explain;
- protected resource and signed media;
- attempt start/save/resume/submit only if exam path changed and staging/synthetic production check is authorized;
- outbox/queue/job age;
- audit/correlation visibility;
- purchase-to-access synthetic/staging-safe check when commerce path enabled;
- no PII/answer key in logs/errors/analytics.

Observe at least one normal workload interval and any scheduled batch boundary relevant to the change.

## 6. Progressive rollout

Recommended sequence:

1. internal staff;
2. synthetic monitoring;
3. pilot cohort;
4. one program or one new non-overlapping batch;
5. percentage/cohort expansion;
6. all eligible users.

Rollout unit should be program, cohort, batch, or capability—not random per-request behavior that can split one attempt across versions.

Feature flag rules:

- stable assignment and audit;
- no change during active attempt;
- safe default;
- owner and expiry/removal task;
- server authorization remains independent;
- public copy matches enabled capability.

## 7. Monitoring and alerts

| Signal | Initial trigger | Primary dashboard | Owner |
|---|---|---|---|
| Student read p95 | >500 ms for 5 min | App RED | App on-call |
| Start/resume p95 | >800 ms for 5 min | Exam hot path | Exam on-call |
| Answer save | p95 >350 ms or error >0,5% for 5 min | Answer durability | Exam on-call |
| Submit/scoring | ack >1 s or oldest scoring job >2 min | Submit/scoring | Exam + Academic Ops |
| Paid-to-access | p95 >2 min or mismatch >0,1% | Commerce/access | Commerce Ops |
| Import | internal failure >2%/hour | Import jobs | Content Platform |
| Queue | oldest critical job beyond per-type SLO | Worker/queue | Platform on-call |
| DB | saturation, connection, lock, replication/PITR health | Database | Platform on-call |
| Auth | login/replay/conflict/revoke anomaly | Identity/security | App + Security |
| Security | secret/PII leak, auth bypass, suspicious export | Security | Security owner |

Alerts require actionable label: service, environment, severity, first observed, current value, runbook key, owner, and correlation query.

## 8. Incident severity

| Severity | Example | Initial response |
|---|---|---|
| SEV-0 | Active data/security breach, widespread wrong score/access, acknowledged answers lost during live batch | Immediate command, containment, launch/change freeze |
| SEV-1 | Critical flow unavailable, paid users denied broadly, answer save/submit failing materially | Page on-call, mitigate/rollback, frequent update |
| SEV-2 | Major degraded function with bounded impact/workaround | Owner assigned, feature pause if needed |
| SEV-3 | Minor defect/isolated case | Support/engineering queue |

Severity is based on impact and integrity, not number of tickets alone.

## 9. Incident command loop

1. Declare incident ID, severity, commander, affected environment/scope.
2. Preserve evidence; do not delete/rewrite logs or result history.
3. Stop unsafe rollout/config changes.
4. Assess student/business/integrity/privacy impact.
5. Choose containment: feature off, cohort pause, batch extension/void, adapter quarantine, worker pause, traffic rollback.
6. Communicate internally; student message only with verified facts.
7. Recover using idempotent replay/rebuild/forward-fix.
8. Validate with synthetic and sampled affected records.
9. Close incident only after metrics stabilize and owner confirms correctness.
10. Produce post-incident review with timeline, cause, contributing factor, detection, response, impact, corrective action, and owner/date.

## 10. Playbooks

### 10.1 Paid order but no access

**Trigger:** paid-to-access SLO breach, support case, reconciliation mismatch.

**Check:** provider event receipt/checksum; canonical transition; SKU mapping version; identity link; purchase status; grant source; projection version; reconciliation case.

**Mitigate:** do not ask student to repurchase. Create/assign case; replay known event only through idempotent command; grant manual temporary access only under approved policy with reason/expiry/audit.

**Recover:** fix mapping/adapter, replay affected event range by provider key, rebuild access, reconcile counts/amounts, notify affected users.

### 10.2 Wrong or overly broad access

**Trigger:** authorization incident, explain mismatch, protected resource leakage.

**Contain:** disable affected mapping/capability, invalidate access projection/cache, preserve grants/purchases.

**Recover:** correct policy/version, rebuild impacted users, compare before/after explanation, audit exposed scope. Do not mass-delete grants.

### 10.3 WordPress bridge/login failure

**Check:** code expiry/audience/nonce/key ID, clock skew, external subject, conflict queue, cookie/session, return path.

**Mitigate:** pause bridge rollout; allow only approved fallback login; preserve deep link; do not merge by email.

**Escalate:** suspected replay/signature issue to Security; staging/provider capability issue to identity owner.

### 10.4 Answer-save degradation

**Trigger:** p95/error threshold, client recovery backlog, writer conflict spike.

**Check:** DB/connection/lock, app release, lease expiry, revision conflict, queue not inline, payload size, region/network.

**Contain:** stop rollout, reduce noncritical workload, preserve local queues, disable nonessential analytics/notification, extend/void batch only by incident command and academic approval.

**Recovery proof:** compare every acknowledged mutation/receipt to current answer/revision; lost acknowledged write = SEV-0.

### 10.5 Submit or scoring backlog

**Check:** final submission existence, idempotency key, outbox/job state, scorer version, secret access, dead-letter, result state.

**Mitigate:** keep `processing` visible; do not fabricate score. Scale/restart workers only with lease/idempotency safety. Replay job from durable record.

**Escalate:** scoring mismatch, wrong policy, or secret/version issue to Academic + Exam on-call; hold result release.

### 10.6 Wrong score/result correction

**Contain:** move affected result to controlled `withheld` when policy permits; pause leaderboard/explanation release.

**Investigate:** form/blueprint/scoring checksum, answer snapshot, correction scope, question report, affected attempts.

**Recover:** create correction case, impact preview, peer approvals, new result version, current pointer switch, new ranking snapshot, student communication. Never edit old result in-place.

### 10.7 Import or question media failure

**Check:** job stage, malware/MIME/decompression, asset reference/checksum, storage/CDN, serializer, mobile render.

**Mitigate:** block import/batch publish; quarantine only affected assets; do not bypass validation. During live exam, treat unreadable critical media as exam incident.

### 10.8 Queue/Redis failure

DB/outbox remains source of truth. Degrade cache/noncritical jobs, fail commands safely where durable enqueue cannot be guaranteed, restore worker/queue, then replay from durable job/outbox with idempotency. Monitor duplicate side effects and oldest job age.

### 10.9 Database degradation

**Contain:** stop deploy/backfill, reduce noncritical admin/reporting, protect answer/access commands, disable heavy rebuilds.

**Recover:** provider failover/restore according to tested playbook; verify migration version, unique constraints, outbox, recent mutation/result continuity. Declare RPO/RTO actual.

### 10.10 Notification provider failure or wrong audience

Pause scheduled/promotional jobs, preserve in-app state, cancel undispatched jobs, do not retry ambiguous settled deliveries. For wrong audience/consent breach, involve Privacy owner, record recipients/template/version, suppress further sends, and follow legal incident procedure.

### 10.11 Flash-sale/catalogue overload

Separate catalogue/checkout degradation from active exam hot path. Apply CDN/cache/rate controls to public reads, queue checkout intent safely, show truthful status, and never let scarcity countdown diverge from authoritative sale window.

### 10.12 Suspected secret/PII/answer-key exposure

Treat as SEV-0/SEV-1 based on scope. Stop affected release/endpoint/export, revoke/rotate credential or signed URL capability, restrict logs/artifacts, preserve evidence, notify Security/Privacy/Academic owners, assess exposure window and legal duty, and reissue/redact through controlled workflow.

## 11. Rollback policy

Rollback triggers:

- Sev-0/Sev-1 related to new release;
- access mismatch above threshold;
- auth/login failure broadly;
- exam save/submit integrity uncertain;
- unbounded migration/backfill impact;
- security regression;
- core SLO does not stabilize after bounded mitigation.

Rollback order:

1. stop progressive rollout/flag;
2. route traffic to last known good compatible app;
3. pause incompatible worker or new job production;
4. keep ingest/outbox safely durable where possible;
5. forward-fix data/schema when reverse is unsafe;
6. rebuild projections and validate affected records;
7. communicate status and next decision.

Do not delete purchase, grant, attempt, answer mutation, result, audit, or migration evidence as rollback.

## 12. Backup, restore, and continuity

Before production:

- confirm automated DB backup and PITR window;
- object storage versioning/lifecycle where required;
- export/backup critical blueprint/form/scoring/config;
- encrypt and restrict backup;
- document restore destination/isolation;
- test restore quarterly initially and before high-risk migration;
- test projection rebuild and outbox replay after restore;
- record actual RPO/RTO.

Provisional objective: transactional DB RPO ≤15 minutes and RTO ≤4 hours. Active exam operational decision may require batch extension/void/retake even when infrastructure RTO is met.

## 13. Launch day command center

### T-24 hours

- confirm gates/evidence, on-call, pilot cohort, backup, last known good;
- freeze mappings/blueprints/forms/batch time except approved emergency;
- verify support templates/status page/channel.

### T-60 minutes

- baseline dashboards and queue/DB health;
- confirm no conflicting batch/deploy;
- run staging smoke and production-safe preflight;
- announce go/no-go checkpoint.

### T0–T+60

- progressive enablement;
- live monitor auth, access, exam, queue, errors, support;
- record decisions/timestamps; avoid unrelated changes.

### T+1–24 hours

- reconcile paid/access, attempts/results, notifications;
- sample representative users and multi-grant/refund cases;
- publish internal launch report and decide expansion/hold/rollback.

## 14. Student/support communication principles

- Empathetic, specific, and honest; no blame or false certainty.
- State what is affected, what remains safe, what student should do, and when next update arrives.
- Do not ask repurchase or repeated submit unless verified safe.
- Never expose internal IDs, security detail, another student, answer key, or medical/evidence data.
- For exam incidents, coordinate message with Academic owner before promising retake/score action.
- Tone remains Superlatif: purpose, confidence, clarity, and humane process—not motivational copy that hides a failure.

## 15. Handover and routine operations

Daily during active campaign/batch:

- outstanding reconciliation and identity conflicts;
- upcoming sale/attempt/result/review windows;
- queue/dead-letter and failed import/notification;
- error/SLO/access mismatch;
- live occurrence/recording readiness;
- open Sev-2 and support trend.

Weekly:

- permission/high-risk action audit;
- projection rebuild sample;
- dependency/security updates;
- capacity trend and storage/DB growth;
- expired feature flags/config versions;
- runbook/action-item review.

Monthly/quarterly:

- incident and correction trend;
- backup/restore rehearsal according to schedule;
- access/role review;
- provider SLA/cost and OD-03 decision review;
- retention/deletion jobs and legal policy review;
- load model before major flash sale/batch.

## 16. Required records

- change/release record;
- go/no-go evidence;
- incident timeline and postmortem;
- migration/backfill/reconciliation report;
- access/correction approval;
- backup/restore drill;
- provider outage/replay evidence;
- student communication versions;
- open action owner and due date.
