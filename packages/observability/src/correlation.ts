// Correlation ID propagation (GOV-004).
//
// 20_TECHNICAL_ARCHITECTURE.md §6: "Correlation ID diteruskan ke log/job/
// outbox." 22_API_AND_WEBHOOK_CONTRACT.md §2: `X-Request-ID` is optional on
// request, server mints one when absent, and echoes it on response.
//
// Uses Node's built-in AsyncLocalStorage - no new dependency - so a
// correlation ID established at an API boundary is ambient for the rest of
// that call tree (including anything awaited), and can be explicitly handed
// off to a worker job or an outbound provider call.

import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

/** Canonical header name (lowercase; HTTP header names are case-insensitive). */
export const CORRELATION_HEADER = "x-request-id";

interface CorrelationContext {
  readonly correlationId: string;
}

const storage = new AsyncLocalStorage<CorrelationContext>();

/** Mints a new correlation ID. */
export function newCorrelationId(): string {
  return randomUUID();
}

/**
 * Reads a correlation ID from inbound request headers, or mints one if
 * absent - the "server membuat bila tidak ada" half of dok 22 §2.
 */
export function correlationIdFromHeaders(
  headers: Readonly<Record<string, string | readonly string[] | undefined>>,
): string {
  const raw = headers[CORRELATION_HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value !== undefined && value.length > 0 ? value : newCorrelationId();
}

/**
 * Runs `fn` with `correlationId` established as ambient context for its
 * entire call tree (sync or async). This is the one place a boundary
 * establishes or resumes a correlation ID: an inbound request, or a worker
 * picking up a job that carries one forward from the request that created it.
 */
export function withCorrelationId<T>(correlationId: string, fn: () => T): T {
  return storage.run({ correlationId }, fn);
}

/**
 * Reads the correlation ID from ambient context. Throws outside a
 * `withCorrelationId` scope: dok 24 §17 lists correlation as a structured
 * safe field every log line should carry, so a boundary that forgot to
 * establish one is a bug worth surfacing loudly, not a silently blank field.
 * Logging code should use `tryGetCorrelationId` instead - observability must
 * never become a new way for the application to crash.
 */
export function getCorrelationId(): string {
  const context = storage.getStore();
  if (!context) {
    throw new Error("getCorrelationId() called outside a withCorrelationId() scope");
  }
  return context.correlationId;
}

/** Reads the correlation ID if one is established, otherwise undefined. Never throws. */
export function tryGetCorrelationId(): string | undefined {
  return storage.getStore()?.correlationId;
}

/**
 * Attaches the current correlation ID onto an outbound header bag - the
 * shape a provider HTTP call's `headers` init object takes. Requires an
 * established context: forwarding a request with no correlation ID is a
 * propagation bug, not something to paper over with a fresh one.
 */
export function attachCorrelationHeader<T extends Record<string, string>>(
  headers: T,
): T & Record<typeof CORRELATION_HEADER, string> {
  return { ...headers, [CORRELATION_HEADER]: getCorrelationId() };
}

/**
 * The field shape a durable job/outbox record carries so a worker can
 * resume the same correlation ID the originating request established. No
 * job/outbox implementation exists yet (P1); this is the contract future
 * job records are expected to satisfy.
 */
export interface CorrelatedJob {
  readonly correlationId: string;
}

/** Stamps the current correlation ID onto a job payload at enqueue time. */
export function attachCorrelationToJob<T extends Record<string, unknown>>(job: T): T & CorrelatedJob {
  return { ...job, correlationId: getCorrelationId() };
}

/** Resumes a job's correlation ID as ambient context for the duration of processing it. */
export function withJobCorrelationId<T extends CorrelatedJob, R>(job: T, fn: (job: T) => R): R {
  return withCorrelationId(job.correlationId, () => fn(job));
}
