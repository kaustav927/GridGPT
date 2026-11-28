// What households actually pay: Ontario Regulated Price Plan (RPP) rates, which period is in
// effect right now, and when the price next drops. Server-rendered; refreshed with the page's ISR window.
import { RPP_RATES } from '@/data/oeb-rates';
import {
  TOU_PLAIN_LABEL,
  ULO_PLAIN_LABEL,
  formatLocalTime,
  ratesAreCurrent,
  tieredMonthlyCost,
  touStatus,
  uloStatus,
} from '@/lib/rpp';
import styles from './seo.module.css';

const TYPICAL_KWH = 700;

export default function HouseholdRates({ now = new Date() }: { now?: Date }) {
  if (!ratesAreCurrent(now)) {
    return (
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Household electricity rates</h2>
        <div className={`${styles.sectionBody} ${styles.prose}`}>
          <p>
            Ontario&apos;s regulated household rates have changed for the new season and are being updated here.
            See the{' '}
            <a href={RPP_RATES.sources[0].url} rel="noopener noreferrer" target="_blank">
              Ontario Energy Board
            </a>{' '}
            for current prices.
          </p>
        </div>
      </section>
    );
  }

  const tou = touStatus(now);
  const ulo = uloStatus(now);
  const typicalCost = tieredMonthlyCost(TYPICAL_KWH);

  return (
    <section className={styles.section} id="household-rates">
      <h2 className={styles.sectionTitle}>What households pay right now</h2>
      <div className={styles.sectionBody}>
        <div className={styles.prose} style={{ marginBottom: 16 }}>
          <p>
            Ontario homes pay one of three price plans, set by the Ontario Energy Board.{' '}
            <strong>Time-of-use</strong> is the standard plan most homes are on: the price depends on the time of
            day, cheapest in the evening, overnight and on weekends. <strong>Ultra-low overnight</strong> is an
            optional plan with very cheap power from 11 p.m. to 7 a.m. but a much higher price on weekday evenings,
            which suits people who charge an electric car overnight. <strong>Tiered</strong> is an optional flat price
            up to a monthly limit.
          </p>
        </div>
        <div className={styles.stats} style={{ marginBottom: 16 }}>
          <div className={styles.stat}>
            <div className={styles.statLabel}>Standard plan (time-of-use)</div>
            <div className={styles.statValue}>{tou.price.toFixed(1)}¢/kWh</div>
            <div className={styles.statSub}>
              {TOU_PLAIN_LABEL[tou.period]}
              {tou.nextCheaper
                ? ` · drops to ${tou.nextCheaper.price.toFixed(1)}¢ at ${formatLocalTime(tou.nextCheaper.at)}`
                : ' · cheapest price now'}
            </div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLabel}>Overnight plan (ultra-low overnight)</div>
            <div className={styles.statValue}>{ulo.price.toFixed(1)}¢/kWh</div>
            <div className={styles.statSub}>
              {ULO_PLAIN_LABEL[ulo.period]}
              {ulo.nextCheaper
                ? ` · drops to ${ulo.nextCheaper.price.toFixed(1)}¢ at ${formatLocalTime(ulo.nextCheaper.at)}`
                : ' · cheapest price now'}
            </div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLabel}>Flat plan (tiered), {TYPICAL_KWH} kWh/month</div>
            <div className={styles.statValue}>${typicalCost.toFixed(2)}</div>
            <div className={styles.statSub}>energy charge only, at {RPP_RATES.tiered.tier1}¢/kWh</div>
          </div>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Plan</th>
                <th>When (current winter schedule)</th>
                <th className={styles.num}>Price</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Time-of-use (standard)</td><td>Lowest rate (off-peak): weekdays 7 p.m.–7 a.m., all weekend &amp; holidays</td><td className={styles.num}>{RPP_RATES.tou.offPeak}¢</td></tr>
              <tr><td>Time-of-use (standard)</td><td>Mid-day rate (mid-peak): weekdays 11 a.m.–5 p.m.</td><td className={styles.num}>{RPP_RATES.tou.midPeak}¢</td></tr>
              <tr><td>Time-of-use (standard)</td><td>Peak rate (on-peak): weekdays 7–11 a.m. and 5–7 p.m.</td><td className={styles.num}>{RPP_RATES.tou.onPeak}¢</td></tr>
              <tr><td>Ultra-low overnight (optional)</td><td>Overnight: 11 p.m.–7 a.m., every day</td><td className={styles.num}>{RPP_RATES.ulo.ultraLow}¢</td></tr>
              <tr><td>Ultra-low overnight (optional)</td><td>Weekend daytime: 7 a.m.–11 p.m., weekends &amp; holidays</td><td className={styles.num}>{RPP_RATES.ulo.weekendOffPeak}¢</td></tr>
              <tr><td>Ultra-low overnight (optional)</td><td>Weekday daytime: 7 a.m.–4 p.m. and 9–11 p.m.</td><td className={styles.num}>{RPP_RATES.ulo.midPeak}¢</td></tr>
              <tr><td>Ultra-low overnight (optional)</td><td>Weekday evening peak: 4–9 p.m.</td><td className={styles.num}>{RPP_RATES.ulo.onPeak}¢</td></tr>
              <tr><td>Tiered (optional)</td><td>First {RPP_RATES.tiered.residentialThresholdKwh.toLocaleString('en-CA')} kWh/month (winter)</td><td className={styles.num}>{RPP_RATES.tiered.tier1}¢</td></tr>
              <tr><td>Tiered (optional)</td><td>Above {RPP_RATES.tiered.residentialThresholdKwh.toLocaleString('en-CA')} kWh/month</td><td className={styles.num}>{RPP_RATES.tiered.tier2}¢</td></tr>
            </tbody>
          </table>
        </div>
        <p className={styles.note} style={{ marginTop: 12, marginBottom: 0 }}>
          Ontario Energy Board Regulated Price Plan rates effective {RPP_RATES.effectiveFrom}. Prices cover the
          electricity itself; bills also include delivery, regulatory charges, HST and the Ontario Electricity
          Rebate. Source:{' '}
          <a href={RPP_RATES.sources[0].url} rel="noopener noreferrer" target="_blank" style={{ color: 'inherit' }}>
            oeb.ca
          </a>
          .
        </p>
      </div>
    </section>
  );
}
