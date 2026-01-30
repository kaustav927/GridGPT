import { query } from '@/lib/clickhouse';
import { NextResponse } from 'next/server';

interface DemandRow {
  timestamp: string;
  demand_mw: number;
}

interface GridLoadRow {
  timestamp: string;
  grid_load_mw: number;
}

interface PriceRow {
  timestamp: string;
  price: number;
}

interface SupplyRow {
  timestamp: string;
  total_mw: number;
}

// Ontario's maximum grid capacity is approximately 27,000 MW
const MAX_ONTARIO_SUPPLY_MW = 30000;

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const hours = parseInt(searchParams.get('hours') || '24', 10);

  try {
    // Execute all queries in parallel for efficiency
    // All queries use deduplication to handle duplicate historical data
    // from producer polling cycles
    const [demandData, gridLoadData, priceData, supplyData] = await Promise.all([
      // Ontario Demand (internal consumption)
      query<DemandRow>(`
        SELECT
          toStartOfFiveMinutes(timestamp) as timestamp,
          anyLast(demand_mw) as demand_mw
        FROM ieso.zonal_demand
        WHERE zone = 'ONTARIO'
          AND timestamp >= now() - INTERVAL 5 HOUR - INTERVAL ${hours} HOUR
        GROUP BY timestamp
        ORDER BY timestamp ASC
      `),
      // Grid Load (Total Load = Supply minus transmission losses)
      query<GridLoadRow>(`
        SELECT
          toStartOfFiveMinutes(timestamp) as timestamp,
          anyLast(demand_mw) as grid_load_mw
        FROM ieso.zonal_demand
        WHERE zone = 'GRID_LOAD'
          AND timestamp >= now() - INTERVAL 5 HOUR - INTERVAL ${hours} HOUR
        GROUP BY timestamp
        ORDER BY timestamp ASC
      `),
      // Average price with deduplication
      // Deduplicate by (timestamp, zone), then average across zones
      query<PriceRow>(`
        SELECT
          timestamp,
          avg(price) as price
        FROM (
          SELECT
            toStartOfFiveMinutes(timestamp) as timestamp,
            zone,
            anyLast(price) as price
          FROM ieso.zonal_prices
          WHERE timestamp >= now() - INTERVAL 5 HOUR - INTERVAL ${hours} HOUR
          GROUP BY timestamp, zone
        )
        GROUP BY timestamp
        ORDER BY timestamp ASC
      `),
      // Total supply combining realtime (5-min) and hourly data
      // REALTIME_TOTAL provides 5-minute granularity, others are hourly
      query<SupplyRow>(`
        SELECT
          timestamp,
          total_mw
        FROM (
          -- Realtime 5-minute supply data
          SELECT
            toStartOfFiveMinutes(timestamp) as timestamp,
            anyLast(output_mw) as total_mw
          FROM ieso.fuel_mix
          WHERE fuel_type = 'REALTIME_TOTAL'
            AND timestamp >= now() - INTERVAL 5 HOUR - INTERVAL ${hours} HOUR
          GROUP BY timestamp

          UNION ALL

          -- Hourly supply data (sum of individual fuel types)
          SELECT
            timestamp,
            sum(output_mw) as total_mw
          FROM (
            SELECT
              toStartOfHour(timestamp) as timestamp,
              fuel_type,
              anyLast(output_mw) as output_mw
            FROM ieso.fuel_mix
            WHERE fuel_type != 'REALTIME_TOTAL'
              AND timestamp >= now() - INTERVAL 5 HOUR - INTERVAL ${hours} HOUR
            GROUP BY timestamp, fuel_type
          )
          GROUP BY timestamp
        )
        ORDER BY timestamp ASC
      `)
    ]);

    // Filter anomalous supply values
    const validSupplyData = supplyData.filter(row =>
      row.total_mw > 0 && row.total_mw <= MAX_ONTARIO_SUPPLY_MW
    );

    if (validSupplyData.length < supplyData.length) {
      console.warn(
        `Filtered ${supplyData.length - validSupplyData.length} anomalous supply records`
      );
    }

    return NextResponse.json({
      demand: demandData,
      gridLoad: gridLoadData,
      price: priceData,
      supply: validSupplyData,
      hours,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('ClickHouse error:', error);
    return NextResponse.json(
      { error: 'Database error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
