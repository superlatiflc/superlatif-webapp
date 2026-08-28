# Synthetic Contract Fixtures

Status: `TEST-ONLY`  
Evidence class: `synthetic`  
Production eligibility: `false`

These fixtures define deterministic examples for the implementation backlog and CI contract suite. They contain no production data, no real credentials, no official exam threshold, and no claim that a provider payload matches the current live Sejoli installation.

## Fixture sets

| File | Contract under test |
|---|---|
| `entitlement-resolution.cases.json` | Grant union, overlap, expiry, revocation isolation, explanation |
| `purchase-events.cases.json` | Normalized commerce lifecycle, replay, ordering, quarantine |
| `exam-attempt-lifecycle.cases.json` | Start, lease, autosave, resume, expiry, submit |
| `blueprint-publication.cases.json` | Blueprint publication and fail-closed validation |
| `scoring-skd-synthetic.cases.json` | Deterministic scorer using deliberately synthetic values |
| `question-import.cases.json` | XLSX/ZIP validation, media checks, idempotency, archive safety |
| `result-correction.cases.json` | Append-only result correction and ranking versions |
| `migration-reconciliation.cases.json` | Legacy profiling, ETL, rerun, and reconciliation invariants |
| `privacy-rbac.cases.json` | RBAC, object scope, maker-checker, and payload privacy |

## Mandatory harness behavior

1. Reject a fixture whose `evidenceClass` is not `synthetic` or whose `productionEligible` is not `false`.
2. Run with a fixed clock and seeded randomness.
3. Compare semantic objects, not generated IDs or timestamps, unless an expected value is explicit.
4. Keep official scoring or provider evidence in a separate controlled evidence store.
5. Never turn a fixture into a production configuration through an environment flag alone.

## Evidence replacement

Synthetic fixtures support build verification but do not close external gates. Live readiness requires sanitized, owner-approved evidence listed in `../release-gates.json` and `../../GATE_4_READINESS_REGISTER.md`.
