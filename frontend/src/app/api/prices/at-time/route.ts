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
      // IESO DA data uses EST date/hour-ending convention:
      //   delivery_date = EST date, delivery_hour = hour-ending 1-24
      //   e.g. delivery_hour=20 covers 7pm-8pm EST
      // The timestamp arrives as UTC ISO string. We must convert to EST before
      // extracting date and hour, then add 1 for the hour-ending convention.
      const data = await query<PriceAtTime>(`
        WITH
          parseDateTimeBestEffort('${sanitizedTs}') as ts_utc,
          toTimezone(ts_utc, 'America/Toronto') as ts_est,
          toDate(ts_est) as est_date,
          toHour(ts_est) + 1 as est_hour_ending
        SELECT
          zone,
          argMax(zonal_price, timestamp) as price,
          1 as is_forecast
        FROM ieso.da_ozp
        WHERE delivery_date = est_date
          AND delivery_hour = est_hour_ending
        GROUP BY zone
        ORDER BY zone
      `);

      return NextResponse.json({
        data,
        timestamp,
        source: 'day_ahead',
        count: data.length,
      }, {
        headers: { 'Cache-Control': 's-maxage=30, stale-while-revalidate=60' },
      });
    }

    // Historical: find nearest timestamp per zone within ±12 hour window
    // Wider window ensures we find data even with gaps in the archive
    // Uses LIMIT 1 BY zone with ORDER BY distance for reliable nearest-neighbor lookup
    const data = await query<PriceAtTime>(`
      SELECT
        zone,
        price,
        0 as is_forecast
      FROM ieso.zonal_prices
      WHERE timestamp >= parseDateTimeBestEffort('${sanitizedTs}') - INTERVAL 12 HOUR
        AND timestamp <= parseDateTimeBestEffort('${sanitizedTs}') + INTERVAL 5 MINUTE
      ORDER BY zone, abs(toInt64(timestamp) - toInt64(parseDateTimeBestEffort('${sanitizedTs}')))
      LIMIT 1 BY zone
    `);

    return NextResponse.json({
      data,
      timestamp,
      source: 'realtime',
      count: data.length,
    }, {
      headers: { 'Cache-Control': 's-maxage=30, stale-while-revalidate=60' },
    });
  } catch (error) {
    console.error('ClickHouse error:', error);
    return NextResponse.json(
      { error: 'Database error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
