#!/usr/bin/env node

/**
 * Honest placeholder for a repository script that is declared by CLAUDE.md
 * ("Expected repository scripts") but is not wired yet.
 *
 * CLAUDE.md forbids inventing or silently skipping a missing script: the
 * bootstrap dependency must be reported. This exits non-zero so a caller can
 * never mistake "not built yet" for "passed".
 */

import process from "node:process";

const [scriptName = "(unknown)", owner = "a later backlog task"] = process.argv.slice(2);

console.error(
  [
    `Script "${scriptName}" is declared but not configured yet.`,
    `It is owned by: ${owner}.`,
    "",
    "This is a reported bootstrap dependency, not a failure of your change.",
    "Do not stub this out to make a pipeline green - wire the owning task.",
  ].join("\n"),
);

process.exit(1);
