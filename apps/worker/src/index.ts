// @superlatif/worker — background worker entry point.
//
// GOV-001 establishes the deployment unit only. Job runners, the transactional
// outbox consumer, scoring, and provider adapters are added by their owning
// backlog tasks (P1 onward). This file intentionally starts no work: booting a
// worker requires the configuration contract (GOV-003) and the observability
// baseline (GOV-004) that do not exist yet.

export {};
