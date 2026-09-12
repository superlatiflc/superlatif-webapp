<?php
/**
 * Wire protocol shared with the Superlatif Web App.
 *
 * Must agree byte for byte with packages/integrations/src/wordpress-bridge/
 * protocol.ts. tests/vectors.json pins both implementations to the same
 * signatures. Pure functions: no WordPress calls, so tests/run.php can check
 * them in isolation.
 *
 * @package SuperlatifAppBridge
 */

defined( 'ABSPATH' ) || exit;

const SUPERLATIF_BRIDGE_PROTOCOL_VERSION = 1;
const SUPERLATIF_BRIDGE_REST_NAMESPACE   = 'superlatif-bridge/v1';

/**
 * Front-end authorize entry point (ADR-073):
 *   GET /?superlatif_bridge=authorize&client_id=...&state=...
 *
 * Deliberately NOT under /wp-admin/: membership plugins (Sejoli on
 * superlatif.id) guard every /wp-admin/* request on `admin_init`, which
 * admin-post.php fires before any `admin_post_*` handler runs, so the old
 * entry point was redirected away before this plugin was ever consulted.
 */
const SUPERLATIF_BRIDGE_QUERY_VAR          = 'superlatif_bridge';
const SUPERLATIF_BRIDGE_AUTHORIZE_REQUEST  = 'authorize';

/** Legacy admin-post entry point, kept for backward compatibility and rollback only. */
const SUPERLATIF_BRIDGE_AUTHORIZE_ACTION = 'superlatif_bridge_authorize';

/** Seconds a code stays redeemable. The app redeems it within a second of the redirect. */
const SUPERLATIF_BRIDGE_CODE_TTL = 120;

/** Accepted clock difference between WordPress and the app, both directions. */
const SUPERLATIF_BRIDGE_MAX_CLOCK_SKEW = 300;

/** Pending-login cookie: name and the longest a sign-in detour may take. */
const SUPERLATIF_BRIDGE_PENDING_COOKIE = 'superlatif_bridge_pending';
const SUPERLATIF_BRIDGE_PENDING_TTL    = 600;

/**
 * Codes and state values: 32 random bytes, base64url without padding.
 *
 * @param mixed $value Candidate.
 */
function superlatif_bridge_is_token( $value ): bool {
	return is_string( $value ) && 1 === preg_match( '/^[A-Za-z0-9_-]{43}$/', $value );
}

/** A new code, from the CSPRNG. */
function superlatif_bridge_new_token(): string {
	return rtrim( strtr( base64_encode( random_bytes( 32 ) ), '+/', '-_' ), '=' );
}

/**
 * Only this hash of a code or state is ever stored. The raw code exists in
 * the redirect and in the app's exchange request, nowhere else.
 */
function superlatif_bridge_hash_token( string $token ): string {
	return hash( 'sha256', $token );
}

function superlatif_bridge_request_signing_input( string $timestamp, string $body ): string {
	return "v1\n" . $timestamp . "\n" . $body;
}

/**
 * Canonical claims, not the raw JSON body, so REST serialization details can
 * never break or widen what the signature covers.
 *
 * @param array $claims version, subject, audience, environment.
 */
function superlatif_bridge_response_signing_input( string $timestamp, array $claims ): string {
	return implode(
		"\n",
		array( 'v1', $timestamp, (string) $claims['version'], $claims['subject'], $claims['audience'], $claims['environment'] )
	);
}

/**
 * What the pending-login cookie is signed over (ADR-073). A separate domain
 * prefix from the exchange signatures, so a value from one context can never
 * be replayed as the other even though both use the same client secret.
 */
function superlatif_bridge_pending_signing_input( string $client_id, string $state, string $issued_at ): string {
	return "pending.v1\n" . $client_id . "\n" . $state . "\n" . $issued_at;
}

function superlatif_bridge_sign( string $secret, string $input ): string {
	return hash_hmac( 'sha256', $input, $secret );
}

/**
 * Constant-time. Anything that is not a well-formed hex digest is a mismatch.
 *
 * @param mixed $provided Signature header value.
 */
function superlatif_bridge_signature_matches( string $secret, string $input, $provided ): bool {
	if ( ! is_string( $provided ) || 1 !== preg_match( '/^[a-f0-9]{64}$/', $provided ) ) {
		return false;
	}
	return hash_equals( superlatif_bridge_sign( $secret, $input ), $provided );
}

/**
 * @param mixed $timestamp Unix seconds as a decimal string.
 */
function superlatif_bridge_timestamp_is_fresh( $timestamp, int $now ): bool {
	if ( ! is_string( $timestamp ) || 1 !== preg_match( '/^[0-9]{1,12}$/', $timestamp ) ) {
		return false;
	}
	return abs( $now - (int) $timestamp ) <= SUPERLATIF_BRIDGE_MAX_CLOCK_SKEW;
}

/**
 * Builds the pending-login cookie value: `client_id.state.issued_at.hmac`.
 *
 * `.` separates safely because no field can contain one - client IDs are
 * `[a-z0-9-]`, state is base64url, and the rest are decimal/hex.
 *
 * The value carries NO URL. The authorize URL is rebuilt server-side from
 * these two identifiers, so a tampered cookie can never redirect anywhere.
 */
function superlatif_bridge_pending_value( string $secret, string $client_id, string $state, int $issued_at ): string {
	$issued = (string) $issued_at;
	return $client_id . '.' . $state . '.' . $issued . '.' .
		superlatif_bridge_sign( $secret, superlatif_bridge_pending_signing_input( $client_id, $state, $issued ) );
}

/**
 * Parses a pending-login cookie into its two identifiers, or null.
 *
 * Rejects anything whose shape, age, or signature does not check out. The
 * secret is resolved per client through $secret_for_client, so an unknown
 * client is rejected before any comparison happens.
 *
 * @param mixed    $raw               Cookie value.
 * @param callable $secret_for_client fn(string $client_id): ?string
 * @return array{client_id: string, state: string}|null
 */
function superlatif_bridge_parse_pending( $raw, callable $secret_for_client, int $now ): ?array {
	if ( ! is_string( $raw ) || '' === $raw ) {
		return null;
	}
	$parts = explode( '.', $raw );
	if ( 4 !== count( $parts ) ) {
		return null;
	}
	list( $client_id, $state, $issued_at, $signature ) = $parts;

	if ( 1 !== preg_match( '/^[a-z0-9][a-z0-9-]{2,63}$/', $client_id ) ) {
		return null;
	}
	if ( ! superlatif_bridge_is_token( $state ) ) {
		return null;
	}
	if ( 1 !== preg_match( '/^[0-9]{1,12}$/', $issued_at ) ) {
		return null;
	}
	// Server-side age check as well as the cookie's own expiry: a browser that
	// keeps an expired cookie must not get a longer window than we allow.
	$age = $now - (int) $issued_at;
	if ( $age < -SUPERLATIF_BRIDGE_MAX_CLOCK_SKEW || $age > SUPERLATIF_BRIDGE_PENDING_TTL ) {
		return null;
	}
	$secret = $secret_for_client( $client_id );
	if ( ! is_string( $secret ) || '' === $secret ) {
		return null;
	}
	if ( ! superlatif_bridge_signature_matches( $secret, superlatif_bridge_pending_signing_input( $client_id, $state, $issued_at ), $signature ) ) {
		return null;
	}
	return array(
		'client_id' => $client_id,
		'state'     => $state,
	);
}
