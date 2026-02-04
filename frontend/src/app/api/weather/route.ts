import { NextResponse } from 'next/server';
import { query } from '@/lib/clickhouse';

export const dynamic = 'force-dynamic';

interface WeatherRow {
  zone: string;
  temperature: number;
  wind_speed: number;
  wind_direction: number;
  cloud_cover: number;
  precipitation: number;
  last_updated: string;
}

export async function GET() {
  try {
    // Get most recent weather data for each zone
    // Prefer observed data (is_forecast=0) but fall back to forecast if needed
    const data = await query<WeatherRow>(`
      SELECT
        zone,
        argMax(temperature, fetch_timestamp) as temperature,
        argMax(wind_speed, fetch_timestamp) as wind_speed,
        argMax(wind_direction, fetch_timestamp) as wind_direction,
        argMax(cloud_cover, fetch_timestamp) as cloud_cover,
        argMax(precipitation, fetch_timestamp) as precipitation,
        max(fetch_timestamp) as last_updated
      FROM ieso.weather
      WHERE valid_timestamp >= now() - INTERVAL 1 HOUR
        AND valid_timestamp <= now() + INTERVAL 1 HOUR
        AND is_forecast = 0
      GROUP BY zone
      ORDER BY zone
    `);

    return NextResponse.json({
      data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('ClickHouse error:', error);
    return NextResponse.json(
      { error: 'Database error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
