// P0-2 regression guard: the write kill switch must be checked BEFORE any
// mutation begins, in every action that performs one.
//
// This is structural for the same reason no-query-identity.test.ts is: the
// property at risk is an ORDERING inside a Server Action, and this repository
// has no harness that can render or invoke an App Router Server Action. A
// behavioural test would therefore have to re-implement the action, which
// proves the re-implementation rather than the shipped code.
//
// What "before any mutation" means concretely: the guard must appear earlier
// in the file than the first call that can reach the database at all -
// getDb(), or any exam.* service call. If a future edit moves a guard below
// one of those, an attempt row, an answer revision, a submission, or a
// scoring-outbox row could be created and only then refused, which is exactly
// the partial-write failure the audit asked to be made impossible.
//
// The complementary evidence lives elsewhere: runtime-flags.test.ts pins the
// decision itself, and the live incident simulation counts real rows in
// Postgres before and after a blocked request.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const APP_DIR = import.meta.dirname;

function source(relativePath: string): string {
  return readFileSync(join(APP_DIR, relativePath), "utf8");
}

/**
 * Comments must be removed before any ordering search. These files document
 * their own guards in prose ("runs BEFORE `getDb()`..."), so a naive search
 * matches the explanation instead of the call and reports a false failure -
 * which is exactly what happened when this test was first written.
 */
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/** Index of the first character of `needle`, or -1. */
function at(haystack: string, needle: RegExp): number {
  return haystack.search(needle);
}

const ATTEMPT_ACTIONS = stripComments(source("attempts/actions.ts"));

/**
 * Actions that perform an exam write, and the first database-reaching call in
 * each. Each entry slices the action's own body so one action's guard cannot
 * accidentally satisfy another's assertion.
 */
const GUARDED = [
  { action: "startAttemptAction", firstDbCall: /getDb\(\)|exam\.findExamBatchByCode/ },
  { action: "takeoverLeaseAction", firstDbCall: /exam\.takeoverWriterLease|getDb\(\)/ },
  { action: "saveAnswerAction", firstDbCall: /exam\.renewWriterLease|exam\.saveAnswer/ },
  { action: "submitAttemptAction", firstDbCall: /exam\.submitAttempt/ },
] as const;

function bodyOf(actionName: string): string {
  const start = ATTEMPT_ACTIONS.indexOf(`export async function ${actionName}`);
  expect(start, `${actionName} not found`).toBeGreaterThan(-1);
  const rest = ATTEMPT_ACTIONS.slice(start + 1);
  const nextExport = rest.indexOf("\nexport async function ");
  return nextExport === -1 ? rest : rest.slice(0, nextExport);
}

describe("write kill switch runs before any mutation (P0-2)", () => {
  it.each(GUARDED)("$action checks the guard before touching the database", ({ action, firstDbCall }) => {
    const body = bodyOf(action);

    const guardAt = at(body, /examWritesPermitted\(\)|examWriteBlockReason\(\)/);
    expect(guardAt, `${action} must consult the write guard`).toBeGreaterThan(-1);

    const dbAt = at(body, firstDbCall);
    expect(dbAt, `${action} should contain a database call to guard`).toBeGreaterThan(-1);

    expect(
      guardAt,
      `${action} calls the database at index ${dbAt} before its guard at ${guardAt} - a refusal could leave a partial write`,
    ).toBeLessThan(dbAt);
  });

  it("saveAnswerAction refuses without renewing the lease or writing an answer", () => {
    const body = bodyOf("saveAnswerAction");
    // The guard's early return must come before BOTH the lease renewal and
    // the answer write - renewing a lease on a refused save would mutate
    // attempt_writer_leases for a request that saved nothing.
    const guardReturn = at(body, /return \{ ok: false, code: "writes_disabled" \}/);
    expect(guardReturn).toBeGreaterThan(-1);
    expect(guardReturn).toBeLessThan(at(body, /exam\.renewWriterLease/));
    expect(guardReturn).toBeLessThan(at(body, /exam\.saveAnswer/));
  });

  it("submitAttemptAction refuses before the submission and before any scoring job", () => {
    const body = bodyOf("submitAttemptAction");
    const guardAt = at(body, /examWriteBlockReason\(\)/);
    expect(guardAt).toBeLessThan(at(body, /exam\.submitAttempt/));
    // findPendingScoringJobs/drainScoringJob only run after a committed
    // submission; the guard preceding submitAttempt is what guarantees no
    // scoring job can be enqueued by a refused request.
    expect(guardAt).toBeLessThan(at(body, /drainScoringJob/));
  });
});

describe("intentionally unguarded paths stay unguarded (P0-2)", () => {
  it("sign-out remains available so a session can still be revoked during a freeze", () => {
    // Containment must not be disabled by the freeze it is containing. This
    // asserts the decision is deliberate rather than forgotten.
    const signinRaw = source("signin/actions.ts");
    const signin = stripComments(signinRaw);
    const start = signin.indexOf("export async function signOutAction");
    expect(start).toBeGreaterThan(-1);
    const body = signin.slice(start);
    expect(body).not.toMatch(/examWritesPermitted\(\)|assertProductionWritesEnabled\(/);
    expect(signinRaw).toMatch(/INTENTIONALLY NOT GUARDED/);
  });

  it("the inline scoring drain is not guarded, so committed work still completes", () => {
    const body = bodyOf("submitAttemptAction");
    const drainAt = at(body, /drainScoringJob/);
    const afterDrain = body.slice(Math.max(0, drainAt - 900), drainAt);
    // The drain sits after the guard (asserted above) and carries no guard of
    // its own - a submitted attempt must never be left unscored by the switch.
    expect(afterDrain).not.toMatch(/examWritesPermitted\(\)\)\s*return/);
  });
});

describe("read paths are never guarded (P0-2)", () => {
  it.each([
    "attempts/[attemptId]/result/page.tsx",
    "attempts/[attemptId]/review/page.tsx",
    "home/page.tsx",
    "tryouts/page.tsx",
  ])("%s stays readable when writes are disabled", (file) => {
    // A write freeze must not blind a learner to work they already did.
    expect(stripComments(source(file))).not.toMatch(/examWritesPermitted|examWriteBlockReason/);
  });
});
