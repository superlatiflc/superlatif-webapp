# Gate 4 Readiness Register

**Versi:** 1.0-RC1  
**Tanggal:** 28 Agustus 2026  
**Decision:** `READY_FOR_IMPLEMENTATION_PLANNING`  
**Production decision:** `NO_GO_UNTIL_SCOPE_GATES_PASS`

## 1. Interpretation

`READY_FOR_IMPLEMENTATION_PLANNING` berarti tim dapat membuat repository, spike, test harness, synthetic integrations, dan vertical slices non-production berdasarkan Gates 1–4. Status ini tidak berarti semua vendor, regulasi, legal, kapasitas, atau migration evidence telah tersedia.

## 2. Internal build-readiness

| Area | Status | Evidence/next condition |
|---|---|---|
| Product/domain source of truth | READY | Gates 1–3 RC2 + closure report |
| UX/screen contract | READY | Gate 2 RC2; six previously partial screens closed |
| Functional/technical contract | READY_RC | Gate 3 RC2; machine artifacts parse/reference-check |
| QA/UAT contract | READY | Document 27 |
| Delivery sequence | READY | Document 28 |
| Claude Code workflow | READY | Document 29 + `CLAUDE.md` + project skills |
| Operations/rollback | READY_FOR_REHEARSAL | Document 30; provider commands pending OD-03 |
| Machine backlog | READY | `planning/implementation-backlog.json` |
| Release evidence contract | READY | `planning/release-gates.json` |
| Synthetic fixtures | READY | `test/fixtures/contracts/`; official/provider fixtures still gated |
| Environment contract | READY_TEMPLATE | `.env.example`; no credentials included |

## 3. External hard gates

| Gate | Status | Blocks | Evidence required | Owner |
|---|---|---|---|---|
| OD-01 Sejoli events | BLOCKED_EXTERNAL | Live commerce/access | Real payloads, stable IDs, signature bytes, timestamp/replay, retry, refund/chargeback/amount semantics | Commerce + Engineering |
| OD-02 WordPress bridge | BLOCKED_EXTERNAL | Live SSO/linking | One-time exchange staging, audience/nonce/expiry, safe linking, logout/revocation | Identity + Engineering |
| OD-03 Provider decisions | OPEN | Production infrastructure/runbook commands | Benchmark/ADR for DB, queue, storage, messaging, live, hosting | Founder + Engineering |
| OD-04 Official SKD rules | EXPECTED_OPEN | Ranked SKD production | Primary source, verified structure/threshold/category, academic sign-off, official fixture | Academic + Product |
| OD-07 Legal/privacy | BLOCKED_REVIEW | Production data/consent/retention/incident policy | Indonesian legal review and approved policy | Founder + Legal/Privacy |
| OD-08 Scale | BLOCKED_TEST | High-traffic ranked/flash sale launch | Workload model and target-platform load/soak/failure evidence | Engineering + Ops |
| Legacy promises 05A | BLOCKED_EXTERNAL | Legacy benefit migration | Sales/order/terms evidence or signed founder decision per promise | Founder + Commerce |

## 4. Internal kickoff decisions

These are implementation choices, not reasons to reopen product direction.

| ID | Decision | Default proposal | Lock point |
|---|---|---|---|
| BD-01 | Package manager/runtime exact version | Current supported Node LTS + pnpm; pin in `packageManager` and CI | P0 kickoff ADR |
| BD-02 | Repository layout | Monorepo: `apps/web`, `apps/worker`, `packages/domain|db|contracts|ui|testing` | P0 bootstrap |
| BD-03 | Test tools | TypeScript unit/contract runner + Playwright-class E2E + provider fakes | P0 bootstrap |
| BD-04 | Feature/config system | Versioned DB config + safe deployment flags; no auth via flag | P1 foundation |
| BD-05 | Migration runner | Drizzle generate + reviewed SQL migrate; push local disposable only | P1 foundation |
| BD-06 | Evidence location | CI artifact + restricted operational record linked by release ID | P0 kickoff |

If the implementation repository already has a valid locked choice, preserve it unless an ADR justifies migration.

## 5. Path authorization matrix

| Activity | Allowed now | Required before execution |
|---|---:|---|
| Create repo/CI/local synthetic stack | Yes | BD-01–03 lock |
| Build program/LMS in dev/staging | Yes | Foundation tests |
| Build entitlement with synthetic events | Yes | Domain fixtures |
| Build Sejoli/WP adapter interface | Yes | No guessed live behavior |
| Connect real staging commerce | Conditional | Authorized staging access and OD-01/02 evidence capture plan |
| Build ranked engine in staging | Yes | Synthetic/approved staging blueprint |
| Activate ranked SKD production | No | OD-04, Academic sign-off, Gate C, OD-08, security/UAT |
| Dry-run migration with synthetic/masked export | Conditional | Source access approval, 05A workflow, data handling |
| Production migration/cutover | No | Document 25 go/no-go + Gate D + rollback rehearsal |
| Production launch | No | Scope-specific release gates and signed go/no-go |

## 6. Gate evidence status at package creation

| Release gate | Status | What exists | What is missing |
|---|---|---|---|
| Gate A — Access | NOT_RUN | Contract + synthetic fixture plan | Runtime implementation, staging provider evidence, test report |
| Gate B — Learning | NOT_RUN | UX/spec/test plan | Runtime implementation and mobile UAT |
| Gate C — SKD | BLOCKED | Engine contract + synthetic fixture plan | Official rule, implementation, academic/security/load/incident evidence |
| Gate D — Commerce/launch | BLOCKED | Runbook + release schema | OD-01/02, runtime flow, support rehearsal, signed launch decision |

## 7. Go/no-go vocabulary

- `GO`: all required evidence for the exact scope is attached and valid.
- `CONDITIONAL_GO`: only explicitly non-production or limited pilot activity is allowed; conditions and stop triggers are named.
- `NO_GO`: one or more required gate missing, failed, expired, or materially inconsistent.
- `BLOCKED_EXTERNAL`: cannot be closed by document/code alone.
- `EXPECTED_OPEN`: intentionally waits for time-bound authoritative input such as annual regulation.

Missing evidence is never interpreted as pass.

## 8. First decisions for Fadhli/team

Before P0 implementation starts, approve or delegate:

1. engineering lead and academic owner;
2. reference team/capacity and scope window;
3. repository/tooling lock owner;
4. staging access owner for WordPress/Sejoli;
5. shortlist/budget constraints for provider benchmark;
6. legal/privacy reviewer;
7. pilot Kelas Akselerasi cohort and support owner.

These decisions affect schedule and ownership, not the core product/domain contract.
