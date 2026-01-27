import { query } from '@/lib/clickhouse';
import { NextResponse } from 'next/server';

interface HistoryRow {
  timestamp: string;
  generator: string;
  fuel_type: string;
  output_mw: number;
}

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const hours = parseInt(searchParams.get('hours') || '4', 10);

  try {
    // Get the last N hours of data ending at the most recent hour available
    const data = await query<HistoryRow>(`
      SELECT
        toStartOfHour(timestamp) as timestamp,
        generator,
        fuel_type,
        anyLast(output_mw) as output_mw
      FROM ieso.generator_output
      WHERE timestamp >= (
        SELECT toStartOfHour(max(timestamp)) - INTERVAL ${hours - 1} HOUR
        FROM ieso.generator_output
      )
      GROUP BY timestamp, generator, fuel_type
      ORDER BY timestamp ASC
    `);

    return NextResponse.json({
      data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('ClickHouse history error:', error);
    return NextResponse.json(
      { error: 'Database error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
