// @superlatif/worker — background worker entry point.
//
// Startup config validation (GOV-003): loadCoreEnv() is called immediately,
// so importing/running this module fails fast on a missing or invalid
// required environment variable, before any job runner starts.
//
// Job runners, the transactional outbox consumer, scoring, and provider
// adapters are added by their owning backlog tasks (P1 onward). This file
// intentionally starts no work beyond that check: booting real worker
// behaviour also needs the observability baseline (GOV-004), which does not
// exist yet.

import { loadCoreEnv } from "@superlatif/contracts";

loadCoreEnv();

export {};
