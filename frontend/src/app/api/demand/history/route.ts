import { query } from '@/lib/clickhouse';
import { NextResponse } from 'next/server';

interface DemandHistoryRow {
  timestamp: string;
  demand_mw: number;
}

interface ZonalDemandHistoryRow {
  timestamp: string;
  zone: string;
  demand_mw: number;
}

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const hours = parseInt(searchParams.get('hours') || '24', 10);
  const zone = searchParams.get('zone') || 'ONTARIO'; // ONTARIO = aggregate

  try {
    if (zone === 'ONTARIO') {
      // Aggregate demand across all zones with deduplication
      // Producer may insert historical data multiple times, so we deduplicate
      // by taking the last value for each (timestamp, zone) pair, then sum
      // Note: IESO data is in Eastern Time, so convert now() to Eastern for comparison
      const data = await query<DemandHistoryRow>(`
        SELECT
          timestamp,
          sum(demand_mw) as demand_mw
        FROM (
          SELECT
            toStartOfFiveMinutes(timestamp) as timestamp,
            zone,
            anyLast(demand_mw) as demand_mw
          FROM ieso.zonal_demand
          WHERE timestamp >= now() - INTERVAL 5 HOUR - INTERVAL ${hours} HOUR
          GROUP BY timestamp, zone
        )
        GROUP BY timestamp
        ORDER BY timestamp ASC
      `);

      return NextResponse.json({
        data,
        zone: 'ONTARIO',
        hours,
        timestamp: new Date().toISOString()
      });
    }

    // Per-zone demand history with deduplication
    // Note: IESO data is in Eastern Time, so convert now() to Eastern for comparison
    const data = await query<ZonalDemandHistoryRow>(`
      SELECT
        timestamp,
        zone,
        demand_mw
      FROM (
        SELECT
          toStartOfFiveMinutes(timestamp) as timestamp,
          zone,
          anyLast(demand_mw) as demand_mw
        FROM ieso.zonal_demand
        WHERE timestamp >= now() - INTERVAL 5 HOUR - INTERVAL ${hours} HOUR
          AND zone = '${zone}'
        GROUP BY timestamp, zone
      )
      ORDER BY timestamp ASC
    `);

    return NextResponse.json({
      data,
      zone,
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
