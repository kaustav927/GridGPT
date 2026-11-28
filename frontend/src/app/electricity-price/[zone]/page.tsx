import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import SeoShell from '@/components/seo/SeoShell';
import TrendChart from '@/components/seo/TrendChart';
import HouseholdRates from '@/components/seo/HouseholdRates';
import Faq from '@/components/seo/Faq';
import styles from '@/components/seo/seo.module.css';
import { getPriceSnapshot, getPriceTrend, PRICING_ZONES, ZONE_INFO, zoneFromSlug } from '@/lib/grid-data';
import { fmtCentsPerKwh, fmtDollarsPerMwh, fmtLocalStamp } from '@/lib/format';
import { RPP_RATES } from '@/data/oeb-rates';

export const revalidate = 300;
export const dynamicParams = false;

export const generateStaticParams = () => PRICING_ZONES.map((z) => ({ zone: z.toLowerCase() }));

interface Props {
  params: { zone: string };
}

export const generateMetadata = ({ params }: Props): Metadata => {
  const zone = zoneFromSlug(params.zone);
  if (!zone) return {};
  const { name, places } = ZONE_INFO[zone];
  const path = `/electricity-price/${params.zone}`;
  return {
    title: `${name} Electricity Price Right Now (Live Ontario Zone Price)`,
    description: `Live wholesale electricity price for Ontario's ${name} zone (${places}), the 24-hour trend, how it compares to the provincial average, and current household Time-of-Use rates.`,
    alternates: { canonical: path },
    openGraph: { url: path, title: `${name} electricity price right now` },
  };
};

export default async function ZonePricePage({ params }: Props) {
  const zone = zoneFromSlug(params.zone);
  if (!zone) notFound();
  const { name, places } = ZONE_INFO[zone];
  const path = `/electricity-price/${params.zone}`;

  const [snapshot, trend] = await Promise.all([getPriceSnapshot(), getPriceTrend(zone)]);
  const current = snapshot?.zones.find((z) => z.zone === zone) ?? null;
  const diff = current && snapshot ? current.price - snapshot.average : null;

  const faq = [
    {
      q: `What is the electricity price in ${name} right now?`,
      a: current
        ? `As of ${fmtLocalStamp(current.last_updated)}, the real-time wholesale price in Ontario's ${name} zone is ${fmtDollarsPerMwh(current.price)} (${fmtCentsPerKwh(current.price)}). Households in ${places} on the Regulated Price Plan pay the province-wide rates of ${RPP_RATES.tou.offPeak}¢ to ${RPP_RATES.tou.onPeak}¢ per kWh on Time-of-Use.`
        : `Households in ${places} on the Regulated Price Plan pay the province-wide rates of ${RPP_RATES.tou.offPeak}¢ to ${RPP_RATES.tou.onPeak}¢ per kWh on Time-of-Use. The live ${name} zone wholesale price is shown on the GridGPT dashboard.`,
    },
    {
      q: `Do people in ${name} pay a different electricity rate than the rest of Ontario?`,
      a: `No, not for the electricity itself. Regulated household rates are the same across Ontario. The zonal wholesale price matters for large consumers and shows local grid conditions, while the delivery portion of your bill depends on your local utility.`,
    },
    {
      q: `Why is the ${name} zone price higher or lower than other zones?`,
      a: 'Zonal prices differ because of transmission losses and congestion. When power has to travel far or lines are full, prices rise in the zones on the receiving end and fall where supply is plentiful.',
    },
  ];

  return (
    <SeoShell path={path} crumb={name} parent={{ href: '/ontario-electricity-price', label: 'Electricity price' }}>
      <h1 className={styles.h1}>{name} electricity price right now</h1>
      <p className={styles.lede}>
        Live wholesale electricity price for Ontario&apos;s {name} pricing zone, which covers {places}, with the
        regulated rates households in the area pay.
      </p>

      {current && snapshot && diff !== null ? (
        <>
          <div className={styles.asOf}>
            <span className={styles.liveDot} />
            As of {fmtLocalStamp(current.last_updated)} · refreshes every 5 minutes
          </div>
          <div className={styles.stats}>
            <div className={styles.stat}>
              <div className={styles.statLabel}>{name} zone (wholesale)</div>
              <div className={styles.statValue}>{fmtDollarsPerMwh(current.price)}</div>
              <div className={styles.statSub}>{fmtCentsPerKwh(current.price)}</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statLabel}>Ontario average</div>
              <div className={styles.statValue}>{fmtDollarsPerMwh(snapshot.average)}</div>
              <div className={styles.statSub}>
                {name} is{' '}
                <span className={diff > 0 ? styles.red : styles.green}>
                  ${Math.abs(diff).toFixed(2)} {diff > 0 ? 'above' : 'below'}
                </span>{' '}
                average
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className={styles.unavailable}>Live prices are temporarily unavailable. Household rates below are current.</div>
      )}

      <Link href="/" className={styles.cta}>See {name} on the live Ontario grid map →</Link>

      {trend && trend.length > 1 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{name}: last 24 hours</h2>
          <div className={styles.sectionBody}>
            <TrendChart
              points={trend.map((p) => ({ label: p.hour, value: p.price }))}
              unit="$/MWh"
              title={`Hourly ${name} zone wholesale electricity price over the last 24 hours`}
              caption="Hourly average of the 5-minute real-time zonal price, Eastern time."
            />
          </div>
        </section>
      )}

      <HouseholdRates />

      {snapshot && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Other Ontario zones</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <tbody>
                {snapshot.zones
                  .filter((z) => z.zone !== zone)
                  .map((z) => (
                    <tr key={z.zone}>
                      <td>
                        <Link href={`/electricity-price/${z.zone.toLowerCase()}`}>
                          {ZONE_INFO[z.zone as keyof typeof ZONE_INFO]?.name ?? z.zone}
                        </Link>
                      </td>
                      <td className={styles.num}>{fmtDollarsPerMwh(z.price)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <Faq items={faq} />
    </SeoShell>
  );
}
