import { NextResponse } from 'next/server';
import { query } from '@/lib/clickhouse';

export const dynamic = 'force-dynamic';

interface PriceAtTime {
  zone: string;
  price: number;
  is_forecast: number;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const timestamp = searchParams.get('timestamp') || new Date().toISOString();
    const requestedTime = new Date(timestamp);
    const now = new Date();

    // Sanitize timestamp for SQL
    const sanitizedTs = timestamp.replace(/[^0-9TZ:.+-]/g, '');

    // If future time, use day-ahead prices from da_ozp table
    if (requestedTime > now) {
      const data = await query<PriceAtTime>(`
        SELECT
          zone,
          argMax(zonal_price, timestamp) as price,
          1 as is_forecast
        FROM ieso.da_ozp
        WHERE delivery_date = toDate(parseDateTimeBestEffort('${sanitizedTs}'))
          AND delivery_hour = toHour(parseDateTimeBestEffort('${sanitizedTs}')) + 1
        GROUP BY zone
        ORDER BY zone
      `);

      return NextResponse.json({
        data,
        timestamp,
        source: 'day_ahead',
        count: data.length,
      });
    }

    // Historical: use actual realtime prices
    const data = await query<PriceAtTime>(`
      SELECT
        zone,
        argMax(price, timestamp) as price,
        0 as is_forecast
      FROM ieso.zonal_prices
      WHERE timestamp >= parseDateTimeBestEffort('${sanitizedTs}') - INTERVAL 5 MINUTE
        AND timestamp <= parseDateTimeBestEffort('${sanitizedTs}') + INTERVAL 5 MINUTE
      GROUP BY zone
      ORDER BY zone
    `);

    return NextResponse.json({
      data,
      timestamp,
      source: 'realtime',
      count: data.length,
    });
  } catch (error) {
    console.error('ClickHouse error:', error);
    return NextResponse.json(
      { error: 'Database error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
