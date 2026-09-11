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
const SUPERLATIF_BRIDGE_AUTHORIZE_ACTION = 'superlatif_bridge_authorize';
const SUPERLATIF_BRIDGE_REST_NAMESPACE   = 'superlatif-bridge/v1';

/** Seconds a code stays redeemable. The app redeems it within a second of the redirect. */
const SUPERLATIF_BRIDGE_CODE_TTL = 120;

/** Accepted clock difference between WordPress and the app, both directions. */
const SUPERLATIF_BRIDGE_MAX_CLOCK_SKEW = 300;

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
