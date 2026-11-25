import type { Metadata } from 'next';
import Link from 'next/link';
import SeoShell from '@/components/seo/SeoShell';
import TrendChart from '@/components/seo/TrendChart';
import HouseholdRates from '@/components/seo/HouseholdRates';
import HouseholdBar from '@/components/seo/HouseholdBar';
import Faq from '@/components/seo/Faq';
import styles from '@/components/seo/seo.module.css';
import { getPriceSnapshot, getPriceTrend, ZONE_INFO, type PricingZone } from '@/lib/grid-data';
import { fmtCentsPerKwh, fmtDollarsPerMwh, fmtLocalStamp } from '@/lib/format';
import { RPP_RATES } from '@/data/oeb-rates';

export const revalidate = 300;

const PATH = '/ontario-electricity-price';

export const metadata: Metadata = {
  title: 'Ontario Electricity Price Right Now (Live, Updated Every 5 Minutes)',
  description:
    "Live Ontario electricity prices: the current wholesale price by zone (Toronto, Ottawa and 7 more), the 24-hour trend, and today's Time-of-Use and Ultra-Low Overnight household rates.",
  alternates: { canonical: PATH },
  openGraph: { url: PATH, title: 'Ontario Electricity Price Right Now' },
};

export default async function OntarioElectricityPricePage() {
  const [snapshot, trend] = await Promise.all([getPriceSnapshot(), getPriceTrend()]);

  const faq = [
    {
      q: 'What is the price of electricity in Ontario right now?',
      a: snapshot
        ? `As of ${fmtLocalStamp(snapshot.lastUpdated)}, the average real-time wholesale price across Ontario's nine pricing zones is ${fmtDollarsPerMwh(snapshot.average)} (${fmtCentsPerKwh(snapshot.average)}). Most households instead pay the Ontario Energy Board's regulated rates: ${RPP_RATES.tou.offPeak}¢ to ${RPP_RATES.tou.onPeak}¢ per kWh on Time-of-Use, depending on the time of day.`
        : `Most Ontario households pay the Ontario Energy Board's regulated rates: ${RPP_RATES.tou.offPeak}¢ to ${RPP_RATES.tou.onPeak}¢ per kWh on Time-of-Use, depending on the time of day. The live wholesale price is shown on the GridGPT dashboard.`,
    },
    {
      q: 'Why is the wholesale price different from what I pay?',
      a: "The wholesale price is what the electricity market pays generators every five minutes. Households on the Regulated Price Plan pay fixed rates set by the Ontario Energy Board twice a year, which also recover the cost of long-term generation contracts (the Global Adjustment). Your bill then adds delivery, regulatory charges and HST, minus the Ontario Electricity Rebate.",
    },
    {
      q: 'When is electricity cheapest in Ontario?',
      a: `On Time-of-Use, electricity is cheapest (${RPP_RATES.tou.offPeak}¢/kWh) on weekdays from 7 p.m. to 7 a.m. and all day on weekends and statutory holidays. On the Ultra-Low Overnight plan, 11 p.m. to 7 a.m. costs just ${RPP_RATES.ulo.ultraLow}¢/kWh, but weekday on-peak (4 to 9 p.m.) costs ${RPP_RATES.ulo.onPeak}¢/kWh.`,
    },
    {
      q: 'Why can the wholesale price be negative?',
      a: 'When supply from nuclear, hydro and wind exceeds demand (often overnight or on mild, windy days), the market price can fall below zero so that some generators reduce output or exports increase. Negative wholesale prices do not lower regulated household rates directly.',
    },
    {
      q: 'Does the electricity price differ across Ontario?',
      a: 'Wholesale prices differ by zone because of transmission losses and congestion; northern zones are often cheaper than the Toronto area. Regulated household rates are the same everywhere in the province, but delivery charges vary by local utility.',
    },
  ];

  return (
    <SeoShell path={PATH} crumb="Electricity price">
      <h1 className={styles.h1}>Ontario electricity price right now</h1>
      <p className={styles.lede}>
        The live wholesale price of electricity in Ontario, by zone, from the Independent Electricity System
        Operator (IESO), next to the regulated household rates most Ontarians actually pay.
      </p>

      <HouseholdBar framed />

      {snapshot ? (
        <>
          <div className={styles.asOf}>
            <span className={styles.liveDot} />
            As of {fmtLocalStamp(snapshot.lastUpdated)} · refreshes every 5 minutes
          </div>
          <div className={styles.stats}>
            <div className={styles.stat}>
              <div className={styles.statLabel}>Ontario average (wholesale)</div>
              <div className={styles.statValue}>{fmtDollarsPerMwh(snapshot.average)}</div>
              <div className={styles.statSub}>{fmtCentsPerKwh(snapshot.average)}</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statLabel}>Cheapest zone</div>
              <div className={`${styles.statValue} ${styles.green}`}>{fmtDollarsPerMwh(snapshot.cheapest.price)}</div>
              <div className={styles.statSub}>{ZONE_INFO[snapshot.cheapest.zone as PricingZone]?.name ?? snapshot.cheapest.zone}</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statLabel}>Priciest zone</div>
              <div className={`${styles.statValue} ${styles.red}`}>{fmtDollarsPerMwh(snapshot.priciest.price)}</div>
              <div className={styles.statSub}>{ZONE_INFO[snapshot.priciest.zone as PricingZone]?.name ?? snapshot.priciest.zone}</div>
            </div>
          </div>
        </>
      ) : (
        <div className={styles.unavailable}>Live prices are temporarily unavailable. Household rates below are current.</div>
      )}

      <Link href="/" className={styles.cta}>See prices live on the Ontario grid map →</Link>

      <HouseholdRates />

      {trend && trend.length > 1 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Last 24 hours: average wholesale price</h2>
          <div className={styles.sectionBody}>
            <TrendChart
              points={trend.map((p) => ({ label: p.hour, value: p.price }))}
              unit="$/MWh"
              title="Hourly average Ontario wholesale electricity price over the last 24 hours"
              caption="Hourly average of the nine zonal real-time prices, Eastern time."
            />
          </div>
        </section>
      )}

      {snapshot && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Price by zone</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Zone</th>
                  <th>Includes</th>
                  <th className={styles.num}>$/MWh</th>
                  <th className={styles.num}>¢/kWh</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.zones.map((z) => {
                  const info = ZONE_INFO[z.zone as PricingZone];
                  return (
                    <tr key={z.zone}>
                      <td>
                        <Link href={`/electricity-price/${z.zone.toLowerCase()}`}>{info?.name ?? z.zone}</Link>
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>{info?.places ?? ''}</td>
                      <td className={styles.num}>{z.price.toFixed(2)}</td>
                      <td className={styles.num}>{(z.price / 10).toFixed(1)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>How Ontario electricity prices work</h2>
        <div className={`${styles.sectionBody} ${styles.prose}`}>
          <p>
            Since the IESO&apos;s Market Renewal in May 2025, Ontario&apos;s wholesale market sets a separate price for
            each of nine zones every five minutes. The price reflects the cost of the last generator needed to meet
            demand, plus the cost of transmission losses and congestion into that zone.
          </p>
          <p>
            <strong>Households and small businesses</strong> are usually on the Regulated Price Plan (RPP) and pay
            Time-of-Use, Ultra-Low Overnight or Tiered rates set by the Ontario Energy Board each November 1. Those
            rates already include the Global Adjustment, so they are higher than the typical wholesale price.
          </p>
          <p>
            <strong>Large consumers and retail-contract customers</strong> pay the wholesale price plus the Global
            Adjustment separately, which is why the live market price matters to them hour by hour.
          </p>
        </div>
      </section>

      <Faq items={faq} />
    </SeoShell>
  );
}
