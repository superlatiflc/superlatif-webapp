// Policy content checksum (ENT-001).
//
// ADR-014 "Version rules; history never mutates": a published policy
// version's content must never silently change. The checksum is what makes
// that auditable - a stored config whose checksum no longer matches its own
// content is unambiguous evidence of tampering or a bug, not something a
// database constraint alone can catch.
//
// Re-exported from @superlatif/domain/shared (COM-001, ADR-048): product
// versions and offers need the exact same canonical-JSON-checksum
// discipline, so the implementation moved to shared/checksum.ts rather than
// being duplicated a second time. This module keeps re-exporting the same
// names so nothing importing from @superlatif/domain/access changes.

export { computeChecksum, type JsonValue } from "../shared/checksum.ts";
