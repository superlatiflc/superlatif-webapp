<?php
/**
 * Browser step: issue a code for the logged-in WordPress user.
 *
 * PRIMARY entry point (ADR-073), a plain front-end URL:
 *   GET /?superlatif_bridge=authorize&client_id=...&state=...
 *
 * LEGACY entry point, kept only for backward compatibility and rollback:
 *   GET /wp-admin/admin-post.php?action=superlatif_bridge_authorize&...
 *
 * Why the move: a membership plugin (Sejoli on superlatif.id) guards every
 * /wp-admin/* request on `admin_init`, and admin-post.php fires `admin_init`
 * BEFORE any `admin_post_*` handler, so the request was redirected to the
 * member area before this plugin ran at all. The front end is not guarded.
 *
 * Logged out: sent through WordPress's own login (and its own lost-password
 * flow), then straight back here. Logged in: a single-use code bound to the
 * client, the user, and the app's state is issued, and the browser is
 * redirected to that client's CONFIGURED redirect_uri - never to a URL taken
 * from the request, so a crafted link cannot send a code anywhere else.
 *
 * CACHING IS A SECURITY BOUNDARY HERE. The old entry point lived under
 * /wp-admin/, which no page cache ever stores. A front-end URL does pass
 * through LiteSpeed/CDN caching, and this response carries a single-use code
 * in its Location header: a cached copy would hand one learner's code to the
 * next visitor. Every authorize response therefore goes out uncacheable by
 * several independent mechanisms (see superlatif_bridge_no_cache), and
 * README.md documents the LiteSpeed exclusion to configure as well. The
 * state binding is NOT the mitigation for this - it is a second line only.
 *
 * Why no WordPress nonce: the request is started by the app, which cannot
 * hold a WordPress nonce. It does not need one - a forged request can only
 * make a victim's own browser carry a code for the victim's own account to
 * the fixed app callback, where it is rejected because the victim's browser
 * does not hold the matching state cookie.
 *
 * @package SuperlatifAppBridge
 */

defined( 'ABSPATH' ) || exit;

/** Seam so the test harness can observe headers without a live SAPI. */
function superlatif_bridge_emit_header( string $header ): void {
	if ( defined( 'SUPERLATIF_BRIDGE_TESTING' ) && SUPERLATIF_BRIDGE_TESTING ) {
		$GLOBALS['superlatif_bridge_test_headers'][] = $header;
		return;
	}
	header( $header, true );
}

/**
 * Makes this response uncacheable by every layer we know of: WordPress page
 * caches read the DONOTCACHE* constants, LiteSpeed reads its own header and
 * action, nginx/proxies read X-Accel-Expires and CDN-Cache-Control, and
 * browsers read Cache-Control/Pragma/Expires.
 */
function superlatif_bridge_no_cache(): void {
	foreach ( array( 'DONOTCACHEPAGE', 'DONOTCACHEOBJECT', 'DONOTCACHEDB' ) as $constant ) {
		if ( ! defined( $constant ) ) {
			define( $constant, true );
		}
	}
	if ( function_exists( 'nocache_headers' ) ) {
		nocache_headers();
	}
	superlatif_bridge_emit_header( 'Cache-Control: no-store, no-cache, must-revalidate, max-age=0, private' );
	superlatif_bridge_emit_header( 'Pragma: no-cache' );
	superlatif_bridge_emit_header( 'Expires: 0' );
	superlatif_bridge_emit_header( 'X-LiteSpeed-Cache-Control: no-cache, no-store' );
	superlatif_bridge_emit_header( 'X-Accel-Expires: 0' );
	superlatif_bridge_emit_header( 'CDN-Cache-Control: no-store' );
	superlatif_bridge_emit_header( 'Vary: Cookie' );
	superlatif_bridge_emit_header( 'Referrer-Policy: no-referrer' );
	if ( function_exists( 'do_action' ) ) {
		do_action( 'litespeed_control_set_nocache', 'superlatif app bridge authorize' );
	}
}

/** The canonical front-end authorize URL for this site. Always built server-side. */
function superlatif_bridge_authorize_url( string $client_id, string $state ): string {
	return add_query_arg(
		array(
			SUPERLATIF_BRIDGE_QUERY_VAR => SUPERLATIF_BRIDGE_AUTHORIZE_REQUEST,
			'client_id'                 => rawurlencode( $client_id ),
			'state'                     => rawurlencode( $state ),
		),
		home_url( '/' )
	);
}

/** Runs on every front-end request; returns immediately unless this is an authorize call. */
function superlatif_bridge_maybe_handle_authorize_request(): void {
	// phpcs:disable WordPress.Security.NonceVerification.Recommended -- see file header.
	if ( ! isset( $_GET[ SUPERLATIF_BRIDGE_QUERY_VAR ] ) ) {
		return;
	}
	$request = sanitize_text_field( wp_unslash( $_GET[ SUPERLATIF_BRIDGE_QUERY_VAR ] ) );
	// phpcs:enable
	if ( SUPERLATIF_BRIDGE_AUTHORIZE_REQUEST !== $request ) {
		return;
	}
	superlatif_bridge_handle_authorize();
}

function superlatif_bridge_handle_authorize(): void {
	superlatif_bridge_no_cache();

	// phpcs:disable WordPress.Security.NonceVerification.Recommended -- see file header.
	$client_id = isset( $_GET['client_id'] ) ? sanitize_text_field( wp_unslash( $_GET['client_id'] ) ) : '';
	$state     = isset( $_GET['state'] ) ? sanitize_text_field( wp_unslash( $_GET['state'] ) ) : '';
	// phpcs:enable

	$client = superlatif_bridge_client( $client_id );
	if ( null === $client || ! superlatif_bridge_is_token( $state ) ) {
		superlatif_bridge_fail( 400 );
		return;
	}

	if ( ! is_user_logged_in() ) {
		// Remember the flow across the login detour. Sejoli replaces the login
		// URL with its member area and drops the query string, so redirect_to
		// alone is not reliable; the cookie is what survives. Both are sent.
		superlatif_bridge_remember_pending( $client['secret'], $client_id, $state );
		wp_safe_redirect( wp_login_url( superlatif_bridge_authorize_url( $client_id, $state ) ) );
		superlatif_bridge_exit();
		return;
	}

	if ( ! current_user_can( 'read' ) ) {
		superlatif_bridge_fail( 403 );
		return;
	}

	$code = superlatif_bridge_issue_code( $client_id, get_current_user_id(), $state, time() );
	if ( null === $code ) {
		superlatif_bridge_fail( 503 );
		return;
	}

	$target = add_query_arg(
		array(
			'code'  => rawurlencode( $code ),
			'state' => rawurlencode( $state ),
		),
		$client['redirect_uri']
	);
	wp_safe_redirect( $target, 302, 'Superlatif App Bridge' );
	superlatif_bridge_exit();
}

/** Seam so the test harness can observe cookies without a live SAPI. */
function superlatif_bridge_set_cookie( string $value, int $expires ): void {
	if ( defined( 'SUPERLATIF_BRIDGE_TESTING' ) && SUPERLATIF_BRIDGE_TESTING ) {
		$GLOBALS['superlatif_bridge_test_cookies'][] = array(
			'value'   => $value,
			'expires' => $expires,
		);
		if ( '' === $value ) {
			unset( $_COOKIE[ SUPERLATIF_BRIDGE_PENDING_COOKIE ] );
		} else {
			$_COOKIE[ SUPERLATIF_BRIDGE_PENDING_COOKIE ] = $value;
		}
		return;
	}
	if ( headers_sent() ) {
		return;
	}
	setcookie(
		SUPERLATIF_BRIDGE_PENDING_COOKIE,
		$value,
		array(
			'expires'  => $expires,
			'path'     => '/',
			'secure'   => is_ssl(),
			'httponly' => true,
			'samesite' => 'Lax',
		)
	);
}

function superlatif_bridge_remember_pending( string $secret, string $client_id, string $state ): void {
	$now = time();
	superlatif_bridge_set_cookie(
		superlatif_bridge_pending_value( $secret, $client_id, $state, $now ),
		$now + SUPERLATIF_BRIDGE_PENDING_TTL
	);
}

function superlatif_bridge_forget_pending(): void {
	unset( $_COOKIE[ SUPERLATIF_BRIDGE_PENDING_COOKIE ] );
	superlatif_bridge_set_cookie( '', time() - 3600 );
}

/**
 * Single use: the cookie is cleared on every read, valid or not, so a value
 * can never be replayed. Returns the rebuilt authorize URL, or null.
 */
function superlatif_bridge_take_pending(): ?string {
	$raw = isset( $_COOKIE[ SUPERLATIF_BRIDGE_PENDING_COOKIE ] )
		? sanitize_text_field( wp_unslash( $_COOKIE[ SUPERLATIF_BRIDGE_PENDING_COOKIE ] ) )
		: '';
	if ( '' === $raw ) {
		return null;
	}
	superlatif_bridge_forget_pending();

	$pending = superlatif_bridge_parse_pending(
		$raw,
		static function ( string $client_id ): ?string {
			$client = superlatif_bridge_client( $client_id );
			return null === $client ? null : $client['secret'];
		},
		time()
	);
	if ( null === $pending ) {
		return null;
	}
	return superlatif_bridge_authorize_url( $pending['client_id'], $pending['state'] );
}

/**
 * After a successful login, resume the bridge flow - and ONLY the bridge
 * flow. With no pending cookie this returns immediately, which is what keeps
 * every ordinary login going wherever the site normally sends it.
 */
function superlatif_bridge_resume_after_login(): void {
	$doing_ajax = function_exists( 'wp_doing_ajax' ) ? wp_doing_ajax() : false;
	if ( $doing_ajax
		|| ( defined( 'REST_REQUEST' ) && REST_REQUEST )
		|| ( defined( 'XMLRPC_REQUEST' ) && XMLRPC_REQUEST ) ) {
		// Cannot redirect from these contexts; the front-end consumer below
		// picks the flow up on the next page load instead.
		return;
	}
	$url = superlatif_bridge_take_pending();
	if ( null === $url ) {
		return;
	}
	superlatif_bridge_no_cache();
	wp_safe_redirect( $url, 302, 'Superlatif App Bridge' );
	superlatif_bridge_exit();
}

/** Fallback for sites whose login form posts over AJAX and never reaches `wp_login` in a redirectable context. */
function superlatif_bridge_resume_on_front_end(): void {
	if ( ! is_user_logged_in() ) {
		return;
	}
	if ( ! isset( $_COOKIE[ SUPERLATIF_BRIDGE_PENDING_COOKIE ] ) ) {
		return;
	}
	superlatif_bridge_resume_after_login();
}

/**
 * Generic, escaped error page. Never says whether the client, the state, or
 * the account was the problem.
 */
function superlatif_bridge_fail( int $status ): void {
	wp_die(
		esc_html__( 'Masuk ke aplikasi Superlatif tidak dapat dilanjutkan. Silakan kembali ke aplikasi dan coba lagi.', 'superlatif-app-bridge' ),
		esc_html__( 'Superlatif', 'superlatif-app-bridge' ),
		array( 'response' => $status )
	);
}

/** Seam so the test harness can observe a redirect without ending the process. */
function superlatif_bridge_exit(): void {
	if ( defined( 'SUPERLATIF_BRIDGE_TESTING' ) && SUPERLATIF_BRIDGE_TESTING ) {
		return;
	}
	exit;
}
