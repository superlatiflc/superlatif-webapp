// Uniform handling for "this attempt is not yours" / "no such attempt".
//
// @superlatif/db distinguishes the two cases (`AttemptNotFoundError` vs
// `AttemptNotOwnedError`/`ResultNotOwnedError`) because the SERVER needs
// that distinction for logs and precise tests. A learner must not get it:
// rendering "not found" for one and "forbidden" for the other turns the URL
// bar into an oracle for which attempt ids exist. Both collapse to the same
// 404 here - the same reasoning IDN-001's `validateSession` module doc
// already applies to session failure modes ("echoing WHICH reason ... is an
// oracle").

import { notFound } from "next/navigation";

const HIDDEN_ATTEMPT_ERROR_NAMES = new Set([
  "AttemptNotFoundError",
  "AttemptNotOwnedError",
  "ResultNotOwnedError",
]);

/** Postgres "invalid input syntax for type uuid" - see `parseAttemptId`. */
const INVALID_TEXT_REPRESENTATION = "22P02";

function isInvalidUuidError(error: unknown): boolean {
  const cause = (error as { cause?: unknown } | null)?.cause;
  return (
    (error as { code?: unknown } | null)?.code === INVALID_TEXT_REPRESENTATION ||
    (typeof cause === "object" &&
      cause !== null &&
      (cause as { code?: unknown }).code === INVALID_TEXT_REPRESENTATION)
  );
}

/** RFC 4122 shape, case-insensitive - the format `attempts.id` (uuid) actually accepts. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates a path segment BEFORE it is used as a uuid column value.
 * CLAUDE.md: "Parse/validate all external input at the boundary." Without
 * this, a malformed id (`/attempts/not-a-uuid/result`) reaches Postgres and
 * comes back as a 500 with a query in the log, rather than the same 404 an
 * unknown-but-well-formed id already produces - a needless difference in
 * behaviour, and needless error noise, for input a learner never sends by
 * accident.
 */
export function parseAttemptId(raw: string): string {
  if (!UUID_PATTERN.test(raw)) notFound();
  return raw;
}

/**
 * Rethrows anything that is not an attempt ownership/existence error, so
 * genuine bugs stay loud. A malformed-uuid database error is also folded
 * into the 404 as belt-and-braces for any call path that did not already
 * go through `parseAttemptId`.
 */
export function notFoundOnAttemptAccessError(error: unknown): never {
  if (error instanceof Error && HIDDEN_ATTEMPT_ERROR_NAMES.has(error.name)) notFound();
  if (isInvalidUuidError(error)) notFound();
  throw error;
}
