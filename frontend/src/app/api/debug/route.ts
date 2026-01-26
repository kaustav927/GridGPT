import { query } from '@/lib/clickhouse';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Simple test queries - no aggregation, just raw data
    const [prices, counts, sample] = await Promise.all([
      // Get raw sample of prices
      query<{ zone: string; price: number; timestamp: string }>(`
        SELECT zone, price, timestamp
        FROM ieso.zonal_prices
        ORDER BY timestamp DESC
        LIMIT 10
      `),
      // Get table counts
      query<{ table_name: string; cnt: number }>(`
        SELECT 'zonal_prices' as table_name, count() as cnt FROM ieso.zonal_prices
        UNION ALL SELECT 'zonal_demand', count() FROM ieso.zonal_demand
        UNION ALL SELECT 'generator_output', count() FROM ieso.generator_output
        UNION ALL SELECT 'fuel_mix', count() FROM ieso.fuel_mix
        UNION ALL SELECT 'intertie_flow', count() FROM ieso.intertie_flow
      `),
      // Get the latest timestamp and now() for comparison
      query<{ max_ts: string; now_ts: string }>(`
        SELECT
          toString(max(timestamp)) as max_ts,
          toString(now()) as now_ts
        FROM ieso.zonal_prices
      `)
    ]);

    return NextResponse.json({
      prices_sample: prices,
      table_counts: counts,
      time_comparison: sample[0],
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Debug error:', error);
    return NextResponse.json({
      error: 'Database error',
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}
