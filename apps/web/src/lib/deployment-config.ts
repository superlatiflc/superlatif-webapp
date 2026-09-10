// Deployment-time configuration gate (production hardening, after bring-up).
//
// WHY THE BUILD, NOT STARTUP. The production bring-up proved that the startup
// check in instrumentation/register-node does not stop a Vercel deployment:
// that hook runs lazily inside each serverless function instance, after the
// deployment is already built, promoted, and routed, so `process.exit(1)`
// fails at most one invocation. A staging deployment with no
// RATE_LIMIT_HASH_SECRET served all day and 500'd only on sign-in.
//
// Vercel binds a deployment's environment at BUILD time, and a failed build
// never becomes Ready - the previous deployment simply keeps serving. So this
// module is enforced from next.config.ts, which Next.js evaluates on every
// build path (`next build`, Vercel's default `npm run build`, `vercel build`).
// That is the narrowest boundary that actually makes a misconfigured
// deployment unusable instead of partially working.
//
// WHEN IT IS ENFORCED. Only for hosted deployments: VERCEL=1 (Vercel sets it
// for every build and function), or APP_ENV staging/production anywhere.
// Local development and CI builds carry neither, so they are unaffected -
// CI's `pnpm run build` runs with no deployment environment at all.
//
// NO SECRET IN OUTPUT. parseEnv's own violation messages echo the raw value
// for url/boolean/integer/enum fields (`received "..."`). For DATABASE_URL
// that would print a connection string, password included, straight into
// build logs. Every violation leaving this module is sanitized first.

import { EnvValidationError, SECRET_ENV_NAMES, loadCoreEnv } from "@superlatif/contracts";

type Env = Readonly<Record<string, string | undefined>>;

const HOSTED_APP_ENVS = new Set(["staging", "production"]);

export class DeploymentConfigError extends Error {
  readonly violations: readonly string[];
  constructor(violations: readonly string[]) {
    super(
      "Deployment configuration is invalid - refusing to build this deployment:\n  - " +
        violations.join("\n  - "),
    );
    this.name = "DeploymentConfigError";
    this.violations = violations;
  }
}

/** Whether this build/process is a hosted deployment whose configuration must be complete. */
export function isDeploymentConfigEnforced(env: Env): boolean {
  return env["VERCEL"] === "1" || HOSTED_APP_ENVS.has(env["APP_ENV"] ?? "");
}

/**
 * The rate-limit configuration rule, shared with the request path
 * (rate-limit.ts delegates here) so build time and run time cannot disagree.
 * Returns a value-free message, or null when the configuration is acceptable.
 */
export function rateLimitConfigViolation(env: Env): string | null {
  const raw = env["RATE_LIMIT_ENABLED"];
  // Absent or empty means ON, matching ENV_SPEC's own default.
  const enabled = raw === undefined || raw === "" ? true : raw !== "false";
  const hosted = HOSTED_APP_ENVS.has(env["APP_ENV"] ?? "");
  if (!enabled) {
    return hosted ? "RATE_LIMIT_ENABLED=false is not permitted when APP_ENV is staging or production" : null;
  }
  const secret = env["RATE_LIMIT_HASH_SECRET"];
  if (secret && secret.length >= 16) return null;
  return hosted
    ? "RATE_LIMIT_ENABLED is on but RATE_LIMIT_HASH_SECRET is missing or shorter than 16 characters"
    : null;
}

/**
 * Removes every raw value from environment violations before they are logged
 * or thrown. Three independent layers, because one missed format is a leak:
 * drop parseEnv's `received ...` tails, mask anything URL-shaped, and replace
 * the actual value of every secret-typed variable wherever it appears.
 */
export function sanitizeEnvViolations(violations: readonly string[], env: Env): string[] {
  const secretValues = SECRET_ENV_NAMES.map((name) => env[name]).filter(
    (value): value is string => typeof value === "string" && value.length >= 4,
  );
  return violations.map((violation) => {
    let clean = violation
      .replace(/,? received [\s\S]*$/, "")
      .replace(/ is not a safe integer: [\s\S]*$/, " is not a safe integer")
      .replace(/[a-z][a-z0-9+.-]*:\/\/\S+/gi, "[redacted-url]");
    for (const value of secretValues) clean = clean.split(value).join("[redacted]");
    return clean;
  });
}

/** Every reason this environment must not become a hosted deployment. Empty when acceptable or not enforced. */
export function deploymentConfigViolations(env: Env): string[] {
  if (!isDeploymentConfigEnforced(env)) return [];
  const violations: string[] = [];
  const appEnv = env["APP_ENV"];

  // A public Vercel deployment running as "development" or "test" would get
  // the dev sign-in fallbacks and the hard-coded development rate-limit key.
  if (env["VERCEL"] === "1" && !HOSTED_APP_ENVS.has(appEnv ?? "")) {
    violations.push(
      `APP_ENV must be "staging" or "production" on a Vercel deployment (got ${appEnv ? JSON.stringify(appEnv) : "nothing"})`,
    );
  }

  try {
    loadCoreEnv(env);
  } catch (error) {
    if (error instanceof EnvValidationError) violations.push(...error.violations);
    else violations.push("environment could not be validated");
  }

  const rateLimit = rateLimitConfigViolation(env);
  if (rateLimit) violations.push(rateLimit);

  // Not required by ENV_SPEC globally, but a staging/production web
  // deployment without it serves pages that 500 on every database read -
  // exactly the partially-working state this gate exists to prevent.
  if (HOSTED_APP_ENVS.has(appEnv ?? "") && !env["DATABASE_URL"]) {
    violations.push("DATABASE_URL is required for a staging or production web deployment");
  }

  return sanitizeEnvViolations(violations, env);
}

/** Throws when this environment must not become a hosted deployment. Called from next.config.ts. */
export function assertDeploymentConfig(env: Env = process.env): void {
  const violations = deploymentConfigViolations(env);
  if (violations.length > 0) throw new DeploymentConfigError(violations);
}
