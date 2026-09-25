<?php
/**
 * Self-contained tests for the bridge plugin's own logic.
 *
 *   php tests/run.php                      (CI: ubuntu-latest ships PHP)
 *   npx @php-wasm/cli tests/run.php        (no local PHP needed)
 *
 * This is NOT a WordPress test suite: the few WordPress functions the plugin
 * calls are replaced by minimal stand-ins below, and $wpdb by an in-memory
 * table with the same conditional-update semantics. Real-WordPress behaviour
 * (dbDelta, REST routing, login redirects, MySQL atomicity) is exercised by
 * the OD-02 spike in README.md, not here.
 *
 * @package SuperlatifAppBridge
 */

declare(strict_types=1);

define( 'ABSPATH', __DIR__ . '/' );
define( 'SUPERLATIF_BRIDGE_TESTING', true );
define( 'ARRAY_A', 'ARRAY_A' );

const STAGING_KEY    = 'staging-client-hmac-key-for-plugin-tests-000';
const PRODUCTION_KEY = 'production-client-hmac-key-for-plugin-tests-00';
const WEBHOOK_KEY    = 'staging-webhook-hmac-key-for-plugin-tests-0';
const BYPASS_VALUE   = 'vercelBypassForPluginTests0001';

define(
	'SUPERLATIF_BRIDGE_CLIENTS',
	array(
		'superlatif-web-staging'    => array(
			'secret'                   => STAGING_KEY,
			'redirect_uri'             => 'https://staging-app.test/auth/bridge/callback',
			'environment'              => 'staging',
			'webhook_secret'           => WEBHOOK_KEY,
			'vercel_protection_bypass' => BYPASS_VALUE,
		),
		'webhook-short'             => array(
			'secret'         => STAGING_KEY,
			'redirect_uri'   => 'https://staging-app.test/auth/bridge/callback',
			'environment'    => 'staging',
			'webhook_secret' => 'too-short',
		),
		'webhook-reused'            => array(
			'secret'         => STAGING_KEY,
			'redirect_uri'   => 'https://staging-app.test/auth/bridge/callback',
			'environment'    => 'staging',
			'webhook_secret' => STAGING_KEY,
		),
		'prod-with-bypass'          => array(
			'secret'                   => PRODUCTION_KEY,
			'redirect_uri'             => 'https://app.test/auth/bridge/callback',
			'environment'              => 'production',
			'webhook_secret'           => WEBHOOK_KEY,
			'vercel_protection_bypass' => BYPASS_VALUE,
		),
		'superlatif-web-production' => array(
			'secret'       => PRODUCTION_KEY,
			'redirect_uri' => 'https://app.test/auth/bridge/callback',
			'environment'  => 'production',
		),
		'short-secret'              => array(
			'secret'       => 'too-short',
			'redirect_uri' => 'https://app.test/auth/bridge/callback',
			'environment'  => 'production',
		),
		'plain-http'                => array(
			'secret'       => STAGING_KEY,
			'redirect_uri' => 'http://staging-app.test/auth/bridge/callback',
			'environment'  => 'staging',
		),
	)
);

// Keep the expected "ignoring client" notices out of the test output.
ini_set( 'error_log', sys_get_temp_dir() . '/superlatif-bridge-tests.log' );
// The plugin calls header(); buffering keeps PHP from treating test output
// as "headers already sent". Results go straight to STDOUT instead.
ob_start();

// ---------------------------------------------------------------- stand-ins

final class Sab_Die extends Exception {
	public $status;
	public function __construct( int $status ) {
		parent::__construct( 'wp_die ' . $status );
		$this->status = $status;
	}
}

class WP_Error {
	private $code;
	private $data;
	public function __construct( string $code, string $message, array $data ) {
		$this->code = $code;
		$this->data = $data;
	}
	public function get_error_code(): string {
		return $this->code;
	}
	public function get_error_data(): array {
		return $this->data;
	}
}

class WP_REST_Request {
	private $headers;
	private $body;
	public function __construct( array $headers, string $body ) {
		$this->headers = array();
		foreach ( $headers as $name => $value ) {
			$this->headers[ self::canonical( $name ) ] = $value;
		}
		$this->body = $body;
	}
	private static function canonical( string $name ): string {
		return str_replace( '-', '_', strtolower( $name ) );
	}
	public function get_header( string $name ) {
		return $this->headers[ self::canonical( $name ) ] ?? null;
	}
	public function get_body(): string {
		return $this->body;
	}
}

class WP_REST_Response {
	private $data;
	private $status;
	private $headers = array();
	public function __construct( $data, int $status ) {
		$this->data   = $data;
		$this->status = $status;
	}
	public function header( string $name, string $value ): void {
		$this->headers[ $name ] = $value;
	}
	public function get_data() {
		return $this->data;
	}
	public function get_status(): int {
		return $this->status;
	}
	public function get_headers(): array {
		return $this->headers;
	}
}

/** In-memory stand-in for the code table, with wpdb's NULL-in-WHERE semantics. */
final class Sab_Wpdb {
	public $prefix = 'wp_';
	public $rows   = array();
	public function get_charset_collate(): string {
		return '';
	}
	public function insert( string $table, array $data, array $format ) {
		$this->rows[ $data['code_hash'] ] = $data + array( 'used_at' => null );
		return 1;
	}
	public function update( string $table, array $data, array $where, array $format, array $where_format ) {
		$row = $this->rows[ $where['code_hash'] ] ?? null;
		if ( null === $row ) {
			return 0;
		}
		foreach ( $where as $column => $value ) {
			if ( null === $value ? null !== $row[ $column ] : (string) $row[ $column ] !== (string) $value ) {
				return 0;
			}
		}
		$this->rows[ $where['code_hash'] ] = array_merge( $row, $data );
		return 1;
	}
	public function prepare( string $sql, ...$args ): array {
		return array(
			'sql'  => $sql,
			'args' => $args,
		);
	}
	public function get_row( array $prepared, string $output ) {
		$row = $this->rows[ $prepared['args'][0] ] ?? null;
		if ( null === $row ) {
			return null;
		}
		return array(
			'client_id'  => (string) $row['client_id'],
			'wp_user_id' => (string) $row['wp_user_id'],
			'state_hash' => (string) $row['state_hash'],
			'expires_at' => (string) $row['expires_at'],
		);
	}
	public function query( array $prepared ) {
		$threshold = (int) $prepared['args'][0];
		$before    = count( $this->rows );
		$this->rows = array_filter(
			$this->rows,
			static function ( $row ) use ( $threshold ) {
				return (int) $row['expires_at'] >= $threshold;
			}
		);
		return $before - count( $this->rows );
	}
}

$GLOBALS['wpdb']         = new Sab_Wpdb();
$GLOBALS['sab_user_id']  = 0;
$GLOBALS['sab_can_read'] = true;
$GLOBALS['sab_redirect'] = null;
$GLOBALS['sab_users']    = array( 4821 => true );
$GLOBALS['sab_options']  = array();

function sanitize_text_field( $value ): string {
	return trim( strip_tags( (string) $value ) );
}
function wp_unslash( $value ) {
	return $value;
}
function is_user_logged_in(): bool {
	return $GLOBALS['sab_user_id'] > 0;
}
function get_current_user_id(): int {
	return $GLOBALS['sab_user_id'];
}
function current_user_can( string $capability ): bool {
	return $GLOBALS['sab_can_read'];
}
function add_query_arg( array $args, string $url ): string {
	$pairs = array();
	foreach ( $args as $key => $value ) {
		$pairs[] = $key . '=' . $value;
	}
	return $url . ( false === strpos( $url, '?' ) ? '?' : '&' ) . implode( '&', $pairs );
}
function admin_url( string $path ): string {
	return 'https://wp.test/wp-admin/' . $path;
}
function wp_login_url( string $redirect ): string {
	return 'https://wp.test/wp-login.php?redirect_to=' . rawurlencode( $redirect );
}
function wp_parse_url( string $url, int $component = -1 ) {
	return parse_url( $url, $component );
}
/** Mirrors WordPress: an unlisted external host falls back to the admin URL. */
function wp_safe_redirect( string $location, int $status = 302, string $by = '' ): bool {
	$host    = parse_url( $location, PHP_URL_HOST );
	$allowed = superlatif_bridge_allowed_redirect_hosts( array( 'wp.test' ) );
	$GLOBALS['sab_redirect'] = in_array( $host, $allowed, true ) ? $location : admin_url();
	return true;
}
function nocache_headers(): void {
}
function wp_die( string $message, string $title, array $args ): void {
	throw new Sab_Die( (int) $args['response'] );
}
function esc_html__( string $text, string $domain ): string {
	return $text;
}
function get_userdata( int $user_id ) {
	return isset( $GLOBALS['sab_users'][ $user_id ] ) ? (object) array( 'ID' => $user_id ) : false;
}
function get_option( string $name ) {
	return $GLOBALS['sab_options'][ $name ] ?? false;
}
function update_option( string $name, $value, bool $autoload ): bool {
	$GLOBALS['sab_options'][ $name ] = $value;
	return true;
}
function register_rest_route( string $namespace, string $route, array $args ): void {
	$GLOBALS['sab_routes'][ $namespace . $route ] = $args;
}
function home_url( string $path = '' ): string {
	return 'https://wp.test' . ( '' === $path ? '' : $path );
}
function do_action( string $hook, ...$args ): void {
	$GLOBALS['sab_actions'][] = $hook;
}
function is_ssl(): bool {
	return true;
}
function wp_doing_ajax(): bool {
	return false;
}
function wp_json_encode( $data, int $options = 0 ) {
	return json_encode( $data, $options );
}
function add_option( string $name, $value, string $deprecated = '', $autoload = true ): bool {
	if ( array_key_exists( $name, $GLOBALS['sab_options'] ) ) {
		return false;
	}
	$GLOBALS['sab_options'][ $name ] = $value;
	return true;
}
function delete_option( string $name ): bool {
	unset( $GLOBALS['sab_options'][ $name ] );
	return true;
}
function wp_generate_uuid4(): string {
	$b    = random_bytes( 16 );
	$b[6] = chr( ord( $b[6] ) & 0x0f | 0x40 );
	$b[8] = chr( ord( $b[8] ) & 0x3f | 0x80 );
	return vsprintf( '%s%s-%s-%s-%s-%s%s%s', str_split( bin2hex( $b ), 4 ) );
}
function add_action( string $hook, $callback, int $priority = 10, int $args = 1 ): void {
	$GLOBALS['sab_hooks'][ $hook ][] = $callback;
}
function has_action( string $hook, $callback ): bool {
	return in_array( $callback, $GLOBALS['sab_hooks'][ $hook ] ?? array(), true );
}

/** In-memory stand-in for the commerce outbox table. */
final class Sab_Commerce_Wpdb {
	public $prefix    = 'wp_';
	public $rows      = array();
	public $insert_id = 0;
	public function get_charset_collate(): string {
		return '';
	}
	public function insert( string $table, array $data, array $format ) {
		foreach ( $this->rows as $row ) {
			if ( $row['event_id'] === $data['event_id'] ) {
				return false;
			}
		}
		$this->insert_id                 = count( $this->rows ) + 1;
		$this->rows[ $this->insert_id ] = $data + array(
			'id'               => $this->insert_id,
			'last_http_status' => null,
			'delivered_at'     => null,
		);
		return 1;
	}
	public function prepare( string $sql, ...$args ): array {
		return array(
			'sql'  => $sql,
			'args' => $args,
		);
	}
	public function get_results( array $prepared, string $output ): array {
		list( $now, $limit ) = $prepared['args'];
		$due = array_filter(
			$this->rows,
			static function ( $row ) use ( $now ) {
				return 'pending' === $row['status'] && (int) $row['next_attempt_at'] <= $now;
			}
		);
		ksort( $due );
		return array_map(
			static function ( $row ) {
				return array(
					'id'        => (string) $row['id'],
					'event_id'  => $row['event_id'],
					'client_id' => $row['client_id'],
					'body'      => $row['body'],
					'attempts'  => (string) $row['attempts'],
				);
			},
			array_values( array_slice( $due, 0, $limit, true ) )
		);
	}
	public function update( string $table, array $data, array $where, array $format, array $where_format ) {
		if ( ! isset( $this->rows[ $where['id'] ] ) ) {
			return 0;
		}
		$this->rows[ $where['id'] ] = array_merge( $this->rows[ $where['id'] ], $data );
		return 1;
	}
	public function query( array $prepared ) {
		$threshold = (int) $prepared['args'][0];
		$before    = count( $this->rows );
		$this->rows = array_filter(
			$this->rows,
			static function ( $row ) use ( $threshold ) {
				return ! ( 'delivered' === $row['status'] && (int) $row['delivered_at'] < $threshold );
			}
		);
		return $before - count( $this->rows );
	}
}

require_once __DIR__ . '/../includes/protocol.php';
require_once __DIR__ . '/../includes/config.php';
require_once __DIR__ . '/../includes/code-store.php';
require_once __DIR__ . '/../includes/authorize.php';
require_once __DIR__ . '/../includes/exchange.php';
require_once __DIR__ . '/../includes/commerce.php';

// ---------------------------------------------------------------- harness

$sab_results = array(
	'pass' => 0,
	'fail' => 0,
);

function check( string $name, bool $condition ): void {
	global $sab_results;
	if ( $condition ) {
		++$sab_results['pass'];
		fwrite( STDOUT, "ok - {$name}\n" );
	} else {
		++$sab_results['fail'];
		fwrite( STDOUT, "NOT OK - {$name}\n" );
	}
}

function reset_state(): void {
	$GLOBALS['wpdb']->rows    = array();
	$GLOBALS['sab_user_id']   = 0;
	$GLOBALS['sab_can_read']  = true;
	$GLOBALS['sab_redirect']  = null;
	$_GET                     = array();
}

function new_state(): string {
	return superlatif_bridge_new_token();
}

/** Runs authorize for a logged-in user and returns [code, state] from the redirect. */
function authorize_as( int $user_id, string $client_id ): array {
	$state                  = new_state();
	$GLOBALS['sab_user_id'] = $user_id;
	$_GET                   = array(
		'client_id' => $client_id,
		'state'     => $state,
	);
	superlatif_bridge_handle_authorize();
	parse_str( (string) parse_url( (string) $GLOBALS['sab_redirect'], PHP_URL_QUERY ), $query );
	return array( $query['code'] ?? '', $state );
}

function signed_request( string $client_id, string $key, array $body, ?int $timestamp = null, ?string $raw_body = null ): WP_REST_Request {
	$raw = $raw_body ?? json_encode( $body );
	$ts  = (string) ( $timestamp ?? time() );
	return new WP_REST_Request(
		array(
			'X-Superlatif-Bridge-Client'    => $client_id,
			'X-Superlatif-Bridge-Timestamp' => $ts,
			'X-Superlatif-Bridge-Signature' => hash_hmac( 'sha256', "v1\n{$ts}\n{$raw}", $key ),
		),
		$raw
	);
}

/** Full server-side path: permission callback, then the handler. */
function exchange( WP_REST_Request $request ) {
	$permitted = superlatif_bridge_rest_authenticate_client( $request );
	if ( true !== $permitted ) {
		return $permitted;
	}
	return superlatif_bridge_rest_exchange( $request );
}

function error_code( $result ): string {
	return $result instanceof WP_Error ? $result->get_error_code() : 'none';
}

function error_status( $result ): int {
	return $result instanceof WP_Error ? (int) $result->get_error_data()['status'] : 0;
}

// ---------------------------------------------------------------- protocol

$vectors = json_decode( (string) file_get_contents( __DIR__ . '/vectors.json' ), true );
check(
	'request signature matches the shared cross-language vector',
	superlatif_bridge_sign( $vectors['hmacKey'], superlatif_bridge_request_signing_input( $vectors['request']['timestamp'], $vectors['request']['body'] ) ) === $vectors['request']['signature']
);
check(
	'response signature matches the shared cross-language vector',
	superlatif_bridge_sign( $vectors['hmacKey'], superlatif_bridge_response_signing_input( $vectors['response']['timestamp'], $vectors['response']['claims'] ) ) === $vectors['response']['signature']
);
check( 'vector code and state are well-formed tokens', superlatif_bridge_is_token( $vectors['code'] ) && superlatif_bridge_is_token( $vectors['state'] ) );

$token_a = superlatif_bridge_new_token();
$token_b = superlatif_bridge_new_token();
check( 'new tokens are 43-char base64url', superlatif_bridge_is_token( $token_a ) );
check( 'new tokens are unique', $token_a !== $token_b );
check( 'token check rejects padding and wrong length', ! superlatif_bridge_is_token( $token_a . '=' ) && ! superlatif_bridge_is_token( substr( $token_a, 1 ) ) && ! superlatif_bridge_is_token( 42 ) );
check( 'signature check rejects non-hex and uppercase', ! superlatif_bridge_signature_matches( 'k', 'i', 'zz' ) && ! superlatif_bridge_signature_matches( 'k', 'i', strtoupper( superlatif_bridge_sign( 'k', 'i' ) ) ) );
check( 'timestamp within 300s is fresh', superlatif_bridge_timestamp_is_fresh( (string) ( time() - 300 ), time() ) );
check( 'timestamp beyond 300s is stale', ! superlatif_bridge_timestamp_is_fresh( (string) ( time() - 301 ), time() ) && ! superlatif_bridge_timestamp_is_fresh( 'abc', time() ) && ! superlatif_bridge_timestamp_is_fresh( null, time() ) );

// ---------------------------------------------------------------- config

$clients = superlatif_bridge_clients();
check( 'valid clients are loaded', isset( $clients['superlatif-web-staging'], $clients['superlatif-web-production'] ) );
check( 'a client with a short secret is ignored', ! isset( $clients['short-secret'] ) );
check( 'a hosted client with an http redirect is ignored', ! isset( $clients['plain-http'] ) );
check( 'a local development client may use http://localhost', null === superlatif_bridge_client_problem( 'local-dev', array( 'secret' => STAGING_KEY, 'redirect_uri' => 'http://localhost:3000/auth/bridge/callback', 'environment' => 'development' ) ) );
check( 'a redirect_uri with a query string is rejected', null !== superlatif_bridge_client_problem( 'x-client', array( 'secret' => STAGING_KEY, 'redirect_uri' => 'https://app.test/cb?next=//evil', 'environment' => 'staging' ) ) );
check( 'configured app hosts become allowed redirect hosts', in_array( 'app.test', superlatif_bridge_allowed_redirect_hosts( array() ), true ) );

// ---------------------------------------------------------------- authorize

reset_state();
$_GET = array(
	'client_id' => 'superlatif-web-production',
	'state'     => new_state(),
);
superlatif_bridge_handle_authorize();
check( 'logged out: sent to the WordPress login page, returning to authorize', 0 === strpos( (string) $GLOBALS['sab_redirect'], 'https://wp.test/wp-login.php?redirect_to=' ) && false !== strpos( rawurldecode( (string) $GLOBALS['sab_redirect'] ), 'superlatif_bridge=authorize' ) );
check( 'logged out: no code issued', array() === $GLOBALS['wpdb']->rows );

reset_state();
$GLOBALS['sab_user_id'] = 4821;
$_GET = array(
	'client_id' => 'unknown-client',
	'state'     => new_state(),
);
$status = 0;
try {
	superlatif_bridge_handle_authorize();
} catch ( Sab_Die $e ) {
	$status = $e->status;
}
check( 'unknown client: generic 400, no code', 400 === $status && array() === $GLOBALS['wpdb']->rows );

reset_state();
$GLOBALS['sab_user_id'] = 4821;
$_GET = array(
	'client_id' => 'superlatif-web-production',
	'state'     => 'not-a-token',
);
$status = 0;
try {
	superlatif_bridge_handle_authorize();
} catch ( Sab_Die $e ) {
	$status = $e->status;
}
check( 'malformed state: generic 400, no code', 400 === $status && array() === $GLOBALS['wpdb']->rows );

reset_state();
$GLOBALS['sab_can_read'] = false;
$status                  = 0;
try {
	authorize_as( 4821, 'superlatif-web-production' );
} catch ( Sab_Die $e ) {
	$status = $e->status;
}
check( 'user without the read capability: 403, no code', 403 === $status && array() === $GLOBALS['wpdb']->rows );

reset_state();
list( $code, $state ) = authorize_as( 4821, 'superlatif-web-production' );
$stored               = array_values( $GLOBALS['wpdb']->rows );
check( 'logged in: redirected to the CONFIGURED app callback only', 0 === strpos( (string) $GLOBALS['sab_redirect'], 'https://app.test/auth/bridge/callback?code=' ) );
check( 'logged in: a well-formed code and the same state come back', superlatif_bridge_is_token( $code ) && false !== strpos( (string) $GLOBALS['sab_redirect'], 'state=' . $state ) );
check( 'only the code HASH is stored, never the code', 1 === count( $stored ) && $stored[0]['code_hash'] === hash( 'sha256', $code ) && false === strpos( json_encode( $stored ), $code ) );
check( 'state is stored hashed, bound to client and user', $stored[0]['state_hash'] === hash( 'sha256', $state ) && 'superlatif-web-production' === $stored[0]['client_id'] && 4821 === $stored[0]['wp_user_id'] );
check( 'code expiry is short (120s)', SUPERLATIF_BRIDGE_CODE_TTL === $stored[0]['expires_at'] - $stored[0]['created_at'] );
check( 'no profile data stored', array( 'code_hash', 'client_id', 'wp_user_id', 'state_hash', 'created_at', 'expires_at', 'used_at' ) === array_keys( $stored[0] ) );

// ---------------------------------------------------------------- exchange

reset_state();
list( $code, $state ) = authorize_as( 4821, 'superlatif-web-production' );
$body                 = array(
	'code'        => $code,
	'state'       => $state,
	'environment' => 'production',
);
$result = exchange( signed_request( 'superlatif-web-production', PRODUCTION_KEY, $body ) );
check( 'valid exchange returns 200', $result instanceof WP_REST_Response && 200 === $result->get_status() );
$claims = $result instanceof WP_REST_Response ? $result->get_data() : array();
check(
	'response carries ONLY version/subject/audience/environment',
	array(
		'version'     => 1,
		'subject'     => '4821',
		'audience'    => 'superlatif-web-production',
		'environment' => 'production',
	) === $claims
);
$headers = $result instanceof WP_REST_Response ? $result->get_headers() : array();
check(
	'response is signed over the canonical claims',
	isset( $headers['X-Superlatif-Bridge-Signature'] )
		&& hash_equals( hash_hmac( 'sha256', superlatif_bridge_response_signing_input( $headers['X-Superlatif-Bridge-Timestamp'], $claims ), PRODUCTION_KEY ), $headers['X-Superlatif-Bridge-Signature'] )
);
check( 'response is not cacheable', 'no-store' === ( $headers['Cache-Control'] ?? '' ) );
check( 'response never contains the client secret', false === strpos( json_encode( array( $claims, $headers ) ), PRODUCTION_KEY ) );

$replay = exchange( signed_request( 'superlatif-web-production', PRODUCTION_KEY, $body ) );
check( 'replayed code: invalid_grant (400)', 'invalid_grant' === error_code( $replay ) && 400 === error_status( $replay ) );

reset_state();
list( $code, $state ) = authorize_as( 4821, 'superlatif-web-production' );
$result = exchange(
	signed_request(
		'superlatif-web-production',
		PRODUCTION_KEY,
		array(
			'code'        => $code,
			'state'       => new_state(),
			'environment' => 'production',
		)
	)
);
check( 'wrong state: invalid_grant', 'invalid_grant' === error_code( $result ) );
$retry = exchange(
	signed_request(
		'superlatif-web-production',
		PRODUCTION_KEY,
		array(
			'code'        => $code,
			'state'       => $state,
			'environment' => 'production',
		)
	)
);
check( 'a code presented with the wrong state is burned, even for the right state afterwards', 'invalid_grant' === error_code( $retry ) );

reset_state();
list( $code, $state ) = authorize_as( 4821, 'superlatif-web-production' );
$hash                                         = hash( 'sha256', $code );
$GLOBALS['wpdb']->rows[ $hash ]['expires_at'] = time() - 1;
$result                                       = exchange(
	signed_request(
		'superlatif-web-production',
		PRODUCTION_KEY,
		array(
			'code'        => $code,
			'state'       => $state,
			'environment' => 'production',
		)
	)
);
check( 'expired code: invalid_grant', 'invalid_grant' === error_code( $result ) );

reset_state();
$result = exchange(
	signed_request(
		'superlatif-web-production',
		PRODUCTION_KEY,
		array(
			'code'        => superlatif_bridge_new_token(),
			'state'       => new_state(),
			'environment' => 'production',
		)
	)
);
check( 'unknown code: invalid_grant', 'invalid_grant' === error_code( $result ) );

reset_state();
list( $code, $state ) = authorize_as( 4821, 'superlatif-web-production' );
$result = exchange(
	signed_request(
		'superlatif-web-staging',
		STAGING_KEY,
		array(
			'code'        => $code,
			'state'       => $state,
			'environment' => 'staging',
		)
	)
);
check( 'a production code redeemed by the STAGING client: invalid_grant (audience binding)', 'invalid_grant' === error_code( $result ) );

reset_state();
list( $code, $state ) = authorize_as( 4821, 'superlatif-web-production' );
$result = exchange(
	signed_request(
		'superlatif-web-production',
		PRODUCTION_KEY,
		array(
			'code'        => $code,
			'state'       => $state,
			'environment' => 'staging',
		)
	)
);
check( 'environment mismatch: invalid_request, code NOT burned', 'invalid_request' === error_code( $result ) && null === $GLOBALS['wpdb']->rows[ hash( 'sha256', $code ) ]['used_at'] );

reset_state();
list( $code, $state ) = authorize_as( 4821, 'superlatif-web-production' );
$body   = array(
	'code'        => $code,
	'state'       => $state,
	'environment' => 'production',
);
$result = exchange( signed_request( 'superlatif-web-production', STAGING_KEY, $body ) );
check( 'wrong client secret: invalid_client (401), code NOT burned', 'invalid_client' === error_code( $result ) && 401 === error_status( $result ) && null === $GLOBALS['wpdb']->rows[ hash( 'sha256', $code ) ]['used_at'] );
$result = exchange( signed_request( 'superlatif-web-production', PRODUCTION_KEY, $body, time() - 301 ) );
check( 'stale request timestamp: invalid_client', 'invalid_client' === error_code( $result ) );
$result = exchange( signed_request( 'unknown-client', PRODUCTION_KEY, $body ) );
check( 'unknown client id: invalid_client', 'invalid_client' === error_code( $result ) );
$tampered = signed_request( 'superlatif-web-production', PRODUCTION_KEY, $body );
$forged   = new WP_REST_Request(
	array(
		'X-Superlatif-Bridge-Client'    => 'superlatif-web-production',
		'X-Superlatif-Bridge-Timestamp' => $tampered->get_header( 'x-superlatif-bridge-timestamp' ),
		'X-Superlatif-Bridge-Signature' => $tampered->get_header( 'x-superlatif-bridge-signature' ),
	),
	json_encode( array( 'code' => superlatif_bridge_new_token() ) + $body )
);
check( 'body changed after signing: invalid_client', 'invalid_client' === error_code( exchange( $forged ) ) );

$result = exchange( signed_request( 'superlatif-web-production', PRODUCTION_KEY, array(), null, '{not json' ) );
check( 'malformed JSON body: invalid_request', 'invalid_request' === error_code( $result ) );

reset_state();
list( $code, $state ) = authorize_as( 4821, 'superlatif-web-production' );
unset( $GLOBALS['sab_users'][4821] );
$result = exchange(
	signed_request(
		'superlatif-web-production',
		PRODUCTION_KEY,
		array(
			'code'        => $code,
			'state'       => $state,
			'environment' => 'production',
		)
	)
);
$GLOBALS['sab_users'][4821] = true;
check( 'account deleted between issue and exchange: invalid_grant', 'invalid_grant' === error_code( $result ) );

// ------------------------------------------- front-end authorize (ADR-073)

/** Reset yang juga mengosongkan header/cookie hasil seam pengujian. */
function reset_front_end(): void {
	reset_state();
	$GLOBALS['superlatif_bridge_test_headers'] = array();
	$GLOBALS['superlatif_bridge_test_cookies'] = array();
	$GLOBALS['sab_actions']                    = array();
	$_COOKIE                                   = array();
}

function emitted_headers(): string {
	return implode( "\n", $GLOBALS['superlatif_bridge_test_headers'] ?? array() );
}

function front_end_request( string $client_id, string $state ): void {
	$_GET = array(
		SUPERLATIF_BRIDGE_QUERY_VAR => SUPERLATIF_BRIDGE_AUTHORIZE_REQUEST,
		'client_id'                 => $client_id,
		'state'                     => $state,
	);
	superlatif_bridge_maybe_handle_authorize_request();
}

reset_front_end();
$state = new_state();
front_end_request( 'superlatif-web-production', $state );
$redirect = (string) $GLOBALS['sab_redirect'];
check( 'front-end + logout: diarahkan ke halaman login WordPress', 0 === strpos( $redirect, 'https://wp.test/wp-login.php?redirect_to=' ) );
check(
	'front-end + logout: return URL menunjuk entry point FRONT-END, bukan admin-post',
	false !== strpos( rawurldecode( $redirect ), 'superlatif_bridge=authorize' )
		&& false === strpos( rawurldecode( $redirect ), 'admin-post.php' )
);
check( 'front-end + logout: belum ada kode diterbitkan', array() === $GLOBALS['wpdb']->rows );

$pending_cookie = $GLOBALS['superlatif_bridge_test_cookies'][0]['value'] ?? '';
$pending_expiry = $GLOBALS['superlatif_bridge_test_cookies'][0]['expires'] ?? 0;
check( 'pending cookie dipasang dengan 4 bagian', 4 === count( explode( '.', $pending_cookie ) ) );
check( 'pending cookie TTL maksimal 10 menit', $pending_expiry - time() <= SUPERLATIF_BRIDGE_PENDING_TTL && $pending_expiry > time() );
check( 'pending cookie TIDAK memuat URL', false === strpos( $pending_cookie, 'http' ) && false === strpos( $pending_cookie, '/' ) );
$parsed = superlatif_bridge_parse_pending(
	$pending_cookie,
	static function ( string $id ): ?string {
		$c = superlatif_bridge_client( $id );
		return null === $c ? null : $c['secret'];
	},
	time()
);
check( 'pending cookie terverifikasi dan memuat client_id + state saja', is_array( $parsed ) && 'superlatif-web-production' === $parsed['client_id'] && $state === $parsed['state'] );

// --- HARD GATE: respons authorize tidak boleh cacheable
$headers = emitted_headers();
check( 'anti-cache: Cache-Control no-store', false !== stripos( $headers, 'Cache-Control: no-store' ) );
check( 'anti-cache: header khusus LiteSpeed', false !== stripos( $headers, 'X-LiteSpeed-Cache-Control: no-cache, no-store' ) );
check( 'anti-cache: proxy/CDN (X-Accel-Expires + CDN-Cache-Control)', false !== stripos( $headers, 'X-Accel-Expires: 0' ) && false !== stripos( $headers, 'CDN-Cache-Control: no-store' ) );
check( 'anti-cache: Pragma + Expires + Vary: Cookie', false !== stripos( $headers, 'Pragma: no-cache' ) && false !== stripos( $headers, 'Expires: 0' ) && false !== stripos( $headers, 'Vary: Cookie' ) );
check( 'anti-cache: Referrer-Policy no-referrer', false !== stripos( $headers, 'Referrer-Policy: no-referrer' ) );
check( 'anti-cache: konstanta DONOTCACHEPAGE didefinisikan', defined( 'DONOTCACHEPAGE' ) && DONOTCACHEPAGE );
check( 'anti-cache: action litespeed_control_set_nocache dipicu', in_array( 'litespeed_control_set_nocache', $GLOBALS['sab_actions'] ?? array(), true ) );

reset_front_end();
$GLOBALS['sab_user_id'] = 4821;
$state                  = new_state();
front_end_request( 'superlatif-web-production', $state );
parse_str( (string) parse_url( (string) $GLOBALS['sab_redirect'], PHP_URL_QUERY ), $q );
check( 'front-end + login: diarahkan ke redirect_uri terkonfigurasi', 0 === strpos( (string) $GLOBALS['sab_redirect'], 'https://app.test/auth/bridge/callback?code=' ) );
check( 'front-end + login: kode sah diterbitkan', superlatif_bridge_is_token( $q['code'] ?? '' ) );
check( 'front-end + login: respons tetap tidak cacheable', false !== stripos( emitted_headers(), 'Cache-Control: no-store' ) );

reset_front_end();
$_GET = array( SUPERLATIF_BRIDGE_QUERY_VAR => 'sesuatu-yang-lain' );
superlatif_bridge_maybe_handle_authorize_request();
check( 'query var dengan nilai lain: handler tidak dijalankan', null === $GLOBALS['sab_redirect'] && array() === $GLOBALS['wpdb']->rows );

// --- pending cookie: penolakan
reset_front_end();
$now   = time();
$valid = superlatif_bridge_pending_value( STAGING_KEY, 'superlatif-web-staging', new_state(), $now );
$lookup = static function ( string $id ): ?string {
	$c = superlatif_bridge_client( $id );
	return null === $c ? null : $c['secret'];
};
check( 'pending: nilai sah diterima', null !== superlatif_bridge_parse_pending( $valid, $lookup, $now ) );
check( 'pending: HMAC diubah ditolak', null === superlatif_bridge_parse_pending( substr( $valid, 0, -1 ) . '0', $lookup, $now ) );
check( 'pending: client tidak dikenal ditolak', null === superlatif_bridge_parse_pending( str_replace( 'superlatif-web-staging', 'client-lain-lain', $valid ), $lookup, $now ) );
check( 'pending: kedaluwarsa (>10 menit) ditolak', null === superlatif_bridge_parse_pending( $valid, $lookup, $now + SUPERLATIF_BRIDGE_PENDING_TTL + 1 ) );
check( 'pending: ditandatangani kunci client LAIN ditolak', null === superlatif_bridge_parse_pending( superlatif_bridge_pending_value( PRODUCTION_KEY, 'superlatif-web-staging', new_state(), $now ), $lookup, $now ) );
check( 'pending: bentuk rusak ditolak', null === superlatif_bridge_parse_pending( 'a.b.c', $lookup, $now ) && null === superlatif_bridge_parse_pending( '', $lookup, $now ) );

// --- resume setelah login
reset_front_end();
$state                                              = new_state();
$_COOKIE[ SUPERLATIF_BRIDGE_PENDING_COOKIE ]        = superlatif_bridge_pending_value( PRODUCTION_KEY, 'superlatif-web-production', $state, time() );
$GLOBALS['sab_user_id']                             = 4821;
superlatif_bridge_resume_after_login();
$resume = (string) $GLOBALS['sab_redirect'];
check( 'resume: kembali ke authorize front-end yang dibangun ulang server-side', false !== strpos( $resume, 'superlatif_bridge=authorize' ) && 0 === strpos( $resume, 'https://wp.test/' ) );
check( 'resume: state yang sama dibawa kembali', false !== strpos( rawurldecode( $resume ), $state ) );
check( 'resume: cookie dihapus (sekali pakai)', ! isset( $_COOKIE[ SUPERLATIF_BRIDGE_PENDING_COOKIE ] ) );

$GLOBALS['sab_redirect'] = null;
superlatif_bridge_resume_after_login();
check( 'resume kedua tanpa cookie: tidak ada redirect (tidak bisa diulang)', null === $GLOBALS['sab_redirect'] );

reset_front_end();
$GLOBALS['sab_user_id'] = 4821;
superlatif_bridge_resume_after_login();
check( 'LOGIN NORMAL (tanpa cookie bridge): tidak diarahkan ke mana pun', null === $GLOBALS['sab_redirect'] );

reset_front_end();
$GLOBALS['sab_user_id']                      = 4821;
$_COOKIE[ SUPERLATIF_BRIDGE_PENDING_COOKIE ] = 'jelas-tidak-sah';
superlatif_bridge_resume_after_login();
check( 'resume dengan cookie tidak sah: tidak ada redirect, cookie tetap dibuang', null === $GLOBALS['sab_redirect'] && ! isset( $_COOKIE[ SUPERLATIF_BRIDGE_PENDING_COOKIE ] ) );

// --- entry point lama tetap dilayani (backward compatibility / rollback)
reset_front_end();
list( $legacy_code, $legacy_state ) = authorize_as( 4821, 'superlatif-web-production' );
check( 'legacy admin-post masih menerbitkan kode', superlatif_bridge_is_token( $legacy_code ) );


// ---------------------------------------------------------------- commerce events (M2, ADR-074)

$code_store      = $GLOBALS['wpdb'];
$GLOBALS['wpdb'] = new Sab_Commerce_Wpdb();

$commerce_clients = superlatif_bridge_commerce_clients();
check( 'commerce: only the client with a valid webhook secret delivers', array( 'superlatif-web-staging' ) === array_keys( $commerce_clients ) );
check( 'commerce: a short webhook secret disables delivery but keeps sign-in', isset( $clients['webhook-short'] ) && null === $clients['webhook-short']['webhook_secret'] );
check( 'commerce: reusing the sign-in secret for webhooks is refused', isset( $clients['webhook-reused'] ) && null === $clients['webhook-reused']['webhook_secret'] );
check( 'commerce: a production client may not carry a Vercel bypass', isset( $clients['prod-with-bypass'] ) && null === $clients['prod-with-bypass']['webhook_secret'] );

check( 'commerce: completed is the only settled payment', 'payment_settled' === superlatif_bridge_commerce_event_type( 'completed' ) );
check(
	'commerce: unverified / fulfilment states stay pending',
	array( 'order_pending', 'order_pending', 'order_pending', 'order_pending' ) === array_map( 'superlatif_bridge_commerce_event_type', array( 'on-hold', 'payment-confirm', 'in-progress', 'shipping' ) )
);
check( 'commerce: refunded and cancelled map to their wire types', 'refund_full' === superlatif_bridge_commerce_event_type( 'refunded' ) && 'order_cancelled' === superlatif_bridge_commerce_event_type( 'cancelled' ) );
check( 'commerce: an unknown status is never sent', null === superlatif_bridge_commerce_event_type( 'waiting-approval' ) && null === superlatif_bridge_commerce_event_type( '' ) );

$sejoli_order = array(
	'ID'              => '9526',
	'product_id'      => '9001',
	'user_id'         => '5638',
	'grand_total'     => '149000.00',
	'status'          => 'completed',
	'quantity'        => '1',
	'type'            => 'regular',
	'order_parent_id' => '0',
	'user_email'      => 'student@example.com',
	'user_name'       => 'Siswa Contoh',
	'meta_data'       => array( 'coupon' => array( 'code' => 'HEMAT' ), 'affiliate' => 12 ),
);
$event = superlatif_bridge_commerce_build_event( $sejoli_order, 'evt-1', 1767225600 );
check( 'commerce: a completed order builds a payment_settled event', is_array( $event ) && 'payment_settled' === $event['eventType'] );
check(
	'commerce: body has exactly the contract keys',
	array( 'schemaVersion', 'eventId', 'eventType', 'occurredAt', 'order', 'customer', 'amounts', 'rawPayloadChecksum' ) === array_keys( $event )
		&& array( 'externalOrderId', 'externalSkuId', 'externalUserId' ) === array_keys( $event['order'] )
);
check( 'commerce: IDs travel as decimal strings', '9526' === $event['order']['externalOrderId'] && '9001' === $event['order']['externalSkuId'] && '5638' === $event['order']['externalUserId'] );
check( 'commerce: amount is whole rupiah', 149000 === $event['amounts']['grossMinor'] && 149000 === $event['amounts']['netSettledMinor'] && 0 === $event['amounts']['refundedMinor'] );
check( 'commerce: occurredAt is UTC RFC 3339', '2026-01-01T00:00:00Z' === $event['occurredAt'] );
$encoded = superlatif_bridge_commerce_encode( $event );
check( 'commerce: no email, name, coupon, or affiliate data leaves WordPress', false === strpos( $encoded, 'example.com' ) && false === strpos( $encoded, 'Siswa' ) && false === strpos( $encoded, 'HEMAT' ) && false === strpos( $encoded, 'affiliate' ) );
check( 'commerce: customer hashes are never populated', null === $event['customer']['emailHash'] && null === $event['customer']['phoneHash'] );
check( 'commerce: checksum is a sha256 hex digest', 1 === preg_match( '/^[a-f0-9]{64}$/', $event['rawPayloadChecksum'] ) );

$refund = superlatif_bridge_commerce_build_event( array_merge( $sejoli_order, array( 'status' => 'refunded' ) ), 'evt-2', 1767225600 );
check( 'commerce: a refund reports the refunded amount', 'refund_full' === $refund['eventType'] && 149000 === $refund['amounts']['refundedMinor'] );
$guest = superlatif_bridge_commerce_build_event( array_merge( $sejoli_order, array( 'user_id' => '0' ) ), 'evt-3', 1767225600 );
check( 'commerce: a guest order carries a null buyer', null === $guest['order']['externalUserId'] );
check( 'commerce: an order object is accepted too', is_array( superlatif_bridge_commerce_build_event( (object) $sejoli_order, 'evt-4', 1767225600 ) ) );
check( 'commerce: no product means no event', null === superlatif_bridge_commerce_build_event( array_merge( $sejoli_order, array( 'product_id' => '' ) ), 'evt-5', 1 ) );
check( 'commerce: an unknown status means no event', null === superlatif_bridge_commerce_build_event( array_merge( $sejoli_order, array( 'status' => 'waiting-approval' ) ), 'evt-6', 1 ) );
check( 'commerce: garbage means no event', null === superlatif_bridge_commerce_build_event( 'not an order', 'evt-7', 1 ) );

// Same bytes, same signature as the TypeScript side (shared vector).
$cv = $vectors['commerce'];
check(
	'commerce vector: signing input and signature match the app',
	superlatif_bridge_sign( $vectors['hmacKey'], superlatif_bridge_commerce_signing_input( $cv['keyId'], $cv['timestamp'], $cv['eventId'], $cv['body'] ) ) === $cv['signature']
);

$staging_client = $commerce_clients['superlatif-web-staging'];
$headers        = superlatif_bridge_commerce_headers( 'superlatif-web-staging', $staging_client, 'evt-1', $encoded, 1767225600 );
check(
	'commerce: delivery headers carry event ID, timestamp, key ID and a verifiable signature',
	'evt-1' === $headers['X-Provider-Event-ID'] && '1767225600' === $headers['X-Superlatif-Timestamp'] && 'superlatif-web-staging' === $headers['X-Superlatif-Key-ID']
		&& superlatif_bridge_signature_matches( WEBHOOK_KEY, superlatif_bridge_commerce_signing_input( 'superlatif-web-staging', '1767225600', 'evt-1', $encoded ), $headers['X-Superlatif-Signature'] )
);
check( 'commerce: the sign-in secret does NOT verify a webhook signature', ! superlatif_bridge_signature_matches( STAGING_KEY, superlatif_bridge_commerce_signing_input( 'superlatif-web-staging', '1767225600', 'evt-1', $encoded ), $headers['X-Superlatif-Signature'] ) );
check( 'commerce: the staging bypass header is sent only when configured', BYPASS_VALUE === $headers['x-vercel-protection-bypass'] );
check( 'commerce: webhook URL is the app origin plus the fixed path', 'https://staging-app.test/api/v1/integrations/commerce/sejoli_bridge/events' === superlatif_bridge_commerce_url( $staging_client ) );

check( 'retry: 2xx is delivered', 'delivered' === superlatif_bridge_commerce_next( 202, 1 )['state'] );
check( 'retry: 400/413/415/422 are dead at once', 'dead' === superlatif_bridge_commerce_next( 400, 1 )['state'] && 'dead' === superlatif_bridge_commerce_next( 415, 1 )['state'] );
check( 'retry: a transport failure retries after 60 s', array( 'state' => 'pending', 'delay' => 60 ) === superlatif_bridge_commerce_next( 0, 1 ) );
check( 'retry: 503 / 404 / 401 keep retrying with backoff', 300 === superlatif_bridge_commerce_next( 503, 2 )['delay'] && 'pending' === superlatif_bridge_commerce_next( 404, 3 )['state'] && 'pending' === superlatif_bridge_commerce_next( 401, 4 )['state'] );
check( 'retry: gives up after the last backoff step', 'pending' === superlatif_bridge_commerce_next( 503, 7 )['state'] && 'dead' === superlatif_bridge_commerce_next( 503, 8 )['state'] );

// Hook -> outbox -> delivery, with the transport faked.
$GLOBALS['sab_hooks'] = array();
superlatif_bridge_commerce_on_order_status( $sejoli_order );
$outbox = array_values( $GLOBALS['wpdb']->rows );
check( 'hook: one event queued, for the webhook client only', 1 === count( $outbox ) && 'superlatif-web-staging' === $outbox[0]['client_id'] && 'pending' === $outbox[0]['status'] );
check( 'hook: a delivery is scheduled for the end of the request', has_action( 'shutdown', 'superlatif_bridge_commerce_deliver_now' ) );
$queued_id   = $outbox[0]['event_id'];
$queued_body = $outbox[0]['body'];
check( 'hook: the event ID is a UUID fixed at enqueue time', 1 === preg_match( '/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/', $queued_id ) && false !== strpos( $queued_body, $queued_id ) );

$sent   = array();
$answer = 0;
$fake   = static function ( string $url, array $headers, string $body ) use ( &$sent, &$answer ): int {
	$sent[] = array( $url, $headers, $body );
	return $answer;
};
$t0 = time();
$summary = superlatif_bridge_commerce_deliver_due( $t0, $fake );
$row     = array_values( $GLOBALS['wpdb']->rows )[0];
check( 'delivery: a transport failure leaves the event pending for 60 s', array( 'delivered' => 0, 'pending' => 1, 'dead' => 0 ) === $summary && 1 === (int) $row['attempts'] && $t0 + 60 === (int) $row['next_attempt_at'] );
superlatif_bridge_commerce_deliver_due( $t0 + 30, $fake );
check( 'delivery: nothing is re-sent before it is due', 1 === count( $sent ) );
$answer  = 202;
$summary = superlatif_bridge_commerce_deliver_due( $t0 + 61, $fake );
$row     = array_values( $GLOBALS['wpdb']->rows )[0];
check( 'delivery: the retry is delivered and recorded', 1 === $summary['delivered'] && 'delivered' === $row['status'] && 2 === (int) $row['attempts'] && 202 === (int) $row['last_http_status'] );
check( 'delivery: the retry reuses the SAME event ID and the SAME body bytes', $sent[0][1]['X-Provider-Event-ID'] === $queued_id && $sent[1][1]['X-Provider-Event-ID'] === $queued_id && $sent[0][2] === $queued_body && $sent[1][2] === $queued_body );
check( 'delivery: each attempt is signed with its own timestamp', $sent[0][1]['X-Superlatif-Timestamp'] !== $sent[1][1]['X-Superlatif-Timestamp'] );
check(
	'delivery: every attempt verifies with the webhook secret',
	superlatif_bridge_signature_matches( WEBHOOK_KEY, superlatif_bridge_commerce_signing_input( 'superlatif-web-staging', $sent[1][1]['X-Superlatif-Timestamp'], $queued_id, $queued_body ), $sent[1][1]['X-Superlatif-Signature'] )
);
superlatif_bridge_commerce_deliver_due( $t0 + 10000, $fake );
check( 'delivery: a delivered event is never sent again', 2 === count( $sent ) );

superlatif_bridge_commerce_on_order_status( array_merge( $sejoli_order, array( 'status' => 'refunded' ) ) );
$answer = 400;
superlatif_bridge_commerce_deliver_due( $t0 + 10001, $fake );
$dead = array_values( array_filter( $GLOBALS['wpdb']->rows, static function ( $r ) { return 'refund_full' === $r['event_type']; } ) )[0];
check( 'delivery: a 400 is dead at once and kept for a human', 'dead' === $dead['status'] && 400 === (int) $dead['last_http_status'] );

superlatif_bridge_commerce_on_order_status( array_merge( $sejoli_order, array( 'status' => 'cancelled' ) ) );
add_option( 'superlatif_bridge_commerce_lock', (string) ( $t0 + 20000 ), '', false );
$before  = count( $sent );
superlatif_bridge_commerce_deliver_due( $t0 + 20001, $fake );
check( 'delivery: a concurrent run holding the lock is not duplicated', count( $sent ) === $before );
superlatif_bridge_commerce_deliver_due( $t0 + 20200, $fake );
check( 'delivery: a stale lock (> 120 s) is taken over', count( $sent ) === $before + 1 && ! isset( $GLOBALS['sab_options']['superlatif_bridge_commerce_lock'] ) );

$GLOBALS['sab_hooks'] = array();
superlatif_bridge_commerce_register_hooks();
check(
	'hooks: every mapped Sejoli status hook, and nothing else from Sejoli, is listened to',
	array_map( static function ( $s ) { return 'sejoli/order/set-status/' . $s; }, array_keys( SUPERLATIF_BRIDGE_SEJOLI_EVENT_TYPES ) )
		=== array_values( array_filter( array_keys( $GLOBALS['sab_hooks'] ), static function ( $h ) { return 0 === strpos( $h, 'sejoli/' ); } ) )
);

$GLOBALS['wpdb'] = $code_store;

// ---------------------------------------------------------------- housekeeping

reset_state();
$GLOBALS['wpdb']->rows['old'] = array(
	'code_hash'  => 'old',
	'client_id'  => 'x',
	'wp_user_id' => 1,
	'state_hash' => 's',
	'created_at' => 0,
	'expires_at' => time() - SUPERLATIF_BRIDGE_RETENTION_SECONDS - 10,
	'used_at'    => null,
);
authorize_as( 4821, 'superlatif-web-production' );
check( 'issuing a code purges rows past the retention window', ! isset( $GLOBALS['wpdb']->rows['old'] ) && 1 === count( $GLOBALS['wpdb']->rows ) );

superlatif_bridge_register_routes();
$route = $GLOBALS['sab_routes']['superlatif-bridge/v1/exchange'] ?? array();
check( 'exchange route is POST-only with a real permission callback', 'POST' === ( $route['methods'] ?? '' ) && 'superlatif_bridge_rest_authenticate_client' === ( $route['permission_callback'] ?? '' ) );

fwrite( STDOUT, "\n{$sab_results['pass']} passed, {$sab_results['fail']} failed\n" );
exit( $sab_results['fail'] > 0 ? 1 : 0 );
