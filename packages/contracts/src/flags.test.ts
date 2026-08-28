import { describe, expect, it } from "vitest";
import { ENV_SPEC, type EnvName } from "./env-spec.ts";
import { parseEnv } from "./env.ts";
import { PRODUCTION_SENSITIVE_FLAGS, REGISTERED_FLAG_NAMES, loadFlags, type FeatureFlag } from "./flags.ts";

const VALID_CORE = {
  APP_ENV: "development",
  APP_BASE_URL: "http://localhost:3000",
  ADMIN_BASE_URL: "http://localhost:3001",
  API_BASE_URL: "http://localhost:4000",
  WORKER_CONCURRENCY: "2",
  LOG_LEVEL: "info",
};

const booleanFieldNames = (Object.keys(ENV_SPEC) as EnvName[]).filter(
  (name) => ENV_SPEC[name].type === "boolean",
);

describe("flag registry completeness", () => {
  it("registers exactly the boolean fields declared in ENV_SPEC", () => {
    expect(new Set(REGISTERED_FLAG_NAMES)).toEqual(new Set(booleanFieldNames));
  });

  it("gives every registered flag a non-empty owner and removal condition", () => {
    const env = parseEnv(VALID_CORE);
    const flags = loadFlags(env);
    for (const name of REGISTERED_FLAG_NAMES) {
      const flag = flags[name];
      expect(flag.owner.length, name).toBeGreaterThan(0);
      expect(flag.targetRemoval.length, name).toBeGreaterThan(0);
    }
  });
});

describe("a flag can only ever answer on-or-off", () => {
  it("read() reflects the parsed env value", () => {
    const onEnv = parseEnv({ ...VALID_CORE, FEATURE_EXAM_ENGINE: "true" });
    const offEnv = parseEnv(VALID_CORE);
    expect(loadFlags(onEnv).FEATURE_EXAM_ENGINE.read()).toBe(true);
    expect(loadFlags(offEnv).FEATURE_EXAM_ENGINE.read()).toBe(false);
  });

  it("a flag object carries no field shaped like an authorization decision", () => {
    const env = parseEnv(VALID_CORE);
    const flag = loadFlags(env).FEATURE_EXAM_ENGINE;
    // Exhaustive by construction: FeatureFlag has exactly these keys, so an
    // authorization-shaped addition (role, permission, bypass, scope, ...)
    // would show up here as an unexpected extra key.
    expect(Object.keys(flag).sort()).toEqual(["description", "name", "owner", "read", "targetRemoval"]);
  });

  it("the type itself refuses an authorization-shaped field", () => {
    // FeatureFlag has no field a caller could use to grant access; adding
    // one must fail to typecheck here, not just fail review.
    const smuggled: FeatureFlag = {
      name: "FEATURE_EXAM_ENGINE",
      owner: "x",
      description: "x",
      targetRemoval: "x",
      read: () => true,
      // @ts-expect-error - excess property: FeatureFlag has no such field.
      bypassAuthorization: true,
    };
    expect(smuggled).toBeDefined();
  });
});

describe("production-sensitive flags default off", () => {
  it("every production-sensitive flag reads false from an environment that omits it", () => {
    const env = parseEnv(VALID_CORE);
    const flags = loadFlags(env);
    for (const name of PRODUCTION_SENSITIVE_FLAGS) {
      expect(flags[name].read(), name).toBe(false);
    }
  });
});
