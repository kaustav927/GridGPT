import { query } from '@/lib/clickhouse';
import { NextResponse } from 'next/server';

interface FuelMixRow {
  fuel_type: string;
  output_mw: number;
  last_updated: string;
}

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Get latest fuel mix using max timestamp from the table
    // Exclude REALTIME_TOTAL which is used for supply charts, not fuel breakdown
    const data = await query<FuelMixRow>(`
      SELECT
        fuel_type,
        argMax(output_mw, timestamp) as output_mw,
        max(timestamp) as last_updated
      FROM ieso.fuel_mix
      WHERE fuel_type != 'REALTIME_TOTAL'
        AND timestamp >= (
          SELECT max(timestamp) - INTERVAL 2 HOUR
          FROM ieso.fuel_mix
          WHERE fuel_type != 'REALTIME_TOTAL'
        )
      GROUP BY fuel_type
      ORDER BY output_mw DESC
    `);

    const total = data.reduce((sum, row) => sum + row.output_mw, 0);

    return NextResponse.json({
      data: data.map(row => ({
        ...row,
        percentage: total > 0 ? (row.output_mw / total) * 100 : 0
      })),
      total_mw: total,
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
