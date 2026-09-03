// Runtime enforcement of the feature-flag registry (P0-2).
//
// The production readiness audit found that FLAG_OWNERSHIP, loadFlags(), and
// the "safe default" discipline in env-spec.ts were all real and all tested -
// and that `loadFlags()` had no caller outside its own test file. Every flag,
// including PRODUCTION_WRITES_ENABLED ("master switch for any
// production-effect write"), was inert. dok 30 §9 step 5 lists "feature off"
// as the primary containment lever for an incident; that lever did not exist.
//
// This module is the smallest thing that makes it exist. It does NOT add a
// second config system: it reads the SAME validated env through the SAME
// parseEnv/loadFlags path, and exposes two questions server code can ask.
//
// SERVER-ONLY. Every consumer is a Server Action, a Server Component, or the
// worker process. Nothing here is reachable from a client bundle, and nothing
// here accepts caller-supplied input - the answer depends only on the
// process's own validated environment, so a request cannot influence it.
//
// NOT DYNAMIC, DELIBERATELY STATED. The flag snapshot is read once per
// process and cached. Flipping a flag therefore takes effect when the process
// restarts: on Vercel that means redeploying (or otherwise recycling the
// function instances), NOT an instant toggle. This is an operational kill
// switch with a deploy-shaped latency, and calling it anything faster would
// be misleading during exactly the incident where it matters.

import { parseEnv, type ParsedEnv } from "./env.ts";
import { loadFlags, type FlagName } from "./flags.ts";

/** Thrown when the production write kill switch is engaged. */
export class ProductionWritesDisabledError extends Error {
  /** Short, non-sensitive label of what was refused; safe to log. */
  readonly operation: string;
  constructor(operation: string) {
    super(`production writes are disabled (refused: ${operation})`);
    this.name = "ProductionWritesDisabledError";
    this.operation = operation;
  }
}

/** Thrown when a capability flag is off for a feature that exists. */
export class CapabilityDisabledError extends Error {
  readonly capability: FlagName;
  constructor(capability: FlagName) {
    super(`capability is disabled: ${capability}`);
    this.name = "CapabilityDisabledError";
    this.capability = capability;
  }
}

interface RuntimeFlagState {
  readonly appEnv: string;
  readonly flags: ReturnType<typeof loadFlags>;
}

let cached: RuntimeFlagState | null = null;

/** Test seam. Never called by application code. */
export function resetRuntimeFlagsForTests(): void {
  cached = null;
}

/**
 * Reads and caches the validated flag snapshot for this process.
 *
 * parseEnv throws EnvValidationError on any violation, and startup already
 * ran it (loadCoreEnv), so a serving process has proven this succeeds. If it
 * somehow does not, the throw propagates rather than being swallowed: a
 * process that cannot determine whether writes are permitted must not answer
 * "permitted" (see `isProductionWriteAllowed`, which never catches).
 */
function state(source: Readonly<Record<string, string | undefined>> = process.env): RuntimeFlagState {
  if (cached) return cached;
  const parsed: ParsedEnv = parseEnv(source);
  cached = { appEnv: parsed.APP_ENV, flags: loadFlags(parsed) };
  return cached;
}

/** True when this process is a real production deployment. */
export function isProductionRuntime(): boolean {
  return state().appEnv === "production";
}

/**
 * Whether production-effect writes are currently permitted.
 *
 * SCOPE - read before changing. The switch is evaluated ONLY when
 * APP_ENV=production. That is not a loophole, it is what makes the contract's
 * existing fail-closed default safe to enforce at all:
 * PRODUCTION_WRITES_ENABLED already defaults to `false` (env-spec.ts), and
 * neither local development nor the staging deployment sets it. Enforcing it
 * in every environment would therefore block every write on every developer
 * machine and on staging the moment this shipped - turning a safety control
 * into an outage. dok 30 §6 also requires a "safe default"; for a
 * non-production environment the safe default is "behaves like today".
 *
 * The default being `false` is PRESERVED exactly, and is the desirable
 * behaviour for production specifically: a production deployment is born
 * locked and only opens after the explicit signed go/no-go in dok 30 §13.
 */
export function isProductionWriteAllowed(): boolean {
  const current = state();
  if (current.appEnv !== "production") return true;
  return current.flags.PRODUCTION_WRITES_ENABLED.read();
}

/**
 * Guard for a production-effect write. Call BEFORE any mutation begins - see
 * each call site's own comment for why it sits where it does.
 *
 * `operation` is a short constant label used for logs and nothing else; it
 * must never carry user input, ids, or configuration values.
 */
export function assertProductionWritesEnabled(operation: string): void {
  if (!isProductionWriteAllowed()) throw new ProductionWritesDisabledError(operation);
}

/**
 * Whether a capability flag permits its feature to be offered.
 *
 * SEMANTICS, chosen so the declared defaults stay honest without breaking
 * environments that never set flags:
 *   - production: the validated flag value decides, so the declared default
 *     (off, for every production-sensitive flag) applies exactly as written.
 *   - non-production: enabled unless the flag is EXPLICITLY set to false.
 *     Absent means "as today", which keeps local development and staging
 *     working; an operator who wants to rehearse a disabled capability in
 *     staging sets the variable explicitly and gets production behaviour.
 *
 * Deterministic in both cases: the answer is a pure function of APP_ENV and
 * the raw variable, and `flags.test.ts`/`runtime-flags.test.ts` pin both.
 */
export function isCapabilityEnabled(
  capability: FlagName,
  source: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  const current = state();
  if (current.appEnv === "production") return current.flags[capability].read();
  return source[capability] !== "false";
}

/** Guard for a capability whose feature exists and is deployed. */
export function assertCapabilityEnabled(
  capability: FlagName,
  source: Readonly<Record<string, string | undefined>> = process.env,
): void {
  if (!isCapabilityEnabled(capability, source)) throw new CapabilityDisabledError(capability);
}
