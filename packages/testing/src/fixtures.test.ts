import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  FixtureRejectedError,
  assertNonProductionEnvironment,
  loadFixtureSet,
  parseFixtureSet,
} from "./fixtures.ts";

const valid = {
  schemaVersion: "1.0",
  fixtureSet: "example",
  evidenceClass: "synthetic",
  productionEligible: false,
  cases: [{ id: "case-1" }],
};

const temporaryDirectories: string[] = [];

function writeFixture(contents: unknown): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "superlatif-fixture-"));
  temporaryDirectories.push(directory);
  const file = path.join(directory, "case.json");
  fs.writeFileSync(file, typeof contents === "string" ? contents : JSON.stringify(contents));
  return file;
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    fs.rmSync(temporaryDirectories.pop() as string, { recursive: true, force: true });
  }
});

describe("parseFixtureSet accepts a conforming fixture", () => {
  it("returns the parsed set", () => {
    const set = parseFixtureSet("memory", JSON.stringify(valid));
    expect(set.fixtureSet).toBe("example");
    expect(set.cases).toHaveLength(1);
  });
});

describe("parseFixtureSet rejects a non-conforming fixture", () => {
  it("rejects evidenceClass that is not synthetic", () => {
    const raw = JSON.stringify({ ...valid, evidenceClass: "production" });
    expect(() => parseFixtureSet("memory", raw)).toThrow(FixtureRejectedError);
    expect(() => parseFixtureSet("memory", raw)).toThrow(/evidenceClass must be "synthetic"/);
  });

  it("rejects productionEligible that is not false", () => {
    const raw = JSON.stringify({ ...valid, productionEligible: true });
    expect(() => parseFixtureSet("memory", raw)).toThrow(/productionEligible must be false/);
  });

  it("rejects a truthy-looking string instead of the boolean false", () => {
    const raw = JSON.stringify({ ...valid, productionEligible: "false" });
    expect(() => parseFixtureSet("memory", raw)).toThrow(/productionEligible must be false/);
  });

  it("rejects an empty case list", () => {
    const raw = JSON.stringify({ ...valid, cases: [] });
    expect(() => parseFixtureSet("memory", raw)).toThrow(/cases must be a non-empty array/);
  });

  it("rejects a missing schemaVersion", () => {
    const { schemaVersion: _dropped, ...rest } = valid;
    expect(() => parseFixtureSet("memory", JSON.stringify(rest))).toThrow(/schemaVersion/);
  });

  it("rejects malformed JSON", () => {
    expect(() => parseFixtureSet("memory", "{ not json")).toThrow(/invalid JSON/);
  });

  it("rejects a non-object root", () => {
    expect(() => parseFixtureSet("memory", "[]")).toThrow(/expected a JSON object/);
  });
});

describe("loadFixtureSet", () => {
  it("reads a conforming file from disk", () => {
    expect(loadFixtureSet(writeFixture(valid)).fixtureSet).toBe("example");
  });

  it("rejects a deliberately failing fixture on disk", () => {
    const file = writeFixture({ ...valid, evidenceClass: "production" });
    expect(() => loadFixtureSet(file)).toThrow(FixtureRejectedError);
  });
});

describe("assertNonProductionEnvironment", () => {
  it("allows a development environment", () => {
    expect(() => assertNonProductionEnvironment({ APP_ENV: "development" })).not.toThrow();
  });

  it("refuses APP_ENV=production", () => {
    expect(() => assertNonProductionEnvironment({ APP_ENV: "production" })).toThrow(/APP_ENV=production/);
  });

  it("refuses PRODUCTION_WRITES_ENABLED=true", () => {
    expect(() => assertNonProductionEnvironment({ PRODUCTION_WRITES_ENABLED: "true" })).toThrow(
      /PRODUCTION_WRITES_ENABLED/,
    );
  });

  it("refuses SKD_PRODUCTION_ACTIVATION=true", () => {
    expect(() => assertNonProductionEnvironment({ SKD_PRODUCTION_ACTIVATION: "true" })).toThrow(
      /SKD_PRODUCTION_ACTIVATION/,
    );
  });
});
