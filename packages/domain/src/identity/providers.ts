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
 * DELIBERATELY NOT `sejoli_bridge`. Commerce resolves buyers under
 * `sejoli_bridge` (dok 22 §17), and no repository evidence yet proves that a
 * Sejoli purchase's `externalUserId` is this same WordPress `user_id` (dok 23
 * §4 lists `wordpress_user_id` and `sejoli_customer/member_id` separately).
 * Reusing the commerce provider name would silently assert that equivalence.
 * The mapping rule between the two is an explicit OD-02 spike output that M2
 * consumes - see ADR-072.
 */
export const WORDPRESS_LOGIN_PROVIDER = "wordpress";

/** A WordPress `user_id` as the bridge sends it: a positive decimal integer, no leading zero. */
export const WORDPRESS_SUBJECT_PATTERN = /^[1-9][0-9]{0,19}$/;
