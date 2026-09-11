<?php
/**
 * Browser step: issue a code for the logged-in WordPress user.
 *
 *   GET /wp-admin/admin-post.php?action=superlatif_bridge_authorize&client_id=...&state=...
 *
 * Logged out: sent through WordPress's own login (and its own lost-password
 * flow), then straight back here. Logged in: a single-use code bound to the
 * client, the user, and the app's state is issued, and the browser is
 * redirected to that client's CONFIGURED redirect_uri - never to a URL taken
 * from the request, so a crafted link cannot send a code anywhere else.
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

function superlatif_bridge_handle_authorize(): void {
	nocache_headers();
	header( 'Referrer-Policy: no-referrer' );

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
		$return = add_query_arg(
			array(
				'action'    => SUPERLATIF_BRIDGE_AUTHORIZE_ACTION,
				'client_id' => rawurlencode( $client_id ),
				'state'     => rawurlencode( $state ),
			),
			admin_url( 'admin-post.php' )
		);
		wp_safe_redirect( wp_login_url( $return ) );
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
