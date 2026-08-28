import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPOSITORY_ROOT = path.join(import.meta.dirname, "..", "..");
const OBSERVABILITY_PACKAGE = "@superlatif/observability";

/**
 * @superlatif/observability is server/worker only: redaction.ts reads a
 * contract file via node:fs, which a bundler cannot resolve for a browser
 * target. This test is defense-in-depth with a clear, named failure -
 * relying solely on a bundler error to catch a "use client" import would
 * work eventually, but with a far more confusing message.
 */
describe("no client component imports @superlatif/observability", () => {
  it("scans every .ts/.tsx source file for a 'use client' + observability import combination", () => {
    const offenders: string[] = [];
    const roots = [path.join(REPOSITORY_ROOT, "apps"), path.join(REPOSITORY_ROOT, "packages")];

    const walk = (directory: string) => {
      if (!fs.existsSync(directory)) return;
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name === ".next" || entry.name === "dist") continue;
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          walk(absolute);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name) || entry.name.endsWith(".test.ts")) continue;

        const contents = fs.readFileSync(absolute, "utf8");
        const firstStatement = contents.trimStart().split("\n")[0]?.trim() ?? "";
        const isClientComponent = firstStatement === '"use client";' || firstStatement === "'use client';";
        if (isClientComponent && contents.includes(OBSERVABILITY_PACKAGE)) {
          offenders.push(path.relative(REPOSITORY_ROOT, absolute));
        }
      }
    };

    for (const root of roots) walk(root);
    expect(offenders).toEqual([]);
  });

  it("today, nothing under apps/web/src/app imports @superlatif/observability directly", () => {
    // Regression guard: instrumentation.ts and register-node.ts (outside
    // src/app) are the only intended import sites at P0.
    const appDirectory = path.join(REPOSITORY_ROOT, "apps", "web", "src", "app");
    const offenders: string[] = [];
    const walk = (directory: string) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          walk(absolute);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue;
        if (fs.readFileSync(absolute, "utf8").includes(OBSERVABILITY_PACKAGE)) {
          offenders.push(path.relative(REPOSITORY_ROOT, absolute));
        }
      }
    };
    walk(appDirectory);
    expect(offenders).toEqual([]);
  });
});
