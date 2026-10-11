// @superlatif/integrations
//
// Vendor adapters at the boundary: wordpress-sejoli, object-storage, messaging.
//
// Owning backlog task: P1/P3.
// GOV-001 only establishes the package boundary; behaviour is added by the
// owning task. Do not add domain semantics, provider behaviour, or schema here
// without the backlog entry that owns it.
//
// IDN-002 / M1 (ADR-072): the WordPress one-time bridge client. Code for the
// commerce (Sejoli) adapters still waits on OD-01 evidence.

export {
  BRIDGE_AUTHORIZE_ACTION,
  BRIDGE_AUTHORIZE_QUERY_VALUE,
  BRIDGE_AUTHORIZE_QUERY_VAR,
  BRIDGE_CLIENT_ID_PATTERN,
  BRIDGE_ENVIRONMENT_PATTERN,
  BRIDGE_HEADERS,
  BRIDGE_MAX_CLOCK_SKEW_SECONDS,
  BRIDGE_PROTOCOL_VERSION,
  BRIDGE_REST_ROUTE,
  BRIDGE_SUBJECT_PATTERN,
  bridgeSignatureMatches,
  generateBridgeState,
  isBridgeTimestampFresh,
  isWellFormedBridgeToken,
  parseIdentityClaims,
  requestSigningInput,
  responseSigningInput,
  signBridgeMessage,
  type BridgeIdentityClaims,
} from "./wordpress-bridge/protocol.ts";

export {
  bridgeAuthorizeUrl,
  bridgeExchangeUrl,
  legacyBridgeAuthorizeUrl,
  exchangeBridgeCode,
  type BridgeClientConfig,
  type BridgeExchangeDeps,
  type BridgeExchangeResult,
} from "./wordpress-bridge/client.ts";

// M2 (ADR-074): commerce webhook wire protocol shared with the bridge plugin.
export {
  COMMERCE_WEBHOOK_HEADERS,
  COMMERCE_WEBHOOK_MAX_BODY_BYTES,
  COMMERCE_WEBHOOK_PROVIDERS,
  COMMERCE_WEBHOOK_SIGNING_PREFIX,
  WIRE_COMMERCE_EVENT_TYPES,
  commerceWebhookSignatureMatches,
  commerceWebhookSigningInput,
  isCommerceWebhookTimestampFresh,
  parseWireCommerceEvent,
  sha256Hex,
  signCommerceWebhook,
  type CommerceWebhookProvider,
  type WireCommerceEvent,
  type WireCommerceEventType,
} from "./commerce-webhook/protocol.ts";

export { WIRE_ENVELOPE_TYPE, toCommerceEventEnvelope } from "./commerce-webhook/envelope.ts";
