import { query } from '@/lib/clickhouse';
import { NextResponse } from 'next/server';

interface AdequacyRow {
  delivery_date: string;
  delivery_hour: number;
  demand_mw: number;
}

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Get today and tomorrow's dates in Eastern timezone (IESO's timezone)
    const now = new Date();
    const today = now.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
      .toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });

    // Query peak demand for today and tomorrow from adequacy forecast (ForecastOntDemand)
    // Using forecast data for both to show the expected peak for the full day
    const [todayPeakData, tomorrowPeakData] = await Promise.all([
      // Today's forecasted peak from adequacy
      query<AdequacyRow>(`
        SELECT
          delivery_date,
          delivery_hour,
          anyLast(forecast_demand_mw) as demand_mw
        FROM ieso.adequacy
        WHERE delivery_date = '${today}'
        GROUP BY delivery_date, delivery_hour
        ORDER BY demand_mw DESC
        LIMIT 1
      `),
      // Tomorrow's forecast peak from adequacy
      query<AdequacyRow>(`
        SELECT
          delivery_date,
          delivery_hour,
          anyLast(forecast_demand_mw) as demand_mw
        FROM ieso.adequacy
        WHERE delivery_date = '${tomorrow}'
        GROUP BY delivery_date, delivery_hour
        ORDER BY demand_mw DESC
        LIMIT 1
      `)
    ]);

    // Build response - both today and tomorrow now use AdequacyRow format
    const response: {
      today: { peakMw: number; peakHour: number };
      tomorrow: { peakMw: number; peakHour: number } | null;
    } = {
      today: todayPeakData.length > 0
        ? { peakMw: todayPeakData[0].demand_mw, peakHour: todayPeakData[0].delivery_hour }
        : { peakMw: 0, peakHour: 0 },
      tomorrow: tomorrowPeakData.length > 0
        ? { peakMw: tomorrowPeakData[0].demand_mw, peakHour: tomorrowPeakData[0].delivery_hour }
        : null
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('ClickHouse error:', error);
    return NextResponse.json(
      { error: 'Database error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
