// Household Regulated Price Plan (RPP) period logic: which TOU / ULO price applies right now,
// and when the next cheaper period starts. All calendar math is in America/Toronto.
import { RPP_RATES } from '@/data/oeb-rates';

const TZ = 'America/Toronto';

interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number; // 0-23
  weekday: number; // 0 = Sunday
  ymd: string; // YYYY-MM-DD
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const toLocalParts = (date: Date): LocalParts => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const year = Number(get('year'));
  const month = Number(get('month'));
  const day = Number(get('day'));
  return {
    year,
    month,
    day,
    hour: Number(get('hour')),
    weekday: WEEKDAYS.indexOf(get('weekday')),
    ymd: `${get('year')}-${get('month')}-${get('day')}`,
  };
};

// ---------- Holidays (OEB: statutory holidays; weekend holidays move to the next free weekday) ----------

const pad = (n: number) => String(n).padStart(2, '0');
const ymdOf = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const utcDate = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

const nthWeekday = (y: number, m: number, weekday: number, n: number) => {
  const first = utcDate(y, m, 1);
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return utcDate(y, m, 1 + offset + (n - 1) * 7);
};

// Anonymous Gregorian algorithm
const easterSunday = (y: number) => {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return utcDate(y, month, day);
};

const holidayCache = new Map<number, Set<string>>();

export const ontarioRppHolidays = (y: number): Set<string> => {
  const cached = holidayCache.get(y);
  if (cached) return cached;

  const victoria = (() => {
    // Monday before May 25
    const may24 = utcDate(y, 5, 24);
    const back = (may24.getUTCDay() + 6) % 7; // days since Monday
    return utcDate(y, 5, 24 - back);
  })();
  const easter = easterSunday(y);
  const goodFriday = new Date(easter.getTime() - 2 * 86400000);

  const base = [
    utcDate(y, 1, 1), // New Year's Day
    nthWeekday(y, 2, 1, 3), // Family Day
    goodFriday,
    victoria,
    utcDate(y, 7, 1), // Canada Day
    nthWeekday(y, 8, 1, 1), // Civic Holiday
    nthWeekday(y, 9, 1, 1), // Labour Day
    nthWeekday(y, 10, 1, 2), // Thanksgiving
    utcDate(y, 12, 25), // Christmas
    utcDate(y, 12, 26), // Boxing Day
  ].sort((a, b) => a.getTime() - b.getTime());

  const taken = new Set<string>();
  for (const d of base) {
    let cur = d;
    while (cur.getUTCDay() === 0 || cur.getUTCDay() === 6 || taken.has(ymdOf(cur))) {
      cur = new Date(cur.getTime() + 86400000);
    }
    taken.add(ymdOf(cur));
  }
  holidayCache.set(y, taken);
  return taken;
};

// ---------- Periods ----------

export type TouPeriod = 'off-peak' | 'mid-peak' | 'on-peak';
export type UloPeriod = 'ultra-low' | 'weekend-off-peak' | 'mid-peak' | 'on-peak';

const isOffDay = (p: LocalParts) =>
  p.weekday === 0 || p.weekday === 6 || ontarioRppHolidays(p.year).has(p.ymd);

// Winter TOU (Nov 1 - Apr 30): on-peak 7-11 & 17-19, mid-peak 11-17, off-peak 19-7, weekends/holidays off-peak.
export const touPeriodAt = (p: LocalParts): TouPeriod => {
  if (isOffDay(p)) return 'off-peak';
  if ((p.hour >= 7 && p.hour < 11) || (p.hour >= 17 && p.hour < 19)) return 'on-peak';
  if (p.hour >= 11 && p.hour < 17) return 'mid-peak';
  return 'off-peak';
};

// ULO (same all year): ultra-low 23-7 every day; weekends/holidays 7-23 weekend off-peak;
// weekdays mid-peak 7-16 & 21-23, on-peak 16-21.
export const uloPeriodAt = (p: LocalParts): UloPeriod => {
  if (p.hour >= 23 || p.hour < 7) return 'ultra-low';
  if (isOffDay(p)) return 'weekend-off-peak';
  if (p.hour >= 16 && p.hour < 21) return 'on-peak';
  return 'mid-peak';
};

export const touPrice = (period: TouPeriod) =>
  ({ 'off-peak': RPP_RATES.tou.offPeak, 'mid-peak': RPP_RATES.tou.midPeak, 'on-peak': RPP_RATES.tou.onPeak })[period];

export const uloPrice = (period: UloPeriod) =>
  ({
    'ultra-low': RPP_RATES.ulo.ultraLow,
    'weekend-off-peak': RPP_RATES.ulo.weekendOffPeak,
    'mid-peak': RPP_RATES.ulo.midPeak,
    'on-peak': RPP_RATES.ulo.onPeak,
  })[period];

/** Everyday wording for Time-of-Use periods, for people who don't know the industry terms */
export const TOU_PLAIN_LABEL: Record<TouPeriod, string> = {
  'off-peak': 'Lowest rate',
  'mid-peak': 'Mid-day rate',
  'on-peak': 'Peak rate (highest)',
};

export const ULO_PLAIN_LABEL: Record<UloPeriod, string> = {
  'ultra-low': 'Overnight rate (lowest)',
  'weekend-off-peak': 'Weekend daytime rate',
  'mid-peak': 'Weekday daytime rate',
  'on-peak': 'Weekday evening peak (highest)',
};

export const PERIOD_LABEL: Record<TouPeriod | UloPeriod, string> = {
  'off-peak': 'Off-peak',
  'mid-peak': 'Mid-peak',
  'on-peak': 'On-peak',
  'ultra-low': 'Ultra-low overnight',
  'weekend-off-peak': 'Weekend off-peak',
};

/** Rates are only shown while the date is inside the confirmed schedule window. */
export const ratesAreCurrent = (now: Date) => {
  const { ymd } = toLocalParts(now);
  return ymd >= RPP_RATES.effectiveFrom && ymd <= RPP_RATES.validUntil;
};

export interface PlanStatus<P extends string> {
  period: P;
  price: number;
  /** Next time the price drops, or null if already at the plan's cheapest price */
  nextCheaper: { at: Date; period: P; price: number } | null;
  /** Next time the price changes in either direction */
  nextChange: { at: Date; period: P; price: number } | null;
}

const HOUR = 3600000;

const planStatus = <P extends string>(
  now: Date,
  periodAt: (p: LocalParts) => P,
  priceOf: (p: P) => number,
): PlanStatus<P> => {
  const period = periodAt(toLocalParts(now));
  const price = priceOf(period);
  // Walk forward hour by hour (top of each local hour) for up to 4 days.
  const startOfNextHour = new Date(Math.floor(now.getTime() / HOUR) * HOUR + HOUR);
  let nextChange: PlanStatus<P>['nextChange'] = null;
  for (let i = 0; i < 96; i++) {
    const t = new Date(startOfNextHour.getTime() + i * HOUR);
    const p = periodAt(toLocalParts(t));
    const candidate = { at: t, period: p, price: priceOf(p) };
    if (!nextChange && candidate.price !== price) nextChange = candidate;
    if (candidate.price < price) return { period, price, nextCheaper: candidate, nextChange };
  }
  return { period, price, nextCheaper: null, nextChange };
};

export const touStatus = (now: Date) => planStatus<TouPeriod>(now, touPeriodAt, touPrice);
export const uloStatus = (now: Date) => planStatus<UloPeriod>(now, uloPeriodAt, uloPrice);

/** Commodity (energy-only) cost on the tiered plan, in dollars. */
export const tieredMonthlyCost = (kwh: number) => {
  const { tier1, tier2, residentialThresholdKwh } = RPP_RATES.tiered;
  const low = Math.min(kwh, residentialThresholdKwh);
  const high = Math.max(0, kwh - residentialThresholdKwh);
  return (low * tier1 + high * tier2) / 100;
};

/** Compact time for tight UI: "7 p.m." if later today, otherwise "Sat 7 a.m." */
export const formatShortTime = (date: Date, now: Date = new Date()) => {
  const p = toLocalParts(date);
  const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  const time = `${h12} ${p.hour < 12 ? 'a.m.' : 'p.m.'}`;
  return p.ymd === toLocalParts(now).ymd ? time : `${WEEKDAYS[p.weekday]} ${time}`;
};

export const formatLocalTime = (date: Date) =>
  date.toLocaleString('en-CA', { timeZone: TZ, weekday: 'short', hour: 'numeric', minute: '2-digit' });
