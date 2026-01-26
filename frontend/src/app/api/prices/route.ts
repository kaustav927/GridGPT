import { query } from '@/lib/clickhouse';
import { NextResponse } from 'next/server';

interface ZonalPriceRow {
  zone: string;
  price: number;
  last_updated: string;
}

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Get latest price per zone using max timestamp from the table
    const data = await query<ZonalPriceRow>(`
      SELECT
        zone,
        argMax(price, timestamp) as price,
        max(timestamp) as last_updated
      FROM ieso.zonal_prices
      WHERE timestamp >= (SELECT max(timestamp) - INTERVAL 1 HOUR FROM ieso.zonal_prices)
      GROUP BY zone
      ORDER BY zone
    `);

    return NextResponse.json({
      data,
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
