// Ontario Regulated Price Plan (RPP) household rates, in cents per kWh.
//
// Sources (checked 2026-11-25):
// - Prices: https://www.oeb.ca/consumer-information-and-protection/electricity-rates/historical-electricity-rates
// - Winter TOU / ULO hours: https://www.torontohydro.com/for-home/rates ("Winter TOU price periods from
//   November 1, 2026 to April 30, 2027"; "ULO price periods are the same in the summer as they are in the winter")
// - Holiday rule: https://www.oeb.ca/consumer-information-and-protection/electricity-rates/holiday-schedule-time-use-and-ultra-low
//
// MAINTENANCE: rates change on Nov 1 (and sometimes May 1). The weekly maintenance agent updates this file.
// TOU hours here are the WINTER schedule only; summer TOU hours were not confirmed from a text source,
// so consumer widgets hide themselves after `validUntil` rather than show possibly wrong hours.

export interface RppRates {
  effectiveFrom: string; // YYYY-MM-DD, Ontario local
  validUntil: string; // YYYY-MM-DD inclusive; widgets hide after this date
  tou: { offPeak: number; midPeak: number; onPeak: number };
  ulo: { ultraLow: number; weekendOffPeak: number; midPeak: number; onPeak: number };
  tiered: { tier1: number; tier2: number; residentialThresholdKwh: number };
  sources: { label: string; url: string }[];
}

export const RPP_RATES: RppRates = {
  effectiveFrom: '2026-11-01',
  validUntil: '2027-04-30',
  tou: { offPeak: 9.1, midPeak: 14.6, onPeak: 18.9 },
  ulo: { ultraLow: 3.7, weekendOffPeak: 9.1, midPeak: 14.6, onPeak: 37.7 },
  tiered: { tier1: 11.2, tier2: 13.2, residentialThresholdKwh: 1000 },
  sources: [
    {
      label: 'Ontario Energy Board: historical electricity rates',
      url: 'https://www.oeb.ca/consumer-information-and-protection/electricity-rates/historical-electricity-rates',
    },
    {
      label: 'Ontario Energy Board: holiday schedule',
      url: 'https://www.oeb.ca/consumer-information-and-protection/electricity-rates/holiday-schedule-time-use-and-ultra-low',
    },
  ],
};
