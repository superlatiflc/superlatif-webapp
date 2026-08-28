import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { afterEach, describe, expect, it } from "vitest";

const REPOSITORY_ROOT = path.join(import.meta.dirname, "..", "..");
const VALIDATOR = path.join(REPOSITORY_ROOT, "scripts", "validate-contracts.mjs");
const REAL_SCHEMA = path.join(REPOSITORY_ROOT, "contracts", "exam-blueprint.schema.json");

const temporaryDirectories: string[] = [];

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    fs.rmSync(temporaryDirectories.pop() as string, { recursive: true, force: true });
  }
});

function writeTemporary(name: string, contents: string): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "superlatif-contract-"));
  temporaryDirectories.push(directory);
  const file = path.join(directory, name);
  fs.writeFileSync(file, contents);
  return file;
}

interface ValidatorResult {
  exitCode: number;
  report: { status: string; errors: string[] };
}

function runValidator(args: string[]): ValidatorResult {
  try {
    const stdout = execFileSync(process.execPath, [VALIDATOR, ...args], { encoding: "utf8" });
    return { exitCode: 0, report: JSON.parse(stdout) };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string };
    return {
      exitCode: failure.status ?? 1,
      report: JSON.parse(failure.stdout ?? '{"status":"FAIL","errors":["validator produced no report"]}'),
    };
  }
}

const VALID_DOCUMENT = `openapi: 3.1.0
info:
  title: Contract fixture
  version: "1.0.0"
paths:
  /attempts/{attemptId}:
    get:
      parameters:
        - name: attemptId
          in: path
          required: true
          schema:
            type: string
      responses:
        "200":
          description: ok
`;

describe("the real Superlatif contracts", () => {
  it("pass every contract check", () => {
    const result = runValidator([]);
    expect(result.report.errors).toEqual([]);
    expect(result.report.status).toBe("PASS");
    expect(result.exitCode).toBe(0);
  });
});

describe("an intentionally failing contract is rejected", () => {
  it("rejects an unresolved $ref", () => {
    const broken = VALID_DOCUMENT.replace(
      "          schema:\n            type: string",
      "          schema:\n            $ref: '#/components/schemas/DoesNotExist'",
    );
    const result = runValidator([
      "--openapi",
      writeTemporary("broken-ref.yaml", broken),
      "--schema",
      REAL_SCHEMA,
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.report.status).toBe("FAIL");
    expect(result.report.errors.join("\n")).toMatch(/Unresolved \$ref/);
  });

  it("rejects a path template variable with no declared parameter", () => {
    const broken = VALID_DOCUMENT.replace("name: attemptId", "name: wrongName").replace(
      "{attemptId}",
      "{attemptId}",
    );
    const result = runValidator([
      "--openapi",
      writeTemporary("bad-param.yaml", broken),
      "--schema",
      REAL_SCHEMA,
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.report.errors.join("\n")).toMatch(
      /uses \{attemptId\} but declares no matching path parameter/,
    );
    expect(result.report.errors.join("\n")).toMatch(/declares path parameter "wrongName"/);
  });

  it("rejects an example that exposes an exam answer key", () => {
    const broken = `${VALID_DOCUMENT}          content:
            application/json:
              schema:
                type: object
              example:
                answer_key: "B"
`;
    const result = runValidator(["--openapi", writeTemporary("leaky.yaml", broken), "--schema", REAL_SCHEMA]);
    expect(result.exitCode).toBe(1);
    expect(result.report.errors.join("\n")).toMatch(/forbidden key "answer_key"/);
  });

  it("rejects an external $ref that would leave the reviewed contract", () => {
    const broken = VALID_DOCUMENT.replace(
      "          schema:\n            type: string",
      "          schema:\n            $ref: 'https://example.invalid/schema.json'",
    );
    const result = runValidator([
      "--openapi",
      writeTemporary("external.yaml", broken),
      "--schema",
      REAL_SCHEMA,
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.report.errors.join("\n")).toMatch(/External or unsupported \$ref/);
  });

  it("rejects a document that is not valid YAML", () => {
    const result = runValidator([
      "--openapi",
      writeTemporary("bad.yaml", "openapi: [unclosed\n"),
      "--schema",
      REAL_SCHEMA,
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.report.errors.join("\n")).toMatch(/does not parse/);
  });

  it("rejects a JSON Schema that does not compile", () => {
    const badSchema = writeTemporary(
      "bad.schema.json",
      JSON.stringify({ $schema: "https://json-schema.org/draft/2020-12/schema", type: "not-a-type" }),
    );
    const result = runValidator(["--schema", badSchema]);
    expect(result.exitCode).toBe(1);
    expect(result.report.errors.join("\n")).toMatch(/does not compile/);
  });
});
