import { query } from '@/lib/clickhouse';
import { NextResponse } from 'next/server';

interface ZonalDemandRow {
  zone: string;
  demand_mw: number;
  last_updated: string;
}

interface TotalDemandRow {
  total_demand_mw: number;
  last_updated: string;
}

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'zones';

  try {
    if (type === 'total') {
      const data = await query<TotalDemandRow>(`
        SELECT
          sum(demand_mw) as total_demand_mw,
          max(timestamp) as last_updated
        FROM ieso.zonal_demand
        WHERE timestamp = (SELECT max(timestamp) FROM ieso.zonal_demand)
      `);

      return NextResponse.json({
        data: data[0] || { total_demand_mw: 0, last_updated: null },
        timestamp: new Date().toISOString()
      });
    }

    // Get latest demand per zone using max timestamp from the table
    const data = await query<ZonalDemandRow>(`
      SELECT
        zone,
        argMax(demand_mw, timestamp) as demand_mw,
        max(timestamp) as last_updated
      FROM ieso.zonal_demand
      WHERE timestamp >= (SELECT max(timestamp) - INTERVAL 1 HOUR FROM ieso.zonal_demand)
      GROUP BY zone
      ORDER BY demand_mw DESC
    `);

    return NextResponse.json({
      data,
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
