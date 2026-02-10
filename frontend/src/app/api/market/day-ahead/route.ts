import { query } from '@/lib/clickhouse';
import { NextResponse } from 'next/server';

interface DaOzpRow {
  delivery_date: string;
  delivery_hour: number;
  zonal_price: number;
}

interface AdequacyRow {
  delivery_date: string;
  delivery_hour: number;
  forecast_demand_mw: number;
  forecast_supply_mw: number;
}

export const dynamic = 'force-dynamic';

// Get date string in Eastern timezone (IESO operates in Eastern time)
function getEasternDateString(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
}

// Convert IESO delivery date + hour to UTC timestamp
// IESO uses hour 1-24 where hour 1 = midnight to 1am Eastern
function iesoToUtcTimestamp(deliveryDate: string, deliveryHour: number): string {
  const [year, month, day] = deliveryDate.split('-').map(Number);
  // IESO hour 1 = 00:00-01:00, hour 24 = 23:00-24:00
  const hour = deliveryHour - 1; // Convert to 0-23

  // For Toronto/Eastern time:
  // - EST (Standard Time): UTC-5, used roughly Nov-Mar
  // - EDT (Daylight Time): UTC-4, used roughly Mar-Nov
  // DST starts 2nd Sunday of March, ends 1st Sunday of November

  // Simple but accurate check: February is always EST (UTC-5)
  // For a more complete solution, we'd check exact DST boundaries
  // but for the grid dashboard, this simplified version works

  // Check if date is in DST period (approximate: March 15 - November 1)
  const isDST = (month > 3 && month < 11) ||
    (month === 3 && day >= 15) ||
    (month === 11 && day < 7);

  const utcOffsetHours = isDST ? 4 : 5;

  // Create UTC timestamp: Eastern hour + offset = UTC hour
  // E.g., 00:00 ET (hour 0) + 5 hours = 05:00 UTC in EST
  const utcMs = Date.UTC(year, month - 1, day, hour + utcOffsetHours, 0, 0, 0);

  return new Date(utcMs).toISOString();
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const targetDate = searchParams.get('date') || 'today'; // 'today' or 'tomorrow'

    // Get today and tomorrow in Eastern timezone (IESO's timezone)
    const now = new Date();
    const todayEastern = getEasternDateString(now);
    const tomorrowEastern = getEasternDateString(new Date(now.getTime() + 24 * 60 * 60 * 1000));

    // Select which date to query based on parameter
    const queryDate = targetDate === 'tomorrow' ? tomorrowEastern : todayEastern;

    // Execute queries in parallel
    // - Prices from da_ozp (Day-Ahead Ontario Zonal Prices)
    // - Demand and supply forecast from adequacy (Adequacy3 report)
    const [priceData, adequacyData] = await Promise.all([
      // Day-ahead zonal prices (average across zones) for the target date
      query<DaOzpRow>(`
        SELECT
          delivery_date,
          delivery_hour,
          avg(zonal_price) as zonal_price
        FROM ieso.da_ozp
        WHERE delivery_date = '${queryDate}'
        GROUP BY delivery_date, delivery_hour
        ORDER BY delivery_hour ASC
      `),
      // Day-ahead demand and supply forecast from adequacy (Adequacy3 report)
      query<AdequacyRow>(`
        SELECT
          delivery_date,
          delivery_hour,
          anyLast(forecast_demand_mw) as forecast_demand_mw,
          anyLast(forecast_supply_mw) as forecast_supply_mw
        FROM ieso.adequacy
        WHERE delivery_date = '${queryDate}'
        GROUP BY delivery_date, delivery_hour
        ORDER BY delivery_hour ASC
      `)
    ]);

    // Create maps for quick lookup: "hour" -> value
    const priceByHour = new Map<number, number>();
    priceData.forEach(row => {
      priceByHour.set(row.delivery_hour, row.zonal_price);
    });

    const demandByHour = new Map<number, number>();
    const supplyByHour = new Map<number, number>();
    adequacyData.forEach(row => {
      demandByHour.set(row.delivery_hour, row.forecast_demand_mw);
      supplyByHour.set(row.delivery_hour, row.forecast_supply_mw);
    });

    // Generate data points mapped to TODAY's timestamps for overlay comparison
    // Tomorrow's DA forecast for hour X -> display at today's hour X position
    const data = [];

    for (let hour = 1; hour <= 24; hour++) {
      const price = priceByHour.get(hour);
      const demand = demandByHour.get(hour);
      const supply = supplyByHour.get(hour);

      // Only add if we have at least some data
      if (price !== undefined || demand !== undefined || supply !== undefined) {
        data.push({
          // Use TODAY's timestamp for overlay effect
          timestamp: iesoToUtcTimestamp(todayEastern, hour),
          da_demand_mw: demand ?? null,
          da_supply_mw: supply ?? null,
          da_price: price ?? null,
        });
      }
    }

    return NextResponse.json({
      data,
      forecastDate: queryDate,
      targetDate,
      hasData: data.length > 0,
      today: todayEastern,
      tomorrow: tomorrowEastern,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('ClickHouse error:', error);
    return NextResponse.json(
      { error: 'Database error', message: 'Internal server error' },
      { status: 500 }
    );
  }
}
