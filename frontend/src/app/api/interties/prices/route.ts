import { query } from '@/lib/clickhouse';
import { NextResponse } from 'next/server';

interface IntertieLmpRow {
  intertie_zone: string;
  lmp: number;
  timestamp: string;
}

// Map IESO intertie zone names to display names
const INTERTIE_ZONE_MAP: Record<string, string> = {
  'MICH': 'MICHIGAN',
  'MICHIGAN': 'MICHIGAN',
  'MINN': 'MINNESOTA',
  'MINNESOTA': 'MINNESOTA',
  'MANIT': 'MANITOBA',
  'MANITOBA': 'MANITOBA',
  'PQ.AT': 'QUEBEC',
  'PQ.B5D.B31L': 'QUEBEC',
  'PQ.D4Z': 'QUEBEC',
  'PQ.D5A': 'QUEBEC',
  'PQ.H4Z': 'QUEBEC',
  'PQ.H9A': 'QUEBEC',
  'PQ.P33C': 'QUEBEC',
  'PQ.Q4C': 'QUEBEC',
  'PQ.X2Y': 'QUEBEC',
  'NYISO': 'NEW-YORK',
  'NEW-YORK': 'NEW-YORK',
};

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Get latest LMP for each intertie zone
    const lmpData = await query<IntertieLmpRow>(`
      SELECT
        intertie_zone,
        anyLast(lmp) as lmp,
        max(timestamp) as timestamp
      FROM ieso.realtime_intertie_lmp
      WHERE timestamp >= now() - INTERVAL 1 HOUR
      GROUP BY intertie_zone
      ORDER BY intertie_zone ASC
    `);

    // Aggregate Quebec zones and normalize zone names
    const aggregated: Record<string, { lmp: number; count: number; timestamp: string }> = {};

    for (const row of lmpData) {
      const normalizedZone = INTERTIE_ZONE_MAP[row.intertie_zone] || row.intertie_zone;

      if (aggregated[normalizedZone]) {
        aggregated[normalizedZone].lmp += row.lmp;
        aggregated[normalizedZone].count += 1;
        // Keep the most recent timestamp
        if (row.timestamp > aggregated[normalizedZone].timestamp) {
          aggregated[normalizedZone].timestamp = row.timestamp;
        }
      } else {
        aggregated[normalizedZone] = {
          lmp: row.lmp,
          count: 1,
          timestamp: row.timestamp
        };
      }
    }

    // Calculate averages and format response
    const data = Object.entries(aggregated).map(([zone, { lmp, count, timestamp }]) => ({
      intertie_zone: zone,
      lmp: lmp / count,
      timestamp
    }));

    return NextResponse.json({
      data,
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
