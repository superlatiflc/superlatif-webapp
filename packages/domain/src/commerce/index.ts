export {
  composeProductTargets,
  type ComposedProductTarget,
  type ProductComponentClaim,
  type ProductComponentSource,
  type TargetType,
} from "./bundle-composition.ts";

export {
  deriveOfferSaleState,
  type OfferEditorialStatus,
  type OfferSaleState,
  type OfferSaleStateInput,
  type OfferVisibility,
} from "./offer-status.ts";

export { resolveSkuMapping, type SkuMappingCandidate, type SkuMappingStatus } from "./sku-mapping.ts";

export {
  computeHmacSignature,
  deriveEventKey,
  verifyWebhookSignature,
  type SignatureOutcome,
} from "./webhook-verification.ts";

export { REDACTED_PLACEHOLDER, redactRawPayload } from "./payload-redaction.ts";

export {
  PURCHASE_STATES,
  SEJOLI_BRIDGE_STATUS_MAP_V1,
  SUPPORTED_EVENT_TYPES,
  normalizeCommerceEvent,
  type CanonicalCommerceEvent,
  type CommerceEventEnvelope,
  type CommerceEventOrderEnvelope,
  type NormalizationOutcome,
  type ProviderStatusMap,
  type PurchaseState,
} from "./canonical-event.ts";

export {
  ALLOWED_TRANSITIONS,
  resolvePurchaseTransition,
  type PurchaseTransitionContext,
  type PurchaseTransitionOutcome,
} from "./purchase-transition.ts";
