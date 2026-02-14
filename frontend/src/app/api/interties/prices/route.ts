import { query } from '@/lib/clickhouse';
import { NextResponse } from 'next/server';

interface IntertieLmpRow {
  intertie_zone: string;
  lmp: number;
  latest_ts: string;
}

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const timestamp = searchParams.get('timestamp');

    let whereClause: string;
    if (timestamp) {
      const sanitizedTs = timestamp.replace(/[^0-9TZ:.+-]/g, '');
      whereClause = `toStartOfHour(timestamp) = toStartOfHour(parseDateTimeBestEffort('${sanitizedTs}'))`;
    } else {
      whereClause = `toStartOfHour(timestamp) = (SELECT toStartOfHour(max(timestamp)) FROM ieso.realtime_intertie_lmp)`;
    }

    const data = await query<IntertieLmpRow>(`
      SELECT
        intertie_zone,
        avg(lmp) as lmp,
        max(timestamp) as latest_ts
      FROM ieso.realtime_intertie_lmp
      WHERE ${whereClause}
      GROUP BY intertie_zone
      ORDER BY intertie_zone ASC
    `);

    return NextResponse.json({
      data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('ClickHouse intertie prices error:', error);
    return NextResponse.json(
      { error: 'Database error', message: 'Internal server error' },
      { status: 500 }
    );
  }
}
