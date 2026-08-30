// AJV validation of exam blueprint config against the reviewed Gate 3
// contract, contracts/exam-blueprint.schema.json (EXM-001).
//
// Mirrors packages/db/src/access/policy-repository.ts's own
// loadValidator/assertValidPolicyConfig pattern for
// entitlement-policy.schema.json exactly - same AJV2020 + ajv-formats
// setup, same node:fs (not a static JSON import, so this module cannot end
// up in a browser bundle by construction), same "validate on every write,
// not only at publish" discipline. This file exists specifically because
// the blueprint schema was discovered to ALREADY EXIST as a pre-existing,
// reviewed Gate 3 artifact after this task's schema/domain layer had
// already been built independently - the blueprint `config` JSONB column
// was reshaped to hold exactly the document this schema describes, and
// this validator is what actually enforces that shape at runtime, not
// merely the column's own untyped JSONB type.

import Ajv2020, { type ValidateFunction } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
// packages/db/src/exam/config -> repository root is five levels up.
const BLUEPRINT_SCHEMA_PATH = path.join(
  here,
  "..",
  "..",
  "..",
  "..",
  "..",
  "contracts",
  "exam-blueprint.schema.json",
);

let cachedValidator: ValidateFunction | undefined;

function loadValidator(): ValidateFunction {
  if (cachedValidator) return cachedValidator;
  const schema = JSON.parse(fs.readFileSync(BLUEPRINT_SCHEMA_PATH, "utf8"));
  const ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: true });
  addFormats(ajv);
  const compiled = ajv.compile(schema);
  cachedValidator = compiled;
  return compiled;
}

export class ExamBlueprintConfigValidationError extends Error {
  readonly errors: readonly string[];

  constructor(errors: readonly string[]) {
    super(
      `Exam blueprint config failed schema validation:\n${errors.map((line) => `  - ${line}`).join("\n")}`,
    );
    this.name = "ExamBlueprintConfigValidationError";
    this.errors = errors;
  }
}

/** Validates a blueprint config against contracts/exam-blueprint.schema.json. Throws on any violation. */
export function assertValidExamBlueprintConfig(config: unknown): asserts config is Record<string, unknown> {
  const validate = loadValidator();
  if (validate(config)) return;
  const errors = (validate.errors ?? []).map((error) =>
    `${error.instancePath || "(root)"} ${error.message ?? ""}`.trim(),
  );
  throw new ExamBlueprintConfigValidationError(errors.length > 0 ? errors : ["unknown validation failure"]);
}
