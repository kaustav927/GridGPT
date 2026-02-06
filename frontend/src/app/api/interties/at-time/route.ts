import { query } from '@/lib/clickhouse';
import { NextResponse } from 'next/server';

interface IntertieFlowRow {
  flow_group: string;
  mw: number;
  actual_mw: number;
  scheduled_mw: number;
  last_updated: string;
}

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const timestamp = searchParams.get('timestamp') || new Date().toISOString();
    const requestedTime = new Date(timestamp);
    const now = new Date();

    // Sanitize timestamp for SQL
    const sanitizedTs = timestamp.replace(/[^0-9TZ:.+-]/g, '');

    // Future time: use scheduled_mw (actual_mw won't exist yet)
    // IESO only publishes schedules for the current hour, not future hours.
    // For future times beyond available data, fall back to the latest scheduled values.
    if (requestedTime > now) {
      // First try exact hour match
      let data = await query<IntertieFlowRow>(`
        WITH target_ts AS (
          SELECT parseDateTimeBestEffort('${sanitizedTs}') as ts
        )
        SELECT
          flow_group,
          sum(avg_scheduled) as mw,
          0 as actual_mw,
          sum(avg_scheduled) as scheduled_mw,
          max(latest_ts) as last_updated
        FROM (
          SELECT
            CASE
              WHEN intertie IN ('MANITOBA', 'MANITOBA SK') THEN 'MANITOBA'
              WHEN intertie LIKE 'PQ%' THEN 'QUEBEC'
              ELSE intertie
            END as flow_group,
            avg(scheduled_mw) as avg_scheduled,
            max(timestamp) as latest_ts
          FROM ieso.intertie_flow
          WHERE toStartOfHour(timestamp) = toStartOfHour((SELECT ts FROM target_ts))
          GROUP BY intertie
        )
        GROUP BY flow_group
        ORDER BY flow_group
      `);

      // Fallback: if no data for requested hour, use latest available scheduled data
      if (data.length === 0) {
        data = await query<IntertieFlowRow>(`
          SELECT
            flow_group,
            sum(avg_scheduled) as mw,
            0 as actual_mw,
            sum(avg_scheduled) as scheduled_mw,
            max(latest_ts) as last_updated
          FROM (
            SELECT
              CASE
                WHEN intertie IN ('MANITOBA', 'MANITOBA SK') THEN 'MANITOBA'
                WHEN intertie LIKE 'PQ%' THEN 'QUEBEC'
                ELSE intertie
              END as flow_group,
              avg(scheduled_mw) as avg_scheduled,
              max(timestamp) as latest_ts
            FROM ieso.intertie_flow
            WHERE timestamp >= now() - INTERVAL 2 HOUR
            GROUP BY intertie, toStartOfHour(timestamp)
            ORDER BY intertie, toStartOfHour(timestamp) DESC
            LIMIT 1 BY intertie
          )
          GROUP BY flow_group
          ORDER BY flow_group
        `);
      }

      return NextResponse.json({
        data,
        timestamp,
        source: 'scheduled',
      }, {
        headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=300' },
      });
    }

    // Historical: find nearest intertie data within ±2 hour window of requested time
    // Aggregates by flow_group and finds the hour closest to the requested timestamp
    const data = await query<IntertieFlowRow>(`
      WITH target_ts AS (
        SELECT parseDateTimeBestEffort('${sanitizedTs}') as ts
      )
      SELECT
        flow_group,
        sum(avg_mw) as mw,
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
        WHERE timestamp >= (SELECT ts FROM target_ts) - INTERVAL 2 HOUR
          AND timestamp <= (SELECT ts FROM target_ts) + INTERVAL 5 MINUTE
        GROUP BY intertie, toStartOfHour(timestamp)
        ORDER BY intertie, abs(toInt64(toStartOfHour(timestamp)) - toInt64(toStartOfHour((SELECT ts FROM target_ts))))
        LIMIT 1 BY intertie
      )
      GROUP BY flow_group
      ORDER BY flow_group
    `);

    return NextResponse.json({
      data,
      timestamp,
      source: 'actual',
    }, {
      headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=300' },
    });
  } catch (error) {
    console.error('ClickHouse intertie at-time error:', error);
    return NextResponse.json(
      { error: 'Database error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
