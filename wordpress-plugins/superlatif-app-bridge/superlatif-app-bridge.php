<?php
/**
 * Plugin Name:       Superlatif App Bridge
 * Description:       One-time sign-in bridge from WordPress to the Superlatif Web App. Issues single-use codes for logged-in users and redeems them server-to-server. No settings screen; configured in wp-config.php.
 * Version:           1.1.0
 * Requires at least: 5.8
 * Requires PHP:      7.4
 * Author:            Superlatif
 * License:           Proprietary
 * Text Domain:       superlatif-app-bridge
 *
 * Protocol and security model: README.md in this directory, plus ADR-072 and
 * ADR-073 in the superlatif-webapp repository (docs/gates/26_ADRS.md).
 *
 * What this plugin does NOT do: it never exposes a password, a WordPress
 * auth cookie, or an application password; never sends email, phone, or
 * any other profile field to the app; never computes access or entitlement;
 * and never touches Sejoli data.
 */

defined( 'ABSPATH' ) || exit;

define( 'SUPERLATIF_BRIDGE_VERSION', '1.1.0' );

require_once __DIR__ . '/includes/protocol.php';
require_once __DIR__ . '/includes/config.php';
require_once __DIR__ . '/includes/code-store.php';
require_once __DIR__ . '/includes/authorize.php';
require_once __DIR__ . '/includes/exchange.php';

register_activation_hook( __FILE__, 'superlatif_bridge_install_table' );
add_action( 'plugins_loaded', 'superlatif_bridge_maybe_upgrade' );

add_filter( 'allowed_redirect_hosts', 'superlatif_bridge_allowed_redirect_hosts' );

// PRIMARY entry point (ADR-073): a front-end URL, handled before any theme or
// membership plugin gets to redirect it. Priority 0 on `init` runs while the
// current user is already resolved but before the usual `init` consumers.
add_action( 'init', 'superlatif_bridge_maybe_handle_authorize_request', 0 );

// LEGACY entry point. Kept so a deployment can be rolled back to the previous
// app build without touching WordPress; blocked by Sejoli on superlatif.id.
add_action( 'admin_post_' . SUPERLATIF_BRIDGE_AUTHORIZE_ACTION, 'superlatif_bridge_handle_authorize' );
add_action( 'admin_post_nopriv_' . SUPERLATIF_BRIDGE_AUTHORIZE_ACTION, 'superlatif_bridge_handle_authorize' );

// Resume the bridge flow after the login detour - and only the bridge flow.
add_action( 'wp_login', 'superlatif_bridge_resume_after_login', 999 );
add_action( 'template_redirect', 'superlatif_bridge_resume_on_front_end', 0 );

add_action( 'rest_api_init', 'superlatif_bridge_register_routes' );
