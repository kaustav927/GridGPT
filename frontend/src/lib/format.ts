// Shared number/time formatting for server-rendered pages.

export const fmtDollarsPerMwh = (v: number) => `$${v.toFixed(2)}/MWh`;

/** Wholesale $/MWh expressed as ¢/kWh (1 $/MWh = 0.1 ¢/kWh) */
export const fmtCentsPerKwh = (dollarsPerMwh: number) => `${(dollarsPerMwh / 10).toFixed(1)}¢/kWh`;

export const fmtMw = (v: number) => `${Math.round(v).toLocaleString('en-CA')} MW`;

export const fmtMwh = (v: number) => `${Math.round(Math.abs(v)).toLocaleString('en-CA')} MWh`;

export const fmtPct = (v: number, digits = 0) => `${v.toFixed(digits)}%`;

/** ClickHouse naive Ontario-local timestamp ("2026-11-25 14:05:00") to a readable label */
export const fmtLocalStamp = (stamp: string) => {
  const [date, time] = stamp.split(' ');
  if (!date || !time) return stamp;
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const month = new Date(Date.UTC(y, m - 1, d)).toLocaleString('en-CA', { month: 'short', timeZone: 'UTC' });
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${month} ${d}, ${h12}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'a.m.' : 'p.m.'} Eastern`;
};

/** Hour of day (0-23) to "6 p.m." */
export const fmtHour = (hour: number) => {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12} ${hour < 12 ? 'a.m.' : 'p.m.'}`;
};

export const FUEL_LABELS: Record<string, string> = {
  NUCLEAR: 'Nuclear',
  GAS: 'Natural gas',
  HYDRO: 'Hydro',
  WIND: 'Wind',
  SOLAR: 'Solar',
  BIOFUEL: 'Biofuel',
  OTHER: 'Other',
};
