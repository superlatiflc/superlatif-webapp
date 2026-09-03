// Regression guard for P0-1 (production readiness audit): a production
// route must never accept the acting user's identity from the URL.
//
// This is a STRUCTURAL test rather than a behavioural one on purpose. The
// vulnerability was not a wrong branch inside one function - it was a
// whole class of route shape ("read `userId` from searchParams, hand it to
// an authorization check"), reintroduced independently by three different
// tasks over time because each one copied the previous route's precedent.
// A behavioural test on today's three routes would not stop a fourth route
// from doing it tomorrow; scanning the route tree does.
//
// Next.js has no test harness in this repo for rendering App Router server
// components (no route-level integration layer exists), so asserting on
// the source is also the only way to cover the route layer at all. The
// AUTHORIZATION decisions underneath - `assertProgramAccess`,
// `assertQuestionPermission`/`authorize()` - are already integration-tested
// against a real database in packages/db (see
// question-moderation.integration.test.ts, which covers both the denied
// student and the permitted writer).

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const APP_DIR = join(import.meta.dirname);

/**
 * `/preview/**` is excluded deliberately and is NOT a gap. Those routes
 * serve entirely synthetic fixture data (apps/web/src/lib/preview-data),
 * carry no real user identity at all, and their query params are mock
 * SCORES (`total`/`twk`/`tkp`/`answers`), never an actor. Their own demo
 * cookie is documented as "NOT authentication" in
 * lib/preview-data/session.ts. Nothing there can authorize a real action
 * or read a real user's data, so a synthetic identity in that subtree is
 * non-authoritative by construction.
 */
const NON_PRODUCTION_SUBTREES = ["preview"];

function collectRouteFiles(dir: string, relative = ""): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const absolute = join(dir, entry);
    const rel = relative ? `${relative}/${entry}` : entry;
    if (statSync(absolute).isDirectory()) {
      if (NON_PRODUCTION_SUBTREES.includes(entry)) continue;
      found.push(...collectRouteFiles(absolute, rel));
      continue;
    }
    if (/^(page|layout|route)\.tsx?$/.test(entry) || entry === "actions.ts") found.push(rel);
  }
  return found;
}

const ROUTE_FILES = collectRouteFiles(APP_DIR);

describe("production routes never take identity from the URL (P0-1 regression guard)", () => {
  it("finds the production route files it is meant to be scanning", () => {
    // Guards the guard: if the collector silently matched nothing, every
    // assertion below would vacuously pass.
    expect(ROUTE_FILES.length).toBeGreaterThan(5);
    expect(ROUTE_FILES).toContain("home/page.tsx");
    expect(ROUTE_FILES).toContain("programs/[programCode]/page.tsx");
    expect(ROUTE_FILES).toContain("admin/questions/[versionId]/review/page.tsx");
    expect(ROUTE_FILES.some((file) => file.startsWith("preview/"))).toBe(false);
  });

  it.each(ROUTE_FILES)("%s does not declare a userId search param", (file) => {
    const source = readFileSync(join(APP_DIR, file), "utf8");
    // Matches `userId` appearing inside a searchParams type declaration.
    const searchParamsBlocks = source.match(/searchParams:\s*Promise<\{[\s\S]*?\}>/g) ?? [];
    for (const block of searchParamsBlocks) {
      expect(block, `${file} declares userId in its searchParams`).not.toMatch(/\buserId\b/);
    }
  });

  it.each(ROUTE_FILES)("%s does not destructure userId out of searchParams", (file) => {
    const source = readFileSync(join(APP_DIR, file), "utf8");
    const destructuring = /const\s*\{[^}]*\buserId\b[^}]*\}\s*=\s*await\s+searchParams/;
    expect(source, `${file} reads userId from searchParams`).not.toMatch(destructuring);
  });

  it("the three previously-vulnerable routes now resolve identity from the session helper", () => {
    for (const file of [
      "home/page.tsx",
      "programs/[programCode]/page.tsx",
      "admin/questions/[versionId]/review/page.tsx",
    ]) {
      const source = readFileSync(join(APP_DIR, file), "utf8");
      expect(source, `${file} must use the canonical session helper`).toMatch(/requireUserIdOrRedirect\(\)/);
    }
  });

  it("the admin review route collapses unauthorized and not-found into one non-disclosing outcome", () => {
    const source = readFileSync(join(APP_DIR, "admin/questions/[versionId]/review/page.tsx"), "utf8");
    // Both error classes must be handled in the same branch, ending in notFound().
    expect(source).toMatch(
      /QuestionActionNotAuthorizedError[\s\S]{0,200}QuestionVersionNotFoundForPreviewError[\s\S]{0,120}notFound\(\)/,
    );
  });
});
