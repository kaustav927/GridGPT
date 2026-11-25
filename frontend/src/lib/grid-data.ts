// Server-side data access for the crawlable (ISR) pages.
// Mirrors the SQL of the existing /api routes but runs inside server components, so the
// numbers land in the HTML that search engines index. Every function returns null on failure
// so a database hiccup renders a "data temporarily unavailable" state instead of a 500.
// Server-only: imports the ClickHouse client, which reads non-public env vars.
import { query } from '@/lib/clickhouse';

/** ISR window for SEO pages, in seconds. Keep in sync with `export const revalidate` on pages. */
export const SEO_REVALIDATE = 300;
const opts = { revalidate: SEO_REVALIDATE };

// Timestamps in ClickHouse are naive Ontario local time (EST/EDT), so all windows are
// anchored on max(timestamp) rather than now().

export const PRICING_ZONES = [
  'EAST', 'ESSA', 'NIAGARA', 'NORTHEAST', 'NORTHWEST', 'OTTAWA', 'SOUTHWEST', 'TORONTO', 'WEST',
] as const;
export type PricingZone = (typeof PRICING_ZONES)[number];

export const ZONE_INFO: Record<PricingZone, { name: string; places: string }> = {
  EAST: { name: 'East', places: 'Kingston, Belleville and Brockville' },
  ESSA: { name: 'Essa', places: 'Barrie, Orillia and Collingwood' },
  NIAGARA: { name: 'Niagara', places: 'St. Catharines, Niagara Falls and Welland' },
  NORTHEAST: { name: 'Northeast', places: 'Sudbury, Timmins, North Bay and Sault Ste. Marie' },
  NORTHWEST: { name: 'Northwest', places: 'Thunder Bay, Kenora and Dryden' },
  OTTAWA: { name: 'Ottawa', places: 'Ottawa and the surrounding area' },
  SOUTHWEST: { name: 'Southwest', places: 'Kitchener-Waterloo, Guelph, London and the Bruce Peninsula' },
  TORONTO: { name: 'Toronto', places: 'the City of Toronto and the GTA' },
  WEST: { name: 'West', places: 'Windsor, Sarnia and Chatham-Kent' },
};

export const zoneFromSlug = (slug: string): PricingZone | null => {
  const upper = slug.toUpperCase();
  return (PRICING_ZONES as readonly string[]).includes(upper) ? (upper as PricingZone) : null;
};

const safe = async <T>(label: string, fn: () => Promise<T>): Promise<T | null> => {
  try {
    return await fn();
  } catch (error) {
    console.error(`[grid-data] ${label} failed:`, error instanceof Error ? error.message : error);
    return null;
  }
};

// ---------- Prices ----------

export interface ZonePrice {
  zone: string;
  price: number;
  last_updated: string;
}

export interface PricePoint {
  hour: string;
  price: number;
}

export interface PriceSnapshot {
  zones: ZonePrice[];
  average: number;
  cheapest: ZonePrice;
  priciest: ZonePrice;
  lastUpdated: string;
}

export const getPriceSnapshot = () =>
  safe('price snapshot', async (): Promise<PriceSnapshot | null> => {
    const zones = await query<ZonePrice>(
      `SELECT zone, argMax(price, timestamp) AS price, toString(max(timestamp)) AS last_updated
       FROM ieso.zonal_prices
       WHERE timestamp >= (SELECT max(timestamp) - INTERVAL 1 HOUR FROM ieso.zonal_prices)
       GROUP BY zone ORDER BY zone`,
      opts,
    );
    if (zones.length === 0) return null;
    const sorted = [...zones].sort((a, b) => a.price - b.price);
    return {
      zones,
      average: zones.reduce((s, z) => s + z.price, 0) / zones.length,
      cheapest: sorted[0],
      priciest: sorted[sorted.length - 1],
      lastUpdated: zones.reduce((m, z) => (z.last_updated > m ? z.last_updated : m), ''),
    };
  });

/** Hourly average price over the last 24 hours, for one zone or the provincial average. */
export const getPriceTrend = (zone?: PricingZone) =>
  safe('price trend', () =>
    query<PricePoint>(
      `SELECT toString(h) AS hour, avg(p) AS price FROM (
         SELECT toStartOfHour(timestamp) AS h, zone, toStartOfFiveMinutes(timestamp) AS t, anyLast(price) AS p
         FROM ieso.zonal_prices
         WHERE timestamp >= (SELECT max(timestamp) - INTERVAL 24 HOUR FROM ieso.zonal_prices)
           ${zone ? `AND zone = '${zone}'` : ''}
         GROUP BY h, zone, t
       )
       GROUP BY h ORDER BY h`,
      opts,
    ),
  );

// ---------- Fuel mix ----------

export interface FuelRow {
  fuel_type: string;
  output_mw: number;
  capability_mw: number;
}

export interface FuelMixSnapshot {
  fuels: (FuelRow & { percent: number })[];
  totalMw: number;
  asOf: string;
}

export const getFuelMix = () =>
  safe('fuel mix', async (): Promise<FuelMixSnapshot | null> => {
    const rows = await query<FuelRow & { data_timestamp: string }>(
      `SELECT fuel_type, sum(output_mw) AS output_mw, sum(capability_mw) AS capability_mw,
              toString(max(latest_ts)) AS data_timestamp
       FROM (
         SELECT generator, fuel_type,
                argMax(output_mw, timestamp) AS output_mw,
                argMax(capability_mw, timestamp) AS capability_mw,
                max(timestamp) AS latest_ts
         FROM ieso.generator_output
         WHERE timestamp >= (SELECT max(timestamp) - INTERVAL 2 HOUR FROM ieso.generator_output)
         GROUP BY generator, fuel_type
       )
       GROUP BY fuel_type ORDER BY output_mw DESC`,
      opts,
    );
    if (rows.length === 0) return null;
    const totalMw = rows.reduce((s, r) => s + Math.max(0, r.output_mw), 0);
    return {
      fuels: rows.map((r) => ({
        fuel_type: r.fuel_type,
        output_mw: r.output_mw,
        capability_mw: r.capability_mw,
        percent: totalMw > 0 ? (Math.max(0, r.output_mw) / totalMw) * 100 : 0,
      })),
      totalMw,
      asOf: rows.reduce((m, r) => (r.data_timestamp > m ? r.data_timestamp : m), ''),
    };
  });

// ---------- Interties (positive = export from Ontario, negative = import) ----------

const FLOW_GROUP_SQL = `CASE
  WHEN intertie IN ('MANITOBA', 'MANITOBA SK') THEN 'MANITOBA'
  WHEN intertie LIKE 'PQ%' THEN 'QUEBEC'
  ELSE intertie END`;

export const INTERTIE_LABELS: Record<string, { name: string; country: 'US' | 'Canada' }> = {
  'NEW-YORK': { name: 'New York', country: 'US' },
  MICHIGAN: { name: 'Michigan', country: 'US' },
  MINNESOTA: { name: 'Minnesota', country: 'US' },
  QUEBEC: { name: 'Quebec', country: 'Canada' },
  MANITOBA: { name: 'Manitoba', country: 'Canada' },
};

export interface IntertieRow {
  flow_group: string;
  /** Average MW over the latest hour */
  now_mw: number;
  /** Net energy over the last 24 hours, MWh */
  net_mwh_24h: number;
  /** Real-time intertie price for the latest hour, $/MWh (null if unavailable) */
  price: number | null;
}

export interface IntertieSnapshot {
  interties: IntertieRow[];
  netNowMw: number;
  netMwh24h: number;
  usNetMwh24h: number;
  lastUpdated: string;
}

export const getInterties = () =>
  safe('interties', async (): Promise<IntertieSnapshot | null> => {
    const [flows, prices] = await Promise.all([
      query<{ flow_group: string; now_mw: number; net_mwh_24h: number; last_updated: string }>(
        `WITH hourly AS (
           SELECT ${FLOW_GROUP_SQL} AS flow_group, intertie, toStartOfHour(t) AS h, avg(mw) AS hour_mw
           FROM (
             SELECT intertie, toStartOfFiveMinutes(timestamp) AS t, anyLast(actual_mw) AS mw
             FROM ieso.intertie_flow
             WHERE timestamp >= (SELECT max(timestamp) - INTERVAL 24 HOUR FROM ieso.intertie_flow)
             GROUP BY intertie, t
           )
           GROUP BY flow_group, intertie, h
         ),
         latest AS (SELECT max(h) AS lh FROM hourly)
         SELECT flow_group,
                sumIf(hour_mw, h = (SELECT lh FROM latest)) AS now_mw,
                sum(hour_mw) AS net_mwh_24h,
                toString(max(h)) AS last_updated
         FROM hourly GROUP BY flow_group ORDER BY flow_group`,
        opts,
      ),
      query<{ intertie_zone: string; lmp: number }>(
        `SELECT intertie_zone, avg(lmp) AS lmp FROM ieso.realtime_intertie_lmp
         WHERE toStartOfHour(timestamp) = (SELECT toStartOfHour(max(timestamp)) FROM ieso.realtime_intertie_lmp)
         GROUP BY intertie_zone`,
        opts,
      ).catch(() => [] as { intertie_zone: string; lmp: number }[]),
    ]);
    if (flows.length === 0) return null;
    const priceMap = new Map(prices.map((p) => [p.intertie_zone, p.lmp]));
    const interties = flows.map((f) => ({
      flow_group: f.flow_group,
      now_mw: f.now_mw,
      net_mwh_24h: f.net_mwh_24h,
      price: priceMap.get(f.flow_group) ?? null,
    }));
    return {
      interties,
      netNowMw: interties.reduce((s, i) => s + i.now_mw, 0),
      netMwh24h: interties.reduce((s, i) => s + i.net_mwh_24h, 0),
      usNetMwh24h: interties
        .filter((i) => INTERTIE_LABELS[i.flow_group]?.country === 'US')
        .reduce((s, i) => s + i.net_mwh_24h, 0),
      lastUpdated: flows.reduce((m, f) => (f.last_updated > m ? f.last_updated : m), ''),
    };
  });

// ---------- Demand ----------

export interface DemandSnapshot {
  ontarioMw: number;
  marketMw: number | null;
  lastUpdated: string;
  trend: { hour: string; mw: number }[];
  todayPeak: { mw: number; hour: number } | null;
  tomorrowPeak: { mw: number; hour: number } | null;
}

export const getDemand = () =>
  safe('demand', async (): Promise<DemandSnapshot | null> => {
    const now = new Date();
    const today = now.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
    const tomorrow = new Date(now.getTime() + 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });

    const peakSql = (d: string) =>
      `SELECT delivery_hour AS hour, anyLast(forecast_demand_mw) AS mw FROM ieso.adequacy
       WHERE delivery_date = '${d}' GROUP BY delivery_date, delivery_hour ORDER BY mw DESC LIMIT 1`;

    const [latest, trend, todayPeak, tomorrowPeak] = await Promise.all([
      query<{ zone: string; mw: number; last_updated: string }>(
        `SELECT zone, argMax(demand_mw, timestamp) AS mw, toString(max(timestamp)) AS last_updated
         FROM ieso.zonal_demand
         WHERE zone IN ('ONTARIO', 'GRID_LOAD')
           AND timestamp >= (SELECT max(timestamp) - INTERVAL 1 HOUR FROM ieso.zonal_demand)
         GROUP BY zone`,
        opts,
      ),
      query<{ hour: string; mw: number }>(
        `SELECT toString(toStartOfHour(t)) AS hour, avg(mw) AS mw FROM (
           SELECT toStartOfFiveMinutes(timestamp) AS t, anyLast(demand_mw) AS mw
           FROM ieso.zonal_demand
           WHERE zone = 'ONTARIO'
             AND timestamp >= (SELECT max(timestamp) - INTERVAL 24 HOUR FROM ieso.zonal_demand)
           GROUP BY t
         ) GROUP BY hour ORDER BY hour`,
        opts,
      ),
      query<{ hour: number; mw: number }>(peakSql(today), opts).catch(() => []),
      query<{ hour: number; mw: number }>(peakSql(tomorrow), opts).catch(() => []),
    ]);
    const ontario = latest.find((r) => r.zone === 'ONTARIO');
    if (!ontario) return null;
    return {
      ontarioMw: ontario.mw,
      marketMw: latest.find((r) => r.zone === 'GRID_LOAD')?.mw ?? null,
      lastUpdated: ontario.last_updated,
      trend,
      todayPeak: todayPeak[0] ?? null,
      tomorrowPeak: tomorrowPeak[0] ?? null,
    };
  });
