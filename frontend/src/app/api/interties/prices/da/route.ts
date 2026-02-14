import { query } from '@/lib/clickhouse';
import { NextResponse } from 'next/server';

interface DaIntertieLmpRow {
  intertie_zone: string;
  lmp: number;
}

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const timestamp = searchParams.get('timestamp') || new Date().toISOString();

    // Sanitize timestamp for SQL
    const sanitizedTs = timestamp.replace(/[^0-9TZ:.+-]/g, '');

    // IESO DA data uses EST date/hour-ending convention:
    //   delivery_date = EST date, delivery_hour = hour-ending 1-24
    //   e.g. delivery_hour=20 covers 7pm-8pm EST
    // Convert UTC timestamp to EST before extracting date and hour.
    const data = await query<DaIntertieLmpRow>(`
      WITH
        parseDateTimeBestEffort('${sanitizedTs}') as ts_utc,
        toTimezone(ts_utc, 'America/Toronto') as ts_est,
        toDate(ts_est) as est_date,
        toHour(ts_est) + 1 as est_hour_ending
      SELECT
        intertie_zone,
        argMax(lmp, timestamp) as lmp
      FROM ieso.da_intertie_lmp
      WHERE delivery_date = est_date
        AND delivery_hour = est_hour_ending
      GROUP BY intertie_zone
      ORDER BY intertie_zone
    `);

    return NextResponse.json({
      data,
      timestamp,
      source: 'day_ahead',
    }, {
      headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=300' },
    });
  } catch (error) {
    console.error('ClickHouse DA intertie LMP error:', error);
    return NextResponse.json(
      { error: 'Database error', message: 'Internal server error' },
      { status: 500 }
    );
  }
}
