import { describe, expect, it } from "vitest";
import {
  attachCorrelationHeader,
  attachCorrelationToJob,
  correlationIdFromHeaders,
  getCorrelationId,
  newCorrelationId,
  tryGetCorrelationId,
  withCorrelationId,
  withJobCorrelationId,
} from "./correlation.ts";

describe("newCorrelationId / correlationIdFromHeaders", () => {
  it("mints distinct IDs", () => {
    expect(newCorrelationId()).not.toBe(newCorrelationId());
  });

  it("reuses an inbound X-Request-ID rather than minting a new one", () => {
    expect(correlationIdFromHeaders({ "x-request-id": "abc-123" })).toBe("abc-123");
  });

  it("mints a new one when the header is absent", () => {
    const id = correlationIdFromHeaders({});
    expect(id.length).toBeGreaterThan(0);
  });

  it("takes the first value when the header repeats", () => {
    expect(correlationIdFromHeaders({ "x-request-id": ["first", "second"] })).toBe("first");
  });
});

describe("getCorrelationId / tryGetCorrelationId outside a scope", () => {
  it("getCorrelationId throws outside withCorrelationId", () => {
    expect(() => getCorrelationId()).toThrow(/outside a withCorrelationId/);
  });

  it("tryGetCorrelationId returns undefined outside withCorrelationId, never throws", () => {
    expect(tryGetCorrelationId()).toBeUndefined();
  });
});

describe("correlation ID crosses API -> worker -> provider boundaries", () => {
  it("stays identical across a simulated request -> job -> provider call chain", async () => {
    // 1. API boundary: an inbound request establishes the correlation ID.
    const inboundId = correlationIdFromHeaders({ "x-request-id": "req-e2e-test" });

    const observed: { fromRequestScope?: string; fromJobScope?: string; providerHeader?: string } = {};

    await withCorrelationId(inboundId, async () => {
      observed.fromRequestScope = getCorrelationId();

      // 2. Domain -> worker boundary: enqueue a job, carrying the ID forward
      //    as a durable field (what an outbox row would store).
      const job = attachCorrelationToJob({ kind: "example-job", payload: { n: 1 } });
      expect(job.correlationId).toBe(inboundId);

      // Simulate the request handler returning before the worker runs, by
      // leaving the withCorrelationId(inboundId, ...) scope entirely.
      return job;
    }).then((job) => {
      // 3. Worker boundary: a separate async context (no ambient
      //    correlation ID here) resumes it from the job record.
      expect(tryGetCorrelationId()).toBeUndefined();

      return withJobCorrelationId(job, (resumedJob) => {
        observed.fromJobScope = getCorrelationId();

        // 4. Provider boundary: an outbound call attaches the same ID.
        const outboundHeaders = attachCorrelationHeader({ "content-type": "application/json" });
        observed.providerHeader = outboundHeaders["x-request-id"];

        return resumedJob;
      });
    });

    expect(observed.fromRequestScope).toBe(inboundId);
    expect(observed.fromJobScope).toBe(inboundId);
    expect(observed.providerHeader).toBe(inboundId);
  });

  it("keeps two concurrent requests' correlation IDs from leaking into each other", async () => {
    const results = await Promise.all(
      ["req-a", "req-b"].map((id) =>
        withCorrelationId(id, async () => {
          await new Promise((resolve) => setTimeout(resolve, Math.random() * 5));
          return getCorrelationId();
        }),
      ),
    );
    expect(results).toEqual(["req-a", "req-b"]);
  });
});

describe("attachCorrelationHeader / attachCorrelationToJob require an established scope", () => {
  it("attachCorrelationHeader throws outside a scope rather than silently omitting the header", () => {
    expect(() => attachCorrelationHeader({})).toThrow(/outside a withCorrelationId/);
  });

  it("attachCorrelationToJob throws outside a scope rather than enqueueing an uncorrelated job", () => {
    expect(() => attachCorrelationToJob({ kind: "x" })).toThrow(/outside a withCorrelationId/);
  });
});
