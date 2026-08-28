#!/usr/bin/env node

/**
 * Workspace and import-boundary check (GOV-001).
 *
 * Enforces the layout locked by ADR-042 and the architecture rule in
 * 20_TECHNICAL_ARCHITECTURE.md §5: "Domain packages tidak mengimpor UI atau
 * vendor SDK direkt". ADR-007 requires module boundaries to exist in code
 * before services are split, so those boundaries are enforced by a machine,
 * not by convention.
 *
 * Checks:
 *  1. every workspace directory is a real package with a typecheck script;
 *  2. declared internal dependencies respect the layering matrix;
 *  3. imports found in source respect the same matrix (catches phantom imports
 *     that are used but never declared);
 *  4. packages marked pure own no external runtime dependencies.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCOPE = "@superlatif/";
const errors = [];
const fail = (message) => errors.push(message);

/** Internal dependencies each package may declare or import. */
const ALLOWED_INTERNAL = {
  contracts: [],
  domain: ["contracts"],
  observability: ["contracts"],
  ui: ["contracts"],
  db: ["contracts", "domain"],
  integrations: ["contracts", "domain", "observability"],
  testing: ["contracts", "domain", "db", "ui", "observability", "integrations"],
  // Deployment units compose everything, but never each other.
  web: ["contracts", "domain", "db", "ui", "testing", "observability", "integrations"],
  worker: ["contracts", "domain", "db", "ui", "testing", "observability", "integrations"],
};

/** Packages that must stay free of vendor SDKs and other external runtime deps. */
const PURE_PACKAGES = new Set(["domain"]);

function workspaceGlobs() {
  const file = path.join(root, "pnpm-workspace.yaml");
  const text = fs.readFileSync(file, "utf8");
  const globs = [...text.matchAll(/^\s*-\s*"([^"]+)"/gm)].map((match) => match[1]);
  if (globs.length === 0) fail("pnpm-workspace.yaml declares no package globs");
  return globs;
}

function discoverPackages() {
  const found = [];
  for (const glob of workspaceGlobs()) {
    if (!glob.endsWith("/*")) {
      fail(`Unsupported workspace glob: ${glob}`);
      continue;
    }
    const parent = path.join(root, glob.slice(0, -2));
    if (!fs.existsSync(parent)) {
      fail(`Workspace directory is missing: ${glob}`);
      continue;
    }
    for (const entry of fs.readdirSync(parent, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(parent, entry.name);
      const manifestPath = path.join(dir, "package.json");
      if (!fs.existsSync(manifestPath)) {
        fail(`${path.relative(root, dir)} is inside the workspace but has no package.json`);
        continue;
      }
      let manifest;
      try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      } catch (error) {
        fail(`${path.relative(root, manifestPath)} is not valid JSON: ${error.message}`);
        continue;
      }
      found.push({ dir, shortName: entry.name, manifest });
    }
  }
  return found;
}

function sourceFiles(dir) {
  const files = [];
  const walk = (current) => {
    if (!fs.existsSync(current)) return;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".next") continue;
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (/\.(ts|tsx|mts|cts)$/.test(entry.name)) files.push(absolute);
    }
  };
  walk(path.join(dir, "src"));
  return files;
}

const IMPORT_PATTERNS = [
  /\bfrom\s+["']([^"']+)["']/g,
  /\bimport\s+["']([^"']+)["']/g,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
];

function importedSpecifiers(file) {
  const text = fs.readFileSync(file, "utf8");
  const specifiers = new Set();
  for (const pattern of IMPORT_PATTERNS) {
    for (const match of text.matchAll(pattern)) specifiers.add(match[1]);
  }
  return [...specifiers];
}

function isExternal(specifier) {
  if (specifier.startsWith(".") || specifier.startsWith("/")) return false;
  if (specifier.startsWith("node:")) return false;
  if (specifier.startsWith(SCOPE)) return false;
  return true;
}

const packages = discoverPackages();
if (packages.length === 0) fail("No workspace packages were discovered");

const byName = new Map(packages.map((entry) => [entry.manifest.name, entry]));

for (const entry of packages) {
  const rel = path.relative(root, entry.dir);
  const { manifest, shortName } = entry;
  const expectedName = `${SCOPE}${shortName}`;

  if (manifest.name !== expectedName) {
    fail(`${rel} declares name ${manifest.name}; expected ${expectedName}`);
  }
  if (manifest.private !== true) {
    fail(`${rel} must be private:true; nothing in this repository is published`);
  }
  if (!manifest.scripts?.typecheck) {
    fail(`${rel} has no "typecheck" script, so it would silently escape verification`);
  }

  const allowed = ALLOWED_INTERNAL[shortName];
  if (!allowed) {
    fail(`${rel} is not present in the ALLOWED_INTERNAL layering matrix; add it deliberately with an ADR`);
    continue;
  }
  const allowedNames = new Set(allowed.map((name) => `${SCOPE}${name}`));

  const runtimeDeps = Object.keys(manifest.dependencies ?? {});
  const allDeclared = [...runtimeDeps, ...Object.keys(manifest.devDependencies ?? {})];

  for (const dependency of allDeclared) {
    if (!dependency.startsWith(SCOPE)) continue;
    if (!byName.has(dependency) && !allowedNames.has(dependency)) {
      fail(`${rel} depends on unknown workspace package ${dependency}`);
      continue;
    }
    if (!allowedNames.has(dependency)) {
      fail(`${rel} declares a forbidden dependency on ${dependency} (layering violation)`);
    }
  }

  if (PURE_PACKAGES.has(shortName)) {
    const external = runtimeDeps.filter((dependency) => !dependency.startsWith(SCOPE));
    if (external.length > 0) {
      fail(`${rel} is a pure package but declares external runtime dependencies: ${external.join(", ")}`);
    }
  }

  for (const file of sourceFiles(entry.dir)) {
    const fileRel = path.relative(root, file);
    for (const specifier of importedSpecifiers(file)) {
      if (specifier.startsWith(SCOPE)) {
        const target = specifier.split("/").slice(0, 2).join("/");
        if (!allowedNames.has(target)) {
          fail(`${fileRel} imports ${target}, which ${manifest.name} may not depend on (layering violation)`);
          continue;
        }
        if (!allDeclared.includes(target)) {
          fail(
            `${fileRel} imports ${target} but ${rel}/package.json does not declare it (phantom dependency)`,
          );
        }
        continue;
      }
      // The "no vendor SDK" rule governs production code. A test file's own
      // test framework (vitest, declared in the root package.json as shared
      // dev tooling) is not a runtime dependency of the package under test -
      // this exemption is what let packages/domain add its first *.test.ts
      // file; without it, "no vendor SDK" would make packages/domain
      // untestable.
      if (PURE_PACKAGES.has(shortName) && isExternal(specifier) && !/\.test\.ts$/.test(file)) {
        fail(
          `${fileRel} imports external module "${specifier}"; ${manifest.name} must stay free of vendor SDKs`,
        );
      }
    }
  }
}

const result = {
  status: errors.length === 0 ? "PASS" : "FAIL",
  packagesChecked: packages.length,
  packages: packages.map((entry) => entry.manifest.name).sort(),
  errors,
};

console.log(JSON.stringify(result, null, 2));
process.exitCode = errors.length === 0 ? 0 : 1;
