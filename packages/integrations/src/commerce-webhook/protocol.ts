// Commerce webhook wire protocol, app side (M2, ADR-074).
//
// The WordPress bridge plugin (wordpress-plugins/superlatif-app-bridge,
// includes/commerce.php) delivers Sejoli order events to
// `POST /api/v1/integrations/commerce/{provider}/events` (dok 22 §16,
// contracts/openapi.yaml). Both sides must agree byte for byte on the signing
// input below; the plugin's tests/vectors.json pins it for BOTH test suites,
// exactly like the sign-in protocol.
//
// Signature: HMAC-SHA256, hex, with the per-environment
// SEJOLI_WEBHOOK_SIGNING_SECRET, over
//
//   commerce.v1 \n <key id> \n <unix seconds> \n <event id> \n <raw body>
//
// The raw body is signed as received - never a re-serialization - so what is
// verified is exactly what is parsed. The `commerce.v1` prefix keeps these
// signatures in their own domain: no sign-in signature can be replayed as a
// webhook, and the reverse, even if a key were ever reused by mistake.
//
// Pure apart from node:crypto; no I/O.

import { createHash } from "node:crypto";
import {
  bridgeSignatureMatches,
  isBridgeTimestampFresh,
  signBridgeMessage,
} from "../wordpress-bridge/protocol.ts";

export const COMMERCE_WEBHOOK_SIGNING_PREFIX = "commerce.v1";

/** Header names from contracts/openapi.yaml, lower-cased as Fetch exposes them. */
export const COMMERCE_WEBHOOK_HEADERS = {
  eventId: "x-provider-event-id",
  timestamp: "x-superlatif-timestamp",
  keyId: "x-superlatif-key-id",
  signature: "x-superlatif-signature",
} as const;

/** A single order event is well under 2 KB; anything past this is refused before it is read in full. */
export const COMMERCE_WEBHOOK_MAX_BODY_BYTES = 16 * 1024;

/** The providers the contract names in the path. */
export const COMMERCE_WEBHOOK_PROVIDERS = ["sejoli_bridge", "woocommerce"] as const;
export type CommerceWebhookProvider = (typeof COMMERCE_WEBHOOK_PROVIDERS)[number];

export function commerceWebhookSigningInput(
  keyId: string,
  timestamp: string,
  eventId: string,
  rawBody: string,
): string {
  return [COMMERCE_WEBHOOK_SIGNING_PREFIX, keyId, timestamp, eventId, rawBody].join("\n");
}

export function signCommerceWebhook(
  secret: string,
  keyId: string,
  timestamp: string,
  eventId: string,
  rawBody: string,
): string {
  return signBridgeMessage(secret, commerceWebhookSigningInput(keyId, timestamp, eventId, rawBody));
}

/** Constant-time; a malformed signature is simply a mismatch. */
export function commerceWebhookSignatureMatches(
  secret: string,
  keyId: string,
  timestamp: string,
  eventId: string,
  rawBody: string,
  provided: unknown,
): boolean {
  return bridgeSignatureMatches(
    secret,
    commerceWebhookSigningInput(keyId, timestamp, eventId, rawBody),
    provided,
  );
}

/** Same ±300 s window as the sign-in protocol. */
export function isCommerceWebhookTimestampFresh(timestamp: unknown, now: Date): timestamp is string {
  return isBridgeTimestampFresh(timestamp, now);
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

// --- Body: contracts/openapi.yaml `CanonicalCommerceEvent` ------------------

export const WIRE_COMMERCE_EVENT_TYPES = [
  "order_pending",
  "payment_settled",
  "payment_failed",
  "order_expired",
  "order_cancelled",
  "refund_full",
  "refund_partial",
  "chargeback_opened",
  "chargeback_resolved",
] as const;
export type WireCommerceEventType = (typeof WIRE_COMMERCE_EVENT_TYPES)[number];

export interface WireCommerceEvent {
  readonly schemaVersion: 1;
  readonly eventId: string;
  readonly eventType: WireCommerceEventType;
  readonly occurredAt: string;
  readonly order: {
    readonly externalOrderId: string;
    readonly externalSkuId: string;
    readonly externalUserId: string | null;
  };
  readonly customer: {
    readonly emailHash: string | null;
    readonly phoneHash: string | null;
  };
  readonly amounts: {
    readonly currency: string;
    readonly grossMinor: number;
    readonly discountMinor: number;
    readonly netSettledMinor: number;
    readonly refundedMinor: number;
  };
  readonly rawPayloadChecksum: string;
}

const HEX64 = /^[a-f0-9]{64}$/;
const CURRENCY = /^[A-Z]{3}$/;
// RFC 3339 date-time with an explicit offset; Date.parse alone accepts far more.
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `additionalProperties: false` - every key must be one the schema names. */
function onlyKeys(record: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(record).every((key) => allowed.includes(key));
}

function boundedString(value: unknown, min: number, max: number): value is string {
  return typeof value === "string" && value.length >= min && value.length <= max;
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function nullableHex(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || (typeof value === "string" && HEX64.test(value));
}

/**
 * Strict parse against the OpenAPI schema. Returns null on ANY deviation - an
 * unknown key, a wrong type, an out-of-range value - so the route answers 400
 * and nothing half-understood ever reaches normalization.
 */
export function parseWireCommerceEvent(value: unknown): WireCommerceEvent | null {
  if (!isRecord(value)) return null;
  if (
    !onlyKeys(value, [
      "schemaVersion",
      "eventId",
      "eventType",
      "occurredAt",
      "order",
      "customer",
      "amounts",
      "rawPayloadChecksum",
    ])
  ) {
    return null;
  }
  const { schemaVersion, eventId, eventType, occurredAt, order, customer, amounts, rawPayloadChecksum } =
    value;

  if (schemaVersion !== 1) return null;
  if (!boundedString(eventId, 1, 255)) return null;
  if (
    typeof eventType !== "string" ||
    !(WIRE_COMMERCE_EVENT_TYPES as readonly string[]).includes(eventType)
  ) {
    return null;
  }
  if (typeof occurredAt !== "string" || !DATE_TIME.test(occurredAt) || Number.isNaN(Date.parse(occurredAt))) {
    return null;
  }
  if (typeof rawPayloadChecksum !== "string" || !HEX64.test(rawPayloadChecksum)) return null;

  if (!isRecord(order) || !onlyKeys(order, ["externalOrderId", "externalSkuId", "externalUserId"]))
    return null;
  if (!boundedString(order["externalOrderId"], 1, 255)) return null;
  if (!boundedString(order["externalSkuId"], 1, 255)) return null;
  const externalUserId = order["externalUserId"];
  if (externalUserId !== undefined && externalUserId !== null && !boundedString(externalUserId, 1, 255))
    return null;

  if (!isRecord(customer) || !onlyKeys(customer, ["emailHash", "phoneHash"])) return null;
  if (!nullableHex(customer["emailHash"]) || !nullableHex(customer["phoneHash"])) return null;

  if (
    !isRecord(amounts) ||
    !onlyKeys(amounts, ["currency", "grossMinor", "discountMinor", "netSettledMinor", "refundedMinor"])
  ) {
    return null;
  }
  const { currency, grossMinor, discountMinor, netSettledMinor, refundedMinor } = amounts;
  if (typeof currency !== "string" || !CURRENCY.test(currency)) return null;
  if (
    !nonNegativeInteger(grossMinor) ||
    !nonNegativeInteger(discountMinor) ||
    !nonNegativeInteger(netSettledMinor)
  ) {
    return null;
  }
  if (refundedMinor !== undefined && !nonNegativeInteger(refundedMinor)) return null;

  return {
    schemaVersion: 1,
    eventId,
    eventType: eventType as WireCommerceEventType,
    occurredAt,
    order: {
      externalOrderId: order["externalOrderId"] as string,
      externalSkuId: order["externalSkuId"] as string,
      externalUserId: (externalUserId as string | null | undefined) ?? null,
    },
    customer: {
      emailHash: (customer["emailHash"] as string | null | undefined) ?? null,
      phoneHash: (customer["phoneHash"] as string | null | undefined) ?? null,
    },
    amounts: {
      currency,
      grossMinor,
      discountMinor,
      netSettledMinor,
      refundedMinor: refundedMinor ?? 0,
    },
    rawPayloadChecksum,
  };
}
