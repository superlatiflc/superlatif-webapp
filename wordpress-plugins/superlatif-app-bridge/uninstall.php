<?php
/**
 * Removes everything this plugin created: the code table and its schema
 * version option. It never created users, roles, user meta, or anything in
 * Sejoli, so there is nothing else to clean up. The client configuration in
 * wp-config.php is removed by hand (see README.md "Rollback").
 *
 * @package SuperlatifAppBridge
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

global $wpdb;
$superlatif_bridge_table = $wpdb->prefix . 'superlatif_bridge_codes';
// phpcs:ignore WordPress.DB.DirectDatabaseQuery.SchemaChange, WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- fixed table name.
$wpdb->query( "DROP TABLE IF EXISTS {$superlatif_bridge_table}" );
delete_option( 'superlatif_bridge_db_version' );
