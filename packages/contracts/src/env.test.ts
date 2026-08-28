import { describe, expect, it } from "vitest";
import { ENV_SPEC, SECRET_ENV_NAMES, type EnvName } from "./env-spec.ts";
import { CORE_REQUIRED_FOR_STARTUP, EnvValidationError, loadCoreEnv, parseEnv } from "./env.ts";

/** A minimal, fully-valid environment: every required field, nothing else. */
const VALID_CORE: Record<string, string> = {
  APP_ENV: "development",
  APP_BASE_URL: "http://localhost:3000",
  ADMIN_BASE_URL: "http://localhost:3001",
  API_BASE_URL: "http://localhost:4000",
  WORKER_CONCURRENCY: "2",
  LOG_LEVEL: "info",
};

describe("ENV_SPEC self-consistency", () => {
  it("never gives a secret a coded default value", () => {
    for (const name of SECRET_ENV_NAMES) {
      expect(ENV_SPEC[name].requirement, name).not.toBe("optional-default");
    }
  });

  it("defaults every production-sensitive flag to false", () => {
    const productionSensitive = [
      "FEATURE_COMMERCE_SYNC",
      "FEATURE_LIVE_CLASS",
      "FEATURE_QUESTION_IMPORT",
      "FEATURE_EXAM_ENGINE",
      "FEATURE_LEADERBOARD",
      "FEATURE_NOTIFICATIONS",
      "SKD_PRODUCTION_ACTIVATION",
      "PRODUCTION_WRITES_ENABLED",
    ] as const;
    for (const name of productionSensitive) {
      const field = ENV_SPEC[name];
      expect(field.requirement, name).toBe("optional-default");
      expect(field.requirement === "optional-default" && field.defaultValue, name).toBe("false");
    }
  });
});

describe("parseEnv accepts a valid environment", () => {
  it("parses the minimal core environment", () => {
    const env = parseEnv(VALID_CORE);
    expect(env.APP_ENV).toBe("development");
    expect(env.WORKER_CONCURRENCY).toBe(2);
  });

  it("applies coded safe defaults for optional-default fields", () => {
    const env = parseEnv(VALID_CORE);
    expect(env.FEATURE_EXAM_ENGINE).toBe(false);
    expect(env.RATE_LIMIT_ENABLED).toBe(true);
    expect(env.SESSION_TTL_SECONDS).toBe(43200);
  });

  it("leaves optional-no-default fields undefined when absent", () => {
    const env = parseEnv(VALID_CORE);
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.SESSION_SIGNING_SECRET).toBeUndefined();
  });

  it("accepts an explicit override of a defaulted field", () => {
    const env = parseEnv({ ...VALID_CORE, FEATURE_EXAM_ENGINE: "true" });
    expect(env.FEATURE_EXAM_ENGINE).toBe(true);
  });
});

describe("Missing required config fails startup", () => {
  it("throws EnvValidationError when a required field is missing", () => {
    const { APP_ENV: _dropped, ...incomplete } = VALID_CORE;
    expect(() => parseEnv(incomplete)).toThrow(EnvValidationError);
    expect(() => parseEnv(incomplete)).toThrow(/APP_ENV is required/);
  });

  it("reports every missing required field at once, not just the first", () => {
    try {
      parseEnv({});
      expect.unreachable("parseEnv must throw on an empty environment");
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      const violations = (error as EnvValidationError).violations;
      for (const name of CORE_REQUIRED_FOR_STARTUP) {
        expect(violations.some((line) => line.includes(name)), name).toBe(true);
      }
    }
  });

  it("loadCoreEnv throws under the same condition", () => {
    expect(() => loadCoreEnv({})).toThrow(EnvValidationError);
  });
});

describe("an env value of the wrong type or format is rejected", () => {
  it("rejects a non-integer WORKER_CONCURRENCY", () => {
    expect(() => parseEnv({ ...VALID_CORE, WORKER_CONCURRENCY: "not-a-number" })).toThrow(/must be an integer/);
  });

  it("rejects an APP_ENV outside the declared enum", () => {
    expect(() => parseEnv({ ...VALID_CORE, APP_ENV: "sandbox" })).toThrow(/must be one of/);
  });

  it("rejects a malformed URL", () => {
    expect(() => parseEnv({ ...VALID_CORE, APP_BASE_URL: "not a url" })).toThrow(/must be a valid URL/);
  });

  it("rejects a boolean spelled as 1/0/yes/no instead of true/false", () => {
    expect(() => parseEnv({ ...VALID_CORE, RATE_LIMIT_ENABLED: "1" })).toThrow(/must be exactly "true" or "false"/);
  });

  it("rejects a secret shorter than its minimum length without echoing the value", () => {
    let caught: EnvValidationError | undefined;
    try {
      parseEnv({ ...VALID_CORE, SESSION_SIGNING_SECRET: "short" });
    } catch (error) {
      caught = error as EnvValidationError;
    }
    expect(caught).toBeInstanceOf(EnvValidationError);
    const message = caught?.violations.join("\n") ?? "";
    expect(message).toMatch(/SESSION_SIGNING_SECRET must be at least 16 characters/);
    expect(message).not.toContain("short");
  });

  it("flags a near-miss of a declared name as a likely typo", () => {
    expect(() => parseEnv({ ...VALID_CORE, FEATURE_QUESTON_IMPORT: "true" })).toThrow(
      /FEATURE_QUESTON_IMPORT is not declared in ENV_SPEC; did you mean FEATURE_QUESTION_IMPORT\?/,
    );
  });

  it("does not flag a variable that merely shares a prefix with a declared name", () => {
    // Regression test: this exact case false-positived under an earlier
    // prefix-based design, against a variable this repository's own shell
    // environment happened to already have set.
    expect(() => parseEnv({ ...VALID_CORE, API_TIMEOUT_MS: "900000" })).not.toThrow();
  });

  it("ignores unrelated environment variables such as PATH, HOME, or NODE_ENV", () => {
    expect(() =>
      parseEnv({ ...VALID_CORE, PATH: "/usr/bin", HOME: "/home/runner", NODE_ENV: "test", SHLVL: "1" }),
    ).not.toThrow();
  });
});

describe("ENV_SPEC matches .env.example exactly", () => {
  it("declares the same variable names as the template", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const templatePath = path.join(import.meta.dirname, "..", "..", "..", ".env.example");
    const template = fs.readFileSync(templatePath, "utf8");
    const templateNames = [...template.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((match) => match[1]);

    expect(new Set(Object.keys(ENV_SPEC))).toEqual(new Set(templateNames));
  });

  it("keeps every FEATURE_* env-example default in sync with ENV_SPEC's default", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const templatePath = path.join(import.meta.dirname, "..", "..", "..", ".env.example");
    const template = fs.readFileSync(templatePath, "utf8");
    for (const match of template.matchAll(/^([A-Z][A-Z0-9_]*)=(.*)$/gm)) {
      const name = match[1] as EnvName;
      const templateValue = match[2];
      const field = ENV_SPEC[name];
      if (field.requirement === "optional-default" && templateValue !== "") {
        expect(field.defaultValue, name).toBe(templateValue);
      }
    }
  });
});
