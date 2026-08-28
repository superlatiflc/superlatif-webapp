// Entitlement policy publication (ENT-001).
//
// "Policy publication is versioned" (ENT-001 acceptance) has real teeth
// here: publishing validates the config document against the reviewed
// contracts/entitlement-policy.schema.json using the same AJV-based
// approach scripts/validate-contracts.mjs uses for CI - except this runs at
// application runtime, whenever an admin actually publishes a policy, not
// only in CI. An invalid policy document cannot become a published row.
//
// Loaded via node:fs, not a static JSON import - same reasoning as
// packages/observability/src/redaction.ts: a bundler cannot resolve
// node:fs for a client target, so this module cannot end up in a browser
// bundle by construction.

import Ajv2020, { type ValidateFunction } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeChecksum, type JsonValue } from "@superlatif/domain/access";
import type { Queryable, Schema } from "../db-types.ts";
import { accessPolicies } from "../schema/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
// packages/db/src/access -> repository root is four levels up.
const POLICY_SCHEMA_PATH = path.join(
  here,
  "..",
  "..",
  "..",
  "..",
  "contracts",
  "entitlement-policy.schema.json",
);

let cachedValidator: ValidateFunction | undefined;

function loadValidator(): ValidateFunction {
  if (cachedValidator) return cachedValidator;
  const schema = JSON.parse(fs.readFileSync(POLICY_SCHEMA_PATH, "utf8"));
  const ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: true });
  addFormats(ajv);
  const compiled = ajv.compile(schema);
  cachedValidator = compiled;
  return compiled;
}

export class PolicyValidationError extends Error {
  readonly errors: readonly string[];

  constructor(errors: readonly string[]) {
    super(
      `Entitlement policy config failed schema validation:\n${errors.map((line) => `  - ${line}`).join("\n")}`,
    );
    this.name = "PolicyValidationError";
    this.errors = errors;
  }
}

/** Validates a policy config against contracts/entitlement-policy.schema.json. Throws on any violation. */
export function assertValidPolicyConfig(config: unknown): asserts config is Record<string, unknown> {
  const validate = loadValidator();
  if (validate(config)) return;
  const errors = (validate.errors ?? []).map((error) =>
    `${error.instancePath || "(root)"} ${error.message ?? ""}`.trim(),
  );
  throw new PolicyValidationError(errors.length > 0 ? errors : ["unknown validation failure"]);
}

export interface CreatePolicyDraftInput {
  readonly code: string;
  readonly version: number;
  readonly title: string;
  readonly config: Record<string, unknown>;
}

export interface PolicyRow {
  readonly id: string;
  readonly code: string;
  readonly version: number;
  readonly status: string;
  readonly checksum: string;
}

/**
 * Creates a new draft policy version. Validates config against the Gate 3
 * schema and stamps a checksum over it immediately - draft rows are not
 * exempt from validation, so an invalid policy is caught before it is ever
 * published, not at publish time.
 */
export async function createPolicyDraft(
  db: Queryable<Schema>,
  input: CreatePolicyDraftInput,
): Promise<PolicyRow> {
  assertValidPolicyConfig(input.config);
  const checksum = computeChecksum(input.config as JsonValue);
  const [row] = await db
    .insert(accessPolicies)
    .values({ code: input.code, version: input.version, title: input.title, config: input.config, checksum })
    .returning({
      id: accessPolicies.id,
      code: accessPolicies.code,
      version: accessPolicies.version,
      status: accessPolicies.status,
      checksum: accessPolicies.checksum,
    });
  if (!row) throw new Error("createPolicyDraft: insert returned no row");
  return row;
}

export class PolicyChecksumMismatchError extends Error {
  constructor(policyId: string) {
    super(`Policy ${policyId}'s stored checksum no longer matches its config - refusing to publish`);
    this.name = "PolicyChecksumMismatchError";
  }
}

/**
 * The one narrow, one-way exception to "policies never update": advances
 * status draft -> published and stamps lockedAt. Never touches `config` or
 * `checksum` - re-verifies the stored checksum against the stored config
 * first, so publishing a row whose content was somehow altered out of band
 * fails loudly instead of locking in a mismatch.
 */
export async function publishPolicyVersion(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  policyId: string,
  now: Date,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ config: accessPolicies.config, checksum: accessPolicies.checksum })
      .from(accessPolicies)
      .where(eq(accessPolicies.id, policyId))
      .limit(1);
    if (!existing) throw new Error(`publishPolicyVersion: policy ${policyId} not found`);
    if (computeChecksum(existing.config as JsonValue) !== existing.checksum) {
      throw new PolicyChecksumMismatchError(policyId);
    }
    await tx
      .update(accessPolicies)
      .set({ status: "published", lockedAt: now })
      .where(eq(accessPolicies.id, policyId));
  });
}

export async function findPolicyByCodeVersion(
  db: Queryable<Schema>,
  code: string,
  version: number,
): Promise<(PolicyRow & { config: Record<string, unknown> }) | null> {
  const [row] = await db
    .select({
      id: accessPolicies.id,
      code: accessPolicies.code,
      version: accessPolicies.version,
      status: accessPolicies.status,
      checksum: accessPolicies.checksum,
      config: accessPolicies.config,
    })
    .from(accessPolicies)
    .where(and(eq(accessPolicies.code, code), eq(accessPolicies.version, version)))
    .limit(1);
  return row ?? null;
}
