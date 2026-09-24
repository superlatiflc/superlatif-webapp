<?php
/**
 * Client configuration: one entry per app deployment, in wp-config.php.
 *
 * Deliberately NOT stored in wp_options and there is no settings screen:
 * secrets in the database end up in backups, exports, and the admin UI, and
 * a settings screen is one more privileged surface to secure. Example:
 *
 *   define( 'SUPERLATIF_BRIDGE_CLIENTS', array(
 *       'superlatif-web-staging' => array(
 *           'secret'         => getenv( 'SUPERLATIF_BRIDGE_STAGING_SECRET' ),
 *           'redirect_uri'   => 'https://<staging-host>/auth/bridge/callback',
 *           'environment'    => 'staging',
 *           // Optional (M2, ADR-074): deliver Sejoli order events to this app.
 *           'webhook_secret' => getenv( 'SUPERLATIF_BRIDGE_STAGING_WEBHOOK_SECRET' ),
 *           // Optional, staging only: Vercel "Protection Bypass for Automation" value.
 *           'vercel_protection_bypass' => getenv( 'SUPERLATIF_BRIDGE_STAGING_VERCEL_BYPASS' ),
 *       ),
 *   ) );
 *
 * The client ID is also the audience every code for that client is bound to,
 * and `environment` must equal the app deployment's APP_ENV. Production and
 * staging MUST be separate clients with separate secrets, so neither can
 * redeem the other's codes.
 *
 * @package SuperlatifAppBridge
 */

defined( 'ABSPATH' ) || exit;

/**
 * Valid configured clients, keyed by client ID. Invalid entries are dropped
 * (fail closed) and reported by name only - never with their values.
 *
 * `webhook_secret` / `vercel_protection_bypass` are optional (ADR-074). An
 * invalid one disables only commerce delivery for that client - sign-in keeps
 * working - and is reported by name, never by value.
 *
 * @return array<string, array{secret: string, redirect_uri: string, environment: string, webhook_secret: ?string, vercel_protection_bypass: ?string}>
 */
function superlatif_bridge_clients(): array {
	// wp-config.php cannot change mid-request: validate (and report) once.
	static $clients = null;
	if ( null !== $clients ) {
		return $clients;
	}
	if ( ! defined( 'SUPERLATIF_BRIDGE_CLIENTS' ) || ! is_array( SUPERLATIF_BRIDGE_CLIENTS ) ) {
		$clients = array();
		return $clients;
	}
	$clients = array();
	foreach ( SUPERLATIF_BRIDGE_CLIENTS as $client_id => $client ) {
		$problem = superlatif_bridge_client_problem( $client_id, $client );
		if ( null !== $problem ) {
			// Client IDs are not secret; the value that failed is never logged.
			error_log( 'superlatif-app-bridge: ignoring client ' . ( is_string( $client_id ) ? $client_id : '?' ) . ': ' . $problem ); // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
			continue;
		}
		$webhook = superlatif_bridge_webhook_settings( $client_id, $client );
		$clients[ $client_id ] = array(
			'secret'                   => $client['secret'],
			'redirect_uri'             => $client['redirect_uri'],
			'environment'              => $client['environment'],
			'webhook_secret'           => $webhook['webhook_secret'],
			'vercel_protection_bypass' => $webhook['vercel_protection_bypass'],
		);
	}
	return $clients;
}

/**
 * Validated commerce-delivery settings of an otherwise valid client.
 *
 * @return array{webhook_secret: ?string, vercel_protection_bypass: ?string}
 */
function superlatif_bridge_webhook_settings( string $client_id, array $client ): array {
	$none    = array(
		'webhook_secret'           => null,
		'vercel_protection_bypass' => null,
	);
	$secret  = $client['webhook_secret'] ?? null;
	if ( null === $secret || false === $secret || '' === $secret ) {
		return $none;
	}
	$problem = null;
	if ( ! is_string( $secret ) || strlen( $secret ) < 32 ) {
		$problem = 'webhook_secret shorter than 32 characters';
	} elseif ( hash_equals( $client['secret'], $secret ) ) {
		$problem = 'webhook_secret must differ from the sign-in secret';
	}
	$bypass = $client['vercel_protection_bypass'] ?? null;
	if ( null === $problem && null !== $bypass && false !== $bypass && '' !== $bypass ) {
		if ( ! is_string( $bypass ) || 1 !== preg_match( '/^[A-Za-z0-9_-]{16,128}$/', $bypass ) ) {
			$problem = 'vercel_protection_bypass is malformed';
		} elseif ( 'production' === $client['environment'] ) {
			$problem = 'vercel_protection_bypass is not allowed for a production client';
		}
	} else {
		$bypass = null;
	}
	if ( null !== $problem ) {
		error_log( 'superlatif-app-bridge: commerce delivery disabled for client ' . $client_id . ': ' . $problem ); // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
		return $none;
	}
	return array(
		'webhook_secret'           => $secret,
		'vercel_protection_bypass' => $bypass,
	);
}

/**
 * @param mixed $client_id Array key.
 * @param mixed $client    Entry.
 */
function superlatif_bridge_client_problem( $client_id, $client ): ?string {
	if ( ! is_string( $client_id ) || 1 !== preg_match( '/^[a-z0-9][a-z0-9-]{2,63}$/', $client_id ) ) {
		return 'invalid client id';
	}
	if ( ! is_array( $client ) ) {
		return 'entry is not an array';
	}
	if ( ! isset( $client['secret'] ) || ! is_string( $client['secret'] ) || strlen( $client['secret'] ) < 32 ) {
		return 'secret missing or shorter than 32 characters';
	}
	if ( ! isset( $client['environment'] ) || ! is_string( $client['environment'] ) || 1 !== preg_match( '/^[a-z]{1,32}$/', $client['environment'] ) ) {
		return 'invalid environment';
	}
	if ( ! isset( $client['redirect_uri'] ) || ! is_string( $client['redirect_uri'] ) ) {
		return 'redirect_uri missing';
	}
	$parts = wp_parse_url( $client['redirect_uri'] );
	if ( ! is_array( $parts ) || empty( $parts['host'] ) || empty( $parts['scheme'] ) || isset( $parts['user'] ) || isset( $parts['pass'] ) || isset( $parts['query'] ) || isset( $parts['fragment'] ) ) {
		return 'redirect_uri is not a plain absolute URL';
	}
	$local = in_array( $parts['host'], array( 'localhost', '127.0.0.1' ), true );
	// Plain http only for a local development client; a code must never
	// travel to a hosted app over clear text.
	if ( 'https' !== $parts['scheme'] && ! ( 'http' === $parts['scheme'] && $local && 'development' === $client['environment'] ) ) {
		return 'redirect_uri must use https';
	}
	return null;
}

/**
 * @return array{secret: string, redirect_uri: string, environment: string}|null
 */
function superlatif_bridge_client( string $client_id ): ?array {
	$clients = superlatif_bridge_clients();
	return $clients[ $client_id ] ?? null;
}

/**
 * Lets wp_safe_redirect() reach exactly the configured app hosts, and no
 * other external host.
 *
 * @param string[] $hosts Hosts WordPress already allows.
 * @return string[]
 */
function superlatif_bridge_allowed_redirect_hosts( $hosts ) {
	$hosts = is_array( $hosts ) ? $hosts : array();
	foreach ( superlatif_bridge_clients() as $client ) {
		$host = wp_parse_url( $client['redirect_uri'], PHP_URL_HOST );
		if ( is_string( $host ) && '' !== $host ) {
			$hosts[] = $host;
		}
	}
	return array_values( array_unique( $hosts ) );
}
