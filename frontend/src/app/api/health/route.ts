// Health check used by the weekly maintenance agent (and any uptime monitor).
// Reports data freshness per table, whether the basemap tiles load for our domain,
// and the configured chat model. Returns 503 if any check fails.
import { NextResponse } from 'next/server';
import { query } from '@/lib/clickhouse';
import { CHAT_MODEL } from '@/lib/chat/model';
import { SITE_URL } from '@/lib/site';

export const dynamic = 'force-dynamic';

// Max acceptable age (minutes) of the newest row in each table. IESO hourly reports lag by a few hours.
const FRESHNESS: Record<string, number> = {
  zonal_prices: 30,
  zonal_demand: 30,
  intertie_flow: 180,
  realtime_intertie_lmp: 180,
  generator_output: 300,
  fuel_mix: 300,
};

const STADIA_TEST_TILE = 'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/6/17/23.png';

/** ClickHouse stores naive Ontario-local timestamps ("2026-11-25 14:05:00"); convert to a real instant. */
const torontoLocalToDate = (stamp: string): Date | null => {
  const m = stamp.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m.map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi, s);
  const offsetLabel = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Toronto', timeZoneName: 'shortOffset' })
    .formatToParts(new Date(asUtc))
    .find((p) => p.type === 'timeZoneName')?.value; // e.g. "GMT-5"
  const offsetHours = Number(offsetLabel?.replace('GMT', '') || 0);
  return new Date(asUtc - offsetHours * 3600000);
};

const checkTable = async (table: string, maxAgeMin: number) => {
  try {
    const rows = await query<{ latest: string }>(
      `SELECT toString(max(timestamp)) AS latest FROM ieso.${table}`,
      { revalidate: 60 },
    );
    const latest = rows[0]?.latest ?? '';
    const at = torontoLocalToDate(latest);
    const ageMinutes = at ? Math.round((Date.now() - at.getTime()) / 60000) : null;
    const ok = ageMinutes !== null && ageMinutes <= maxAgeMin;
    return { table, ok, latest, ageMinutes, maxAgeMinutes: maxAgeMin };
  } catch (error) {
    return { table, ok: false, error: error instanceof Error ? error.message : 'query failed', maxAgeMinutes: maxAgeMin };
  }
};

const checkBasemap = async () => {
  try {
    // Stadia authenticates by domain, so present the production site as the referrer.
    const res = await fetch(STADIA_TEST_TILE, {
      headers: { Referer: `${SITE_URL}/`, Origin: SITE_URL },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    const type = res.headers.get('content-type') ?? '';
    return { ok: res.ok && type.startsWith('image/'), status: res.status, contentType: type };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'fetch failed' };
  }
};

export async function GET() {
  const [tables, basemap] = await Promise.all([
    Promise.all(Object.entries(FRESHNESS).map(([t, max]) => checkTable(t, max))),
    checkBasemap(),
  ]);
  const ok = tables.every((t) => t.ok) && basemap.ok;

  return NextResponse.json(
    {
      status: ok ? 'ok' : 'degraded',
      checkedAt: new Date().toISOString(),
      data: tables,
      basemap,
      chatModel: CHAT_MODEL,
    },
    { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
