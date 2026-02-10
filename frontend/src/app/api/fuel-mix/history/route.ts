import { query } from '@/lib/clickhouse';
import { NextResponse } from 'next/server';

interface FuelMixHistoryRow {
  timestamp: string;
  fuel_type: string;
  output_mw: number;
}

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const hours = parseInt(searchParams.get('hours') || '6', 10);
  const fuelTypes = searchParams.get('fuel_types'); // comma-separated, e.g. "SOLAR,WIND"

  try {
    const fuelFilter = fuelTypes
      ? `AND fuel_type IN (${fuelTypes.split(',').map((f) => `'${f.trim()}'`).join(',')})`
      : "AND fuel_type != 'REALTIME_TOTAL'";

    const data = await query<FuelMixHistoryRow>(`
      SELECT
        timestamp,
        fuel_type,
        output_mw
      FROM ieso.fuel_mix
      WHERE timestamp >= now() - INTERVAL 5 HOUR - INTERVAL ${hours} HOUR
        ${fuelFilter}
      ORDER BY timestamp ASC
    `);

    return NextResponse.json({
      data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('ClickHouse fuel-mix history error:', error);
    return NextResponse.json(
      { error: 'Database error', message: 'Internal server error' },
      { status: 500 }
    );
  }
}
