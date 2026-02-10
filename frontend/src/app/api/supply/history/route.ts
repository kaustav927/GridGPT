import { query } from '@/lib/clickhouse';
import { NextResponse } from 'next/server';

interface SupplyHistoryRow {
  timestamp: string;
  total_mw: number;
}

interface FuelSupplyHistoryRow {
  timestamp: string;
  fuel_type: string;
  output_mw: number;
}

// Ontario's maximum grid capacity is approximately 27,000 MW
// Use 30,000 MW as upper bound for sanity checking
const MAX_ONTARIO_SUPPLY_MW = 30000;

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const hours = parseInt(searchParams.get('hours') || '24', 10);
  const byFuel = searchParams.get('by_fuel') === 'true';

  try {
    if (byFuel) {
      // Supply breakdown by fuel type with deduplication
      // Producer may insert historical data multiple times, so we deduplicate
      // by taking the last value for each (timestamp, fuel_type) pair
      const data = await query<FuelSupplyHistoryRow>(`
        SELECT
          timestamp,
          fuel_type,
          output_mw
        FROM (
          SELECT
            toStartOfHour(timestamp) as timestamp,
            fuel_type,
            anyLast(output_mw) as output_mw
          FROM ieso.fuel_mix
          WHERE timestamp >= now() - INTERVAL 5 HOUR - INTERVAL ${hours} HOUR
          GROUP BY timestamp, fuel_type
        )
        ORDER BY timestamp ASC, output_mw DESC
      `);

      return NextResponse.json({
        data,
        hours,
        by_fuel: true,
        timestamp: new Date().toISOString()
      });
    }

    // Total supply combining realtime (5-min) and hourly data
    // REALTIME_TOTAL provides 5-minute granularity from RealtimeTotals report
    // Other fuel types are hourly from GenOutputbyFuelHourly report
    // Prefer realtime data, fall back to hourly aggregation
    const data = await query<SupplyHistoryRow>(`
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

        -- Hourly supply data (sum of individual fuel types, excluding REALTIME_TOTAL)
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
    `);

    // Filter out anomalous values that exceed Ontario's max capacity
    const validData = data.filter(row =>
      row.total_mw > 0 && row.total_mw <= MAX_ONTARIO_SUPPLY_MW
    );

    if (validData.length < data.length) {
      console.warn(
        `Filtered ${data.length - validData.length} anomalous supply records ` +
        `(values > ${MAX_ONTARIO_SUPPLY_MW} MW or <= 0)`
      );
    }

    return NextResponse.json({
      data: validData,
      hours,
      by_fuel: false,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('ClickHouse error:', error);
    return NextResponse.json(
      { error: 'Database error', message: 'Internal server error' },
      { status: 500 }
    );
  }
}
