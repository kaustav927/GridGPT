import { query } from '@/lib/clickhouse';
import { NextResponse } from 'next/server';

interface GeneratorRow {
  generator: string;
  fuel_type: string;
  output_mw: number;
  capability_mw: number;
  utilization_pct: number;
  last_updated: string;
}

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fuelType = searchParams.get('fuel_type');
  const limit = parseInt(searchParams.get('limit') || '500', 10);

  try {
    const fuelFilter = fuelType ? `AND fuel_type = '${fuelType}'` : '';

    // Use different alias names in inner query to avoid ClickHouse ILLEGAL_AGGREGATION
    const data = await query<GeneratorRow>(`
      SELECT
        generator,
        fuel_type,
        current_output as output_mw,
        current_cap as capability_mw,
        round(current_output / nullIf(current_cap, 0) * 100, 1) as utilization_pct,
        last_updated
      FROM (
        SELECT
          generator,
          fuel_type,
          argMax(output_mw, timestamp) as current_output,
          argMax(capability_mw, timestamp) as current_cap,
          max(timestamp) as last_updated
        FROM ieso.generator_output
        WHERE timestamp >= (SELECT max(timestamp) - INTERVAL 1 HOUR FROM ieso.generator_output)
          ${fuelFilter}
        GROUP BY generator, fuel_type
      )
      ORDER BY current_output DESC
      LIMIT ${limit}
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
