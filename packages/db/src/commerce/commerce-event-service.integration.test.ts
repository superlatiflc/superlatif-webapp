import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SEJOLI_BRIDGE_STATUS_MAP_V1,
  computeHmacSignature,
  type CommerceEventEnvelope,
} from "@superlatif/domain/commerce";
import { createTestDatabase, type TestDatabaseHandle } from "../test-client.ts";
import { rawCommerceEvents } from "../schema/index.ts";
import { eq } from "drizzle-orm";
import {
  findNormalizedCommerceEventByRawEventId,
  findQuarantineRecordByRawEventId,
  findRawCommerceEventById,
  markRawCommerceEventStatus,
} from "./commerce-event-repository.ts";
import { ingestCommerceEvent } from "./commerce-event-service.ts";

const NOW = new Date("2026-08-29T00:00:00.000Z");
const SECRET = "synthetic-test-webhook-secret-do-not-use-in-production";

let handle: TestDatabaseHandle;

beforeEach(async () => {
  handle = await createTestDatabase();
});

afterEach(async () => {
  await handle.close();
});

/**
 * Fabricated-but-realistic Sejoli-bridge-shaped webhook payload (dok 22 §17,
 * dok 23 §7 field list) - never sent to or received from a live Sejoli
 * instance. `debugMeta.apiKey` is a deliberately included credential-shaped
 * field to prove this task's redaction strips it even though dok 23 §7 says
 * a real bridge should not send one (defense-in-depth, not trust).
 */
function fixturePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    provider: "sejoli_bridge",
    site: "superlatif.id",
    eventId: "evt-order-1001",
    eventType: "purchase.status_changed",
    occurredAt: "2026-08-29T00:00:00.000Z",
    order: {
      externalId: "SJ-ORDER-1001",
      status: "completed",
      currency: "IDR",
      amountMinor: 199_000,
      externalUserId: "wp-user-42",
      externalSkuId: "sku-aks-2026",
    },
    schemaVersion: 1,
    debugMeta: { apiKey: "should-never-be-stored-raw" },
    ...overrides,
  };
}

function envelopeFromPayload(payload: Record<string, unknown>): CommerceEventEnvelope {
  const order = payload["order"] as Record<string, unknown>;
  return {
    provider: payload["provider"] as string,
    site: payload["site"] as string,
    eventId: (payload["eventId"] as string | undefined) ?? null,
    type: payload["eventType"] as string,
    occurredAt: payload["occurredAt"] as string,
    order: {
      externalId: order["externalId"] as string,
      status: order["status"] as string,
      currency: order["currency"] as string,
      amountMinor: order["amountMinor"] as number,
      externalUserId: order["externalUserId"] as string,
      externalSkuId: order["externalSkuId"] as string,
    },
    schemaVersion: payload["schemaVersion"] as number,
  };
}

describe("required test: valid event normalization", () => {
  it("a correctly signed, recognized event is normalized into the provider-agnostic canonical shape", async () => {
    const payload = fixturePayload();
    const envelope = envelopeFromPayload(payload);
    const signature = computeHmacSignature(JSON.stringify(payload), SECRET);

    const outcome = await ingestCommerceEvent(
      handle.db,
      {
        envelope,
        rawPayload: payload,
        providedSignature: signature,
        secret: SECRET,
        correlationId: "corr-valid-1",
        statusMap: SEJOLI_BRIDGE_STATUS_MAP_V1,
      },
      NOW,
    );
    expect(outcome.kind).toBe("normalized");
    if (outcome.kind !== "normalized") return;

    const rawEvent = await findRawCommerceEventById(handle.db, outcome.rawEventId);
    expect(rawEvent?.status).toBe("normalized");
    expect(rawEvent?.signatureOutcome).toBe("verified");
    expect(rawEvent?.correlationId).toBe("corr-valid-1");

    const normalized = await findNormalizedCommerceEventByRawEventId(handle.db, outcome.rawEventId);
    expect(normalized?.orderStatus).toBe("paid"); // "completed" mapped through SEJOLI_BRIDGE_STATUS_MAP_V1
    expect(normalized?.externalOrderId).toBe("SJ-ORDER-1001");
    expect(normalized?.provider).toBe("sejoli_bridge");
    expect(normalized?.schemaVersion).toBe(1);
  });

  it("the raw envelope's credential-shaped field is redacted before storage, end to end", async () => {
    const payload = fixturePayload({ eventId: "evt-redaction-check" });
    const envelope = envelopeFromPayload(payload);
    const signature = computeHmacSignature(JSON.stringify(payload), SECRET);

    const outcome = await ingestCommerceEvent(
      handle.db,
      {
        envelope,
        rawPayload: payload,
        providedSignature: signature,
        secret: SECRET,
        correlationId: "corr-redact-1",
        statusMap: SEJOLI_BRIDGE_STATUS_MAP_V1,
      },
      NOW,
    );
    const rawEvent = await findRawCommerceEventById(
      handle.db,
      (outcome as { rawEventId: string }).rawEventId,
    );
    const debugMeta = rawEvent?.rawPayloadRedacted["debugMeta"] as Record<string, unknown> | undefined;
    expect(debugMeta?.["apiKey"]).toBe("[REDACTED]");
    expect(JSON.stringify(rawEvent?.rawPayloadRedacted)).not.toContain("should-never-be-stored-raw");
  });
});

describe("required negative test: invalid signature rejection", () => {
  it("an incorrectly signed event is quarantined, never normalized, and the raw envelope is still stored (no silent drop)", async () => {
    const payload = fixturePayload({ eventId: "evt-bad-signature" });
    const envelope = envelopeFromPayload(payload);
    const wrongSignature = computeHmacSignature(JSON.stringify(payload), "a-completely-different-secret");

    const outcome = await ingestCommerceEvent(
      handle.db,
      {
        envelope,
        rawPayload: payload,
        providedSignature: wrongSignature,
        secret: SECRET,
        correlationId: "corr-bad-sig-1",
        statusMap: SEJOLI_BRIDGE_STATUS_MAP_V1,
      },
      NOW,
    );
    expect(outcome.kind).toBe("quarantined");
    if (outcome.kind !== "quarantined") return;
    expect(outcome.reasonCode).toBe("signature_verification_failed");

    const rawEvent = await findRawCommerceEventById(handle.db, outcome.rawEventId);
    expect(rawEvent?.status).toBe("quarantined");
    expect(rawEvent?.signatureOutcome).toBe("failed");
    expect(rawEvent?.rawPayloadRedacted).toBeTruthy(); // stored, not dropped

    const quarantine = await findQuarantineRecordByRawEventId(handle.db, outcome.rawEventId);
    expect(quarantine?.reasonCode).toBe("signature_verification_failed");

    const normalized = await findNormalizedCommerceEventByRawEventId(handle.db, outcome.rawEventId);
    expect(normalized).toBeNull();
  });
});

describe("required negative test: unknown event quarantine", () => {
  it("an event whose type this task does not support is quarantined with a distinct reason", async () => {
    const payload = fixturePayload({ eventId: "evt-unknown-type", eventType: "subscription.renewed" });
    const envelope = envelopeFromPayload(payload);
    const signature = computeHmacSignature(JSON.stringify(payload), SECRET);

    const outcome = await ingestCommerceEvent(
      handle.db,
      {
        envelope,
        rawPayload: payload,
        providedSignature: signature,
        secret: SECRET,
        correlationId: "corr-unknown-type-1",
        statusMap: SEJOLI_BRIDGE_STATUS_MAP_V1,
      },
      NOW,
    );
    expect(outcome.kind).toBe("quarantined");
    expect(outcome.kind === "quarantined" && outcome.reasonCode).toBe("unsupported_event_type");
  });

  it("an event whose raw status the provider's status map does not recognize is quarantined with a distinct reason", async () => {
    const payload = fixturePayload({
      eventId: "evt-unknown-status",
      order: {
        ...(fixturePayload()["order"] as Record<string, unknown>),
        status: "totally_unheard_of_status",
      },
    });
    const envelope = envelopeFromPayload(payload);
    const signature = computeHmacSignature(JSON.stringify(payload), SECRET);

    const outcome = await ingestCommerceEvent(
      handle.db,
      {
        envelope,
        rawPayload: payload,
        providedSignature: signature,
        secret: SECRET,
        correlationId: "corr-unknown-status-1",
        statusMap: SEJOLI_BRIDGE_STATUS_MAP_V1,
      },
      NOW,
    );
    expect(outcome.kind).toBe("quarantined");
    expect(outcome.kind === "quarantined" && outcome.reasonCode).toBe("unknown_status");
  });
});

describe("required test: duplicate/idempotency", () => {
  it("re-ingesting the same (provider, eventKey) returns the existing outcome and never creates a second raw row", async () => {
    const payload = fixturePayload({ eventId: "evt-duplicate-check" });
    const envelope = envelopeFromPayload(payload);
    const signature = computeHmacSignature(JSON.stringify(payload), SECRET);
    const input = {
      envelope,
      rawPayload: payload,
      providedSignature: signature,
      secret: SECRET,
      correlationId: "corr-dup-1",
      statusMap: SEJOLI_BRIDGE_STATUS_MAP_V1,
    };

    const first = await ingestCommerceEvent(handle.db, input, NOW);
    const second = await ingestCommerceEvent(handle.db, { ...input, correlationId: "corr-dup-2" }, NOW);

    expect(first.kind).toBe("normalized");
    expect(second.kind).toBe("duplicate");
    expect(second.kind === "duplicate" && second.rawEventId).toBe(
      (first as { rawEventId: string }).rawEventId,
    );
    expect(second.kind === "duplicate" && second.existingStatus).toBe("normalized");

    const rows = await handle.db
      .select({ id: rawCommerceEvents.id })
      .from(rawCommerceEvents)
      .where(eq(rawCommerceEvents.eventKey, "evt-duplicate-check"));
    expect(rows.length).toBe(1);
  });
});

describe("required negative test: no raw payload mutation", () => {
  it("markRawCommerceEventStatus - the only exposed mutator on an existing raw row - changes status without touching payload or checksum", async () => {
    const payload = fixturePayload({ eventId: "evt-no-mutation" });
    const envelope = envelopeFromPayload(payload);
    const signature = computeHmacSignature(JSON.stringify(payload), SECRET);

    const outcome = await ingestCommerceEvent(
      handle.db,
      {
        envelope,
        rawPayload: payload,
        providedSignature: signature,
        secret: SECRET,
        correlationId: "corr-no-mutation-1",
        statusMap: SEJOLI_BRIDGE_STATUS_MAP_V1,
      },
      NOW,
    );
    expect(outcome.kind).toBe("normalized");
    const rawEventId = (outcome as { rawEventId: string }).rawEventId;

    const before = await findRawCommerceEventById(handle.db, rawEventId);
    // Calling the ONE exposed mutator directly (not through ingestCommerceEvent) is the strongest
    // proof available: even a deliberate second status write cannot reach the payload/checksum
    // columns, because markRawCommerceEventStatus's UPDATE statement never names them.
    await markRawCommerceEventStatus(handle.db, rawEventId, "quarantined");
    const after = await findRawCommerceEventById(handle.db, rawEventId);

    expect(after?.status).toBe("quarantined"); // the one column that DID change
    expect(after?.rawPayloadRedacted).toEqual(before?.rawPayloadRedacted);
    expect(after?.payloadChecksum).toBe(before?.payloadChecksum);
    expect(after?.correlationId).toBe(before?.correlationId);
    expect(after?.receivedAt).toEqual(before?.receivedAt);
  });
});
