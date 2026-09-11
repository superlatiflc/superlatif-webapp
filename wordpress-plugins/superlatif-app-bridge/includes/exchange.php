<?php
/**
 * Server-to-server step: the app redeems a code for the user's identity.
 *
 *   POST /?rest_route=/superlatif-bridge/v1/exchange
 *   X-Superlatif-Bridge-Client:    <client id>
 *   X-Superlatif-Bridge-Timestamp: <unix seconds>
 *   X-Superlatif-Bridge-Signature: hex HMAC-SHA256(secret, "v1\n<timestamp>\n<raw body>")
 *   {"code":"...","state":"...","environment":"production"}
 *
 * Success (200) returns ONLY {version, subject, audience, environment}, where
 * subject is the WordPress user ID, plus a signature over those claims so the
 * app can verify WordPress - not something in between - vouched for them.
 * Failures are fixed WP_Error codes (invalid_client 401, invalid_request 400,
 * invalid_grant 400) whose messages reveal nothing about why.
 *
 * @package SuperlatifAppBridge
 */

defined( 'ABSPATH' ) || exit;

function superlatif_bridge_register_routes(): void {
	register_rest_route(
		SUPERLATIF_BRIDGE_REST_NAMESPACE,
		'/exchange',
		array(
			'methods'             => 'POST',
			'callback'            => 'superlatif_bridge_rest_exchange',
			// Client authentication IS the permission check for this route: it
			// is never called by a browser or a WordPress user.
			'permission_callback' => 'superlatif_bridge_rest_authenticate_client',
		)
	);
}

/**
 * @param WP_REST_Request $request Request.
 * @return true|WP_Error
 */
function superlatif_bridge_rest_authenticate_client( $request ) {
	$client_id = (string) $request->get_header( 'x-superlatif-bridge-client' );
	$timestamp = $request->get_header( 'x-superlatif-bridge-timestamp' );
	$signature = $request->get_header( 'x-superlatif-bridge-signature' );

	$client = superlatif_bridge_client( $client_id );
	$ok     = null !== $client
		&& superlatif_bridge_timestamp_is_fresh( $timestamp, time() )
		&& superlatif_bridge_signature_matches(
			$client['secret'],
			superlatif_bridge_request_signing_input( (string) $timestamp, (string) $request->get_body() ),
			$signature
		);
	if ( ! $ok ) {
		return new WP_Error( 'invalid_client', 'Client authentication failed.', array( 'status' => 401 ) );
	}
	return true;
}

/**
 * @param WP_REST_Request $request Request, already client-authenticated.
 * @return WP_REST_Response|WP_Error
 */
function superlatif_bridge_rest_exchange( $request ) {
	$client_id = (string) $request->get_header( 'x-superlatif-bridge-client' );
	$client    = superlatif_bridge_client( $client_id );
	if ( null === $client ) {
		return new WP_Error( 'invalid_client', 'Client authentication failed.', array( 'status' => 401 ) );
	}

	$params = json_decode( (string) $request->get_body(), true );
	if ( ! is_array( $params )
		|| ! superlatif_bridge_is_token( $params['code'] ?? null )
		|| ! superlatif_bridge_is_token( $params['state'] ?? null )
		|| ! is_string( $params['environment'] ?? null ) ) {
		return new WP_Error( 'invalid_request', 'Malformed request.', array( 'status' => 400 ) );
	}
	// The app states which environment it is; a mismatch means an app
	// deployment is using another environment's client credentials. Refuse
	// before touching the code, so the misconfiguration is visible and the
	// code is not burned by the wrong caller.
	if ( ! hash_equals( $client['environment'], $params['environment'] ) ) {
		return new WP_Error( 'invalid_request', 'Malformed request.', array( 'status' => 400 ) );
	}

	$now = time();
	$row = superlatif_bridge_consume_code( $params['code'], $now );
	$ok  = null !== $row
		&& (int) $row['expires_at'] >= $now
		&& hash_equals( (string) $row['client_id'], $client_id )
		&& hash_equals( (string) $row['state_hash'], superlatif_bridge_hash_token( $params['state'] ) )
		// The account may have been deleted between issue and redemption.
		&& false !== get_userdata( (int) $row['wp_user_id'] );
	if ( ! $ok ) {
		return new WP_Error( 'invalid_grant', 'The code is invalid or has expired.', array( 'status' => 400 ) );
	}

	$claims    = array(
		'version'     => SUPERLATIF_BRIDGE_PROTOCOL_VERSION,
		'subject'     => (string) (int) $row['wp_user_id'],
		'audience'    => $client_id,
		'environment' => $client['environment'],
	);
	$timestamp = (string) $now;
	$response  = new WP_REST_Response( $claims, 200 );
	$response->header( 'X-Superlatif-Bridge-Timestamp', $timestamp );
	$response->header( 'X-Superlatif-Bridge-Signature', superlatif_bridge_sign( $client['secret'], superlatif_bridge_response_signing_input( $timestamp, $claims ) ) );
	$response->header( 'Cache-Control', 'no-store' );
	return $response;
}
