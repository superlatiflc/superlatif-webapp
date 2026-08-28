import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { afterEach, describe, expect, it } from "vitest";

const REPOSITORY_ROOT = path.join(import.meta.dirname, "..", "..");
const CHECKER = path.join(REPOSITORY_ROOT, "scripts", "check-workspace-boundaries.mjs");

interface CheckerResult {
  exitCode: number;
  report: { status: string; errors: string[] };
}

function runChecker(): CheckerResult {
  try {
    const stdout = execFileSync(process.execPath, [CHECKER], { cwd: REPOSITORY_ROOT, encoding: "utf8" });
    return { exitCode: 0, report: JSON.parse(stdout) };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string };
    return {
      exitCode: failure.status ?? 1,
      report: JSON.parse(failure.stdout ?? '{"status":"FAIL","errors":[]}'),
    };
  }
}

const plantedFiles: string[] = [];

afterEach(() => {
  while (plantedFiles.length > 0) {
    fs.rmSync(plantedFiles.pop() as string, { force: true });
  }
});

function plantFile(relativePath: string, contents: string): string {
  const absolute = path.join(REPOSITORY_ROOT, relativePath);
  fs.writeFileSync(absolute, contents);
  plantedFiles.push(absolute);
  return absolute;
}

describe("scripts/check-workspace-boundaries.mjs", () => {
  it("passes on the real repository state", () => {
    const result = runChecker();
    expect(result.report.errors).toEqual([]);
    expect(result.exitCode).toBe(0);
  });

  it("rejects a vendor SDK import in a non-test production file under packages/domain", () => {
    plantFile(
      "packages/domain/src/identity/.tmp-leak.ts",
      'import { describe } from "vitest";\nexport {};\n',
    );
    const result = runChecker();
    expect(result.exitCode).toBe(1);
    expect(result.report.errors.join("\n")).toMatch(/must stay free of vendor SDKs/);
  });

  it(
    "does NOT reject a vendor SDK import in a *.test.ts file under packages/domain " +
      "(regression: an earlier version of this checker made packages/domain untestable " +
      "the moment it got its first *.test.ts file, because vitest itself tripped the " +
      "no-vendor-SDK rule)",
    () => {
      plantFile(
        "packages/domain/src/identity/.tmp-sample.test.ts",
        'import { describe } from "vitest";\ndescribe.skip("x", () => {});\n',
      );
      const result = runChecker();
      expect(result.report.errors).toEqual([]);
      expect(result.exitCode).toBe(0);
    },
  );

  it("rejects an import of a workspace package outside the declared layering matrix", () => {
    plantFile("packages/domain/src/identity/.tmp-layering.ts", 'import "@superlatif/ui";\nexport {};\n');
    const result = runChecker();
    expect(result.exitCode).toBe(1);
    expect(result.report.errors.join("\n")).toMatch(/layering violation/);
  });
});
