// Canonical commerce event normalization (COM-002).
//
// dok 22 §17 "Canonical commerce event" is the target shape - provider-
// agnostic, ready for COM-003 to consume, and explicitly NOT the raw
// payload ("Canonical event bukan raw payload; adapter menyimpan
// link/checksum ke raw envelope" - the link/checksum lives on the raw row,
// commerce-event-service.ts wires the two together).
//
// dok 23 §9: "Provider state map is configuration/versioned adapter, not
// scattered switch statements." A provider's raw status vocabulary is data
// (`ProviderStatusMap`), not an if/switch chain - adding a new provider or a
// new raw status string is a new config row/object, never a new branch.
//
// `PurchaseState` reuses CLAUDE.md's canonical Purchase states vocabulary
// verbatim (pending/paid/failed/expired/cancelled/refunded_partial/
// refunded_full/chargeback) - this task is the first to actually persist
// it, but introduces no synonym.
//
// Pure, no I/O.

export type PurchaseState =
  | "pending"
  | "paid"
  | "failed"
  | "expired"
  | "cancelled"
  | "refunded_partial"
  | "refunded_full"
  | "chargeback";

export const PURCHASE_STATES: readonly PurchaseState[] = [
  "pending",
  "paid",
  "failed",
  "expired",
  "cancelled",
  "refunded_partial",
  "refunded_full",
  "chargeback",
];

export interface ProviderStatusMap {
  readonly provider: string;
  readonly version: number;
  readonly mapping: Readonly<Record<string, PurchaseState>>;
}

/** dok 22 §17's own worked example provider. A synthetic, versioned config - never wired to a live Sejoli bridge in this task. */
export const SEJOLI_BRIDGE_STATUS_MAP_V1: ProviderStatusMap = {
  provider: "sejoli_bridge",
  version: 1,
  mapping: {
    pending: "pending",
    processing: "pending",
    "on-hold": "pending",
    completed: "paid",
    cancelled: "cancelled",
    refunded: "refunded_full",
    partially_refunded: "refunded_partial",
    failed: "failed",
    expired: "expired",
    chargeback: "chargeback",
  },
};

/** Only event TYPES this task knows how to normalize - dok 22 §17's own example. An unrecognized type is "unknown event" (quarantine), not a guess. */
export const SUPPORTED_EVENT_TYPES: readonly string[] = ["purchase.status_changed"];

export interface CommerceEventOrderEnvelope {
  readonly externalId: string;
  /** Raw, provider-specific status string - looked up against a ProviderStatusMap, never trusted as a PurchaseState directly. */
  readonly status: string;
  readonly currency: string;
  readonly amountMinor: number;
  readonly externalUserId: string;
  readonly externalSkuId: string;
}

/** What a provider bridge sends, before normalization - dok 23 §7's envelope fields, dok 22 §17's field names. */
export interface CommerceEventEnvelope {
  readonly provider: string;
  readonly site: string;
  /** Provider-supplied stable event/delivery ID, if any - webhook-verification.ts#deriveEventKey falls back to a checksum when absent. */
  readonly eventId: string | null;
  readonly type: string;
  readonly occurredAt: string;
  readonly order: CommerceEventOrderEnvelope;
  readonly schemaVersion: number;
}

export interface CanonicalCommerceEvent {
  readonly provider: string;
  readonly site: string;
  readonly eventKey: string;
  readonly type: string;
  readonly occurredAt: string;
  readonly order: {
    readonly externalId: string;
    readonly status: PurchaseState;
    readonly currency: string;
    readonly amountMinor: number;
    readonly externalUserId: string;
    readonly externalSkuId: string;
  };
  readonly schemaVersion: number;
}

export type NormalizationOutcome =
  | { readonly kind: "ok"; readonly event: CanonicalCommerceEvent }
  /** dok 23 §11 "Unknown/ambiguous event creates reconciliation case" - this task's own quarantine, not yet the reconciliation-case table (a later commerce task's scope). */
  | { readonly kind: "unsupported_type"; readonly type: string }
  | { readonly kind: "unknown_status"; readonly rawStatus: string; readonly provider: string };

/**
 * Maps one already-signature-verified envelope into the canonical shape.
 * Never guesses: an event type outside SUPPORTED_EVENT_TYPES, or a raw
 * status the provider's own map does not recognize, is reported as a
 * distinct failure kind - the caller (commerce-event-service.ts) turns
 * either into a quarantine record, never a best-effort normalized row.
 */
export function normalizeCommerceEvent(
  envelope: CommerceEventEnvelope,
  eventKey: string,
  statusMap: ProviderStatusMap,
): NormalizationOutcome {
  if (!SUPPORTED_EVENT_TYPES.includes(envelope.type)) {
    return { kind: "unsupported_type", type: envelope.type };
  }
  const mappedStatus = statusMap.mapping[envelope.order.status];
  if (mappedStatus === undefined) {
    return { kind: "unknown_status", rawStatus: envelope.order.status, provider: envelope.provider };
  }
  return {
    kind: "ok",
    event: {
      provider: envelope.provider,
      site: envelope.site,
      eventKey,
      type: envelope.type,
      occurredAt: envelope.occurredAt,
      order: {
        externalId: envelope.order.externalId,
        status: mappedStatus,
        currency: envelope.order.currency,
        amountMinor: envelope.order.amountMinor,
        externalUserId: envelope.order.externalUserId,
        externalSkuId: envelope.order.externalSkuId,
      },
      schemaVersion: envelope.schemaVersion,
    },
  };
}
