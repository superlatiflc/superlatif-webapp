// Commerce webhook ingress (M2, ADR-074; dok 22 §16; contracts/openapi.yaml
// `POST /integrations/commerce/{provider}/events`).
//
// Order of checks, each before anything is written:
//   1. disabled / wrong provider          -> 404 (no surface at all)
//   2. production write freeze            -> 503 + Retry-After (bridge keeps the event)
//   3. content type, body size            -> 400
//   4. event-ID / timestamp / key headers -> 400; unknown key -> 403
//   5. HMAC over the EXACT raw body + key ID + timestamp + event ID, and the
//      ±300 s window                       -> 401 (recorded, rate limited)
//   6. strict schema, header/body event ID agree -> 400
//   7. durable receipt, then processing   -> 202, or 503 so the bridge retries
//
// Nothing in a response reveals mapping, purchase, identity, or grant detail
// (dok 22 §16 "never expose internal mapping details"): 202 carries only the
// receipt ID. Logs carry fixed labels, the plugin's event ID, and the request
// ID - never the buyer ID, amounts, or any header value.

import { WIRE_EVENT_TYPE_STATUS_MAP_V1, type SignatureOutcome } from "@superlatif/domain/commerce";
import type { commerce } from "@superlatif/db";
import {
  COMMERCE_WEBHOOK_HEADERS,
  commerceWebhookSignatureMatches,
  isCommerceWebhookTimestampFresh,
  parseWireCommerceEvent,
  toCommerceEventEnvelope,
  type WireCommerceEvent,
} from "@superlatif/integrations";
import type { BridgeLogger } from "../bridge/log.ts";
import type { CommerceWebhookConfig } from "./config.ts";

export interface CommerceWebhookRequest {
  readonly provider: string;
  readonly header: (name: string) => string | null;
  /** Null when the body exceeded the size limit and was not read in full. */
  readonly body: string | null;
}

export interface CommerceWebhookResponse {
  readonly status: number;
  readonly body: Record<string, unknown> | null;
  readonly headers: Record<string, string>;
}

type ReceiveInput = commerce.ReceiveCommerceEventInput;

export interface CommerceWebhookDeps {
  readonly config: CommerceWebhookConfig | null;
  readonly writesBlocked: () => boolean;
  readonly now: () => Date;
  readonly newRequestId: () => string;
  readonly receive: (input: ReceiveInput) => Promise<commerce.CommerceReceipt>;
  /** Throws when the caller has sent too many unverified deliveries. */
  readonly limitUnverified: () => Promise<void>;
  readonly isRateLimited: (error: unknown) => boolean;
  readonly logger: BridgeLogger;
}

const EVENT_ID = /^[\x21-\x7e]{1,255}$/;
const TIMESTAMP = /^[0-9]{1,12}$/;
const KEY_ID = /^[\x21-\x7e]{1,100}$/;

export async function handleCommerceWebhook(
  request: CommerceWebhookRequest,
  deps: CommerceWebhookDeps,
): Promise<CommerceWebhookResponse> {
  const requestId = deps.newRequestId();
  const base = { "cache-control": "no-store", "x-request-id": requestId };
  const reply = (
    status: number,
    body: Record<string, unknown> | null,
    extra: Record<string, string> = {},
  ) => ({
    status,
    body,
    headers: { ...base, ...extra },
  });
  const error = (status: number, code: string, message: string, extra: Record<string, string> = {}) =>
    reply(status, { error: { code, message, requestId } }, extra);

  const { config } = deps;
  if (!config || request.provider !== config.provider) return reply(404, null);

  if (deps.writesBlocked()) {
    deps.logger.warn("commerce_webhook.deferred", { reason: "writes_blocked", requestId });
    return error(503, "WRITES_DISABLED", "Commerce writes are paused; retry later.", {
      "retry-after": "300",
    });
  }

  const contentType = (request.header("content-type") ?? "").split(";")[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    return error(400, "UNSUPPORTED_CONTENT_TYPE", "Content-Type must be application/json.");
  }
  if (request.body === null) return error(400, "PAYLOAD_TOO_LARGE", "The request body is too large.");
  const rawBody = request.body;

  const eventId = request.header(COMMERCE_WEBHOOK_HEADERS.eventId);
  const timestamp = request.header(COMMERCE_WEBHOOK_HEADERS.timestamp);
  const keyId = request.header(COMMERCE_WEBHOOK_HEADERS.keyId);
  if (
    !eventId ||
    !EVENT_ID.test(eventId) ||
    !timestamp ||
    !TIMESTAMP.test(timestamp) ||
    !keyId ||
    !KEY_ID.test(keyId)
  ) {
    return error(400, "MISSING_DELIVERY_HEADERS", "Event ID, timestamp, and key ID headers are required.");
  }
  if (keyId !== config.keyId) {
    deps.logger.warn("commerce_webhook.rejected", { reason: "unknown_key", requestId });
    return error(403, "UNKNOWN_KEY", "This key is not accepted here.");
  }

  const signed = commerceWebhookSignatureMatches(
    config.secret,
    keyId,
    timestamp,
    eventId,
    rawBody,
    request.header(COMMERCE_WEBHOOK_HEADERS.signature),
  );
  const fresh = isCommerceWebhookTimestampFresh(timestamp, deps.now());

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    parsed = undefined;
  }
  const wire = parseWireCommerceEvent(parsed);

  if (!signed || !fresh) {
    const reason = signed ? "stale_timestamp" : "bad_signature";
    deps.logger.warn("commerce_webhook.rejected", { reason, requestId });
    if (wire) await recordUnverified(wire, parsed as Record<string, unknown>, config, deps, requestId);
    return signed
      ? error(401, "TIMESTAMP_OUT_OF_WINDOW", "The delivery timestamp is outside the accepted window.")
      : error(401, "SIGNATURE_INVALID", "The delivery signature is not valid.");
  }

  if (parsed === undefined) return error(400, "MALFORMED_JSON", "The body is not valid JSON.");
  if (!wire) return error(400, "SCHEMA_VIOLATION", "The body does not match the commerce event schema.");
  if (wire.eventId !== eventId) {
    return error(400, "EVENT_ID_MISMATCH", "The event ID header and body disagree.");
  }

  let receipt: commerce.CommerceReceipt;
  try {
    receipt = await deps.receive(
      receiveInput(wire, parsed as Record<string, unknown>, config, "verified", requestId),
    );
  } catch (cause) {
    deps.logger.error("commerce_webhook.processing_failed", {
      eventId,
      requestId,
      error: cause instanceof Error ? cause.name : "unknown",
    });
    // The receipt may already be durable. The bridge retries with the same
    // event ID, and the duplicate path re-drives processing.
    return error(503, "PROCESSING_DEFERRED", "The event could not be processed yet; retry later.", {
      "retry-after": "60",
    });
  }

  deps.logger.info("commerce_webhook.accepted", {
    eventId,
    requestId,
    duplicate: receipt.duplicate,
    ingest: receipt.ingest,
    lifecycle: receipt.lifecycle?.kind ?? null,
  });
  return reply(202, { accepted: true, duplicate: receipt.duplicate, eventReceiptId: receipt.rawEventId });
}

function receiveInput(
  wire: WireCommerceEvent,
  rawPayload: Record<string, unknown>,
  config: CommerceWebhookConfig,
  signatureOutcome: SignatureOutcome,
  correlationId: string,
): ReceiveInput {
  return {
    envelope: toCommerceEventEnvelope(wire, config.provider, config.site),
    rawPayload,
    signatureOutcome,
    correlationId,
    statusMap: WIRE_EVENT_TYPE_STATUS_MAP_V1,
  };
}

/**
 * Records a well-formed but unverified delivery for diagnosis (fixture
 * COM-SYN-005), under a checksum key it cannot use to squat a real event ID.
 * Rate limited per network source; best effort - never changes the 401.
 */
async function recordUnverified(
  wire: WireCommerceEvent,
  rawPayload: Record<string, unknown>,
  config: CommerceWebhookConfig,
  deps: CommerceWebhookDeps,
  requestId: string,
): Promise<void> {
  try {
    await deps.limitUnverified();
    await deps.receive(receiveInput(wire, rawPayload, config, "failed", requestId));
  } catch (cause) {
    if (!deps.isRateLimited(cause)) {
      deps.logger.error("commerce_webhook.unverified_record_failed", {
        requestId,
        error: cause instanceof Error ? cause.name : "unknown",
      });
    }
  }
}
