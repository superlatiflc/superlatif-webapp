// Commerce reconciliation report (M2 launch prep, ADR-074). READ-ONLY.
//
// What a support or finance owner checks during the pilot, without a UI:
//   - open reconciliation cases, by type and age;
//   - purchases still waiting for their buyer to sign in;
//   - drift between purchases and grants, in both directions:
//       paid + bound + mapped, but no active grant   (student paid, no access)
//       cancelled/refunded/chargeback, grant still active  (access not removed)
//   - webhook health: unverified deliveries, quarantined events, and events
//     received but never processed.
//
// Every query is a SELECT; the CLI additionally runs them inside a READ ONLY
// transaction. Output carries Sejoli order IDs, case types, counts, and ages -
// never a user ID, email, name, amount, or payload.

import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { Schema } from "../db-types.ts";

type Db = PgDatabase<PgQueryResultHKT, Schema>;

export interface ReconciliationReport {
  readonly generatedAt: string;
  readonly status: "OK" | "ATTENTION";
  readonly openCases: readonly { type: string; count: number; oldestHours: number }[];
  readonly openCaseItems: readonly { case: string; type: string; order: string | null; ageHours: number }[];
  readonly unboundPurchases: readonly { order: string; status: string; ageHours: number }[];
  readonly paidWithoutActiveGrant: readonly { order: string }[];
  readonly activeGrantOnClosedPurchase: readonly { order: string; status: string }[];
  readonly deliveries: {
    readonly receivedLast24h: number;
    readonly unverifiedLast24h: number;
    readonly quarantinedLast7d: readonly { reason: string; count: number }[];
    /** Normalized more than 5 minutes ago and still without a purchase event. */
    readonly unprocessed: number;
  };
}

/**
 * A grant still in force (grant-status.ts vocabulary): never revoked or
 * cancelled, and not currently suspended (its latest suspend/reinstate event,
 * if any, is a reinstate). `g` must alias access_grants.
 */
const GRANT_IN_FORCE = sql`(
  not exists (select 1 from grant_events e where e.grant_id = g.id and e.event_type in ('revoked', 'cancelled'))
  and coalesce((select e.event_type from grant_events e where e.grant_id = g.id and e.event_type in ('suspended', 'reinstated')
                order by e.occurred_at desc limit 1), 'reinstated') <> 'suspended')`;

/** postgres.js returns the row array; pglite (tests) returns `{ rows }`. */
async function rows<T>(db: Db, query: ReturnType<typeof sql>): Promise<T[]> {
  const result = (await db.execute(query)) as unknown;
  return (Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])) as T[];
}

const hours = (value: unknown) => Math.round(Number(value) * 10) / 10;

export async function buildReconciliationReport(db: Db, now: Date): Promise<ReconciliationReport> {
  const at = now.toISOString();

  const openCases = await rows<{ type: string; count: number; oldest: number }>(
    db,
    sql`select case_type as type, count(*)::int as count,
          extract(epoch from (${at}::timestamptz - min(created_at))) / 3600 as oldest
        from reconciliation_cases where status not in ('resolved', 'ignored_with_reason')
        group by case_type order by count(*) desc`,
  );
  const openCaseItems = await rows<{ id: string; type: string; order: string | null; age: number }>(
    db,
    sql`select c.id::text as id, c.case_type as type, p.external_order_id as "order",
          extract(epoch from (${at}::timestamptz - c.created_at)) / 3600 as age
        from reconciliation_cases c left join purchases p on p.id = c.related_purchase_id
        where c.status not in ('resolved', 'ignored_with_reason')
        order by c.created_at limit 50`,
  );
  const unbound = await rows<{ order: string; status: string; age: number }>(
    db,
    sql`select external_order_id as "order", status::text as status,
          extract(epoch from (${at}::timestamptz - ordered_at)) / 3600 as age
        from purchases where user_id is null order by ordered_at limit 50`,
  );
  const paidNoGrant = await rows<{ order: string }>(
    db,
    sql`select p.external_order_id as "order" from purchases p
        where p.status = 'paid' and p.user_id is not null and p.offer_id is not null
          and not exists (
            select 1 from access_grants g
            where g.source_type = 'purchase' and g.source_id = p.id::text
              and (g.valid_to is null or g.valid_to > ${at}::timestamptz)
              and ${GRANT_IN_FORCE})
        order by p.ordered_at limit 50`,
  );
  const closedWithGrant = await rows<{ order: string; status: string }>(
    db,
    sql`select distinct p.external_order_id as "order", p.status::text as status from purchases p
        join access_grants g on g.source_type = 'purchase' and g.source_id = p.id::text
        where p.status in ('cancelled', 'refunded_full', 'chargeback')
          and ${GRANT_IN_FORCE}
        limit 50`,
  );
  const [delivery] = await rows<{ received: number; unverified: number; unprocessed: number }>(
    db,
    sql`select
          (select count(*)::int from raw_commerce_events where received_at > ${at}::timestamptz - interval '24 hours') as received,
          (select count(*)::int from raw_commerce_events where received_at > ${at}::timestamptz - interval '24 hours' and signature_outcome <> 'verified') as unverified,
          (select count(*)::int from normalized_commerce_events n
             where n.created_at < ${at}::timestamptz - interval '5 minutes'
               and not exists (select 1 from purchase_events pe where pe.normalized_event_id = n.id)) as unprocessed`,
  );
  const quarantined = await rows<{ reason: string; count: number }>(
    db,
    sql`select reason_code as reason, count(*)::int as count from commerce_event_quarantine
        where quarantined_at > ${at}::timestamptz - interval '7 days' group by reason_code order by count(*) desc`,
  );

  const report: Omit<ReconciliationReport, "status"> = {
    generatedAt: at,
    openCases: openCases.map((r) => ({ type: r.type, count: r.count, oldestHours: hours(r.oldest) })),
    openCaseItems: openCaseItems.map((r) => ({
      case: `${r.id.slice(0, 8)}…`,
      type: r.type,
      order: r.order,
      ageHours: hours(r.age),
    })),
    unboundPurchases: unbound.map((r) => ({ order: r.order, status: r.status, ageHours: hours(r.age) })),
    paidWithoutActiveGrant: paidNoGrant,
    activeGrantOnClosedPurchase: closedWithGrant,
    deliveries: {
      receivedLast24h: delivery?.received ?? 0,
      unverifiedLast24h: delivery?.unverified ?? 0,
      quarantinedLast7d: quarantined,
      unprocessed: delivery?.unprocessed ?? 0,
    },
  };

  // An unbound purchase is normal until its buyer signs in, so it alone does
  // not raise ATTENTION; everything else here needs a human look.
  const attention =
    report.openCases.some((c) => c.type !== "unresolved_identity") ||
    report.paidWithoutActiveGrant.length > 0 ||
    report.activeGrantOnClosedPurchase.length > 0 ||
    report.deliveries.unverifiedLast24h > 0 ||
    report.deliveries.quarantinedLast7d.length > 0 ||
    report.deliveries.unprocessed > 0;

  return { ...report, status: attention ? "ATTENTION" : "OK" };
}
