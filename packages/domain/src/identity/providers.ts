// External identity provider names that more than one package must agree on.
//
// `external_identities.provider` is free text (IDN-001), so a typo in one call
// site would silently create a second, disconnected identity namespace. The
// providers that login and commerce must BOTH resolve against are therefore
// named once, here.

/**
 * M1 production login: the WordPress one-time bridge (ADR-006, ADR-072).
 *
 * The subject is the WordPress `user_id` of the account the bridge plugin
 * authenticated, as a decimal string - the one identifier the plugin can
 * prove, because it is what WordPress itself authenticated.
 *
 * DELIBERATELY NOT `sejoli_bridge`. The commerce provider name and the login
 * provider name stay separate, and the rule that connects them lives in
 * COMMERCE_BUYER_IDENTITY_PROVIDERS below, backed by evidence.
 */
export const WORDPRESS_LOGIN_PROVIDER = "wordpress";

/** A WordPress `user_id` as the bridge sends it: a positive decimal integer, no leading zero. */
export const WORDPRESS_SUBJECT_PATTERN = /^[1-9][0-9]{0,19}$/;

/**
 * Which identity namespace a commerce provider's `externalUserId` belongs to
 * (M2, ADR-074).
 *
 * `sejoli_bridge` -> `wordpress`: the OD-02 staging spike established outcome
 * (a) on 2026-09-24 - a Sejoli order's `user_id` (`sejolisa_orders.user_id`)
 * IS the WordPress `users.ID` of the buyer (docs/audit/
 * OD02_M1_STAGING_ACCEPTANCE.md §2). So a buyer is resolved against the very
 * identity the login bridge links, and a purchase made before or after the
 * first sign-in lands on the same app user.
 *
 * A provider without evidence keeps its own namespace: it can never resolve
 * to a login identity by accident.
 */
export const COMMERCE_BUYER_IDENTITY_PROVIDERS: Readonly<Record<string, string>> = {
  sejoli_bridge: WORDPRESS_LOGIN_PROVIDER,
};

export function buyerIdentityProviderFor(commerceProvider: string): string {
  return COMMERCE_BUYER_IDENTITY_PROVIDERS[commerceProvider] ?? commerceProvider;
}

/** The commerce providers whose buyers resolve against `identityProvider`. */
export function commerceProvidersForIdentityProvider(identityProvider: string): string[] {
  return Object.entries(COMMERCE_BUYER_IDENTITY_PROVIDERS)
    .filter(([, identity]) => identity === identityProvider)
    .map(([commerce]) => commerce);
}
