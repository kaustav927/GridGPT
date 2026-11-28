import { NextResponse } from 'next/server';

// Successful dashboard API responses are cached on Vercel's CDN, so however many browser tabs
// (or bots) poll a route, the function itself runs at most about once per `sMaxAge` seconds per URL.
// IESO data only changes every 5 minutes, so 30 seconds is still effectively live.
// Use only for success responses; errors should stay uncached.
export const cachedJson = (body: unknown, sMaxAge = 30) =>
  NextResponse.json(body, {
    headers: { 'Cache-Control': `public, s-maxage=${sMaxAge}, stale-while-revalidate=${sMaxAge * 4}` },
  });
