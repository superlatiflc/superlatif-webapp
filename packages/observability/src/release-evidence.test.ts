import { describe, expect, it } from "vitest";
import {
  ReleaseEvidenceRejectedError,
  createReleaseEvidenceManifest,
  serializeReleaseEvidenceManifest,
  type ReleaseEvidenceInput,
} from "./release-evidence.ts";

const fixedClock = { now: () => new Date("2026-03-01T00:00:00.000Z") };

// Built at runtime, never as one contiguous literal - see the same note in
// redaction.test.ts.
const FAKE_AWS_ACCESS_KEY_ID = ["AKIA", "ABCDEFGHIJKLMNOP"].join("");

const VALID_INPUT = {
  releaseId: "gh-12345.1",
  commitSha: "5517b337efb447994366be681a47e9389a8fc65f",
  environment: "ci",
};

describe("createReleaseEvidenceManifest accepts a valid input", () => {
  it("builds a manifest with a stamped schema version and generation time", () => {
    const manifest = createReleaseEvidenceManifest(VALID_INPUT, fixedClock);
    expect(manifest.schemaVersion).toBe("1.0");
    expect(manifest.generatedAt).toBe("2026-03-01T00:00:00.000Z");
    expect(manifest.releaseId).toBe(VALID_INPUT.releaseId);
    expect(manifest.commitSha).toBe(VALID_INPUT.commitSha);
  });

  it("accepts a short 7-character commit SHA", () => {
    expect(() =>
      createReleaseEvidenceManifest({ ...VALID_INPUT, commitSha: "5517b33" }, fixedClock),
    ).not.toThrow();
  });

  it("accepts optional checks/configVersion/notes fields", () => {
    const manifest = createReleaseEvidenceManifest(
      {
        ...VALID_INPUT,
        configVersion: "v1",
        checks: { gitleaksClean: true },
        notes: "P0 foundation evidence",
      },
      fixedClock,
    );
    expect(manifest.checks).toEqual({ gitleaksClean: true });
  });
});

describe("manifest evidence refuses to build without commit SHA / release ID", () => {
  it("rejects an empty releaseId", () => {
    expect(() => createReleaseEvidenceManifest({ ...VALID_INPUT, releaseId: "" }, fixedClock)).toThrow(
      ReleaseEvidenceRejectedError,
    );
  });

  it("rejects a missing/malformed commitSha", () => {
    expect(() =>
      createReleaseEvidenceManifest({ ...VALID_INPUT, commitSha: "not-a-sha" }, fixedClock),
    ).toThrow(/commitSha must be a git commit SHA/);
  });

  it("rejects an empty environment", () => {
    expect(() => createReleaseEvidenceManifest({ ...VALID_INPUT, environment: "" }, fixedClock)).toThrow(
      /environment is required/,
    );
  });
});

describe("manifest evidence refuses to build with forbidden content (§0 BD-06)", () => {
  it("rejects a secret-shaped field name anywhere in the input", () => {
    expect(() =>
      createReleaseEvidenceManifest(
        {
          ...VALID_INPUT,
          notes: "fine",
          checks: {},
          ...{ answer_key: "B" },
        } as unknown as ReleaseEvidenceInput,
        fixedClock,
      ),
    ).toThrow(ReleaseEvidenceRejectedError);
  });

  it("rejects a raw webhook payload field", () => {
    expect(() =>
      createReleaseEvidenceManifest(
        { ...VALID_INPUT, ...{ raw_webhook_payload: { any: "thing" } } } as unknown as ReleaseEvidenceInput,
        fixedClock,
      ),
    ).toThrow(/forbidden field/);
  });

  it("rejects a secret-shaped value even under an innocuous key name", () => {
    // isSensitiveValue matches a value that IS a secret-shaped token, not
    // prose that happens to mention one (redaction.ts documents that as
    // Gitleaks' job on source, not this runtime check on structured
    // fields) - so the fixture here is a bare token, not a sentence.
    expect(() =>
      createReleaseEvidenceManifest({ ...VALID_INPUT, notes: FAKE_AWS_ACCESS_KEY_ID }, fixedClock),
    ).toThrow(/looks like a secret value/);
  });

  it("rejects forbidden content nested inside the checks object", () => {
    expect(() =>
      createReleaseEvidenceManifest(
        { ...VALID_INPUT, checks: { password: true } as unknown as Record<string, boolean> },
        fixedClock,
      ),
    ).toThrow(ReleaseEvidenceRejectedError);
  });
});

describe("check-name keys must avoid the word 'secret', even for a boolean flag", () => {
  it("accepts an outcome-descriptive key like gitleaksClean", () => {
    const manifest = createReleaseEvidenceManifest(
      { ...VALID_INPUT, checks: { gitleaksClean: true } },
      fixedClock,
    );
    expect(manifest.checks).toEqual({ gitleaksClean: true });
  });

  it("still rejects a key containing 'secret' even when its value is an innocuous boolean", () => {
    // Regression: an early evidence generator named this key "secrets:scan"
    // (after the pnpm script of the same name) and was rejected by its own
    // manifest builder, because the KEY contains the substring "secret" -
    // isSensitiveKey correctly does not distinguish "a secret" from "a
    // report about secret scanning" by key name alone. The fix was to
    // rename the generator's key, not to weaken this check.
    expect(() =>
      createReleaseEvidenceManifest({ ...VALID_INPUT, checks: { "secrets:scan": true } }, fixedClock),
    ).toThrow(ReleaseEvidenceRejectedError);
  });
});

describe("serializeReleaseEvidenceManifest", () => {
  it("produces parseable, stable JSON", () => {
    const manifest = createReleaseEvidenceManifest(VALID_INPUT, fixedClock);
    const serialized = serializeReleaseEvidenceManifest(manifest);
    expect(JSON.parse(serialized)).toEqual(manifest);
    expect(serialized.endsWith("\n")).toBe(true);
  });
});
