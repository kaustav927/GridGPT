import type { Metadata } from 'next';
import Link from 'next/link';
import SeoShell from '@/components/seo/SeoShell';
import TrendChart from '@/components/seo/TrendChart';
import Faq from '@/components/seo/Faq';
import styles from '@/components/seo/seo.module.css';
import { getDemand } from '@/lib/grid-data';
import { fmtHour, fmtLocalStamp, fmtMw } from '@/lib/format';

export const revalidate = 300;

const PATH = '/ontario-electricity-demand';

export const metadata: Metadata = {
  title: "Ontario Electricity Demand Today (Live MW and Today's Forecast Peak)",
  description:
    "Live Ontario electricity demand in megawatts, the last 24 hours, and the IESO's forecast peak for today and tomorrow, plus when demand usually peaks and why.",
  alternates: { canonical: PATH },
  openGraph: { url: PATH, title: 'Ontario electricity demand today' },
};

// IESO delivery hours are "hour ending": hour 18 covers 5–6 p.m.
const peakWindow = (hourEnding: number) => `${fmtHour((hourEnding + 23) % 24)}–${fmtHour(hourEnding % 24)}`;

export default async function DemandPage() {
  const demand = await getDemand();

  const faq = [
    {
      q: 'What is Ontario’s electricity demand right now?',
      a: demand
        ? `As of ${fmtLocalStamp(demand.lastUpdated)}, Ontario demand is ${fmtMw(demand.ontarioMw)}.${demand.todayPeak ? ` The IESO forecasts today's peak at ${fmtMw(demand.todayPeak.mw)} between ${peakWindow(demand.todayPeak.hour)}.` : ''}`
        : 'Ontario demand typically ranges from about 12,000 MW overnight to over 20,000 MW on the hottest or coldest days. Live demand is shown on the GridGPT dashboard.',
    },
    {
      q: 'When is electricity demand highest in Ontario?',
      a: 'Daily demand usually peaks in the late afternoon and early evening (about 5 to 7 p.m. in winter, mid-to-late afternoon in summer). Ontario’s annual peaks happen during summer heat waves, when air conditioning load is highest.',
    },
    {
      q: 'What is the difference between Ontario demand and market demand?',
      a: 'Ontario demand is the electricity consumed inside the province. Market demand adds exports to neighbouring grids, so it is the total amount Ontario generators must supply.',
    },
  ];

  return (
    <SeoShell path={PATH} crumb="Demand">
      <h1 className={styles.h1}>Ontario electricity demand today</h1>
      <p className={styles.lede}>
        How much electricity Ontario is using right now, how it changed over the last day, and the IESO&apos;s
        forecast peak.
      </p>

      {demand ? (
        <>
          <div className={styles.asOf}>
            <span className={styles.liveDot} />
            As of {fmtLocalStamp(demand.lastUpdated)} · refreshes every 5 minutes
          </div>
          <div className={styles.stats}>
            <div className={styles.stat}>
              <div className={styles.statLabel}>Ontario demand now</div>
              <div className={styles.statValue}>{fmtMw(demand.ontarioMw)}</div>
              {demand.marketMw !== null && (
                <div className={styles.statSub}>Market demand incl. exports: {fmtMw(demand.marketMw)}</div>
              )}
            </div>
            {demand.todayPeak && (
              <div className={styles.stat}>
                <div className={styles.statLabel}>Today&apos;s forecast peak</div>
                <div className={`${styles.statValue} ${styles.yellow}`}>{fmtMw(demand.todayPeak.mw)}</div>
                <div className={styles.statSub}>{peakWindow(demand.todayPeak.hour)}</div>
              </div>
            )}
            {demand.tomorrowPeak && (
              <div className={styles.stat}>
                <div className={styles.statLabel}>Tomorrow&apos;s forecast peak</div>
                <div className={styles.statValue}>{fmtMw(demand.tomorrowPeak.mw)}</div>
                <div className={styles.statSub}>{peakWindow(demand.tomorrowPeak.hour)}</div>
              </div>
            )}
          </div>

          {demand.trend.length > 1 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Last 24 hours</h2>
              <div className={styles.sectionBody}>
                <TrendChart
                  points={demand.trend.map((p) => ({ label: p.hour, value: p.mw }))}
                  unit="MW"
                  color="#39D5FF"
                  title="Hourly Ontario electricity demand over the last 24 hours"
                  caption="Hourly average Ontario demand, Eastern time."
                />
              </div>
            </section>
          )}
        </>
      ) : (
        <div className={styles.unavailable}>Live demand data is temporarily unavailable.</div>
      )}

      <Link href="/" className={styles.cta}>See supply vs demand on the live dashboard →</Link>

      <Faq items={faq} />
    </SeoShell>
  );
}
