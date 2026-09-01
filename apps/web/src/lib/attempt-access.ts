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

/** Rethrows anything that is not an attempt ownership/existence error, so genuine bugs stay loud. */
export function notFoundOnAttemptAccessError(error: unknown): never {
  if (error instanceof Error && HIDDEN_ATTEMPT_ERROR_NAMES.has(error.name)) notFound();
  throw error;
}
