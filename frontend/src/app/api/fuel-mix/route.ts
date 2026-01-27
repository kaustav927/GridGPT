import { query } from '@/lib/clickhouse';
import { NextResponse } from 'next/server';

interface FuelMixRow {
  fuel_type: string;
  output_mw: number;
  last_updated: string;
}

interface CapacityRow {
  fuel_type: string;
  total_output_mw: number;
  total_capability_mw: number;
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

    // Get capacity data from generator_output table
    const capacityData = await query<CapacityRow>(`
      SELECT
        fuel_type,
        sum(output_mw) as total_output_mw,
        sum(capability_mw) as total_capability_mw
      FROM (
        SELECT
          generator,
          fuel_type,
          argMax(output_mw, timestamp) as output_mw,
          argMax(capability_mw, timestamp) as capability_mw
        FROM ieso.generator_output
        WHERE timestamp >= (SELECT max(timestamp) - INTERVAL 2 HOUR FROM ieso.generator_output)
        GROUP BY generator, fuel_type
      )
      GROUP BY fuel_type
      ORDER BY total_output_mw DESC
    `);

    const capacityMap = new Map(
      capacityData.map(row => [row.fuel_type, row.total_capability_mw])
    );

    const total = data.reduce((sum, row) => sum + row.output_mw, 0);

    return NextResponse.json({
      data: data.map(row => {
        const capacity_mw = capacityMap.get(row.fuel_type) ?? 0;
        const utilization = capacity_mw > 0 ? (row.output_mw / capacity_mw) * 100 : 0;
        return {
          ...row,
          percentage: total > 0 ? (row.output_mw / total) * 100 : 0,
          capacity_mw,
          utilization,
        };
      }),
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
