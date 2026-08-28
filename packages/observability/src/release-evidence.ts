// Release evidence manifest (GOV-004, BD-06).
//
// 27_QA_TESTING_AND_UAT_PLAN.md §16 defines the evidence bundle; ADR-042/044
// lock the two-tier location founder decision: GitHub Actions artifact for
// CI evidence, plus a separate private repository `superlatif-ops-evidence`
// (founder + engineering lead only) as the restricted operational record,
// keyed by release ID and commit SHA. This module produces the manifest;
// it never creates, clones, or pushes to that repository - doing so is an
// operator action outside this codebase's authority.
//
// A manifest is a formal record, not a log line: unlike the logger, a
// forbidden field here is REJECTED (the manifest fails to build) rather than
// silently redacted. Standing evidence that quietly swapped a secret for
// "[redacted]" would misrepresent what was actually captured.

import { isSensitiveKey, isSensitiveValue } from "./redaction.ts";

export class ReleaseEvidenceRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReleaseEvidenceRejectedError";
  }
}

/** Minimal clock seam. Not @superlatif/testing's Clock: observability is a
 * runtime foundation package and must not depend on a test-only package. */
export interface EvidenceClock {
  now(): Date;
}

const systemClock: EvidenceClock = { now: () => new Date() };

export interface ReleaseEvidenceInput {
  readonly releaseId: string;
  readonly commitSha: string;
  readonly environment: string;
  readonly configVersion?: string;
  readonly checks?: Readonly<Record<string, boolean>>;
  readonly notes?: string;
}

export interface ReleaseEvidenceManifest extends ReleaseEvidenceInput {
  readonly schemaVersion: "1.0";
  readonly generatedAt: string;
}

function walkForForbiddenContent(value: unknown, pathLabel: string): void {
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => walkForForbiddenContent(entry, `${pathLabel}[${index}]`));
    return;
  }
  if (typeof value === "object") {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      const fieldPath = `${pathLabel}.${key}`;
      if (isSensitiveKey(key)) {
        throw new ReleaseEvidenceRejectedError(
          `Release evidence rejected: ${fieldPath} is a forbidden field (secret/PII/answer payload/raw webhook are never stored as evidence).`,
        );
      }
      if (isSensitiveValue(entry)) {
        throw new ReleaseEvidenceRejectedError(
          `Release evidence rejected: ${fieldPath} looks like a secret value.`,
        );
      }
      walkForForbiddenContent(entry, fieldPath);
    }
    return;
  }
  if (isSensitiveValue(value)) {
    throw new ReleaseEvidenceRejectedError(
      `Release evidence rejected: ${pathLabel} looks like a secret value.`,
    );
  }
}

const COMMIT_SHA_PATTERN = /^[0-9a-f]{7,40}$/i;

/**
 * Builds a release evidence manifest. Throws ReleaseEvidenceRejectedError if
 * releaseId/commitSha are missing or malformed, or if any field anywhere in
 * the input is a forbidden key or a secret-shaped value.
 */
export function createReleaseEvidenceManifest(
  input: ReleaseEvidenceInput,
  clock: EvidenceClock = systemClock,
): ReleaseEvidenceManifest {
  if (input.releaseId.trim() === "") {
    throw new ReleaseEvidenceRejectedError("releaseId is required and must not be empty");
  }
  if (!COMMIT_SHA_PATTERN.test(input.commitSha)) {
    throw new ReleaseEvidenceRejectedError("commitSha must be a git commit SHA (7-40 hex characters)");
  }
  if (input.environment.trim() === "") {
    throw new ReleaseEvidenceRejectedError("environment is required and must not be empty");
  }

  walkForForbiddenContent(input, "manifest");

  return {
    schemaVersion: "1.0",
    generatedAt: clock.now().toISOString(),
    ...input,
  };
}

export function serializeReleaseEvidenceManifest(manifest: ReleaseEvidenceManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
