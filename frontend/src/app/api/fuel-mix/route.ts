import { query } from '@/lib/clickhouse';
import { NextResponse } from 'next/server';

interface GeneratorAggRow {
  fuel_type: string;
  output_mw: number;
  capability_mw: number;
  data_timestamp: string;
}

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Get fuel mix from generator_output table (more current than GenOutputbyFuelHourly)
    // This aggregates individual generator outputs by fuel type
    // Note: Excludes embedded generation (~2-5% of total) not tracked at generator level
    const data = await query<GeneratorAggRow>(`
      SELECT
        fuel_type,
        sum(output_mw) as output_mw,
        sum(capability_mw) as capability_mw,
        max(latest_ts) as data_timestamp
      FROM (
        SELECT
          generator,
          fuel_type,
          argMax(output_mw, timestamp) as output_mw,
          argMax(capability_mw, timestamp) as capability_mw,
          max(timestamp) as latest_ts
        FROM ieso.generator_output
        WHERE timestamp >= (SELECT max(timestamp) - INTERVAL 2 HOUR FROM ieso.generator_output)
        GROUP BY generator, fuel_type
      )
      GROUP BY fuel_type
      ORDER BY output_mw DESC
    `);

    const total = data.reduce((sum, row) => sum + row.output_mw, 0);

    // Get the most recent data timestamp across all fuel types
    const dataTimestamp = data.length > 0 ? data[0].data_timestamp : new Date().toISOString();

    return NextResponse.json({
      data: data.map(row => {
        const utilization = row.capability_mw > 0 ? (row.output_mw / row.capability_mw) * 100 : 0;
        return {
          fuel_type: row.fuel_type,
          output_mw: row.output_mw,
          percentage: total > 0 ? (row.output_mw / total) * 100 : 0,
          capacity_mw: row.capability_mw,
          utilization,
        };
      }),
      total_mw: total,
      data_timestamp: dataTimestamp,  // Actual timestamp from the data
      is_approximate: true,  // Flag indicating this excludes embedded generation
    });
  } catch (error) {
    console.error('ClickHouse error:', error);
    return NextResponse.json(
      { error: 'Database error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
