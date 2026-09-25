<?php
/**
 * Removes everything this plugin created: the code and commerce-event tables,
 * their schema version options, and the delivery cron event. It never created users, roles, user meta, or anything in
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

// Commerce outbox (1.2.0). Its rows are a delivery log only: the app keeps
// its own durable record of every event it received.
$superlatif_bridge_events = $wpdb->prefix . 'superlatif_bridge_events';
// phpcs:ignore WordPress.DB.DirectDatabaseQuery.SchemaChange, WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- fixed table name.
$wpdb->query( "DROP TABLE IF EXISTS {$superlatif_bridge_events}" );
delete_option( 'superlatif_bridge_commerce_db_version' );
delete_option( 'superlatif_bridge_commerce_lock' );
wp_clear_scheduled_hook( 'superlatif_bridge_commerce_deliver' );
