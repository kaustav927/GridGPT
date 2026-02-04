import { NextResponse } from 'next/server';
import { query } from '@/lib/clickhouse';

export const dynamic = 'force-dynamic';

interface WeatherAtTime {
  zone: string;
  temperature: number;
  wind_speed: number;
  wind_direction: number;
  cloud_cover: number;
  precipitation: number;
  is_forecast: number;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const timestamp = searchParams.get('timestamp') || new Date().toISOString();

    // Sanitize timestamp for SQL
    const sanitizedTs = timestamp.replace(/[^0-9TZ:.+-]/g, '');

    // Find weather data closest to requested timestamp
    // Uses the most recent fetch that has data for the requested valid_timestamp
    const data = await query<WeatherAtTime>(`
      SELECT
        zone,
        argMax(temperature, fetch_timestamp) as temperature,
        argMax(wind_speed, fetch_timestamp) as wind_speed,
        argMax(wind_direction, fetch_timestamp) as wind_direction,
        argMax(cloud_cover, fetch_timestamp) as cloud_cover,
        argMax(precipitation, fetch_timestamp) as precipitation,
        argMax(is_forecast, fetch_timestamp) as is_forecast
      FROM ieso.weather
      WHERE valid_timestamp >= parseDateTimeBestEffort('${sanitizedTs}') - INTERVAL 30 MINUTE
        AND valid_timestamp <= parseDateTimeBestEffort('${sanitizedTs}') + INTERVAL 30 MINUTE
      GROUP BY zone
      ORDER BY zone
    `);

    return NextResponse.json({
      data,
      timestamp,
      count: data.length,
    });
  } catch (error) {
    console.error('ClickHouse error:', error);
    return NextResponse.json(
      { error: 'Database error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
