// Wire event (contracts/openapi.yaml) -> the domain's CommerceEventEnvelope
// (M2, ADR-074). Pure; no I/O.
//
// The wire `eventType` travels as the envelope's order status and is mapped
// to a purchase state by @superlatif/domain/commerce's
// WIRE_EVENT_TYPE_STATUS_MAP_V1 - the same versioned-map normalizer every
// provider uses, so no status logic lives here.
//
// `site` is not in the body: it is the WordPress host configured for this
// deployment's key, so a sender can never choose which catalogue mapping its
// events resolve against.

import type { CommerceEventEnvelope } from "@superlatif/domain/commerce";
import type { WireCommerceEvent } from "./protocol.ts";

/** Internal event type every wire event normalizes under (SUPPORTED_EVENT_TYPES). */
export const WIRE_ENVELOPE_TYPE = "purchase.status_changed";

export function toCommerceEventEnvelope(
  wire: WireCommerceEvent,
  provider: string,
  site: string,
): CommerceEventEnvelope {
  return {
    provider,
    site,
    eventId: wire.eventId,
    type: WIRE_ENVELOPE_TYPE,
    occurredAt: wire.occurredAt,
    order: {
      externalId: wire.order.externalOrderId,
      status: wire.eventType,
      currency: wire.amounts.currency,
      // The settled amount is informational only: access never depends on it.
      amountMinor: wire.amounts.netSettledMinor,
      // A guest order (no WordPress user) can never resolve to an app user:
      // the empty subject matches no identity and opens a reconciliation case.
      externalUserId: wire.order.externalUserId ?? "",
      externalSkuId: wire.order.externalSkuId,
    },
    schemaVersion: wire.schemaVersion,
  };
}
