import { query } from '@/lib/clickhouse';
import { NextResponse } from 'next/server';

interface PriceHistoryRow {
  timestamp: string;
  price: number;
}

interface ZonalPriceHistoryRow {
  timestamp: string;
  zone: string;
  price: number;
}

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const hours = parseInt(searchParams.get('hours') || '24', 10);
  const zone = searchParams.get('zone') || 'ONTARIO'; // ONTARIO = weighted average

  try {
    if (zone === 'ONTARIO') {
      // Ontario-wide average price (simple average across zones)
      const data = await query<PriceHistoryRow>(`
        SELECT
          toStartOfFiveMinutes(timestamp) as timestamp,
          avg(price) as price
        FROM ieso.zonal_prices
        WHERE timestamp >= now() - INTERVAL 5 HOUR - INTERVAL ${hours} HOUR
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

    // Per-zone price history
    const data = await query<ZonalPriceHistoryRow>(`
      SELECT
        toStartOfFiveMinutes(timestamp) as timestamp,
        zone,
        avg(price) as price
      FROM ieso.zonal_prices
      WHERE timestamp >= now() - INTERVAL 5 HOUR - INTERVAL ${hours} HOUR
        AND zone = '${zone}'
      GROUP BY timestamp, zone
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
      { error: 'Database error', message: 'Internal server error' },
      { status: 500 }
    );
  }
}
