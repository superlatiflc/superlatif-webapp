<?php
/**
 * Sejoli order events -> signed webhook deliveries to the app (M2, ADR-074).
 *
 * WHAT IS CAPTURED. Sejoli fires `sejoli/order/set-status/{status}` with the
 * order array both when an order is created (sejoli admin/order.php, after
 * `sejoli/order/new`) and after every status change (`update_status`, which
 * every status path - admin, payment gateways, confirmation, CLI - goes
 * through). Its own access logic hangs off the same hooks: license and user
 * group are granted on `completed` and withdrawn on `refunded`/`cancelled`.
 * This plugin listens to exactly those hooks, for the statuses in
 * SUPERLATIF_BRIDGE_SEJOLI_EVENT_TYPES, and nothing else in Sejoli.
 * Source evidence: Sejoli 1.14.2. The staging capture confirms it (OD-01).
 *
 * WHAT IS SENT. contracts/openapi.yaml `CanonicalCommerceEvent`, minimized:
 * order ID, product ID, WordPress user ID, the mapped event type, and amounts.
 * Never email, name, phone, address, payment data, coupon or affiliate data.
 *
 * DELIVERY. Each event is written to an outbox table first, with its event ID
 * fixed at that moment. A delivery is attempted at the end of the same
 * request, and WP-Cron retries every 5 minutes with backoff - always with the
 * SAME event ID, which is what makes retries safe: the app deduplicates on
 * it. Each attempt is signed afresh (new timestamp), so a retry is never
 * rejected as stale.
 *
 * Nothing here computes access: the app decides what an event means.
 *
 * @package SuperlatifAppBridge
 */

defined( 'ABSPATH' ) || exit;

const SUPERLATIF_BRIDGE_COMMERCE_PROVIDER = 'sejoli_bridge';
const SUPERLATIF_BRIDGE_COMMERCE_PATH     = '/api/v1/integrations/commerce/sejoli_bridge/events';
const SUPERLATIF_BRIDGE_COMMERCE_CRON     = 'superlatif_bridge_commerce_deliver';
const SUPERLATIF_BRIDGE_COMMERCE_DB_VERSION = '1';

/**
 * Sejoli status -> wire event type, version 1.
 *
 * Only `completed` is a settled payment: it is the one status on which Sejoli
 * itself grants a license and user group. `payment-confirm` means the BUYER
 * reported a transfer that nobody has verified yet; `in-progress`/`shipping`
 * are fulfilment states of physical goods. All of those stay pending.
 * Sejoli core has no partial-refund, expiry, or chargeback status, so those
 * wire types are never produced here. An unlisted status (added by another
 * plugin) is not hooked and never sent.
 */
const SUPERLATIF_BRIDGE_SEJOLI_EVENT_TYPES = array(
	'on-hold'         => 'order_pending',
	'payment-confirm' => 'order_pending',
	'in-progress'     => 'order_pending',
	'shipping'        => 'order_pending',
	'completed'       => 'payment_settled',
	'refunded'        => 'refund_full',
	'cancelled'       => 'order_cancelled',
);
const SUPERLATIF_BRIDGE_SEJOLI_MAP_VERSION = 1;

/** Seconds to wait before attempt N+1 (index = attempts made so far). The last one is followed by giving up. */
const SUPERLATIF_BRIDGE_COMMERCE_BACKOFF = array( 60, 300, 900, 3600, 10800, 21600, 43200 );

/** Delivered rows are kept this long as a delivery log, then purged. Undeliverable ("dead") rows are kept. */
const SUPERLATIF_BRIDGE_COMMERCE_RETENTION_SECONDS = 30 * 86400;

// ------------------------------------------------------------------ pure parts

function superlatif_bridge_commerce_event_type( string $sejoli_status ): ?string {
	return SUPERLATIF_BRIDGE_SEJOLI_EVENT_TYPES[ $sejoli_status ] ?? null;
}

/** A positive decimal ID as Sejoli stores it, or null. */
function superlatif_bridge_commerce_id( $value ): ?string {
	if ( is_int( $value ) && $value > 0 ) {
		return (string) $value;
	}
	if ( is_string( $value ) && 1 === preg_match( '/^[1-9][0-9]{0,19}$/', $value ) ) {
		return $value;
	}
	return null;
}

/**
 * Rupiah amount as a whole number. Sejoli stores `grand_total` as FLOAT(12,2)
 * in the store currency; this adapter assumes IDR (confirmed per site in the
 * staging capture). Access never depends on the amount.
 */
function superlatif_bridge_commerce_amount( $value ): int {
	$amount = is_numeric( $value ) ? (float) $value : 0.0;
	return max( 0, (int) round( $amount ) );
}

/**
 * Builds the wire event for one order at one status, or null when the order
 * lacks what the contract requires (then nothing is queued).
 *
 * @param array|object $order Sejoli order as passed to the status hook.
 */
function superlatif_bridge_commerce_build_event( $order, string $event_id, int $now ): ?array {
	$order = is_object( $order ) ? get_object_vars( $order ) : $order;
	if ( ! is_array( $order ) ) {
		return null;
	}
	$status     = isset( $order['status'] ) && is_string( $order['status'] ) ? $order['status'] : '';
	$event_type = superlatif_bridge_commerce_event_type( $status );
	$order_id   = superlatif_bridge_commerce_id( $order['ID'] ?? null );
	$product_id = superlatif_bridge_commerce_id( $order['product_id'] ?? null );
	if ( null === $event_type || null === $order_id || null === $product_id ) {
		return null;
	}
	// A guest order has no WordPress user; the app then records it for review.
	$user_id = superlatif_bridge_commerce_id( $order['user_id'] ?? null );
	$total   = superlatif_bridge_commerce_amount( $order['grand_total'] ?? 0 );

	// Checksum of the minimized source fields this event was built from, so a
	// support investigation can tie an app event back to the Sejoli row state.
	$source = array(
		'ID'              => $order_id,
		'product_id'      => $product_id,
		'user_id'         => $user_id,
		'status'          => $status,
		'grand_total'     => (string) ( $order['grand_total'] ?? '' ),
		'quantity'        => (string) ( $order['quantity'] ?? '' ),
		'type'            => (string) ( $order['type'] ?? '' ),
		'order_parent_id' => (string) ( $order['order_parent_id'] ?? '' ),
		'map_version'     => SUPERLATIF_BRIDGE_SEJOLI_MAP_VERSION,
	);

	return array(
		'schemaVersion'      => 1,
		'eventId'            => $event_id,
		'eventType'          => $event_type,
		'occurredAt'         => gmdate( 'Y-m-d\TH:i:s\Z', $now ),
		'order'              => array(
			'externalOrderId' => $order_id,
			'externalSkuId'   => $product_id,
			'externalUserId'  => $user_id,
		),
		'customer'           => array(
			'emailHash' => null,
			'phoneHash' => null,
		),
		'amounts'            => array(
			'currency'        => 'IDR',
			'grossMinor'      => $total,
			'discountMinor'   => 0,
			'netSettledMinor' => $total,
			'refundedMinor'   => 'refund_full' === $event_type ? $total : 0,
		),
		'rawPayloadChecksum' => hash( 'sha256', (string) wp_json_encode( $source ) ),
	);
}

/** The exact bytes that are signed and sent. Encoded once, at enqueue time. */
function superlatif_bridge_commerce_encode( array $event ): string {
	return (string) wp_json_encode( $event, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE );
}

/** Must agree byte for byte with packages/integrations commerce-webhook/protocol.ts. */
function superlatif_bridge_commerce_signing_input( string $key_id, string $timestamp, string $event_id, string $body ): string {
	return implode( "\n", array( 'commerce.v1', $key_id, $timestamp, $event_id, $body ) );
}

/**
 * @param array{secret: string, redirect_uri: string, environment: string, webhook_secret: ?string, vercel_protection_bypass: ?string} $client
 * @return array<string, string>
 */
function superlatif_bridge_commerce_headers( string $client_id, array $client, string $event_id, string $body, int $now ): array {
	$timestamp = (string) $now;
	$headers   = array(
		'Content-Type'           => 'application/json',
		'User-Agent'             => 'superlatif-app-bridge/' . ( defined( 'SUPERLATIF_BRIDGE_VERSION' ) ? SUPERLATIF_BRIDGE_VERSION : 'dev' ),
		'X-Provider-Event-ID'    => $event_id,
		'X-Superlatif-Timestamp' => $timestamp,
		'X-Superlatif-Key-ID'    => $client_id,
		'X-Superlatif-Signature' => superlatif_bridge_sign(
			(string) $client['webhook_secret'],
			superlatif_bridge_commerce_signing_input( $client_id, $timestamp, $event_id, $body )
		),
	);
	if ( ! empty( $client['vercel_protection_bypass'] ) ) {
		// Staging only: lets a delivery through Vercel deployment protection.
		$headers['x-vercel-protection-bypass'] = (string) $client['vercel_protection_bypass'];
	}
	return $headers;
}

/** The app origin of this client (from its redirect_uri) plus the webhook path. */
function superlatif_bridge_commerce_url( array $client ): ?string {
	$parts = wp_parse_url( $client['redirect_uri'] );
	if ( ! is_array( $parts ) || empty( $parts['scheme'] ) || empty( $parts['host'] ) ) {
		return null;
	}
	$port = isset( $parts['port'] ) ? ':' . (int) $parts['port'] : '';
	return $parts['scheme'] . '://' . $parts['host'] . $port . SUPERLATIF_BRIDGE_COMMERCE_PATH;
}

/**
 * What to do after one attempt. `$status` is the HTTP status, or 0 for a
 * transport failure (timeout, DNS, TLS).
 *
 * @return array{state: string, delay: int}
 */
function superlatif_bridge_commerce_next( int $status, int $attempts_made ): array {
	if ( $status >= 200 && $status < 300 ) {
		return array(
			'state' => 'delivered',
			'delay' => 0,
		);
	}
	// The app understood the request and refused its content: resending the
	// same bytes can never succeed. Kept as "dead" for a human.
	if ( in_array( $status, array( 400, 413, 415, 422 ), true ) ) {
		return array(
			'state' => 'dead',
			'delay' => 0,
		);
	}
	// Everything else may heal: 5xx, 429, 503 during a write freeze, 404 while
	// the endpoint is not enabled yet, 401/403 while keys are being fixed.
	if ( $attempts_made > count( SUPERLATIF_BRIDGE_COMMERCE_BACKOFF ) ) {
		return array(
			'state' => 'dead',
			'delay' => 0,
		);
	}
	return array(
		'state' => 'pending',
		'delay' => SUPERLATIF_BRIDGE_COMMERCE_BACKOFF[ max( 0, $attempts_made - 1 ) ],
	);
}

/**
 * Clients that deliver commerce events: those with a valid webhook secret.
 *
 * @return array<string, array>
 */
function superlatif_bridge_commerce_clients(): array {
	return array_filter(
		superlatif_bridge_clients(),
		static function ( $client ) {
			return is_string( $client['webhook_secret'] ?? null );
		}
	);
}

// ------------------------------------------------------------------ outbox

function superlatif_bridge_commerce_table(): string {
	global $wpdb;
	return $wpdb->prefix . 'superlatif_bridge_events';
}

function superlatif_bridge_commerce_install_table(): void {
	global $wpdb;
	require_once ABSPATH . 'wp-admin/includes/upgrade.php';
	$table   = superlatif_bridge_commerce_table();
	$charset = $wpdb->get_charset_collate();
	dbDelta(
		"CREATE TABLE {$table} (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			event_id varchar(64) NOT NULL,
			client_id varchar(64) NOT NULL,
			order_id bigint(20) unsigned NOT NULL,
			event_type varchar(32) NOT NULL,
			body text NOT NULL,
			status varchar(16) NOT NULL,
			attempts int(10) unsigned NOT NULL DEFAULT 0,
			next_attempt_at bigint(20) unsigned NOT NULL,
			last_http_status smallint(5) unsigned DEFAULT NULL,
			created_at bigint(20) unsigned NOT NULL,
			delivered_at bigint(20) unsigned DEFAULT NULL,
			PRIMARY KEY  (id),
			UNIQUE KEY event_id (event_id),
			KEY due (status, next_attempt_at)
		) {$charset};"
	);
	update_option( 'superlatif_bridge_commerce_db_version', SUPERLATIF_BRIDGE_COMMERCE_DB_VERSION, false );
}

function superlatif_bridge_commerce_maybe_upgrade(): void {
	if ( get_option( 'superlatif_bridge_commerce_db_version' ) !== SUPERLATIF_BRIDGE_COMMERCE_DB_VERSION ) {
		superlatif_bridge_commerce_install_table();
	}
}

/** Queues one event for one client. Returns the new row ID, or 0. */
function superlatif_bridge_commerce_enqueue( string $client_id, array $event, int $now ): int {
	global $wpdb;
	$inserted = $wpdb->insert(
		superlatif_bridge_commerce_table(),
		array(
			'event_id'        => $event['eventId'],
			'client_id'       => $client_id,
			'order_id'        => (int) $event['order']['externalOrderId'],
			'event_type'      => $event['eventType'],
			'body'            => superlatif_bridge_commerce_encode( $event ),
			'status'          => 'pending',
			'attempts'        => 0,
			'next_attempt_at' => $now,
			'created_at'      => $now,
		),
		array( '%s', '%s', '%d', '%s', '%s', '%s', '%d', '%d', '%d' )
	);
	return 1 === $inserted ? (int) $wpdb->insert_id : 0;
}

/** @return array<int, array<string, string>> */
function superlatif_bridge_commerce_due( int $now, int $limit ): array {
	global $wpdb;
	$table = superlatif_bridge_commerce_table();
	// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is not user input.
	$rows = $wpdb->get_results( $wpdb->prepare( "SELECT id, event_id, client_id, body, attempts FROM {$table} WHERE status = 'pending' AND next_attempt_at <= %d ORDER BY id ASC LIMIT %d", $now, $limit ), ARRAY_A );
	return is_array( $rows ) ? $rows : array();
}

function superlatif_bridge_commerce_record_attempt( int $id, int $attempts, int $status, array $next, int $now ): void {
	global $wpdb;
	$data = array(
		'status'           => $next['state'],
		'attempts'         => $attempts,
		'next_attempt_at'  => $now + $next['delay'],
		'last_http_status' => $status,
	);
	$format = array( '%s', '%d', '%d', '%d' );
	if ( 'delivered' === $next['state'] ) {
		$data['delivered_at'] = $now;
		$format[]             = '%d';
	}
	$wpdb->update( superlatif_bridge_commerce_table(), $data, array( 'id' => $id ), $format, array( '%d' ) );
}

function superlatif_bridge_commerce_purge( int $now ): void {
	global $wpdb;
	$table = superlatif_bridge_commerce_table();
	// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is not user input.
	$wpdb->query( $wpdb->prepare( "DELETE FROM {$table} WHERE status = 'delivered' AND delivered_at < %d", $now - SUPERLATIF_BRIDGE_COMMERCE_RETENTION_SECONDS ) );
}

// ------------------------------------------------------------------ delivery

/**
 * Sends one signed delivery. Returns the HTTP status, or 0 on a transport
 * failure. No redirects are followed: the webhook URL is fixed by config.
 */
function superlatif_bridge_commerce_post( string $url, array $headers, string $body ): int {
	$response = wp_remote_post(
		$url,
		array(
			'timeout'     => 10,
			'redirection' => 0,
			'headers'     => $headers,
			'body'        => $body,
		)
	);
	if ( is_wp_error( $response ) ) {
		return 0;
	}
	return (int) wp_remote_retrieve_response_code( $response );
}

/**
 * Attempts every due event once. Safe to run concurrently: a duplicate
 * delivery of the same event ID is harmless (the app deduplicates), and the
 * lock only avoids wasted requests.
 *
 * @param callable|null $post fn(string $url, array $headers, string $body): int - injectable for tests.
 * @return array{delivered: int, pending: int, dead: int}
 */
function superlatif_bridge_commerce_deliver_due( int $now, ?callable $post = null ): array {
	$post    = $post ?? 'superlatif_bridge_commerce_post';
	$summary = array(
		'delivered' => 0,
		'pending'   => 0,
		'dead'      => 0,
	);
	if ( ! add_option( 'superlatif_bridge_commerce_lock', (string) $now, '', false ) ) {
		$held_since = (int) get_option( 'superlatif_bridge_commerce_lock' );
		if ( $now - $held_since < 120 ) {
			return $summary;
		}
		update_option( 'superlatif_bridge_commerce_lock', (string) $now, false );
	}
	try {
		$clients = superlatif_bridge_commerce_clients();
		foreach ( superlatif_bridge_commerce_due( $now, 25 ) as $row ) {
			$attempts = (int) $row['attempts'] + 1;
			$client   = $clients[ $row['client_id'] ] ?? null;
			$url      = null === $client ? null : superlatif_bridge_commerce_url( $client );
			// A client removed from config: nothing can deliver it until it is back.
			$status = null === $url
				? 0
				: (int) call_user_func( $post, $url, superlatif_bridge_commerce_headers( $row['client_id'], $client, $row['event_id'], $row['body'], $now ), $row['body'] );
			$next = superlatif_bridge_commerce_next( $status, $attempts );
			superlatif_bridge_commerce_record_attempt( (int) $row['id'], $attempts, $status, $next, $now );
			++$summary[ $next['state'] ];
			if ( 'dead' === $next['state'] ) {
				// Order and event IDs are not personal data; no body, no header.
				error_log( 'superlatif-app-bridge: commerce event ' . $row['event_id'] . ' undeliverable after ' . $attempts . ' attempts (last HTTP ' . $status . ')' ); // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
			}
		}
		superlatif_bridge_commerce_purge( $now );
	} finally {
		delete_option( 'superlatif_bridge_commerce_lock' );
	}
	return $summary;
}

// ------------------------------------------------------------------ hooks

/**
 * `sejoli/order/set-status/{status}` handler: queue one event per webhook
 * client, and try to deliver it before this request ends.
 *
 * @param array|object $order Sejoli order.
 */
function superlatif_bridge_commerce_on_order_status( $order ): void {
	$clients = superlatif_bridge_commerce_clients();
	if ( array() === $clients ) {
		return;
	}
	$now    = time();
	$queued = false;
	foreach ( array_keys( $clients ) as $client_id ) {
		$event = superlatif_bridge_commerce_build_event( $order, wp_generate_uuid4(), $now );
		if ( null === $event ) {
			return; // Same order for every client: if it is unusable for one, it is for all.
		}
		$queued = superlatif_bridge_commerce_enqueue( $client_id, $event, $now ) > 0 || $queued;
	}
	if ( $queued && ! has_action( 'shutdown', 'superlatif_bridge_commerce_deliver_now' ) ) {
		add_action( 'shutdown', 'superlatif_bridge_commerce_deliver_now' );
	}
}

function superlatif_bridge_commerce_deliver_now(): void {
	superlatif_bridge_commerce_deliver_due( time() );
}

function superlatif_bridge_commerce_register_hooks(): void {
	foreach ( array_keys( SUPERLATIF_BRIDGE_SEJOLI_EVENT_TYPES ) as $status ) {
		add_action( 'sejoli/order/set-status/' . $status, 'superlatif_bridge_commerce_on_order_status', 20, 1 );
	}
	add_action( SUPERLATIF_BRIDGE_COMMERCE_CRON, 'superlatif_bridge_commerce_deliver_now' );
}

/** @param array $schedules WordPress cron schedules. */
function superlatif_bridge_commerce_cron_schedules( $schedules ) {
	$schedules = is_array( $schedules ) ? $schedules : array();
	$schedules['superlatif_bridge_five_minutes'] = array(
		'interval' => 300,
		'display'  => 'Every five minutes (Superlatif App Bridge)',
	);
	return $schedules;
}

function superlatif_bridge_commerce_ensure_cron(): void {
	if ( array() !== superlatif_bridge_commerce_clients() && ! wp_next_scheduled( SUPERLATIF_BRIDGE_COMMERCE_CRON ) ) {
		wp_schedule_event( time() + 60, 'superlatif_bridge_five_minutes', SUPERLATIF_BRIDGE_COMMERCE_CRON );
	}
}

function superlatif_bridge_commerce_deactivate(): void {
	wp_clear_scheduled_hook( SUPERLATIF_BRIDGE_COMMERCE_CRON );
}
