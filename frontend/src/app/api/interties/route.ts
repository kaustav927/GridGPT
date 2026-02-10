import { query } from '@/lib/clickhouse';
import { NextResponse } from 'next/server';

interface IntertieFlowRow {
  flow_group: string;
  actual_mw: number;
  scheduled_mw: number;
  last_updated: string;
}

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Aggregate actual_mw per IESO zone for the latest hour, then group into display groups.
    // IESO convention: positive flow = export from Ontario, negative = import into Ontario.
    // Average across all 5-min intervals within the hour for a stable hourly value.
    const data = await query<IntertieFlowRow>(`
      SELECT
        flow_group,
        sum(avg_mw) as actual_mw,
        sum(avg_scheduled) as scheduled_mw,
        max(latest_ts) as last_updated
      FROM (
        SELECT
          CASE
            WHEN intertie IN ('MANITOBA', 'MANITOBA SK') THEN 'MANITOBA'
            WHEN intertie LIKE 'PQ%' THEN 'QUEBEC'
            ELSE intertie
          END as flow_group,
          avg(actual_mw) as avg_mw,
          avg(scheduled_mw) as avg_scheduled,
          max(timestamp) as latest_ts
        FROM ieso.intertie_flow
        WHERE toStartOfHour(timestamp) = (
          SELECT toStartOfHour(max(timestamp)) FROM ieso.intertie_flow
        )
        GROUP BY intertie
      )
      GROUP BY flow_group
      ORDER BY flow_group
    `);

    return NextResponse.json({
      data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('ClickHouse intertie error:', error);
    return NextResponse.json(
      { error: 'Database error', message: 'Internal server error' },
      { status: 500 }
    );
  }
}
