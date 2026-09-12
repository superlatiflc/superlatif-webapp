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

define(
	'SUPERLATIF_BRIDGE_CLIENTS',
	array(
		'superlatif-web-staging'    => array(
			'secret'       => STAGING_KEY,
			'redirect_uri' => 'https://staging-app.test/auth/bridge/callback',
			'environment'  => 'staging',
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

require_once __DIR__ . '/../includes/protocol.php';
require_once __DIR__ . '/../includes/config.php';
require_once __DIR__ . '/../includes/code-store.php';
require_once __DIR__ . '/../includes/authorize.php';
require_once __DIR__ . '/../includes/exchange.php';

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
