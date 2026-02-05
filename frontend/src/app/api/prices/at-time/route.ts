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
      // delivery_hour matches the hour directly (no +1 offset needed)
      const data = await query<PriceAtTime>(`
        SELECT
          zone,
          argMax(zonal_price, timestamp) as price,
          1 as is_forecast
        FROM ieso.da_ozp
        WHERE delivery_date = toDate(parseDateTimeBestEffort('${sanitizedTs}'))
          AND delivery_hour = toHour(parseDateTimeBestEffort('${sanitizedTs}'))
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

    // Historical: find nearest timestamp per zone within ±2 hour window
    // Uses LIMIT 1 BY zone with ORDER BY distance for reliable nearest-neighbor lookup
    const data = await query<PriceAtTime>(`
      SELECT
        zone,
        price,
        0 as is_forecast
      FROM ieso.zonal_prices
      WHERE timestamp >= parseDateTimeBestEffort('${sanitizedTs}') - INTERVAL 2 HOUR
        AND timestamp <= parseDateTimeBestEffort('${sanitizedTs}') + INTERVAL 5 MINUTE
      ORDER BY zone, abs(toInt64(timestamp) - toInt64(parseDateTimeBestEffort('${sanitizedTs}')))
      LIMIT 1 BY zone
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
