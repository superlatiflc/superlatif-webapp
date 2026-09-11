<?php
/**
 * One-time code storage.
 *
 * A dedicated table rather than transients or options, because redemption
 * must be ATOMIC: a single conditional UPDATE (`... WHERE used_at IS NULL`)
 * lets exactly one of two concurrent exchanges win. Transients have no
 * compare-and-set, so two racing requests could both redeem one code.
 *
 * Stored per code: its SHA-256 hash (never the code), the client it was
 * issued for, the WordPress user ID, the hash of the app's state value, and
 * timestamps. No email, name, IP address, or user agent.
 *
 * @package SuperlatifAppBridge
 */

defined( 'ABSPATH' ) || exit;

const SUPERLATIF_BRIDGE_DB_VERSION = '1';

/** Redeemed or expired rows are kept this long as a replay-evidence trail, then purged. */
const SUPERLATIF_BRIDGE_RETENTION_SECONDS = 86400;

function superlatif_bridge_table(): string {
	global $wpdb;
	return $wpdb->prefix . 'superlatif_bridge_codes';
}

function superlatif_bridge_install_table(): void {
	global $wpdb;
	require_once ABSPATH . 'wp-admin/includes/upgrade.php';
	$table   = superlatif_bridge_table();
	$charset = $wpdb->get_charset_collate();
	dbDelta(
		"CREATE TABLE {$table} (
			code_hash char(64) NOT NULL,
			client_id varchar(64) NOT NULL,
			wp_user_id bigint(20) unsigned NOT NULL,
			state_hash char(64) NOT NULL,
			created_at bigint(20) unsigned NOT NULL,
			expires_at bigint(20) unsigned NOT NULL,
			used_at bigint(20) unsigned DEFAULT NULL,
			PRIMARY KEY  (code_hash),
			KEY expires_at (expires_at)
		) {$charset};"
	);
	update_option( 'superlatif_bridge_db_version', SUPERLATIF_BRIDGE_DB_VERSION, false );
}

function superlatif_bridge_maybe_upgrade(): void {
	if ( get_option( 'superlatif_bridge_db_version' ) !== SUPERLATIF_BRIDGE_DB_VERSION ) {
		superlatif_bridge_install_table();
	}
}

/**
 * Issues a code bound to (client, user, state). Returns the raw code - the
 * only time it exists server-side - or null if it could not be stored.
 */
function superlatif_bridge_issue_code( string $client_id, int $user_id, string $state, int $now ): ?string {
	global $wpdb;
	$code     = superlatif_bridge_new_token();
	$inserted = $wpdb->insert(
		superlatif_bridge_table(),
		array(
			'code_hash'  => superlatif_bridge_hash_token( $code ),
			'client_id'  => $client_id,
			'wp_user_id' => $user_id,
			'state_hash' => superlatif_bridge_hash_token( $state ),
			'created_at' => $now,
			'expires_at' => $now + SUPERLATIF_BRIDGE_CODE_TTL,
		),
		array( '%s', '%s', '%d', '%s', '%d', '%d' )
	);
	if ( 1 !== $inserted ) {
		return null;
	}
	superlatif_bridge_purge_old_codes( $now );
	return $code;
}

/**
 * Marks the code used and returns its row, ONLY if this call is the one that
 * consumed it. Consumption happens before any other check on purpose: a code
 * presented with the wrong state, by the wrong client, or after expiry is
 * burned too, so a leaked code can be tried at most once.
 *
 * @return array{client_id: string, wp_user_id: string, state_hash: string, expires_at: string}|null
 */
function superlatif_bridge_consume_code( string $code, int $now ): ?array {
	global $wpdb;
	$table = superlatif_bridge_table();
	$hash  = superlatif_bridge_hash_token( $code );

	// A NULL value in the WHERE array becomes `used_at IS NULL` (wpdb, WP 4.4+).
	$updated = $wpdb->update(
		$table,
		array( 'used_at' => $now ),
		array(
			'code_hash' => $hash,
			'used_at'   => null,
		),
		array( '%d' ),
		array( '%s', null )
	);
	if ( 1 !== $updated ) {
		return null;
	}
	// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is not user input.
	$row = $wpdb->get_row( $wpdb->prepare( "SELECT client_id, wp_user_id, state_hash, expires_at FROM {$table} WHERE code_hash = %s", $hash ), ARRAY_A );
	return is_array( $row ) ? $row : null;
}

function superlatif_bridge_purge_old_codes( int $now ): void {
	global $wpdb;
	$table = superlatif_bridge_table();
	// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is not user input.
	$wpdb->query( $wpdb->prepare( "DELETE FROM {$table} WHERE expires_at < %d", $now - SUPERLATIF_BRIDGE_RETENTION_SECONDS ) );
}
